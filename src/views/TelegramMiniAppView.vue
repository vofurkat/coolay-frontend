<script setup lang="ts">
/**
 * Mini App внутри Telegram: @coolay_bot → кнопка «Открыть приложение».
 *
 * ОТЛИЧИЯ ОТ САЙТА, и почему они есть:
 *  - Вход не по паролю, а по initData Telegram + номеру телефона, который
 *    администратор внёс в «Настройки → Пользователи». Сотруднику не нужна
 *    учётная запись на сайте.
 *  - Всё общение идёт через POST /api/telegram/miniapp/* — cookie-сессии здесь
 *    нет, initData передаётся в каждом запросе.
 *  - Вёрстка одноколоночная и с крупными зонами нажатия: это телефон внутри
 *    окна Telegram, а не десктоп.
 *
 * ДВА РЕЖИМА, как просил заказчик:
 *  - одиночный: один товар, выбор ракурсов;
 *  - массовый: до 10 товаров одним заданием.
 * Оба используют один и тот же серверный конвейер, что и сайт, поэтому
 * модель на всех кадрах товара остаётся одна и та же.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import { SLOT_DEFS } from '@/stores/productCards'
import type { SkuAnalysis, SkuSlotId } from '@/types/sku'

/* ─────────── мост к Telegram ─────────── */

interface TgWebApp {
  initData: string
  ready: () => void
  expand: () => void
  colorScheme?: string
  HapticFeedback?: { notificationOccurred: (t: 'success' | 'error' | 'warning') => void }
  showAlert?: (m: string) => void
  MainButton?: {
    setText: (t: string) => void
    show: () => void
    hide: () => void
    onClick: (cb: () => void) => void
    enable: () => void
    disable: () => void
  }
}

function tgApp(): TgWebApp | null {
  const w = window as unknown as { Telegram?: { WebApp?: TgWebApp } }
  return w.Telegram?.WebApp || null
}

const initData = ref('')
const outsideTelegram = ref(false)

/* ─────────── состояние экрана ─────────── */

type Phase = 'auth' | 'pick' | 'analyzing' | 'ready' | 'generating' | 'saving' | 'done'

const phase = ref<Phase>('auth')
const authError = ref('')
const needsPhone = ref(false)
const employee = ref<{ id: string; fullName: string; role: string; canGenerate: boolean } | null>(null)
const usage = ref<{ left: number; limit: number; planLabel: string } | null>(null)
const notice = ref('')

/** Режим работы: одиночный товар или пакет. */
const mode = ref<'single' | 'batch'>('single')

interface Row {
  key: string
  /** Локальный предпросмотр (data URL) — показываем сразу, до загрузки. */
  preview: string
  /** Публичный URL после анализа — с ним работает генератор. */
  imageUrl: string
  analysis: SkuAnalysis | null
  state: 'new' | 'analyzing' | 'ready' | 'generating' | 'done' | 'fail'
  error: string
  done: number
  total: number
  cardId: string
}

const rows = ref<Row[]>([])
const jobId = ref('')
const savedCount = ref(0)

const MAX_BATCH = 10
const maxItems = computed(() => (mode.value === 'batch' ? MAX_BATCH : 1))

/** Ракурсы: в боте по умолчанию два кадра — экономнее по кредитам. */
const slots = ref<SkuSlotId[]>(['main', 'front'])
const slotOptions = SLOT_DEFS.filter((s) => s.id !== 'main')

const uniqueSlots = computed<SkuSlotId[]>(() => [...new Set<SkuSlotId>(['main', ...slots.value])])
const analyzedRows = computed(() => rows.value.filter((r) => r.analysis && r.imageUrl))
const framesTotal = computed(() => analyzedRows.value.length * uniqueSlots.value.length)
const notEnoughCredits = computed(() => !!usage.value && framesTotal.value > usage.value.left)
const canAdd = computed(() => rows.value.length < maxItems.value)
const busy = computed(() => ['analyzing', 'generating', 'saving'].includes(phase.value))

function toggleSlot(id: SkuSlotId) {
  if (id === 'main') return // основное фото обязательно
  slots.value = slots.value.includes(id)
    ? slots.value.filter((s) => s !== id)
    : [...slots.value, id]
}

function setMode(m: 'single' | 'batch') {
  if (busy.value) return
  mode.value = m
  // При переходе в одиночный режим лишние товары убираем, иначе останется
  // неочевидное состояние «режим один, а в списке пять».
  if (m === 'single' && rows.value.length > 1) rows.value = rows.value.slice(0, 1)
}

/* ─────────── запросы ─────────── */

async function api<T>(step: string, body: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const resp = await fetch('/api/telegram/miniapp/sku', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData.value, step, ...body }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || data.ok === false) {
      notice.value = data.error || `Ошибка ${resp.status}`
      return null
    }
    return data as T
  } catch {
    notice.value = 'Нет связи с сервером — проверьте интернет'
    return null
  }
}

async function auth() {
  authError.value = ''
  const resp = await fetch('/api/telegram/miniapp/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: initData.value }),
  }).catch(() => null)

  if (!resp) {
    authError.value = 'Нет связи с сервером'
    return
  }
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data.ok === false) {
    authError.value = data.error || 'Не удалось войти'
    needsPhone.value = !!data.needsPhone
    return
  }
  employee.value = data.employee
  usage.value = data.usage
  // Бот мог уже прислать фото — подхватываем их, чтобы не заставлять
  // выбирать файл заново.
  const photos: string[] = Array.isArray(data.photos) ? data.photos : []
  if (photos.length) {
    rows.value = photos.slice(0, MAX_BATCH).map((u, i) => ({
      key: `p${i}_${Date.now()}`,
      preview: u,
      imageUrl: '',
      analysis: null,
      state: 'new' as const,
      error: '',
      done: 0,
      total: 0,
      cardId: '',
    }))
    if (photos.length > 1) mode.value = 'batch'
  }
  phase.value = 'pick'
}

/* ─────────── выбор файлов ─────────── */

const fileInput = ref<HTMLInputElement | null>(null)

function pick() {
  fileInput.value?.click()
}

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  const free = maxItems.value - rows.value.length
  if (free <= 0) {
    notice.value =
      mode.value === 'single'
        ? 'В одиночном режиме один товар. Переключитесь на «Пакет».'
        : `Максимум ${MAX_BATCH} товаров за раз`
    return
  }
  for (const f of files.slice(0, free)) {
    if (!f.type.startsWith('image/')) continue
    if (f.size > 25 * 1024 * 1024) {
      notice.value = `«${f.name}» больше 25 МБ`
      continue
    }
    const fr = new FileReader()
    fr.onload = () => {
      rows.value.push({
        key: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        preview: String(fr.result || ''),
        imageUrl: '',
        analysis: null,
        state: 'new',
        error: '',
        done: 0,
        total: 0,
        cardId: '',
      })
    }
    fr.readAsDataURL(f)
  }
}

function removeRow(key: string) {
  if (busy.value) return
  rows.value = rows.value.filter((r) => r.key !== key)
}

/* ─────────── шаг 1: анализ ─────────── */

async function analyzeAll() {
  if (!rows.value.length) {
    notice.value = 'Добавьте фото товара'
    return
  }
  phase.value = 'analyzing'
  notice.value = ''

  // Последовательно, а не Promise.all: 10 одновременных распознаваний
  // упираются в лимиты провайдера, часть падает — и кредиты за них уже сняты.
  for (const row of rows.value) {
    if (row.analysis && row.imageUrl) continue
    row.state = 'analyzing'
    row.error = ''
    const isDataUrl = row.preview.startsWith('data:')
    const r = await api<{ imageUrl: string; analysis: SkuAnalysis }>('analyze', {
      ...(isDataUrl ? { image: row.preview } : { imageUrl: row.preview }),
    })
    if (!r) {
      row.state = 'fail'
      row.error = notice.value || 'Не удалось распознать'
      continue
    }
    row.imageUrl = r.imageUrl
    row.analysis = r.analysis
    row.state = 'ready'
    if (usage.value) usage.value.left = Math.max(0, usage.value.left - 1)
  }

  phase.value = analyzedRows.value.length ? 'ready' : 'pick'
}

/* ─────────── шаг 2: генерация ─────────── */

interface JobItemResp {
  state: string
  progress: { total: number; done: number; failed: number }
  images: Array<{ slotId: string; state: string; url: string }>
  anchorUrl?: string
  modelPassport?: unknown
}
interface JobResp {
  job: {
    id: string
    state: string
    items: JobItemResp[]
  }
}

let timer: ReturnType<typeof setInterval> | null = null

function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}
onBeforeUnmount(stopPolling)

async function startGeneration() {
  const list = analyzedRows.value
  if (!list.length) return
  if (notEnoughCredits.value) {
    notice.value = 'Не хватает генераций — обратитесь к администратору'
    return
  }
  phase.value = 'generating'
  notice.value = ''
  list.forEach((r) => {
    r.state = 'generating'
    r.total = uniqueSlots.value.length
    r.done = 0
  })

  const r = await api<JobResp>('generate', {
    items: list.map((row) => ({
      imageUrl: row.imageUrl,
      productPrompt: row.analysis?.imagePrompt || '',
      gender: row.analysis?.gender || '',
      slots: uniqueSlots.value,
      label: row.analysis?.title || '',
    })),
    // Одиночный режим отправляет тот же массив из одного элемента —
    // отдельной ветки на сервере не нужно.
    imageUrl: list[0].imageUrl,
    slots: uniqueSlots.value,
    productPrompt: list[0].analysis?.imagePrompt || '',
    gender: list[0].analysis?.gender || '',
  })
  if (!r) {
    phase.value = 'ready'
    list.forEach((row) => (row.state = 'ready'))
    return
  }
  jobId.value = r.job.id
  apply(r.job)
  timer = setInterval(() => void tick(), 4000)
}

async function tick() {
  if (!jobId.value) return
  const r = await api<JobResp>('poll', { jobId: jobId.value })
  if (!r) {
    // Задание могло пропасть (перезапуск, чистка журнала) — не опрашиваем вечно.
    if (/не найдено/i.test(notice.value)) stopPolling()
    return
  }
  apply(r.job)
}

function apply(job: JobResp['job']) {
  const list = analyzedRows.value
  job.items.forEach((item, i) => {
    const row = list[i]
    if (!row) return
    row.done = item.progress.done
    row.total = item.progress.total
    if (item.state === 'done') {
      const ok = item.images.filter((im) => im.state === 'success' && im.url)
      row.state = ok.length ? 'done' : 'fail'
      if (!ok.length) row.error = 'Кадры не удались'
    }
  })

  if (job.state === 'done') {
    stopPolling()
    void saveAll(job)
  }
}

/* ─────────── шаг 3: сохранение ─────────── */

async function saveAll(job: JobResp['job']) {
  phase.value = 'saving'
  const list = analyzedRows.value
  savedCount.value = 0

  for (let i = 0; i < job.items.length; i++) {
    const item = job.items[i]
    const row = list[i]
    if (!row || row.state !== 'done' || row.cardId) continue

    const images = item.images
      .filter((im) => im.state === 'success' && im.url)
      .map((im) => ({ slotId: im.slotId, url: im.url, state: 'success' }))

    // Текст карточки — отдельным вызовом: генерация кадров и текста
    // разнесены и на сайте, поэтому поведение совпадает.
    const c = await api<{ content: unknown; specs: unknown }>('content', {
      analysis: row.analysis,
      tone: 'Нейтральный',
    })

    const saved = await api<{ card: { id: string } }>('save', {
      card: {
        sku: row.analysis?.title || 'SKU',
        sourceImage: row.imageUrl,
        analysis: row.analysis,
        content: c?.content || {},
        specs: c?.specs || [],
        images,
        anchorUrl: item.anchorUrl || '',
        modelPassport: item.modelPassport || null,
        createdVia: 'Telegram',
        credits: item.progress.done,
      },
    })
    if (saved?.card?.id) {
      row.cardId = saved.card.id
      savedCount.value++
    }
  }
  phase.value = 'done'
  tgApp()?.HapticFeedback?.notificationOccurred('success')
}

function reset() {
  stopPolling()
  rows.value = []
  jobId.value = ''
  savedCount.value = 0
  notice.value = ''
  phase.value = 'pick'
}

/* ─────────── запуск ─────────── */

onMounted(() => {
  const app = tgApp()
  if (!app || !app.initData) {
    // Открыто в обычном браузере: initData подделать нельзя, сервер откажет.
    // Честно говорим об этом вместо непонятной ошибки 401.
    outsideTelegram.value = true
    authError.value = 'Откройте приложение через бота @coolay_bot'
    return
  }
  app.ready()
  app.expand()
  initData.value = app.initData
  void auth()
})
</script>

<template>
  <div class="min-h-screen bg-white text-ink-900 px-4 py-5 max-w-md mx-auto">
    <!-- Заголовок -->
    <div class="flex items-center justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h1 class="font-extrabold text-lg leading-tight">Coolay</h1>
        <p v-if="employee" class="text-xs text-ink-400 truncate">{{ employee.fullName }}</p>
      </div>
      <span v-if="usage" class="chip bg-ink-900 text-accent shrink-0 whitespace-nowrap">
        {{ usage.left }} / {{ usage.limit }}
      </span>
    </div>

    <!-- Нет доступа -->
    <div v-if="phase === 'auth'" class="space-y-4">
      <div v-if="authError" class="card p-5 text-center space-y-3">
        <span class="grid place-items-center w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 mx-auto">
          <Icon name="alert" :size="24" />
        </span>
        <p class="font-bold">{{ authError }}</p>
        <p v-if="needsPhone" class="text-sm text-ink-400">
          Откройте бота, нажмите <b>/start</b> и поделитесь номером телефона. Номер должен
          совпадать с тем, который внёс администратор.
        </p>
        <p v-else-if="outsideTelegram" class="text-sm text-ink-400">
          Это мини-приложение работает только внутри Telegram.
        </p>
        <button v-if="!outsideTelegram" class="btn btn-outline btn-md" @click="auth">
          Проверить снова
        </button>
      </div>
      <div v-else class="text-center py-16 text-ink-400">
        <Icon name="loader" :size="24" class="animate-spin inline-block" />
        <p class="text-sm mt-2">Проверяем доступ…</p>
      </div>
    </div>

    <!-- Работа -->
    <div v-else class="space-y-4">
      <!-- Режим -->
      <div class="grid grid-cols-2 gap-2">
        <button
          class="rounded-xl border px-3 py-2.5 text-left transition"
          :class="mode === 'single' ? 'border-ink-900 bg-ink-50' : 'border-ink-200'"
          :disabled="busy"
          @click="setMode('single')"
        >
          <span class="font-bold text-sm block">Один товар</span>
          <span class="text-xs text-ink-400">Одна карточка</span>
        </button>
        <button
          class="rounded-xl border px-3 py-2.5 text-left transition"
          :class="mode === 'batch' ? 'border-ink-900 bg-ink-50' : 'border-ink-200'"
          :disabled="busy"
          @click="setMode('batch')"
        >
          <span class="font-bold text-sm block">Пакет</span>
          <span class="text-xs text-ink-400">До {{ MAX_BATCH }} товаров</span>
        </button>
      </div>

      <!-- Фото -->
      <div v-if="phase !== 'done'">
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          :multiple="mode === 'batch'"
          class="hidden"
          @change="onFiles"
        />
        <button
          v-if="canAdd && !busy"
          class="w-full rounded-2xl border-2 border-dashed border-ink-200 py-6 text-center hover:border-ink-300 transition"
          @click="pick"
        >
          <Icon name="camera" :size="26" class="text-ink-400" />
          <p class="font-bold text-sm mt-1">Добавить фото товара</p>
          <p class="text-xs text-ink-400">
            {{ mode === 'batch' ? `можно выбрать несколько, осталось ${maxItems - rows.length}` : 'одно фото' }}
          </p>
        </button>

        <ul v-if="rows.length" class="space-y-2 mt-3">
          <li
            v-for="r in rows"
            :key="r.key"
            class="flex items-center gap-3 rounded-xl border border-ink-100 p-2"
          >
            <img :src="r.preview" alt="" class="w-14 h-14 rounded-lg object-cover bg-ink-50 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-bold truncate">
                {{ r.analysis?.title || 'Фото товара' }}
              </p>
              <p v-if="r.state === 'analyzing'" class="text-xs text-ink-400">Распознаём…</p>
              <p v-else-if="r.state === 'generating'" class="text-xs text-ink-400">
                Кадры: {{ r.done }} / {{ r.total }}
              </p>
              <p v-else-if="r.state === 'done'" class="text-xs text-green-600">Готово</p>
              <p v-else-if="r.state === 'fail'" class="text-xs text-red-600">{{ r.error }}</p>
              <p v-else-if="r.analysis" class="text-xs text-ink-400 truncate">
                {{ r.analysis.category || r.analysis.productType }}
              </p>
            </div>
            <button
              v-if="!busy"
              class="grid place-items-center w-8 h-8 rounded-lg text-ink-400 hover:bg-ink-100 shrink-0"
              @click="removeRow(r.key)"
            >
              <Icon name="x" :size="16" />
            </button>
          </li>
        </ul>
      </div>

      <!-- Ракурсы -->
      <div v-if="phase === 'ready'">
        <p class="label">Ракурсы</p>
        <div class="flex flex-wrap gap-2">
          <span class="chip bg-ink-900 text-accent">Основное фото</span>
          <button
            v-for="s in slotOptions"
            :key="s.id"
            class="chip transition"
            :class="slots.includes(s.id) ? 'bg-ink-900 text-accent' : 'bg-ink-50 text-ink-500'"
            @click="toggleSlot(s.id)"
          >
            {{ s.title }}
          </button>
        </div>
        <p class="text-xs text-ink-400 mt-2">
          Будет создано <b>{{ framesTotal }}</b> кадров ·
          {{ analyzedRows.length }} товар(ов) × {{ uniqueSlots.length }}
        </p>
        <p class="text-xs text-ink-400 mt-1">
          Модель на всех кадрах одного товара будет одна и та же.
        </p>
        <p v-if="notEnoughCredits" class="text-xs text-red-600 mt-2">
          Не хватает генераций: нужно {{ framesTotal }}, доступно {{ usage?.left }}.
        </p>
      </div>

      <!-- Прогресс -->
      <div v-if="phase === 'generating' || phase === 'saving'" class="card p-4 text-center">
        <Icon name="loader" :size="22" class="animate-spin inline-block text-ink-400" />
        <p class="font-bold text-sm mt-2">
          {{ phase === 'saving' ? 'Сохраняем карточки…' : 'Создаём кадры…' }}
        </p>
        <p class="text-xs text-ink-400 mt-1">
          Можно закрыть окно — работа продолжится, результат будет в «Моих проектах».
        </p>
      </div>

      <!-- Готово -->
      <div v-if="phase === 'done'" class="card p-5 text-center space-y-2">
        <span class="grid place-items-center w-12 h-12 rounded-2xl bg-green-50 text-green-600 mx-auto">
          <Icon name="check" :size="24" />
        </span>
        <p class="font-extrabold">Готово</p>
        <p class="text-sm text-ink-400">
          Сохранено карточек: <b>{{ savedCount }}</b>. Они появились в разделе «Мои проекты».
        </p>
        <button class="btn btn-accent btn-md w-full mt-2" @click="reset">Создать ещё</button>
      </div>

      <p v-if="notice" class="text-sm text-red-600">{{ notice }}</p>

      <!-- Действия -->
      <div v-if="phase === 'pick'" class="pt-1">
        <button
          class="btn btn-accent btn-md w-full"
          :disabled="!rows.length"
          @click="analyzeAll"
        >
          <Icon name="sparkles" :size="18" /> Распознать
          {{ rows.length > 1 ? `(${rows.length})` : '' }}
        </button>
      </div>
      <div v-else-if="phase === 'analyzing'" class="text-center py-2 text-ink-400 text-sm">
        <Icon name="loader" :size="18" class="animate-spin inline-block" /> Распознаём товары…
      </div>
      <div v-else-if="phase === 'ready'" class="space-y-2">
        <button
          class="btn btn-accent btn-md w-full"
          :disabled="notEnoughCredits || !analyzedRows.length"
          @click="startGeneration"
        >
          <Icon name="sparkles" :size="18" /> Создать {{ framesTotal }} кадров
        </button>
        <button v-if="canAdd" class="btn btn-outline btn-md w-full" @click="pick">
          <Icon name="plus" :size="16" /> Добавить ещё товар
        </button>
      </div>
    </div>
  </div>
</template>
