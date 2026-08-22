<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import ReadinessRing from '@/components/sku/ReadinessRing.vue'
import { useProductCardsStore } from '@/stores/productCards'
import type { ChannelStatus, LangCode, SkuCard } from '@/types/sku'
import { LANG_FULL, LANG_LABEL, LANG_LIST } from '@/types/sku'

const route = useRoute()
const router = useRouter()
const store = useProductCardsStore()

type TabId =
  | 'overview'
  | 'content'
  | 'images'
  | 'specs'
  | 'seo'
  | 'marketplaces'
  | 'versions'
  | 'history'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Обзор', icon: 'grid' },
  { id: 'content', label: 'Контент', icon: 'file' },
  { id: 'images', label: 'Изображения', icon: 'image' },
  { id: 'specs', label: 'Характеристики', icon: 'listUl' },
  { id: 'seo', label: 'SEO', icon: 'search' },
  { id: 'marketplaces', label: 'Маркетплейсы', icon: 'shoppingBag' },
  { id: 'versions', label: 'Версии', icon: 'layers' },
  { id: 'history', label: 'История', icon: 'history' },
]

const tab = ref<TabId>('overview')
const lang = ref<LangCode>('ru')
const activeImage = ref(0)
const editing = ref<'' | 'name' | 'short' | 'full' | 'advantages'>('')
const editBuffer = ref('')
const notFound = ref(false)
const lightboxIndex = ref<number | null>(null)

const card = computed<SkuCard | null>(() => store.getCard(String(route.params.id)))

onMounted(async () => {
  // Карточки теперь приходят с сервера: проверять «не найдено» до ответа
  // нельзя — иначе экран мигал бы ошибкой на каждой загрузке страницы.
  await store.restore()
  if (!card.value) notFound.value = true
})

watch(card, (c) => {
  if (c) notFound.value = false
})

/* ---------- Производные данные ---------- */

const cur = computed(() => card.value?.content[lang.value] || null)

const availableLangs = computed(() =>
  LANG_LIST.filter((l) => !!card.value?.content[l]?.name),
)

const gallery = computed(() => {
  const c = card.value
  if (!c) return [] as { url: string; slot: string }[]
  const list = c.images
    .filter((i) => i.state === 'success' && i.url)
    .map((i) => ({ url: i.url as string, slot: i.slotId as string }))
  if (c.sourceImage && !list.some((x) => x.url === c.sourceImage))
    list.push({ url: c.sourceImage, slot: 'source' })
  return list
})

const SLOT_TITLE: Record<string, string> = {
  main: 'Основное фото',
  front: 'Вид спереди',
  back: 'Вид сзади',
  fabric: 'Детали ткани',
  folded: 'Сложенный вид',
  cutout: 'Без фона',
  lifestyle: 'Lifestyle сцена',
  source: 'Исходное фото',
}

const seoScore = computed(() => card.value?.readiness.seo ?? 0)

const readinessRows = computed(() => {
  const r = card.value?.readiness
  if (!r) return []
  return [
    { label: 'Контент', value: r.content },
    { label: 'Характеристики', value: r.specs },
    { label: 'SEO', value: r.seo },
    { label: 'Изображения', value: r.images },
    { label: 'Адаптация', value: r.adaptation },
  ]
})

const CH_LABEL: Record<ChannelStatus, string> = {
  ready: 'Готово',
  check: 'Требует проверки',
  published: 'Опубликовано',
  draft: 'Черновик',
}
const CH_TONE: Record<ChannelStatus, string> = {
  ready: 'bg-emerald-50 text-emerald-700',
  check: 'bg-amber-50 text-amber-700',
  published: 'bg-brand-50 text-brand-700',
  draft: 'bg-ink-100 text-ink-500',
}

const STATUS_LABEL = { active: 'Активная', draft: 'Черновик', archived: 'В архиве' } as const
const STATUS_TONE = {
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  draft: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  archived: 'bg-ink-100 text-ink-500 ring-1 ring-ink-200',
} as const

/* ---------- Форматирование ---------- */

function fmtFull(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  return `${Math.floor(h / 24)} дн назад`
}

/* ---------- Действия ---------- */

function startEdit(field: 'name' | 'short' | 'full', value: string) {
  editing.value = field
  editBuffer.value = value
}

function saveEdit() {
  const c = card.value
  const l = lang.value
  if (!c || !editing.value || editing.value === 'advantages') return
  const block = c.content[l]
  if (!block) return
  const patchContent = { ...c.content, [l]: { ...block, [editing.value]: editBuffer.value } }
  const labels = { name: 'название', short: 'краткое описание', full: 'полное описание' }
  store.updateCard(
    c.id,
    { content: patchContent },
    `Обновлено ${labels[editing.value]} (${LANG_LABEL[l]})`,
  )
  editing.value = ''
}

function cancelEdit() {
  editing.value = ''
}

function updateSpec(i: number, key: 'label' | 'value', val: string) {
  const c = card.value
  if (!c) return
  const specs = c.specs.map((s, idx) => (idx === i ? { ...s, [key]: val } : s))
  store.updateCard(c.id, { specs })
}

function removeSpec(i: number) {
  const c = card.value
  if (!c) return
  store.updateCard(
    c.id,
    { specs: c.specs.filter((_, idx) => idx !== i) },
    'Удалена характеристика',
  )
}

function addSpec() {
  const c = card.value
  if (!c) return
  store.updateCard(c.id, { specs: [...c.specs, { label: '', value: '' }] })
}

function toggleChannel(id: string) {
  const c = card.value
  if (!c) return
  const channels = c.channels.map((ch) =>
    ch.id === id
      ? { ...ch, status: (ch.status === 'published' ? 'ready' : 'published') as ChannelStatus }
      : ch,
  )
  const target = c.channels.find((ch) => ch.id === id)
  store.updateCard(
    c.id,
    { channels },
    target?.status === 'published'
      ? `Снята публикация: ${target.name}`
      : `Опубликовано на ${target?.name}`,
  )
}

function setStatus(s: SkuCard['status']) {
  const c = card.value
  if (!c) return
  store.updateCard(c.id, { status: s }, `Статус изменён на «${STATUS_LABEL[s]}»`)
}

function restoreVersion(vid: string) {
  const c = card.value
  if (!c) return
  const versions = c.versions.map((v) => ({ ...v, current: v.id === vid }))
  const v = c.versions.find((x) => x.id === vid)
  store.updateCard(c.id, { versions }, `Восстановлена версия ${v?.label}`)
}

function exportJson() {
  const c = card.value
  if (!c) return
  const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${c.sku}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* ignore */
  }
}

function openLightbox(index: number) {
  if (!gallery.value[index]) return
  lightboxIndex.value = index
}

function closeLightbox() {
  lightboxIndex.value = null
}

function lightboxPrev() {
  const n = gallery.value.length
  if (!n || lightboxIndex.value === null) return
  lightboxIndex.value = (lightboxIndex.value - 1 + n) % n
}

function lightboxNext() {
  const n = gallery.value.length
  if (!n || lightboxIndex.value === null) return
  lightboxIndex.value = (lightboxIndex.value + 1) % n
}

const lightboxItem = computed(() =>
  lightboxIndex.value === null ? null : gallery.value[lightboxIndex.value] || null,
)

function onLightboxKey(e: KeyboardEvent) {
  if (lightboxIndex.value === null) return
  if (e.key === 'Escape') closeLightbox()
  else if (e.key === 'ArrowLeft') lightboxPrev()
  else if (e.key === 'ArrowRight') lightboxNext()
}

watch(lightboxIndex, (idx, prev) => {
  if (idx !== null && prev === null) window.addEventListener('keydown', onLightboxKey)
  if (idx === null && prev !== null) window.removeEventListener('keydown', onLightboxKey)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onLightboxKey))

function fileNameFromUrl(url: string, fallback: string) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
    if (name && name.includes('.')) return name
  } catch {
    /* ignore */
  }
  const ext = url.match(/\.(jpe?g|png|webp|gif)(?:$|\?)/i)?.[1] || 'jpg'
  return `${fallback}.${ext}`
}

async function downloadImage(url: string, name: string) {
  try {
    const resp = await fetch(url, { mode: 'cors' })
    if (!resp.ok) throw new Error('fetch failed')
    const blob = await resp.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    a.click()
  }
}

function downloadAllImages() {
  gallery.value.forEach((g, i) => {
    const name = fileNameFromUrl(g.url, SLOT_TITLE[g.slot] || `image-${i + 1}`)
    setTimeout(() => downloadImage(g.url, name), i * 250)
  })
}

const creditRows = computed(() => {
  const c = card.value
  if (!c) return []
  const b = c.creditBreakdown
  if (b && (b.analysis || b.content || b.images)) {
    return [
      { label: 'Анализ фото', value: b.analysis },
      { label: 'Генерация контента', value: b.content },
      { label: 'Генерация изображений', value: b.images },
    ].filter((r) => r.value > 0)
  }
  return c.credits > 0 ? [{ label: 'AI-генерация карточки', value: c.credits }] : []
})

function removeCard() {
  const c = card.value
  if (!c) return
  if (confirm(`Удалить карточку ${c.sku}? Действие необратимо.`)) {
    store.removeCard(c.id)
    router.push('/studios/product-cards/history')
  }
}
</script>

<template>
  <!-- Карточка не найдена -->
  <div v-if="!card" class="page">
    <div class="card p-12 text-center">
      <div class="mx-auto h-14 w-14 rounded-2xl bg-ink-50 grid place-items-center">
        <Icon name="alert" :size="24" class="text-ink-400" />
      </div>
      <h2 class="mt-4 text-lg font-bold text-ink-900">Карточка не найдена</h2>
      <p class="mt-1 text-sm text-ink-400">
        Возможно, она была удалена или хранится в другом браузере.
      </p>
      <RouterLink
        to="/studios/product-cards/history"
        class="btn btn-brand h-10 px-5 text-sm font-semibold mt-5 inline-flex"
      >
        <Icon name="history" :size="15" />
        К истории карточек
      </RouterLink>
    </div>
  </div>

  <div v-else class="page space-y-5 animate-fade-in">
    <!-- Хлебные крошки -->
    <div class="flex items-center gap-1.5 text-xs text-ink-400 flex-wrap">
      <RouterLink to="/" class="hover:text-ink-700">Главная</RouterLink>
      <Icon name="chevronRight" :size="12" />
      <RouterLink to="/studios/product-cards" class="hover:text-ink-700">Карточки товара</RouterLink>
      <Icon name="chevronRight" :size="12" />
      <RouterLink to="/studios/product-cards/history" class="hover:text-ink-700">История</RouterLink>
      <Icon name="chevronRight" :size="12" />
      <span class="text-ink-700 font-semibold truncate max-w-[220px]">{{ card.sku }}</span>
    </div>

    <!-- Заголовок -->
    <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2.5 flex-wrap">
          <h1 class="text-2xl font-extrabold text-ink-900 tracking-tight">
            {{ card.content.ru?.name || card.analysis?.title || 'Карточка товара' }}
          </h1>
          <span
            class="px-2.5 py-1 rounded-lg text-[11px] font-bold"
            :class="STATUS_TONE[card.status]"
          >
            {{ STATUS_LABEL[card.status] }}
          </span>
        </div>
        <p class="text-xs text-ink-400 mt-1.5 font-mono flex items-center gap-1.5 flex-wrap">
          <span>SKU: {{ card.sku }}</span>
          <button
            class="text-ink-300 hover:text-brand-600"
            title="Скопировать SKU"
            @click="copy(card.sku)"
          >
            <Icon name="copy" :size="12" />
          </button>
          <span class="text-ink-200">·</span>
          <span>ID: {{ card.productId }}</span>
          <span class="text-ink-200">·</span>
          <span class="font-sans">Создано: {{ fmtFull(card.createdAt) }}</span>
        </p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <button
          class="btn h-9 px-3.5 border border-ink-200 text-ink-700 hover:bg-ink-50 text-xs font-semibold"
          @click="exportJson"
        >
          <Icon name="download" :size="14" />
          Экспорт JSON
        </button>
        <button
          class="btn h-9 px-3.5 border border-ink-200 text-ink-700 hover:bg-ink-50 text-xs font-semibold"
          @click="copy(card.sku)"
        >
          <Icon name="link" :size="14" />
          Копировать SKU
        </button>
        <button
          class="btn h-9 px-3.5 border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold"
          @click="removeCard"
        >
          <Icon name="trash" :size="14" />
          Удалить
        </button>
        <RouterLink
          to="/studios/product-cards"
          class="btn btn-brand h-9 px-4 text-xs font-semibold"
        >
          <Icon name="plus" :size="14" />
          Новая карточка
        </RouterLink>
      </div>
    </div>

    <!-- Табы -->
    <div class="border-b border-ink-100 overflow-x-auto">
      <div class="flex items-center gap-1 min-w-max">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="h-10 px-3.5 inline-flex items-center gap-1.5 text-xs font-bold border-b-2 -mb-px transition whitespace-nowrap"
          :class="
            tab === t.id
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-ink-400 hover:text-ink-700'
          "
          @click="tab = t.id"
        >
          <Icon :name="t.icon" :size="14" />
          {{ t.label }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
      <!-- ============ ЛЕВАЯ КОЛОНКА ============ -->
      <div class="space-y-5 min-w-0">
        <!-- ---------- ОБЗОР ---------- -->
        <template v-if="tab === 'overview'">
          <div class="card p-4 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5">
            <!-- Галерея -->
            <div>
              <button
                type="button"
                class="aspect-[3/4] w-full rounded-xl bg-ink-50 overflow-hidden grid place-items-center"
                :disabled="!gallery[activeImage]"
                @click="openLightbox(activeImage)"
              >
                <img
                  v-if="gallery[activeImage]"
                  :src="gallery[activeImage].url"
                  :alt="SLOT_TITLE[gallery[activeImage].slot]"
                  class="w-full h-full object-contain"
                />
                <Icon v-else name="image" :size="28" class="text-ink-300" />
              </button>
              <div v-if="gallery.length > 1" class="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
                <button
                  v-for="(g, i) in gallery.slice(0, 5)"
                  :key="g.url"
                  class="h-12 w-12 shrink-0 rounded-lg overflow-hidden border-2 transition"
                  :class="activeImage === i ? 'border-brand-600' : 'border-transparent opacity-70 hover:opacity-100'"
                  @click="activeImage = i"
                >
                  <img :src="g.url" alt="" class="w-full h-full object-cover" />
                </button>
                <span
                  v-if="gallery.length > 5"
                  class="h-12 px-2.5 shrink-0 rounded-lg bg-ink-100 grid place-items-center text-[11px] font-bold text-ink-500 cursor-pointer hover:bg-ink-200"
                  @click="tab = 'images'"
                >
                  +{{ gallery.length - 5 }}
                </span>
              </div>
              <p class="text-[11px] text-ink-400 mt-2 text-center">
                {{ SLOT_TITLE[gallery[activeImage]?.slot] || '—' }}
              </p>
            </div>

            <!-- Контент-блоки -->
            <div class="space-y-4 min-w-0">
              <div class="flex items-center gap-1 p-1 rounded-xl bg-ink-50 w-max">
                <button
                  v-for="l in availableLangs"
                  :key="l"
                  class="h-7 px-2.5 rounded-lg text-[11px] font-bold transition"
                  :class="lang === l ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-400 hover:text-ink-700'"
                  @click="lang = l"
                >
                  {{ LANG_LABEL[l] }}
                </button>
              </div>

              <!-- Название -->
              <section>
                <div class="flex items-center justify-between mb-1">
                  <h3 class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">
                    Название товара
                  </h3>
                  <button
                    v-if="editing !== 'name'"
                    class="text-[11px] font-semibold text-brand-600 hover:text-brand-800 inline-flex items-center gap-1"
                    @click="startEdit('name', cur?.name || '')"
                  >
                    <Icon name="edit" :size="11" /> Редактировать
                  </button>
                </div>
                <textarea
                  v-if="editing === 'name'"
                  v-model="editBuffer"
                  rows="2"
                  class="w-full p-2.5 rounded-xl border border-brand-300 text-sm outline-none focus:ring-2 focus:ring-brand-100 resize-none"
                />
                <p v-else class="text-sm font-semibold text-ink-900">{{ cur?.name || '—' }}</p>
                <div v-if="editing === 'name'" class="flex gap-2 mt-2">
                  <button class="btn btn-brand h-8 px-3 text-[11px] font-bold" @click="saveEdit">
                    Сохранить
                  </button>
                  <button
                    class="btn h-8 px-3 border border-ink-200 text-ink-600 text-[11px] font-bold"
                    @click="cancelEdit"
                  >
                    Отмена
                  </button>
                </div>
              </section>

              <!-- Краткое описание -->
              <section>
                <div class="flex items-center justify-between mb-1">
                  <h3 class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">
                    Краткое описание
                  </h3>
                  <button
                    v-if="editing !== 'short'"
                    class="text-[11px] font-semibold text-brand-600 hover:text-brand-800 inline-flex items-center gap-1"
                    @click="startEdit('short', cur?.short || '')"
                  >
                    <Icon name="edit" :size="11" /> Редактировать
                  </button>
                </div>
                <textarea
                  v-if="editing === 'short'"
                  v-model="editBuffer"
                  rows="3"
                  class="w-full p-2.5 rounded-xl border border-brand-300 text-sm outline-none focus:ring-2 focus:ring-brand-100 resize-none"
                />
                <p v-else class="text-sm text-ink-600 leading-relaxed">{{ cur?.short || '—' }}</p>
                <div v-if="editing === 'short'" class="flex gap-2 mt-2">
                  <button class="btn btn-brand h-8 px-3 text-[11px] font-bold" @click="saveEdit">
                    Сохранить
                  </button>
                  <button
                    class="btn h-8 px-3 border border-ink-200 text-ink-600 text-[11px] font-bold"
                    @click="cancelEdit"
                  >
                    Отмена
                  </button>
                </div>
              </section>

              <!-- Ключевые преимущества -->
              <section v-if="cur?.advantages?.length">
                <h3 class="text-[11px] font-bold text-ink-400 uppercase tracking-wide mb-2">
                  Ключевые преимущества
                </h3>
                <ul class="grid sm:grid-cols-2 gap-1.5">
                  <li
                    v-for="(a, i) in cur.advantages"
                    :key="i"
                    class="flex items-start gap-2 p-2 rounded-lg bg-emerald-50/60"
                  >
                    <Icon name="check" :size="13" class="text-emerald-600 mt-0.5 shrink-0" />
                    <span class="text-xs text-ink-700 leading-snug">{{ a }}</span>
                  </li>
                </ul>
              </section>
            </div>
          </div>

          <!-- Полное описание -->
          <div class="card p-4">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-bold text-ink-900">Полное описание</h3>
              <button
                v-if="editing !== 'full'"
                class="text-[11px] font-semibold text-brand-600 hover:text-brand-800 inline-flex items-center gap-1"
                @click="startEdit('full', cur?.full || '')"
              >
                <Icon name="edit" :size="11" /> Редактировать
              </button>
            </div>
            <textarea
              v-if="editing === 'full'"
              v-model="editBuffer"
              rows="10"
              class="w-full p-3 rounded-xl border border-brand-300 text-sm outline-none focus:ring-2 focus:ring-brand-100 leading-relaxed"
            />
            <p v-else class="text-sm text-ink-600 leading-relaxed whitespace-pre-line">
              {{ cur?.full || '—' }}
            </p>
            <div v-if="editing === 'full'" class="flex gap-2 mt-2">
              <button class="btn btn-brand h-8 px-3 text-[11px] font-bold" @click="saveEdit">
                Сохранить
              </button>
              <button
                class="btn h-8 px-3 border border-ink-200 text-ink-600 text-[11px] font-bold"
                @click="cancelEdit"
              >
                Отмена
              </button>
            </div>
          </div>

          <!-- Характеристики (краткая таблица) -->
          <div class="card p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-bold text-ink-900">Характеристики</h3>
              <button
                class="text-[11px] font-semibold text-brand-600 hover:text-brand-800"
                @click="tab = 'specs'"
              >
                Все ({{ card.specs.length }})
              </button>
            </div>
            <dl class="grid sm:grid-cols-2 gap-x-6">
              <div
                v-for="(s, i) in card.specs.slice(0, 10)"
                :key="i"
                class="flex items-baseline justify-between gap-3 py-2 border-b border-ink-100 last:border-0"
              >
                <dt class="text-xs text-ink-400 shrink-0">{{ s.label }}</dt>
                <dd class="text-xs font-semibold text-ink-800 text-right">{{ s.value }}</dd>
              </div>
            </dl>
            <p v-if="!card.specs.length" class="text-xs text-ink-400">Характеристики не заданы.</p>
          </div>
        </template>

        <!-- ---------- КОНТЕНТ ---------- -->
        <template v-else-if="tab === 'content'">
          <div class="card p-4 space-y-4">
            <div class="flex items-center justify-between gap-3 flex-wrap">
              <div class="flex items-center gap-1 p-1 rounded-xl bg-ink-50">
                <button
                  v-for="l in availableLangs"
                  :key="l"
                  class="h-8 px-3 rounded-lg text-xs font-bold transition"
                  :class="lang === l ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-400 hover:text-ink-700'"
                  @click="lang = l"
                >
                  {{ LANG_LABEL[l] }}
                  <span class="text-ink-300 font-normal ml-0.5">{{ LANG_FULL[l] }}</span>
                </button>
              </div>
              <button
                class="btn h-8 px-3 border border-ink-200 text-ink-600 text-[11px] font-bold"
                @click="copy(
                  [cur?.name, cur?.short, cur?.full].filter(Boolean).join('\n\n'),
                )"
              >
                <Icon name="copy" :size="12" /> Скопировать всё
              </button>
            </div>

            <div v-if="cur" class="space-y-4">
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-xs font-bold text-ink-700">Название товара</label>
                  <span class="text-[11px] text-ink-300">{{ cur.name.length }}/150</span>
                </div>
                <textarea
                  :value="cur.name"
                  rows="2"
                  class="w-full p-2.5 rounded-xl border border-ink-200 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 resize-none"
                  @change="
                    (e) => {
                      editing = 'name'
                      editBuffer = (e.target as HTMLTextAreaElement).value
                      saveEdit()
                    }
                  "
                />
              </div>

              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-xs font-bold text-ink-700">Краткое описание</label>
                  <span class="text-[11px] text-ink-300">{{ cur.short.length }}/200</span>
                </div>
                <textarea
                  :value="cur.short"
                  rows="3"
                  class="w-full p-2.5 rounded-xl border border-ink-200 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 resize-none"
                  @change="
                    (e) => {
                      editing = 'short'
                      editBuffer = (e.target as HTMLTextAreaElement).value
                      saveEdit()
                    }
                  "
                />
              </div>

              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-xs font-bold text-ink-700">Полное описание</label>
                  <span class="text-[11px] text-ink-300">{{ cur.full.length }}/3000</span>
                </div>
                <textarea
                  :value="cur.full"
                  rows="12"
                  class="w-full p-3 rounded-xl border border-ink-200 text-sm leading-relaxed outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  @change="
                    (e) => {
                      editing = 'full'
                      editBuffer = (e.target as HTMLTextAreaElement).value
                      saveEdit()
                    }
                  "
                />
              </div>

              <div v-if="cur.advantages.length">
                <label class="text-xs font-bold text-ink-700 block mb-2">Ключевые преимущества</label>
                <ul class="space-y-1.5">
                  <li
                    v-for="(a, i) in cur.advantages"
                    :key="i"
                    class="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50/60"
                  >
                    <Icon name="check" :size="13" class="text-emerald-600 mt-0.5 shrink-0" />
                    <span class="text-xs text-ink-700 leading-snug">{{ a }}</span>
                  </li>
                </ul>
              </div>
            </div>
            <p v-else class="text-sm text-ink-400">Контент на этом языке не сгенерирован.</p>
          </div>
        </template>

        <!-- ---------- ИЗОБРАЖЕНИЯ ---------- -->
        <template v-else-if="tab === 'images'">
          <div class="card p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-bold text-ink-900">
                Изображения карточки
                <span class="text-ink-300 font-semibold">({{ gallery.length }})</span>
              </h3>
              <button
                class="btn h-8 px-3 border border-ink-200 text-ink-600 text-[11px] font-bold"
                :disabled="!gallery.length"
                @click="downloadAllImages"
              >
                <Icon name="download" :size="12" /> Скачать все
              </button>
            </div>
            <div v-if="gallery.length" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <figure
                v-for="(g, i) in gallery"
                :key="g.url"
                class="rounded-xl border border-ink-100 overflow-hidden group"
              >
                <div class="relative aspect-square bg-ink-50">
                  <img :src="g.url" :alt="SLOT_TITLE[g.slot]" class="w-full h-full object-contain" />
                  <button
                    type="button"
                    class="absolute inset-0 bg-ink-900/50 opacity-0 group-hover:opacity-100 transition grid place-items-center"
                    @click="openLightbox(i)"
                  >
                    <span
                      class="px-3 h-8 rounded-lg bg-white text-ink-900 text-[11px] font-bold inline-flex items-center gap-1.5"
                    >
                      <Icon name="expand" :size="12" /> Открыть
                    </span>
                  </button>
                </div>
                <figcaption class="px-2.5 py-2 text-[11px] font-semibold text-ink-600">
                  {{ SLOT_TITLE[g.slot] || g.slot }}
                </figcaption>
              </figure>
            </div>
            <p v-else class="text-sm text-ink-400">Изображения ещё не созданы.</p>
          </div>
        </template>

        <!-- ---------- ХАРАКТЕРИСТИКИ ---------- -->
        <template v-else-if="tab === 'specs'">
          <div class="card p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-bold text-ink-900">
                Характеристики
                <span class="text-ink-300 font-semibold">({{ card.specs.length }})</span>
              </h3>
              <button
                class="btn h-8 px-3 border border-ink-200 text-ink-600 text-[11px] font-bold"
                @click="addSpec"
              >
                <Icon name="plus" :size="12" /> Добавить
              </button>
            </div>
            <div class="space-y-2">
              <div
                v-for="(s, i) in card.specs"
                :key="i"
                class="grid grid-cols-[1fr_1.4fr_32px] gap-2 items-center"
              >
                <input
                  :value="s.label"
                  placeholder="Название"
                  class="h-9 px-2.5 rounded-lg border border-ink-200 text-xs outline-none focus:border-brand-400"
                  @change="updateSpec(i, 'label', ($event.target as HTMLInputElement).value)"
                />
                <input
                  :value="s.value"
                  placeholder="Значение"
                  class="h-9 px-2.5 rounded-lg border border-ink-200 text-xs outline-none focus:border-brand-400"
                  @change="updateSpec(i, 'value', ($event.target as HTMLInputElement).value)"
                />
                <button
                  class="h-8 w-8 grid place-items-center rounded-lg text-ink-300 hover:text-rose-600 hover:bg-rose-50"
                  @click="removeSpec(i)"
                >
                  <Icon name="trash" :size="13" />
                </button>
              </div>
            </div>
            <p v-if="!card.specs.length" class="text-xs text-ink-400">Пока нет характеристик.</p>
          </div>
        </template>

        <!-- ---------- SEO ---------- -->
        <template v-else-if="tab === 'seo'">
          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-1 p-1 rounded-xl bg-ink-50 w-max">
              <button
                v-for="l in availableLangs"
                :key="l"
                class="h-8 px-3 rounded-lg text-xs font-bold transition"
                :class="lang === l ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-400 hover:text-ink-700'"
                @click="lang = l"
              >
                {{ LANG_LABEL[l] }}
              </button>
            </div>

            <div v-if="cur" class="space-y-4">
              <!-- Превью выдачи -->
              <div class="rounded-xl border border-ink-200 p-3.5 bg-white">
                <p class="text-[11px] text-emerald-700 mb-0.5">
                  coolay.website › товары › {{ card.sku.toLowerCase() }}
                </p>
                <p class="text-[15px] text-blue-700 leading-snug hover:underline cursor-pointer">
                  {{ cur.seo.title }}
                </p>
                <p class="text-xs text-ink-500 leading-snug mt-1">{{ cur.seo.description }}</p>
              </div>

              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-xs font-bold text-ink-700">SEO Title</label>
                  <span
                    class="text-[11px]"
                    :class="cur.seo.title.length > 60 ? 'text-rose-500' : 'text-ink-300'"
                  >
                    {{ cur.seo.title.length }}/60
                  </span>
                </div>
                <input
                  :value="cur.seo.title"
                  class="w-full h-10 px-3 rounded-xl border border-ink-200 text-sm outline-none focus:border-brand-400"
                  readonly
                />
              </div>

              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="text-xs font-bold text-ink-700">SEO Description</label>
                  <span
                    class="text-[11px]"
                    :class="cur.seo.description.length > 160 ? 'text-rose-500' : 'text-ink-300'"
                  >
                    {{ cur.seo.description.length }}/160
                  </span>
                </div>
                <textarea
                  :value="cur.seo.description"
                  rows="3"
                  class="w-full p-2.5 rounded-xl border border-ink-200 text-sm outline-none focus:border-brand-400 resize-none"
                  readonly
                />
              </div>

              <div>
                <label class="text-xs font-bold text-ink-700 block mb-1.5">
                  Ключевые слова ({{ cur.seo.keywords.length }})
                </label>
                <div class="flex flex-wrap gap-1.5">
                  <span
                    v-for="(k, i) in cur.seo.keywords"
                    :key="i"
                    class="px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 text-[11px] font-semibold"
                  >
                    {{ k }}
                  </span>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-ink-400">SEO для этого языка не сгенерировано.</p>
          </div>
        </template>

        <!-- ---------- МАРКЕТПЛЕЙСЫ ---------- -->
        <template v-else-if="tab === 'marketplaces'">
          <div class="card p-4">
            <h3 class="text-sm font-bold text-ink-900 mb-3">Публикация на площадках</h3>
            <div class="space-y-2">
              <div
                v-for="ch in card.channels"
                :key="ch.id"
                class="flex items-center gap-3 p-3 rounded-xl border border-ink-100 hover:border-ink-200 transition"
              >
                <span
                  class="h-9 w-9 shrink-0 rounded-lg grid place-items-center text-[11px] font-extrabold"
                  :class="ch.tone"
                >
                  {{ ch.short }}
                </span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-ink-900">{{ ch.name }}</p>
                  <p class="text-[11px] text-ink-400">
                    {{
                      ch.status === 'check'
                        ? 'Не хватает части обязательных полей'
                        : 'Карточка соответствует требованиям площадки'
                    }}
                  </p>
                </div>
                <span
                  class="px-2 py-1 rounded-lg text-[10px] font-bold shrink-0"
                  :class="CH_TONE[ch.status]"
                >
                  {{ CH_LABEL[ch.status] }}
                </span>
                <button
                  class="btn h-8 px-3 text-[11px] font-bold shrink-0"
                  :class="
                    ch.status === 'published'
                      ? 'border border-ink-200 text-ink-600'
                      : 'btn-brand'
                  "
                  @click="toggleChannel(ch.id)"
                >
                  {{ ch.status === 'published' ? 'Снять' : 'Опубликовать' }}
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- ---------- ВЕРСИИ ---------- -->
        <template v-else-if="tab === 'versions'">
          <div class="card p-4">
            <h3 class="text-sm font-bold text-ink-900 mb-3">Версии карточки</h3>
            <div class="space-y-2">
              <div
                v-for="v in card.versions"
                :key="v.id"
                class="flex items-center gap-3 p-3 rounded-xl border transition"
                :class="v.current ? 'border-brand-300 bg-brand-50/50' : 'border-ink-100'"
              >
                <span
                  class="h-9 w-14 shrink-0 rounded-lg grid place-items-center text-[11px] font-extrabold"
                  :class="v.current ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'"
                >
                  {{ v.label }}
                </span>
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-semibold text-ink-900">{{ v.note || 'Изменение карточки' }}</p>
                  <p class="text-[11px] text-ink-400">{{ v.author }} · {{ fmtShort(v.createdAt) }}</p>
                </div>
                <span
                  v-if="v.current"
                  class="px-2 py-1 rounded-lg bg-brand-100 text-brand-700 text-[10px] font-bold shrink-0"
                >
                  Текущая
                </span>
                <button
                  v-else
                  class="btn h-8 px-3 border border-ink-200 text-ink-600 text-[11px] font-bold shrink-0"
                  @click="restoreVersion(v.id)"
                >
                  <Icon name="refresh" :size="12" /> Восстановить
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- ---------- ИСТОРИЯ ---------- -->
        <template v-else>
          <div class="card p-4">
            <h3 class="text-sm font-bold text-ink-900 mb-3">Последняя активность</h3>
            <ol class="relative pl-5 space-y-4">
              <span class="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-ink-100" />
              <li v-for="a in card.activity" :key="a.id" class="relative">
                <span
                  class="absolute -left-5 top-0.5 h-4 w-4 rounded-full bg-brand-50 ring-2 ring-white grid place-items-center"
                >
                  <Icon :name="a.icon" :size="9" class="text-brand-600" />
                </span>
                <p class="text-xs font-semibold text-ink-800 leading-snug">{{ a.text }}</p>
                <p class="text-[11px] text-ink-400 mt-0.5">
                  {{ a.author }} · {{ ago(a.createdAt) }}
                </p>
              </li>
            </ol>
          </div>
        </template>
      </div>

      <!-- ============ ПРАВАЯ КОЛОНКА ============ -->
      <aside class="space-y-4">
        <!-- Статус -->
        <div class="card p-4">
          <h3 class="text-xs font-bold text-ink-400 uppercase tracking-wide mb-3">Статус</h3>
          <div class="flex items-center gap-1 p-1 rounded-xl bg-ink-50 mb-3">
            <button
              v-for="s in (['active', 'draft', 'archived'] as const)"
              :key="s"
              class="flex-1 h-8 rounded-lg text-[11px] font-bold transition"
              :class="
                card.status === s ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-400 hover:text-ink-700'
              "
              @click="setStatus(s)"
            >
              {{ STATUS_LABEL[s] }}
            </button>
          </div>
          <dl class="space-y-2 text-xs">
            <div class="flex justify-between">
              <dt class="text-ink-400">Автор</dt>
              <dd class="font-semibold text-ink-800">{{ card.author }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-400">Создано через</dt>
              <dd class="font-semibold text-ink-800">{{ card.createdVia }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-400">Обновлено</dt>
              <dd class="font-semibold text-ink-800">{{ ago(card.updatedAt) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-400">Потрачено кредитов</dt>
              <dd class="font-semibold text-ink-800">{{ card.credits }}</dd>
            </div>
          </dl>
          <ul v-if="creditRows.length" class="mt-3 pt-3 border-t border-ink-100 space-y-1.5">
            <li
              v-for="row in creditRows"
              :key="row.label"
              class="flex items-center justify-between text-[11px]"
            >
              <span class="text-ink-400">{{ row.label }}</span>
              <span class="font-bold text-ink-800 tabular-nums">−{{ row.value }}</span>
            </li>
          </ul>
          <RouterLink
            to="/usage"
            class="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-800"
          >
            Журнал списаний
            <Icon name="arrowRight" :size="12" />
          </RouterLink>
        </div>

        <!-- Готовность -->
        <div class="card p-4">
          <h3 class="text-xs font-bold text-ink-400 uppercase tracking-wide mb-3">
            Готовность карточки
          </h3>
          <div class="flex items-center gap-3.5 mb-3">
            <ReadinessRing :value="card.readiness.total" :size="72" :stroke="7" />
            <div>
              <p class="text-xs font-bold text-ink-900">
                {{
                  card.readiness.total >= 85
                    ? 'Отличная карточка'
                    : card.readiness.total >= 60
                      ? 'Можно улучшить'
                      : 'Требует доработки'
                }}
              </p>
              <p class="text-[11px] text-ink-400 leading-snug mt-0.5">
                Оценка по контенту, характеристикам, SEO, фото и языкам.
              </p>
            </div>
          </div>
          <div class="space-y-2">
            <div v-for="r in readinessRows" :key="r.label">
              <div class="flex justify-between text-[11px] mb-0.5">
                <span class="text-ink-500">{{ r.label }}</span>
                <span class="font-bold text-ink-800">{{ r.value }}%</span>
              </div>
              <div class="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-700"
                  :class="r.value >= 85 ? 'bg-emerald-500' : r.value >= 60 ? 'bg-amber-500' : 'bg-rose-500'"
                  :style="{ width: r.value + '%' }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Публикация -->
        <div class="card p-4">
          <h3 class="text-xs font-bold text-ink-400 uppercase tracking-wide mb-3">
            Публикация на площадках
          </h3>
          <ul class="space-y-2">
            <li v-for="ch in card.channels" :key="ch.id" class="flex items-center gap-2.5">
              <span
                class="h-7 w-7 shrink-0 rounded-lg grid place-items-center text-[10px] font-extrabold"
                :class="ch.tone"
              >
                {{ ch.short }}
              </span>
              <span class="flex-1 text-xs font-semibold text-ink-700 truncate">{{ ch.name }}</span>
              <span
                class="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0"
                :class="CH_TONE[ch.status]"
              >
                {{ CH_LABEL[ch.status] }}
              </span>
            </li>
          </ul>
        </div>

        <!-- SEO оптимизация -->
        <div class="card p-4">
          <h3 class="text-xs font-bold text-ink-400 uppercase tracking-wide mb-3">
            SEO оптимизация
          </h3>
          <div class="flex items-center gap-3.5">
            <ReadinessRing :value="seoScore" :size="64" :stroke="6" />
            <div class="min-w-0">
              <p class="text-xs font-bold text-ink-900">
                {{ seoScore >= 85 ? 'Хорошо оптимизировано' : 'Есть что улучшить' }}
              </p>
              <p class="text-[11px] text-ink-400 leading-snug mt-0.5">
                Title, description и {{ cur?.seo.keywords.length || 0 }} ключевых слов.
              </p>
              <button
                class="text-[11px] font-bold text-brand-600 hover:text-brand-800 mt-1"
                @click="tab = 'seo'"
              >
                Открыть SEO →
              </button>
            </div>
          </div>
        </div>

        <!-- AI-ассистент -->
        <div class="card p-4 bg-gradient-to-br from-brand-50 to-white border border-brand-100">
          <div class="flex items-center gap-2 mb-2">
            <span class="h-8 w-8 rounded-xl bg-brand-600 grid place-items-center">
              <Icon name="robot" :size="15" class="text-white" />
            </span>
            <div>
              <p class="text-xs font-bold text-ink-900">AI-ассистент</p>
              <p class="text-[10px] text-brand-600 font-bold tracking-wide">BETA</p>
            </div>
          </div>
          <p class="text-[11px] text-ink-500 leading-snug mb-2.5">
            Подскажу, как усилить карточку и поднять конверсию.
          </p>
          <div class="flex flex-wrap gap-1.5">
            <RouterLink
              to="/studios/product-cards"
              class="px-2.5 py-1.5 rounded-lg bg-white border border-brand-200 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
            >
              Улучшить описание
            </RouterLink>
            <RouterLink
              to="/studios/product-cards"
              class="px-2.5 py-1.5 rounded-lg bg-white border border-brand-200 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
            >
              Добавить фото
            </RouterLink>
            <RouterLink
              to="/studios/product-cards"
              class="px-2.5 py-1.5 rounded-lg bg-white border border-brand-200 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
            >
              Адаптировать под WB
            </RouterLink>
          </div>
        </div>
      </aside>
    </div>

    <!-- Нижний блок: версии + активность (как на скриншоте) -->
    <div v-if="tab === 'overview'" class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-ink-900">Версии карточки</h3>
          <button
            class="text-[11px] font-semibold text-brand-600 hover:text-brand-800"
            @click="tab = 'versions'"
          >
            Все версии
          </button>
        </div>
        <div class="space-y-2">
          <div
            v-for="v in card.versions.slice(0, 3)"
            :key="v.id"
            class="flex items-center gap-3 p-2.5 rounded-xl"
            :class="v.current ? 'bg-brand-50/60' : 'bg-ink-50/60'"
          >
            <span
              class="h-8 w-12 shrink-0 rounded-lg grid place-items-center text-[11px] font-extrabold"
              :class="v.current ? 'bg-brand-600 text-white' : 'bg-white text-ink-600'"
            >
              {{ v.label }}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-ink-800 truncate">
                {{ v.note || 'Изменение карточки' }}
              </p>
              <p class="text-[11px] text-ink-400">{{ fmtShort(v.createdAt) }}</p>
            </div>
            <span
              v-if="v.current"
              class="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-100 text-brand-700"
            >
              Текущая
            </span>
          </div>
        </div>
      </div>

      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-ink-900">Последняя активность</h3>
          <button
            class="text-[11px] font-semibold text-brand-600 hover:text-brand-800"
            @click="tab = 'history'"
          >
            Вся история
          </button>
        </div>
        <ol class="relative pl-5 space-y-3.5">
          <span class="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-ink-100" />
          <li v-for="a in card.activity.slice(0, 5)" :key="a.id" class="relative">
            <span
              class="absolute -left-5 top-0.5 h-4 w-4 rounded-full bg-brand-50 ring-2 ring-white grid place-items-center"
            >
              <Icon :name="a.icon" :size="9" class="text-brand-600" />
            </span>
            <p class="text-xs font-semibold text-ink-800 leading-snug">{{ a.text }}</p>
            <p class="text-[11px] text-ink-400 mt-0.5">{{ a.author }} · {{ ago(a.createdAt) }}</p>
          </li>
        </ol>
      </div>
    </div>

    <!-- Лайтбокс: оригинал в модалке, без новой вкладки -->
    <Teleport to="body">
      <div
        v-if="lightboxItem"
        class="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
        @click.self="closeLightbox"
      >
        <button
          type="button"
          class="absolute top-4 right-4 grid place-items-center w-11 h-11 rounded-xl bg-white/10 text-white hover:bg-white/20 transition"
          aria-label="Закрыть"
          @click="closeLightbox"
        >
          <Icon name="x" :size="22" />
        </button>
        <button
          v-if="gallery.length > 1"
          type="button"
          class="absolute left-3 sm:left-6 grid place-items-center w-11 h-11 rounded-xl bg-white/10 text-white hover:bg-white/20 transition"
          aria-label="Предыдущее"
          @click="lightboxPrev"
        >
          <Icon name="chevronLeft" :size="22" />
        </button>
        <button
          v-if="gallery.length > 1"
          type="button"
          class="absolute right-3 sm:right-6 grid place-items-center w-11 h-11 rounded-xl bg-white/10 text-white hover:bg-white/20 transition"
          aria-label="Следующее"
          @click="lightboxNext"
        >
          <Icon name="chevronRight" :size="22" />
        </button>
        <div class="max-w-6xl w-full flex flex-col items-center" @click.stop>
          <img
            :src="lightboxItem.url"
            :alt="SLOT_TITLE[lightboxItem.slot] || lightboxItem.slot"
            class="max-h-[82vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl bg-black/20"
          />
          <div class="mt-4 flex flex-wrap items-center justify-center gap-3 text-white">
            <span class="font-bold">{{ SLOT_TITLE[lightboxItem.slot] || lightboxItem.slot }}</span>
            <span class="opacity-40">·</span>
            <span class="text-sm opacity-70">{{ (lightboxIndex ?? 0) + 1 }} / {{ gallery.length }}</span>
            <button
              type="button"
              class="h-8 px-3 rounded-lg bg-white text-ink-900 text-[11px] font-bold inline-flex items-center gap-1.5"
              @click="
                downloadImage(
                  lightboxItem.url,
                  fileNameFromUrl(lightboxItem.url, SLOT_TITLE[lightboxItem.slot] || 'image'),
                )
              "
            >
              <Icon name="download" :size="12" /> Скачать
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
