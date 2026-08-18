<script setup lang="ts">
/**
 * Мастер создания карточки товара — шаги 2…5.
 * Состояние живёт в Pinia + localStorage, поэтому переживает перезагрузку страницы.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import WizardSteps from '@/components/sku/WizardSteps.vue'
import ReadinessRing from '@/components/sku/ReadinessRing.vue'
import { DEFAULT_SLOTS, SLOT_DEFS, computeReadiness, useProductCardsStore } from '@/stores/productCards'
import { useAuthStore } from '@/stores/auth'
import { analyzePhoto, createImages, generateContent, pollTasks } from '@/data/skuApi'
import {
  GENDER_OPTIONS,
  LANG_LABEL,
  LANG_LIST,
  normalizeGender,
  rewriteGenderedCategory,
  rewriteGenderedText,
  rewriteImagePromptGender,
} from '@/types/sku'
import type { LangCode, SkuGender, SkuImage, SkuSlotId } from '@/types/sku'
import { isFail, templatesApi, type Template } from '@/data/platformApi'

const router = useRouter()
const route = useRoute()
const store = useProductCardsStore()
const auth = useAuthStore()

const d = computed(() => store.draft)

const busy = ref(false)
const busyText = ref('')
const error = ref('')
const extraInput = ref<HTMLInputElement | null>(null)
let pollTimer: number | undefined

/* ─────────── Инициализация / восстановление ─────────── */
onMounted(async () => {
  store.restore()
  if (!d.value.localPreview && !d.value.sourceImage) {
    router.replace('/studios/product-cards')
    return
  }
  // Шаблоны грузим без await: список нужен только на шаге 4, и ждать его
  // здесь значило бы задержать автозапуск анализа.
  void loadTemplates()
  // Автозапуск анализа, если пользователь только что загрузил фото
  if (d.value.step === 2 && !d.value.analysis) await runAnalyze()
  // Возобновление опроса незавершённых задач генерации после перезагрузки
  if (d.value.step === 4 && d.value.images.some((i) => i.state === 'processing')) startPolling()
})

onBeforeUnmount(stopPolling)

/* ─────────── Утилиты ─────────── */
function fmtSize(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

const previewSrc = computed(() => d.value.localPreview || d.value.sourceImage)

function goStep(step: number) {
  error.value = ''
  store.setStep(step)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function exitWizard() {
  router.push('/studios/product-cards')
}

/* ─────────── Шаг 2: AI-анализ ─────────── */
async function runAnalyze() {
  if (busy.value) return
  error.value = ''
  busy.value = true
  busyText.value = 'AI анализирует фото товара…'

  const res = await analyzePhoto(d.value.localPreview || d.value.sourceImage)
  busy.value = false

  if (!res.ok) {
    error.value = res.error
    return
  }
  d.value.sourceImage = res.imageUrl
  d.value.analysis = res.analysis
  d.value.analysisCredits = res.credits || 0
  store.persistDraft()
}

const analysisFields = computed(() => {
  const a = d.value.analysis
  if (!a) return []
  return [
    { label: 'Категория', value: a.category, icon: 'folder' },
    { label: 'Цвет', value: a.color, icon: 'palette' },
    { label: 'Материал', value: a.material, icon: 'layers' },
    { label: 'Сезон', value: a.season, icon: 'globe' },
    { label: 'Тип товара', value: a.productType, icon: 'shirt' },
    { label: 'Стиль', value: a.style, icon: 'chart' },
    { label: 'Узор', value: a.pattern, icon: 'grid' },
    { label: 'Крой', value: a.cut, icon: 'expand' },
    { label: 'Вырез', value: a.neckline, icon: 'target' },
  ].filter((f) => f.value && f.value !== '—')
})

const attrGrid = computed(() => {
  const a = d.value.analysis
  if (!a) return []
  return [
    { label: 'Цвет', value: a.color },
    { label: 'Материал', value: a.material },
    { label: 'Пол', value: a.gender },
    { label: 'Тип рукава', value: a.sleeve },
    { label: 'Сезон', value: a.season },
    { label: 'Вырез', value: a.neckline },
    { label: 'Узор', value: a.pattern },
    { label: 'Крой', value: a.cut },
  ].filter((f) => f.value && f.value !== '—')
})

/**
 * Пользователь поправляет пол на шаге анализа — иначе модель
 * уводит контент и фото «на модели» в другую аудиторию.
 */
function setGender(next: SkuGender) {
  const a = d.value.analysis
  if (!a || a.gender === next) return
  a.gender = next
  a.title = rewriteGenderedText(a.title, next)
  a.subtitle = rewriteGenderedText(a.subtitle, next)
  a.category = rewriteGenderedCategory(a.category, next)
  a.imagePrompt = rewriteImagePromptGender(a.imagePrompt, next)
  store.persistDraft()
}

const selectedGender = computed(() => normalizeGender(d.value.analysis?.gender || ''))

/* ─────────── Шаг 3: контент ─────────── */
const tones = ['Нейтральный', 'Продающий', 'Премиальный', 'Маркетплейсный', 'Лаконичный']
const contentTabs = ['Контент', 'Характеристики', 'SEO'] as const
const activeTab = ref<(typeof contentTabs)[number]>('Контент')

async function runContent(regenerate = false) {
  if (busy.value || !d.value.analysis) return
  if (!regenerate && d.value.content.ru) {
    goStep(3)
    return
  }
  error.value = ''
  busy.value = true
  busyText.value = 'AI создаёт контент на 4 языках…'
  if (!regenerate) goStep(3)

  const res = await generateContent({
    analysis: d.value.analysis,
    tone: d.value.tone,
    withAdvantages: d.value.withAdvantages,
    userNotes: d.value.userNotes,
    sku: d.value.sku || undefined,
    productId: d.value.productId || undefined,
  })
  busy.value = false

  if (!res.ok) {
    error.value = res.error
    return
  }
  d.value.sku = res.sku
  d.value.productId = res.productId
  d.value.content = res.content
  d.value.specs = res.specs
  d.value.contentCredits += res.credits || 0
  if (!d.value.content[d.value.activeLang]) d.value.activeLang = 'ru'
  store.persistDraft()
}

const cur = computed(() => d.value.content[d.value.activeLang])
const availableLangs = computed(() => LANG_LIST.filter((l) => !!d.value.content[l]))

function setLang(l: LangCode) {
  if (d.value.content[l]) {
    d.value.activeLang = l
    store.persistDraft()
  }
}

function onContentEdit() {
  store.persistDraft()
}

function addSpec() {
  d.value.specs.push({ label: '', value: '' })
  store.persistDraft()
}

function removeSpec(i: number) {
  d.value.specs.splice(i, 1)
  store.persistDraft()
}

/* ─────────── Шаг 4: изображения ─────────── */
const styleOptions = ['Чистый студийный', 'На модели', 'Лайфстайл', 'Минимализм']
const bgOptions = ['Белый', 'Светло-серый', 'Прозрачный']
const shadowOptions = ['Реалистичная тень', 'Мягкая тень', 'Без тени']
const qualityOptions = ['Высокое (1К)', 'Стандартное', 'Черновик']

function toggleSlot(id: SkuSlotId) {
  const def = SLOT_DEFS.find((s) => s.id === id)
  if (def?.mode === 'required') return
  const i = d.value.selectedSlots.indexOf(id)
  if (i === -1) d.value.selectedSlots.push(id)
  else d.value.selectedSlots.splice(i, 1)
  store.persistDraft()
}

function slotSelected(id: SkuSlotId) {
  return d.value.selectedSlots.includes(id)
}

function slotImage(id: SkuSlotId): SkuImage | undefined {
  return d.value.images.find((i) => i.slotId === id)
}

const extraSlots = computed(() => SLOT_DEFS.filter((s) => s.id !== 'main'))

/* ─────────── Шаблоны ─────────── */

const templates = ref<Template[]>([])
const selectedTemplateId = ref('')
const templateNotice = ref('')

const activeTemplate = computed(
  () => templates.value.find((t) => t.id === selectedTemplateId.value) || null,
)

/** Группируем по верхнему уровню категории — плоский список нечитаем. */
const templateGroups = computed(() => {
  const map = new Map<string, Template[]>()
  for (const t of templates.value) {
    const key = t.category[0] || 'Без категории'
    const arr = map.get(key)
    if (arr) arr.push(t)
    else map.set(key, [t])
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ru'))
    .map(([label, items]) => ({ label, items }))
})

async function loadTemplates() {
  const res = await templatesApi.list()
  if (isFail(res)) return
  templates.value = res.templates
  // Пришли из «Применить» на /templates — подставляем шаблон сразу.
  const fromQuery = String(route.query.template || '')
  if (fromQuery && res.templates.some((t) => t.id === fromQuery)) {
    selectedTemplateId.value = fromQuery
    onTemplateChange()
  }
}

/**
 * Референсов может быть больше, чем выбранных ракурсов: тогда лишние просто не
 * применятся. Предупреждаем заранее, иначе пользователь решит, что шаблон
 * сработал не полностью из-за ошибки.
 */
function onTemplateChange() {
  templateNotice.value = ''
  const t = activeTemplate.value
  if (!t) return
  const slotCount = new Set(['main', ...d.value.selectedSlots]).size
  if (t.references.length > slotCount) {
    templateNotice.value = `Референсов ${t.references.length}, а ракурсов выбрано ${slotCount} — лишние не применятся. Добавьте ракурсы ниже.`
  }
}

watch(() => d.value.selectedSlots.length, onTemplateChange)

const imagesDone = computed(() => d.value.images.filter((i) => i.state === 'success').length)
const imagesTotal = computed(() => d.value.images.length)
const imagesPending = computed(() => d.value.images.some((i) => i.state === 'processing'))

async function runImages() {
  if (busy.value || !d.value.analysis || !d.value.sourceImage) return
  error.value = ''

  const slots = [...new Set<SkuSlotId>(['main', ...d.value.selectedSlots])]
  busy.value = true
  busyText.value = 'Ставим задачи на генерацию изображений…'
  goStep(4)

  const res = await createImages({
    imageUrl: d.value.sourceImage,
    productPrompt: d.value.analysis.imagePrompt,
    slots,
    settings: d.value.imageSettings,
    gender: d.value.analysis.gender,
    templateId: selectedTemplateId.value || undefined,
  })
  // Счётчик применений — не блокирует генерацию, поэтому без await и без
  // проверки результата: статистика не должна ломать основной сценарий.
  if (selectedTemplateId.value) void templatesApi.use(selectedTemplateId.value)
  busy.value = false

  if (!res.ok) {
    error.value = res.error
    return
  }

  d.value.images = res.tasks.map((t) => ({
    slotId: t.slotId,
    taskId: t.taskId,
    state: t.state === 'fail' ? 'fail' : 'processing',
    error: t.error,
  }))
  store.persistDraft()
  startPolling()
}

function startPolling() {
  stopPolling()
  pollTimer = window.setInterval(tick, 4000)
  tick()
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
}

async function tick() {
  const ids = d.value.images
    .filter((i) => i.state === 'processing' && i.taskId)
    .map((i) => i.taskId as string)
  if (!ids.length) {
    stopPolling()
    return
  }

  const res = await pollTasks(ids)
  if (!res.ok) return

  let changed = false
  for (const t of res.tasks) {
    const img = d.value.images.find((i) => i.taskId === t.taskId)
    if (!img || img.state !== 'processing') continue
    if (t.state === 'success' && t.url) {
      img.state = 'success'
      img.url = t.url
      img.credits = t.credits || 0
      d.value.imageCredits += t.credits || 0
      changed = true
    } else if (t.state === 'fail') {
      img.state = 'fail'
      img.error = t.error || 'Не удалось создать изображение'
      changed = true
    }
  }
  if (changed) store.persistDraft()
  if (!d.value.images.some((i) => i.state === 'processing')) stopPolling()
}

async function retrySlot(id: SkuSlotId) {
  if (!d.value.analysis || !d.value.sourceImage) return
  const res = await createImages({
    imageUrl: d.value.sourceImage,
    productPrompt: d.value.analysis.imagePrompt,
    slots: [id],
    settings: d.value.imageSettings,
    gender: d.value.analysis.gender,
  })
  if (!res.ok) {
    error.value = res.error
    return
  }
  const t = res.tasks[0]
  const i = d.value.images.findIndex((x) => x.slotId === id)
  const next: SkuImage = {
    slotId: id,
    taskId: t.taskId,
    state: t.state === 'fail' ? 'fail' : 'processing',
    error: t.error,
  }
  if (i === -1) d.value.images.push(next)
  else d.value.images.splice(i, 1, next)
  store.persistDraft()
  startPolling()
}

/* ─────────── Шаг 5: результат ─────────── */
const readiness = computed(() =>
  computeReadiness({ content: d.value.content, specs: d.value.specs, images: d.value.images }),
)

const readinessRows = computed(() => [
  { label: 'Контент', value: readiness.value.content },
  { label: 'Характеристики', value: readiness.value.specs },
  { label: 'SEO', value: readiness.value.seo },
  { label: 'Изображения', value: readiness.value.images },
  { label: 'Адаптация', value: readiness.value.adaptation },
])

const channels = computed(() => {
  const imagesOk = readiness.value.images >= 80
  const seoOk = readiness.value.seo >= 70
  return [
    { id: 'site', name: 'Сайт', short: 'C', tone: 'bg-ink-900 text-white', ok: true },
    { id: 'wb', name: 'Wildberries', short: 'WB', tone: 'bg-fuchsia-600 text-white', ok: imagesOk },
    { id: 'ozon', name: 'Ozon', short: 'OZ', tone: 'bg-blue-600 text-white', ok: imagesOk && seoOk },
    { id: 'shopify', name: 'Shopify', short: 'SH', tone: 'bg-emerald-600 text-white', ok: seoOk },
    { id: 'ms', name: 'МойСклад', short: 'МС', tone: 'bg-amber-500 text-white', ok: false },
  ]
})

const galleryUrls = computed(() =>
  d.value.images.filter((i) => i.state === 'success' && i.url).map((i) => i.url as string),
)

const createAnother = ref(false)
const savedCard = computed(() => (d.value.savedCardId ? store.getCard(d.value.savedCardId) : null))

function finish() {
  if (!d.value.analysis || !d.value.content.ru) return
  if (!savedCard.value) store.saveCard(auth.user?.name || 'Пользователь')
  goStep(5)
}

function openCard() {
  const id = d.value.savedCardId
  if (!id) return
  const another = createAnother.value
  router.push(`/studios/product-cards/${id}`)
  if (another) store.resetDraft()
}

function startNew() {
  store.resetDraft()
  router.push('/studios/product-cards')
}

function exportJson() {
  const card = savedCard.value
  if (!card) return
  const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${card.sku}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/* Кредиты */
const creditsSpent = computed(
  () =>
    Math.round((d.value.analysisCredits + d.value.contentCredits + d.value.imageCredits) * 100) /
    100,
)

/* Черновик сохраняем при любом изменении настроек */
watch(
  () => [d.value.tone, d.value.withAdvantages, d.value.imageSettings],
  () => store.persistDraft(),
  { deep: true },
)

function addExtraPhoto() {
  extraInput.value?.click()
}
</script>

<template>
  <div class="page space-y-5 animate-fade-in">
    <input ref="extraInput" type="file" accept="image/*" class="hidden" />

    <!-- Навигация назад -->
    <button
      type="button"
      class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-ink-900 transition"
      @click="exitWizard"
    >
      <Icon name="arrowLeft" :size="15" />
      Назад к карточкам товара
    </button>

    <!-- Заголовок -->
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h1 class="text-2xl sm:text-[28px] font-extrabold text-ink-900 tracking-tight">
          Создание карточки товара
        </h1>
        <p class="text-ink-400 mt-1 text-sm">
          AI создаёт карточку с описанием, характеристиками, SEO и изображениями.
        </p>
      </div>
      <span class="chip bg-ink-50 text-ink-600 border border-ink-100 shrink-0 self-start">
        <Icon name="bolt" :size="14" class="text-accent-500" />
        {{ creditsSpent ? `${creditsSpent} кредита` : '~4 кредита' }}
      </span>
    </div>

    <!-- Прогресс шагов -->
    <div class="card px-4 py-3">
      <WizardSteps :current="d.step" @go="goStep" />
    </div>

    <!-- Ошибка -->
    <div
      v-if="error"
      class="card p-4 border-rose-200 bg-rose-50 flex items-start gap-3"
    >
      <Icon name="alert" :size="18" class="text-rose-600 mt-0.5 shrink-0" />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-rose-900">Не получилось</p>
        <p class="text-xs text-rose-700 mt-0.5">{{ error }}</p>
      </div>
      <button type="button" class="btn btn-sm btn-ghost !text-rose-700" @click="error = ''">
        <Icon name="x" :size="15" />
      </button>
    </div>

    <!-- ══════════════ ШАГ 2: AI-анализ ══════════════ -->
    <template v-if="d.step === 2">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-extrabold text-ink-900">AI-анализ товара</h2>
          <span class="chip bg-brand-100 text-brand-700 !text-[10px] !px-2 !py-0.5">AI</span>
        </div>
        <p class="text-xs text-ink-400 mt-1">
          Мы проанализировали изображение и распознали основные характеристики товара.
        </p>
      </div>

      <!-- Загрузка -->
      <div v-if="busy && !d.analysis" class="card p-10 text-center">
        <span class="inline-grid place-items-center w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 animate-pulse">
          <Icon name="sparkles" :size="26" />
        </span>
        <p class="text-sm font-bold text-ink-900 mt-4">{{ busyText }}</p>
        <p class="text-xs text-ink-400 mt-1">Обычно занимает 5–15 секунд</p>
        <div class="max-w-xs mx-auto mt-5 space-y-2">
          <div class="skeleton h-2.5 w-full" />
          <div class="skeleton h-2.5 w-4/5 mx-auto" />
          <div class="skeleton h-2.5 w-3/5 mx-auto" />
        </div>
      </div>

      <!-- Повтор при ошибке -->
      <div v-else-if="!d.analysis" class="card p-10 text-center">
        <p class="text-sm font-bold text-ink-900">Анализ не выполнен</p>
        <button type="button" class="btn btn-md btn-brand mt-4" @click="runAnalyze">
          <Icon name="refresh" :size="16" />
          Повторить анализ
        </button>
      </div>

      <!-- Результат -->
      <div v-else class="grid lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <!-- Фото -->
        <div class="space-y-3">
          <div class="card overflow-hidden aspect-[4/5] bg-ink-50">
            <img v-if="previewSrc" :src="previewSrc" alt="" class="w-full h-full object-contain" />
          </div>
          <div class="flex gap-2">
            <span class="w-11 h-12 rounded-lg border-2 border-brand-500 overflow-hidden bg-ink-50 shrink-0">
              <img v-if="previewSrc" :src="previewSrc" alt="" class="w-full h-full object-cover" />
            </span>
            <button
              type="button"
              class="w-11 h-12 rounded-lg border border-dashed border-ink-200 grid place-items-center text-ink-400 hover:border-brand-400 hover:text-brand-600 transition text-[9px] font-semibold leading-tight"
              @click="addExtraPhoto"
            >
              <Icon name="plus" :size="14" />
            </button>
          </div>
          <div class="card p-2.5 flex items-center gap-2.5">
            <span class="grid place-items-center w-8 h-8 rounded-lg bg-brand-50 text-brand-600 shrink-0">
              <Icon name="file" :size="15" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-[11px] font-semibold text-ink-900 truncate">
                {{ d.fileName || 'photo.jpg' }}
              </span>
              <span class="block text-[10px] text-ink-400">
                {{ [d.fileDimensions, fmtSize(d.fileSize)].filter(Boolean).join(' · ') }}
              </span>
            </span>
          </div>
        </div>

        <!-- Распознанный товар -->
        <div class="card p-4">
          <div class="flex items-start justify-between gap-2">
            <p class="text-[11px] font-bold uppercase tracking-wide text-ink-400">
              Распознанный товар
            </p>
            <span class="chip bg-accent-100 text-accent-800 !text-[10px] shrink-0">
              Уверенность: {{ d.analysis.confidence }}%
            </span>
          </div>
          <h3 class="text-lg font-extrabold text-ink-900 mt-2 leading-snug">
            {{ d.analysis.title }}
          </h3>
          <p class="text-xs text-ink-400 mt-1">{{ d.analysis.subtitle }}</p>

          <div class="mt-4 pt-3 border-t border-ink-100">
            <p class="text-[10px] uppercase tracking-wide text-ink-400 font-semibold">Пол</p>
            <p class="text-[11px] text-ink-400 mt-0.5 mb-2">
              Поправьте, если AI ошибся — контент и фото на модели пойдут по этому выбору.
            </p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opt in GENDER_OPTIONS"
                :key="opt.value"
                type="button"
                class="h-8 px-3 rounded-lg text-[12px] font-bold border transition"
                :class="
                  selectedGender === opt.value
                    ? 'bg-ink-900 text-white border-ink-900'
                    : 'bg-white text-ink-700 border-ink-200 hover:border-ink-400'
                "
                @click="setGender(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <ul class="mt-4 space-y-3">
            <li v-for="f in analysisFields" :key="f.label" class="flex items-start gap-2.5">
              <span class="grid place-items-center w-7 h-7 rounded-lg bg-brand-50 text-brand-600 shrink-0">
                <Icon :name="f.icon" :size="14" />
              </span>
              <span class="min-w-0">
                <span class="block text-[10px] uppercase tracking-wide text-ink-400 font-semibold">
                  {{ f.label }}
                </span>
                <span class="block text-[13px] font-semibold text-ink-900 leading-snug">
                  {{ f.value }}
                </span>
              </span>
            </li>
          </ul>
        </div>

        <!-- Атрибуты, сомнения, рекомендации -->
        <div class="space-y-4">
          <div class="card p-4">
            <p class="text-[11px] font-bold uppercase tracking-wide text-ink-400 mb-3">
              Определённые атрибуты
            </p>
            <div class="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <div v-for="a in attrGrid" :key="a.label" class="min-w-0">
                <span class="block text-[10px] text-ink-400">{{ a.label }}</span>
                <span class="block text-xs font-semibold text-ink-900 truncate" :title="a.value">
                  {{ a.value }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="d.analysis.doubts.length" class="card p-4 bg-amber-50/60 border-amber-200">
            <p class="flex items-center gap-2 text-xs font-bold text-amber-900 mb-2.5">
              <Icon name="alert" :size="15" />
              Возможные сомнения
            </p>
            <ul class="space-y-1.5">
              <li
                v-for="(t, i) in d.analysis.doubts"
                :key="i"
                class="flex gap-2 text-[11px] text-amber-900 leading-relaxed"
              >
                <span class="text-amber-500 mt-0.5">◆</span>
                <span>{{ t }}</span>
              </li>
            </ul>
          </div>

          <div v-if="d.analysis.recommendations.length" class="card p-4 bg-emerald-50/60 border-emerald-200">
            <p class="flex items-center gap-2 text-xs font-bold text-emerald-900 mb-2.5">
              <Icon name="sparkles" :size="15" />
              Рекомендации
            </p>
            <ul class="space-y-1.5">
              <li
                v-for="(t, i) in d.analysis.recommendations"
                :key="i"
                class="flex gap-2 text-[11px] text-emerald-900 leading-relaxed"
              >
                <span class="text-emerald-500 mt-0.5">✦</span>
                <span>{{ t }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div v-if="d.analysis" class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
        <button type="button" class="btn btn-md btn-outline" @click="exitWizard">
          <Icon name="arrowLeft" :size="16" />
          Назад
        </button>
        <button type="button" class="btn btn-md btn-brand flex-1 sm:flex-none" :disabled="busy" @click="runContent(false)">
          Сгенерировать контент и перейти к следующему шагу
          <Icon name="arrowRight" :size="16" />
        </button>
      </div>
      <p v-if="d.analysis" class="text-[11px] text-ink-400 text-right">
        AI создаст описание, характеристики и SEO на основе анализа
      </p>
    </template>

    <!-- ══════════════ ШАГ 3: генерация контента ══════════════ -->
    <template v-if="d.step === 3">
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <h2 class="text-lg font-extrabold text-ink-900">Генерация контента</h2>
            <span class="chip bg-brand-100 text-brand-700 !text-[10px] !px-2 !py-0.5">AI</span>
            <span
              v-if="d.sku"
              class="chip bg-emerald-50 text-emerald-700 !text-[10px] !px-2 !py-0.5 font-mono"
            >
              SKU: {{ d.sku }}
            </span>
          </div>
          <p class="text-xs text-ink-400 mt-1">
            Проверьте и отредактируйте сгенерированный контент. При необходимости измените или
            сгенерируйте заново.
          </p>
        </div>
        <button
          type="button"
          class="btn btn-sm btn-outline shrink-0"
          :disabled="busy"
          @click="runContent(true)"
        >
          <Icon name="refresh" :size="15" />
          Сгенерировать заново
        </button>
      </div>

      <div v-if="busy" class="card p-10 text-center">
        <span class="inline-grid place-items-center w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 animate-pulse">
          <Icon name="edit" :size="26" />
        </span>
        <p class="text-sm font-bold text-ink-900 mt-4">{{ busyText }}</p>
        <p class="text-xs text-ink-400 mt-1">Название, описания, характеристики и SEO — 15–30 секунд</p>
        <div class="max-w-md mx-auto mt-5 space-y-2">
          <div class="skeleton h-2.5 w-full" />
          <div class="skeleton h-2.5 w-11/12 mx-auto" />
          <div class="skeleton h-2.5 w-4/6 mx-auto" />
        </div>
      </div>

      <div v-else-if="!cur" class="card p-10 text-center">
        <p class="text-sm font-bold text-ink-900">Контент не создан</p>
        <button type="button" class="btn btn-md btn-brand mt-4" @click="runContent(true)">
          <Icon name="refresh" :size="16" />
          Сгенерировать
        </button>
      </div>

      <div v-else class="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)] gap-4">
        <!-- Левая колонка: редактор -->
        <div class="card p-4">
          <!-- Табы разделов -->
          <div class="flex gap-1 border-b border-ink-100 -mx-4 px-4 pb-0 mb-4">
            <button
              v-for="t in contentTabs"
              :key="t"
              type="button"
              class="px-3 py-2 text-xs font-bold border-b-2 -mb-px transition"
              :class="
                activeTab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-ink-400 hover:text-ink-700'
              "
              @click="activeTab = t"
            >
              {{ t }}
            </button>
          </div>

          <!-- Языковые табы -->
          <div class="flex gap-1.5 mb-4 flex-wrap">
            <button
              v-for="l in LANG_LIST"
              :key="l"
              type="button"
              class="px-3 h-7 rounded-lg text-[11px] font-bold transition border"
              :class="
                d.activeLang === l
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : d.content[l]
                    ? 'bg-white border-ink-200 text-ink-600 hover:border-ink-900'
                    : 'bg-ink-50 border-ink-100 text-ink-300 cursor-not-allowed'
              "
              :disabled="!d.content[l]"
              @click="setLang(l)"
            >
              {{ LANG_LABEL[l] }}
            </button>
          </div>

          <!-- Раздел: Контент -->
          <div v-if="activeTab === 'Контент'" class="space-y-4">
            <div>
              <label class="label !normal-case !text-[11px] !text-ink-600">Название товара *</label>
              <div class="relative">
                <input
                  v-model="cur.name"
                  type="text"
                  maxlength="150"
                  class="input !pr-20"
                  @input="onContentEdit"
                />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">
                  {{ cur.name.length }} / 150
                </span>
              </div>
            </div>

            <div>
              <label class="label !normal-case !text-[11px] !text-ink-600">Краткое описание *</label>
              <div class="relative">
                <textarea
                  v-model="cur.short"
                  rows="3"
                  maxlength="200"
                  class="input !h-auto !py-2.5 resize-none leading-relaxed"
                  @input="onContentEdit"
                />
                <span class="absolute right-3 bottom-2 text-[10px] text-ink-400">
                  {{ cur.short.length }} / 200
                </span>
              </div>
            </div>

            <div>
              <label class="label !normal-case !text-[11px] !text-ink-600">Полное описание *</label>
              <div class="border border-ink-200 rounded-xl overflow-hidden focus-within:border-ink-900 transition">
                <div class="flex items-center gap-0.5 px-2 py-1.5 border-b border-ink-100 bg-ink-50/50">
                  <span
                    v-for="ic in ['bold', 'italic', 'listUl', 'listOl', 'link']"
                    :key="ic"
                    class="grid place-items-center w-7 h-7 rounded-md text-ink-400 hover:bg-white hover:text-ink-900 cursor-pointer transition"
                  >
                    <Icon :name="ic" :size="14" />
                  </span>
                </div>
                <div class="relative">
                  <textarea
                    v-model="cur.full"
                    rows="9"
                    maxlength="3000"
                    class="w-full px-3.5 py-3 text-sm text-ink-900 leading-relaxed resize-none focus:outline-none"
                    @input="onContentEdit"
                  />
                  <span class="absolute right-3 bottom-2 text-[10px] text-ink-400">
                    {{ cur.full.length }} / 3000
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label class="label !normal-case !text-[11px] !text-ink-600">Тон описания</label>
              <select
                v-model="d.tone"
                class="input !w-auto min-w-[180px] pr-8"
                @change="store.persistDraft()"
              >
                <option v-for="t in tones" :key="t" :value="t">{{ t }}</option>
              </select>
              <div class="flex flex-wrap gap-1.5 mt-2.5">
                <button
                  v-for="t in tones"
                  :key="t"
                  type="button"
                  class="px-2.5 h-7 rounded-lg text-[11px] font-semibold border transition"
                  :class="
                    d.tone === t
                      ? 'bg-brand-50 border-brand-300 text-brand-700'
                      : 'bg-white border-ink-200 text-ink-500 hover:border-ink-900'
                  "
                  @click="d.tone = t; store.persistDraft()"
                >
                  {{ t }}
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between pt-1">
              <span class="flex items-center gap-2 text-xs font-semibold text-ink-600">
                <Icon name="sparkles" :size="15" class="text-brand-600" />
                Добавить преимущества
              </span>
              <button
                type="button"
                class="w-11 h-6 rounded-full transition relative shrink-0"
                :class="d.withAdvantages ? 'bg-brand-600' : 'bg-ink-200'"
                @click="d.withAdvantages = !d.withAdvantages"
              >
                <span
                  class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                  :class="d.withAdvantages ? 'left-[22px]' : 'left-0.5'"
                />
              </button>
            </div>
          </div>

          <!-- Раздел: Характеристики -->
          <div v-else-if="activeTab === 'Характеристики'" class="space-y-2">
            <div
              v-for="(s, i) in d.specs"
              :key="i"
              class="flex items-center gap-2"
            >
              <input
                v-model="s.label"
                type="text"
                placeholder="Название"
                class="input !h-9 !text-[13px] flex-1"
                @input="onContentEdit"
              />
              <input
                v-model="s.value"
                type="text"
                placeholder="Значение"
                class="input !h-9 !text-[13px] flex-1"
                @input="onContentEdit"
              />
              <button
                type="button"
                class="grid place-items-center w-9 h-9 rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600 transition shrink-0"
                @click="removeSpec(i)"
              >
                <Icon name="trash" :size="15" />
              </button>
            </div>
            <button type="button" class="btn btn-sm btn-outline w-full mt-2" @click="addSpec">
              <Icon name="plus" :size="15" />
              Добавить характеристику
            </button>
          </div>

          <!-- Раздел: SEO -->
          <div v-else class="space-y-4">
            <div>
              <label class="label !normal-case !text-[11px] !text-ink-600">SEO Title</label>
              <input v-model="cur.seo.title" type="text" class="input" @input="onContentEdit" />
            </div>
            <div>
              <label class="label !normal-case !text-[11px] !text-ink-600">SEO Description</label>
              <textarea
                v-model="cur.seo.description"
                rows="3"
                class="input !h-auto !py-2.5 resize-none leading-relaxed"
                @input="onContentEdit"
              />
            </div>
            <div>
              <label class="label !normal-case !text-[11px] !text-ink-600">Keywords</label>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="(k, i) in cur.seo.keywords"
                  :key="i"
                  class="chip bg-ink-50 text-ink-700 border border-ink-100 !rounded-lg !text-[11px]"
                >
                  {{ k }}
                  <button type="button" class="text-ink-400 hover:text-rose-600" @click="cur.seo.keywords.splice(i, 1); onContentEdit()">
                    <Icon name="x" :size="11" />
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Правая колонка -->
        <div class="space-y-4">
          <div class="card p-4">
            <p class="text-xs font-bold text-ink-900 mb-3">Ключевые преимущества</p>
            <ul class="space-y-2">
              <li
                v-for="(a, i) in cur.advantages"
                :key="i"
                class="flex items-start gap-2 text-[12px] text-ink-700 leading-relaxed"
              >
                <span class="grid place-items-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 shrink-0 mt-0.5">
                  <Icon name="check" :size="10" />
                </span>
                {{ a }}
              </li>
            </ul>
            <div v-if="previewSrc" class="mt-4 rounded-xl overflow-hidden bg-ink-50 aspect-[4/3]">
              <img :src="previewSrc" alt="" class="w-full h-full object-contain" />
            </div>
          </div>

          <div class="card p-4">
            <p class="text-xs font-bold text-ink-900 mb-3">SEO предварительный просмотр</p>
            <p class="text-[10px] uppercase tracking-wide text-ink-400 font-semibold">Title</p>
            <p class="text-[12px] text-ink-900 mt-0.5 leading-snug">{{ cur.seo.title }}</p>
            <p class="text-[10px] uppercase tracking-wide text-ink-400 font-semibold mt-3">
              Description
            </p>
            <p class="text-[12px] text-ink-600 mt-0.5 leading-relaxed">{{ cur.seo.description }}</p>
            <p class="text-[10px] uppercase tracking-wide text-ink-400 font-semibold mt-3 mb-1.5">
              Keywords
            </p>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="(k, i) in cur.seo.keywords"
                :key="i"
                class="chip bg-ink-50 text-ink-600 border border-ink-100 !rounded-lg !text-[10px]"
              >
                {{ k }}
              </span>
            </div>
          </div>

          <div class="card p-4">
            <p class="text-xs font-bold text-ink-900">Языки контента</p>
            <p class="text-[10px] text-ink-400 mt-0.5 mb-3">
              Сгенерированы на основе русского контента
            </p>
            <div class="space-y-2">
              <div
                v-for="l in LANG_LIST"
                :key="l"
                class="flex items-center justify-between text-[11px]"
              >
                <span class="font-bold text-ink-700">
                  {{ LANG_LABEL[l] }}
                  <span v-if="l === 'ru'" class="font-normal text-ink-400">(основной)</span>
                </span>
                <span
                  class="chip !text-[10px] !py-0.5"
                  :class="
                    d.content[l] ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-50 text-ink-400'
                  "
                >
                  {{ d.content[l] ? 'Готово' : 'Нет' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="cur" class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
        <button type="button" class="btn btn-md btn-outline" @click="goStep(2)">
          <Icon name="arrowLeft" :size="16" />
          Назад
        </button>
        <button type="button" class="btn btn-md btn-outline" @click="store.persistDraft()">
          Сохранить черновик
        </button>
        <button type="button" class="btn btn-md btn-brand" :disabled="busy" @click="goStep(4)">
          Продолжить
          <Icon name="arrowRight" :size="16" />
        </button>
      </div>
      <p v-if="cur" class="text-[11px] text-ink-400 text-right">
        Далее: подготовка изображений и визуальных материалов
      </p>
    </template>

    <!-- ══════════════ ШАГ 4: подготовка изображений ══════════════ -->
    <template v-if="d.step === 4">
      <div>
        <h2 class="text-lg font-extrabold text-ink-900">Подготовка изображений</h2>
        <p class="text-xs text-ink-400 mt-1">
          AI создаст и обработает изображения товара для карточки.
        </p>
      </div>

      <div class="grid xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,260px)] gap-4">
        <!-- Основное фото -->
        <div class="card p-4">
          <p class="text-xs font-bold text-ink-900 mb-3">Основное фото</p>
          <div class="rounded-xl overflow-hidden bg-ink-50 aspect-[4/5]">
            <img v-if="previewSrc" :src="previewSrc" alt="" class="w-full h-full object-contain" />
          </div>
          <div class="flex gap-2 mt-3">
            <span class="w-12 h-14 rounded-lg border-2 border-brand-500 overflow-hidden bg-ink-50 shrink-0">
              <img v-if="previewSrc" :src="previewSrc" alt="" class="w-full h-full object-cover" />
            </span>
            <span
              v-for="u in galleryUrls.slice(0, 3)"
              :key="u"
              class="w-12 h-14 rounded-lg border border-ink-200 overflow-hidden bg-ink-50 shrink-0"
            >
              <img :src="u" alt="" class="w-full h-full object-cover" />
            </span>
            <button
              type="button"
              class="w-12 h-14 rounded-lg border border-dashed border-ink-200 grid place-items-center text-ink-400 hover:border-brand-400 hover:text-brand-600 transition text-[8px] font-semibold leading-tight text-center"
              @click="addExtraPhoto"
            >
              <span>
                <Icon name="plus" :size="13" class="mx-auto" />
                Добавить<br />фото
              </span>
            </button>
          </div>
          <div class="mt-3 p-2.5 rounded-lg bg-emerald-50 flex gap-2">
            <Icon name="sparkles" :size="14" class="text-emerald-600 shrink-0 mt-0.5" />
            <p class="text-[10px] text-emerald-800 leading-relaxed">
              AI обработает фото: улучшит качество, удалит фон, добавит тень и подготовит под
              маркетплейсы.
            </p>
          </div>
        </div>

        <!-- Дополнительные изображения -->
        <div class="card p-4">
          <!-- Шаблон: его референсы заменяют стандартные фото карточки -->
          <div class="mb-4 pb-4 border-b border-ink-100">
            <div class="flex items-center gap-2 mb-2">
              <p class="text-xs font-bold text-ink-900">Шаблон</p>
              <RouterLink
                to="/templates"
                class="ml-auto text-[11px] text-ink-500 hover:text-ink-900 underline"
              >
                управлять
              </RouterLink>
            </div>

            <select v-model="selectedTemplateId" class="input h-9 text-xs" @change="onTemplateChange">
              <option value="">Без шаблона — стандартные ракурсы</option>
              <optgroup
                v-for="grp in templateGroups"
                :key="grp.label"
                :label="grp.label"
              >
                <option v-for="t in grp.items" :key="t.id" :value="t.id">
                  {{ t.name }} · {{ t.references.length }} реф.
                </option>
              </optgroup>
            </select>

            <div v-if="activeTemplate" class="mt-3">
              <p class="text-[11px] text-ink-500 mb-2">
                Референсы шаблона подставятся вместо стандартных фото карточки:
              </p>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="r in activeTemplate.references"
                  :key="r.id"
                  class="w-12 h-14 rounded-lg overflow-hidden bg-ink-100 border border-ink-200 relative"
                  :title="`${r.label || 'Референс'}: ${r.prompt || 'без промта'}`"
                >
                  <img
                    v-if="r.image"
                    :src="r.image"
                    alt=""
                    class="w-full h-full object-cover"
                  />
                  <span
                    v-else
                    class="absolute inset-0 grid place-items-center text-[8px] text-ink-500 text-center leading-tight px-0.5"
                  >
                    промт
                  </span>
                </div>
              </div>
              <p v-if="templateNotice" class="text-[11px] text-amber-700 mt-2">
                {{ templateNotice }}
              </p>
            </div>
          </div>

          <p class="text-xs font-bold text-ink-900 mb-3">
            Дополнительные изображения
            <span class="font-normal text-ink-400">(рекомендуется)</span>
          </p>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <button
              v-for="s in extraSlots"
              :key="s.id"
              type="button"
              class="rounded-xl border overflow-hidden text-left transition group"
              :class="
                slotSelected(s.id)
                  ? 'border-brand-300 ring-1 ring-brand-200'
                  : 'border-ink-100 hover:border-ink-300 opacity-70'
              "
              @click="toggleSlot(s.id)"
            >
              <div class="px-2.5 pt-2.5 pb-2">
                <span class="block text-[11px] font-bold text-ink-900 leading-tight">
                  {{ s.title }}
                </span>
                <span class="block text-[10px] text-ink-400 mt-0.5">{{ s.subtitle }}</span>
              </div>
              <div class="relative aspect-[3/4] bg-ink-50 overflow-hidden">
                <img
                  v-if="slotImage(s.id)?.url"
                  :src="slotImage(s.id)!.url"
                  alt=""
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full grid place-items-center text-ink-300">
                  <Icon :name="s.icon" :size="24" />
                </div>

                <!-- Индикатор генерации -->
                <div
                  v-if="slotImage(s.id)?.state === 'processing'"
                  class="absolute inset-0 bg-white/70 backdrop-blur-[1px] grid place-items-center"
                >
                  <span class="flex flex-col items-center gap-1.5">
                    <Icon name="refresh" :size="18" class="text-brand-600 animate-spin" />
                    <span class="text-[9px] font-bold text-brand-700">Генерация…</span>
                  </span>
                </div>

                <!-- Ошибка -->
                <div
                  v-else-if="slotImage(s.id)?.state === 'fail'"
                  class="absolute inset-0 bg-rose-50/90 grid place-items-center p-2"
                >
                  <span class="flex flex-col items-center gap-1.5 text-center">
                    <Icon name="alert" :size="16" class="text-rose-600" />
                    <span
                      class="text-[9px] font-bold text-rose-700 underline"
                      @click.stop="retrySlot(s.id)"
                      >Повторить</span
                    >
                  </span>
                </div>

                <!-- Бейдж -->
                <span
                  v-else
                  class="absolute left-2 bottom-2 chip !text-[9px] !px-1.5 !py-0.5 !rounded-md"
                  :class="{
                    'bg-emerald-100 text-emerald-700': slotImage(s.id)?.state === 'success',
                    'bg-brand-100 text-brand-700':
                      !slotImage(s.id) && slotSelected(s.id) && s.mode !== 'optional',
                    'bg-ink-100 text-ink-500': !slotSelected(s.id) || s.mode === 'optional',
                  }"
                >
                  {{ slotImage(s.id)?.state === 'success' ? 'Готово' : s.badge }}
                </span>

                <!-- Чекбокс выбора -->
                <span
                  v-if="s.mode !== 'required'"
                  class="absolute right-2 top-2 w-4 h-4 rounded border grid place-items-center transition"
                  :class="
                    slotSelected(s.id)
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'bg-white/90 border-ink-300 text-transparent'
                  "
                >
                  <Icon name="check" :size="10" />
                </span>
              </div>
            </button>
          </div>

          <!-- Прогресс -->
          <div v-if="imagesTotal" class="mt-4 pt-3 border-t border-ink-100">
            <div class="flex items-center justify-between text-[11px] font-semibold mb-1.5">
              <span class="text-ink-600">
                Готово {{ imagesDone }} из {{ imagesTotal }}
              </span>
              <span class="text-brand-600">
                {{ Math.round((imagesDone / imagesTotal) * 100) }}%
              </span>
            </div>
            <div class="h-1.5 rounded-full bg-ink-100 overflow-hidden">
              <div
                class="h-full bg-brand-600 rounded-full transition-all duration-700"
                :style="{ width: `${(imagesDone / imagesTotal) * 100}%` }"
              />
            </div>
          </div>
        </div>

        <!-- Настройки -->
        <div class="card p-4 h-fit">
          <p class="text-xs font-bold text-ink-900 mb-3">Настройки изображений</p>

          <p class="text-[10px] uppercase tracking-wide font-semibold text-ink-400 mb-1.5">
            Стиль фотографии
          </p>
          <div class="space-y-1.5 mb-4">
            <button
              v-for="o in styleOptions"
              :key="o"
              type="button"
              class="w-full flex items-center gap-2 px-2.5 h-8 rounded-lg border text-[11px] font-semibold transition"
              :class="
                d.imageSettings.style === o
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : 'bg-white border-ink-100 text-ink-500 hover:border-ink-300'
              "
              @click="d.imageSettings.style = o"
            >
              <span
                class="w-3 h-3 rounded-full border-2 shrink-0"
                :class="d.imageSettings.style === o ? 'border-brand-600 bg-brand-600' : 'border-ink-300'"
              />
              {{ o }}
            </button>
          </div>

          <p class="text-[10px] uppercase tracking-wide font-semibold text-ink-400 mb-1.5">Фон</p>
          <div class="space-y-1.5 mb-4">
            <button
              v-for="o in bgOptions"
              :key="o"
              type="button"
              class="w-full flex items-center gap-2 px-2.5 h-8 rounded-lg border text-[11px] font-semibold transition"
              :class="
                d.imageSettings.background === o
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : 'bg-white border-ink-100 text-ink-500 hover:border-ink-300'
              "
              @click="d.imageSettings.background = o"
            >
              <span
                class="w-3 h-3 rounded-full border-2 shrink-0"
                :class="
                  d.imageSettings.background === o ? 'border-brand-600 bg-brand-600' : 'border-ink-300'
                "
              />
              {{ o }}
            </button>
          </div>

          <div class="flex items-center justify-between mb-2">
            <span class="text-[10px] uppercase tracking-wide font-semibold text-ink-400">Тень</span>
            <button
              type="button"
              class="w-9 h-5 rounded-full transition relative shrink-0"
              :class="d.imageSettings.shadow ? 'bg-brand-600' : 'bg-ink-200'"
              @click="d.imageSettings.shadow = !d.imageSettings.shadow"
            >
              <span
                class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                :class="d.imageSettings.shadow ? 'left-[18px]' : 'left-0.5'"
              />
            </button>
          </div>
          <div v-if="d.imageSettings.shadow" class="space-y-1.5 mb-4">
            <button
              v-for="o in shadowOptions"
              :key="o"
              type="button"
              class="w-full flex items-center gap-2 px-2.5 h-8 rounded-lg border text-[11px] font-semibold transition"
              :class="
                d.imageSettings.shadowType === o
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : 'bg-white border-ink-100 text-ink-500 hover:border-ink-300'
              "
              @click="d.imageSettings.shadowType = o"
            >
              <span
                class="w-3 h-3 rounded-full border-2 shrink-0"
                :class="
                  d.imageSettings.shadowType === o ? 'border-brand-600 bg-brand-600' : 'border-ink-300'
                "
              />
              {{ o }}
            </button>
          </div>

          <p class="text-[10px] uppercase tracking-wide font-semibold text-ink-400 mb-1.5">
            Качество
          </p>
          <select v-model="d.imageSettings.quality" class="input !h-9 !text-[12px]">
            <option v-for="o in qualityOptions" :key="o" :value="o">{{ o }}</option>
          </select>

          <div class="mt-4 p-2.5 rounded-lg bg-brand-50 flex gap-2">
            <Icon name="sparkles" :size="14" class="text-brand-600 shrink-0 mt-0.5" />
            <p class="text-[10px] text-brand-800 leading-relaxed">
              Будет создано до {{ d.selectedSlots.length + 1 }} изображений в разных форматах для
              маркетплейсов и сайта.
            </p>
          </div>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
        <button type="button" class="btn btn-md btn-outline" @click="goStep(3)">
          <Icon name="arrowLeft" :size="16" />
          Назад
        </button>
        <button
          v-if="!imagesTotal"
          type="button"
          class="btn btn-md btn-brand flex-1 sm:flex-none sm:min-w-[320px]"
          :disabled="busy"
          @click="runImages"
        >
          <Icon name="sparkles" :size="16" />
          Создать изображения и продолжить
        </button>
        <template v-else>
          <button type="button" class="btn btn-md btn-outline" :disabled="imagesPending" @click="runImages">
            <Icon name="refresh" :size="16" />
            Пересоздать
          </button>
          <button
            type="button"
            class="btn btn-md btn-brand flex-1 sm:flex-none sm:min-w-[240px]"
            :disabled="imagesPending || !imagesDone"
            @click="finish"
          >
            {{ imagesPending ? 'Генерация изображений…' : 'Завершить карточку' }}
            <Icon v-if="!imagesPending" name="arrowRight" :size="16" />
          </button>
        </template>
      </div>
      <p class="text-[11px] text-ink-400 text-right">
        Далее: финальная карточка и рекомендации
      </p>
    </template>

    <!-- ══════════════ ШАГ 5: готовая карточка ══════════════ -->
    <template v-if="d.step === 5">
      <div class="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,300px)] gap-4">
        <div class="space-y-4">
          <!-- Баннер успеха -->
          <div class="card p-5 sm:p-6 bg-emerald-50/60 border-emerald-200">
            <div class="flex items-start gap-4">
              <span class="grid place-items-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 shrink-0">
                <Icon name="check" :size="24" />
              </span>
              <div class="min-w-0 flex-1">
                <h2 class="text-xl sm:text-2xl font-extrabold text-ink-900">
                  Карточка товара успешно создана!
                </h2>
                <p class="text-sm text-ink-500 mt-1.5">
                  SKU: <span class="font-bold text-brand-700">{{ d.sku }}</span> добавлен в каталог
                </p>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-5">
              <button type="button" class="btn btn-md btn-brand" @click="openCard">
                Открыть карточку товара
              </button>
              <button type="button" class="btn btn-md btn-outline" @click="startNew">
                Создать ещё
              </button>
              <button type="button" class="btn btn-md btn-outline" @click="exportJson">
                <Icon name="download" :size="16" />
                Экспортировать
              </button>
              <button type="button" class="btn btn-md btn-outline" @click="exitWizard">
                К карточкам товаров
              </button>
            </div>
          </div>

          <!-- Предпросмотр -->
          <div>
            <h3 class="text-base font-extrabold text-ink-900 mb-3">Предпросмотр карточки</h3>
            <div class="grid md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_minmax(0,1fr)] gap-4">
              <div class="card p-3">
                <div class="rounded-xl overflow-hidden bg-ink-50 aspect-[4/5]">
                  <img
                    :src="galleryUrls[0] || previewSrc"
                    alt=""
                    class="w-full h-full object-contain"
                  />
                </div>
                <div class="flex gap-1.5 mt-2.5 overflow-x-auto no-scrollbar">
                  <span
                    v-for="(u, i) in galleryUrls.slice(0, 5)"
                    :key="u"
                    class="w-10 h-12 rounded-lg overflow-hidden bg-ink-50 shrink-0 border"
                    :class="i === 0 ? 'border-brand-500' : 'border-ink-100'"
                  >
                    <img :src="u" alt="" class="w-full h-full object-cover" />
                  </span>
                  <span
                    v-if="galleryUrls.length > 5"
                    class="w-10 h-12 rounded-lg bg-ink-50 border border-ink-100 grid place-items-center text-[10px] font-bold text-ink-500 shrink-0"
                  >
                    +{{ galleryUrls.length - 5 }}
                  </span>
                </div>
              </div>

              <div class="card p-4">
                <p class="text-xs font-bold text-ink-900 mb-3">Основная информация</p>
                <dl class="space-y-2.5">
                  <div v-if="d.content.ru" class="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
                    <dt class="text-[11px] text-ink-400">Название</dt>
                    <dd class="text-[11px] font-semibold text-ink-900 leading-snug">
                      {{ d.content.ru.name }}
                    </dd>
                  </div>
                  <div
                    v-for="s in d.specs.slice(0, 7)"
                    :key="s.label"
                    class="grid grid-cols-[80px_minmax(0,1fr)] gap-2"
                  >
                    <dt class="text-[11px] text-ink-400">{{ s.label }}</dt>
                    <dd class="text-[11px] font-semibold text-ink-900 leading-snug">{{ s.value }}</dd>
                  </div>
                </dl>
              </div>

              <div class="space-y-4">
                <div class="card p-4">
                  <p class="text-xs font-bold text-ink-900 mb-3">Ключевые преимущества</p>
                  <ul class="space-y-2">
                    <li
                      v-for="(a, i) in d.content.ru?.advantages || []"
                      :key="i"
                      class="flex items-start gap-2 text-[11px] text-ink-700 leading-relaxed"
                    >
                      <span class="grid place-items-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 shrink-0 mt-0.5">
                        <Icon name="check" :size="10" />
                      </span>
                      {{ a }}
                    </li>
                  </ul>
                </div>
                <div class="card p-4">
                  <p class="text-xs font-bold text-ink-900 mb-2.5">Языки контента</p>
                  <div class="flex flex-wrap gap-1.5">
                    <span
                      v-for="l in availableLangs"
                      :key="l"
                      class="inline-flex items-center gap-1"
                    >
                      <span class="chip bg-ink-50 text-ink-700 !rounded-lg !text-[10px]">
                        {{ LANG_LABEL[l] }}
                      </span>
                      <span class="chip bg-emerald-50 text-emerald-700 !rounded-lg !text-[10px]">
                        Готово
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Что дальше -->
          <div class="grid md:grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
            <div class="card p-4 flex gap-3">
              <span class="grid place-items-center w-9 h-9 rounded-xl bg-brand-50 text-brand-600 shrink-0">
                <Icon name="sparkles" :size="17" />
              </span>
              <div>
                <p class="text-xs font-bold text-ink-900">Что дальше?</p>
                <p class="text-[11px] text-ink-400 mt-1 leading-relaxed">
                  Вы можете открыть карточку для редактирования, экспортировать её на нужные площадки
                  или создать новую карточку товара.
                </p>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <div class="flex gap-2">
                <button type="button" class="btn btn-md btn-outline" @click="exportJson">
                  <Icon name="download" :size="16" />
                  Экспортировать
                </button>
                <button type="button" class="btn btn-md btn-brand" @click="openCard">
                  Открыть карточку товара
                  <Icon name="arrowRight" :size="16" />
                </button>
              </div>
              <label class="flex items-center gap-2 justify-end text-[11px] text-ink-500 cursor-pointer">
                <input v-model="createAnother" type="checkbox" class="accent-brand-600" />
                Создать ещё одну карточку после открытия
              </label>
            </div>
          </div>
        </div>

        <!-- Правая колонка: готовность -->
        <div class="space-y-4">
          <div class="card p-4">
            <p class="text-xs font-bold text-ink-900 mb-3">Готовность карточки</p>
            <div class="flex items-center gap-3">
              <ReadinessRing :value="readiness.total" :size="66" />
              <div class="min-w-0">
                <p class="text-xs font-bold text-emerald-600">
                  {{ readiness.total >= 85 ? 'Отличный результат!' : 'Хороший результат' }}
                </p>
                <p class="text-[10px] text-ink-400 mt-0.5 leading-relaxed">
                  Карточка почти готова для публикации.
                </p>
              </div>
            </div>
            <div class="mt-4 space-y-2.5">
              <div v-for="r in readinessRows" :key="r.label">
                <div class="flex items-center justify-between text-[11px] mb-1">
                  <span class="text-ink-500">{{ r.label }}</span>
                  <span class="font-bold text-ink-900">{{ r.value }}%</span>
                </div>
                <div class="h-1 rounded-full bg-ink-100 overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-700"
                    :class="r.value >= 85 ? 'bg-emerald-500' : r.value >= 60 ? 'bg-amber-500' : 'bg-rose-500'"
                    :style="{ width: `${r.value}%` }"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="card p-4">
            <p class="text-xs font-bold text-ink-900 mb-3">Готовность к каналам</p>
            <ul class="space-y-2.5">
              <li v-for="c in channels" :key="c.id" class="flex items-center gap-2.5">
                <span
                  class="grid place-items-center w-6 h-6 rounded-md text-[9px] font-bold shrink-0"
                  :class="c.tone"
                >
                  {{ c.short }}
                </span>
                <span class="text-[11px] font-semibold text-ink-700 flex-1">{{ c.name }}</span>
                <span
                  class="text-[10px] font-bold"
                  :class="c.ok ? 'text-emerald-600' : 'text-amber-600'"
                >
                  {{ c.ok ? 'Готово' : 'Требует проверки' }}
                </span>
              </li>
            </ul>
            <button
              type="button"
              class="btn btn-sm w-full mt-4 bg-brand-50 text-brand-700 hover:bg-brand-100"
              @click="openCard"
            >
              Посмотреть все каналы
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
