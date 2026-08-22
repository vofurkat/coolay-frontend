<script setup lang="ts">
/**
 * Пакетная генерация карточек — до 10 товаров за один запуск.
 *
 * ЗАЧЕМ. Прежде мастер вёл ровно один товар за раз: чтобы обработать десять
 * позиций, приходилось десять раз проходить весь путь заново.
 *
 * КАК УСТРОЕНО. Каждое фото проходит анализ (нужен и для описания товара, и
 * для поиска дублей), затем все товары уходят ОДНИМ заданием на сервер.
 * Порядок кадров внутри товара держит серверный конвейер: сначала эталонный
 * кадр с моделью, потом остальные ракурсы с той же моделью. Товары идут
 * волнами — сервер сам ограничивает одновременную нагрузку на генерацию.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import { DEFAULT_SLOTS, computeReadiness, useProductCardsStore } from '@/stores/productCards'
import { useAuthStore } from '@/stores/auth'
import {
  analyzePhoto,
  createBatchJob,
  createCard,
  findSimilar,
  generateContent,
  imageHash,
  readJob,
  type JobItemInput,
  type SimilarMatch,
  type SkuJob,
} from '@/data/skuApi'
import { DUPLICATE_THRESHOLD } from '@/data/similarity'
import type { SkuAnalysis, SkuSlotId } from '@/types/sku'

/** Ограничение согласовано с заказчиком и совпадает с лимитом сервера. */
const MAX_ITEMS = 10

const router = useRouter()
const store = useProductCardsStore()
const auth = useAuthStore()

type RowState =
  | 'new'
  | 'analyzing'
  | 'ready'
  | 'generating'
  | 'saving'
  | 'done'
  | 'fail'

interface Row {
  id: string
  file: File
  preview: string
  name: string
  size: number
  state: RowState
  error: string
  analysis: SkuAnalysis | null
  imageUrl: string
  hash: string
  /** Найденные ранее созданные похожие товары — предупреждение, не блокер. */
  similar: SimilarMatch[]
  /** Идентификатор товара внутри серверного задания. */
  itemId: string
  images: { slotId: SkuSlotId; state: string; url: string }[]
  cardId: string
  anchorUrl: string
}

const rows = ref<Row[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const error = ref('')
const busy = ref(false)
const busyText = ref('')
const job = ref<SkuJob | null>(null)
const slots = ref<SkuSlotId[]>([...DEFAULT_SLOTS])
let pollTimer: number | undefined

onBeforeUnmount(() => stopPolling())

const canAddMore = computed(() => rows.value.length < MAX_ITEMS)
const analyzedRows = computed(() => rows.value.filter((r) => r.analysis && r.imageUrl))
const duplicates = computed(() =>
  rows.value.filter((r) => r.similar.some((s) => s.similarity >= DUPLICATE_THRESHOLD)),
)
/** Слоты кадров: 'main' всегда первый, дальше выбор пользователя без повторов. */
const uniqueSlots = computed(() => [...new Set<SkuSlotId>(['main', ...slots.value])])
/** Сколько кадров спишется — считаем заранее, чтобы не было сюрприза по кредитам. */
const framesTotal = computed(() => analyzedRows.value.length * uniqueSlots.value.length)

const running = computed(() => job.value?.state === 'running')
const finished = computed(() => !!job.value && job.value.state === 'done')

/* ─────────── Загрузка файлов ─────────── */

function pick() {
  fileInput.value?.click()
}

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  addFiles(Array.from(input.files || []))
  // Сбрасываем значение, иначе повторный выбор того же файла не даст события.
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  addFiles(Array.from(e.dataTransfer?.files || []))
}

function addFiles(files: File[]) {
  error.value = ''
  const free = MAX_ITEMS - rows.value.length
  if (free <= 0) {
    error.value = `За один раз можно обработать не больше ${MAX_ITEMS} товаров`
    return
  }
  const accepted = files.filter((f) => f.type.startsWith('image/'))
  if (accepted.length < files.length) {
    error.value = 'Часть файлов пропущена — нужны изображения (JPG, PNG или WebP)'
  }
  if (accepted.length > free) {
    error.value = `Добавлены первые ${free} — предел ${MAX_ITEMS} товаров за раз`
  }
  for (const file of accepted.slice(0, free)) {
    if (file.size > 25 * 1024 * 1024) {
      error.value = `«${file.name}» больше 25 МБ и пропущен`
      continue
    }
    const reader = new FileReader()
    const row: Row = {
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      preview: '',
      name: file.name,
      size: file.size,
      state: 'new',
      error: '',
      analysis: null,
      imageUrl: '',
      hash: '',
      similar: [],
      itemId: '',
      images: [],
      cardId: '',
      anchorUrl: '',
    }
    reader.onload = () => {
      row.preview = String(reader.result)
    }
    reader.readAsDataURL(file)
    rows.value.push(row)
  }
}

function removeRow(id: string) {
  if (running.value) return
  rows.value = rows.value.filter((r) => r.id !== id)
}

function fmtSize(b: number) {
  return b < 1024 * 1024 ? `${Math.round(b / 1024)} КБ` : `${(b / 1024 / 1024).toFixed(1)} МБ`
}

/* ─────────── Шаг 1: анализ каждого фото ─────────── */

/**
 * Анализ идёт последовательно, а не разом.
 * Десять одновременных запросов к модели анализа упираются в ограничение
 * скорости у провайдера: часть падает с ошибкой, и пользователь видит
 * случайные сбои вместо результата.
 */
async function analyzeAll() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const pending = rows.value.filter((r) => !r.analysis)
  let i = 0
  for (const row of pending) {
    i++
    busyText.value = `Анализируем фото ${i} из ${pending.length}…`
    row.state = 'analyzing'
    row.error = ''
    const res = await analyzePhoto(row.preview)
    if (!res.ok) {
      row.state = 'fail'
      row.error = res.error
      continue
    }
    row.analysis = res.analysis
    row.imageUrl = res.imageUrl
    row.state = 'ready'

    // Поиск дублей: хеш считаем в браузере, сравнение — на сервере.
    row.hash = await imageHash(row.preview)
    const sim = await findSimilar({ analysis: res.analysis, imageHash: row.hash || undefined })
    if (sim.ok) row.similar = sim.matches
  }
  busy.value = false
  busyText.value = ''
}

/* ─────────── Шаг 2: одно задание на все товары ─────────── */

async function startGeneration() {
  const ready = analyzedRows.value
  if (!ready.length || busy.value) return
  busy.value = true
  busyText.value = 'Ставим задание на генерацию…'
  error.value = ''

  const items: JobItemInput[] = ready.map((r) => ({
    imageUrl: r.imageUrl,
    productPrompt: r.analysis!.imagePrompt,
    slots: uniqueSlots.value,
    settings: store.draft.imageSettings,
    gender: r.analysis!.gender,
    label: r.analysis!.title || r.name,
  }))

  const res = await createBatchJob(items)
  busy.value = false
  busyText.value = ''
  if (!res.ok) {
    error.value = res.error
    return
  }
  // Порядок товаров в ответе совпадает с порядком отправки — связываем по индексу.
  res.job.items.forEach((it, idx) => {
    const row = ready[idx]
    if (!row) return
    row.itemId = it.id
    row.state = 'generating'
  })
  applyJob(res.job)
  startPolling()
}

function applyJob(j: SkuJob) {
  job.value = j
  for (const item of j.items) {
    const row = rows.value.find((r) => r.itemId === item.id)
    if (!row) continue
    row.images = item.images.map((i) => ({ slotId: i.slotId, state: i.state, url: i.url }))
    if (item.anchorUrl) row.anchorUrl = item.anchorUrl
    if (item.state === 'done' && row.state === 'generating') {
      // Карточку сохраняем сразу по готовности товара, не дожидаясь всего
      // пакета: иначе при закрытии страницы результат пропал бы.
      void saveRow(row, item)
    }
  }
}

/**
 * Готовый товар → карточка на сервере.
 * Контент генерируем здесь же: без названия и описания карточка бесполезна,
 * а на шаге пакета пользователь их не заполняет вручную.
 */
async function saveRow(row: Row, item: SkuJob['items'][number]) {
  if (row.cardId || row.state === 'saving') return
  row.state = 'saving'
  const good = item.images.filter((i) => i.state === 'success' && i.url)

  const content = await generateContent({
    analysis: row.analysis!,
    tone: store.draft.tone,
    withAdvantages: true,
  })
  if (!content.ok) {
    row.state = 'fail'
    row.error = content.error
    return
  }

  const images = good.map((i) => ({
    slotId: i.slotId,
    taskId: null,
    state: 'success' as const,
    url: i.url,
  }))

  const res = await createCard({
    sku: content.sku,
    productId: content.productId,
    author: auth.user?.name || 'Пользователь',
    createdVia: 'Пакетная генерация',
    sourceImage: row.imageUrl,
    images,
    analysis: row.analysis!,
    content: content.content,
    specs: content.specs,
    tone: store.draft.tone,
    imageHash: row.hash,
    anchorUrl: row.anchorUrl,
    modelPassport: item.modelPassport,
    batchId: job.value?.id || null,
    readiness: computeReadiness({
      content: content.content,
      specs: content.specs,
      images,
    }),
  })
  if (!res.ok) {
    row.state = 'fail'
    row.error = res.error
    return
  }
  row.cardId = res.card.id
  row.state = 'done'
}

/* ─────────── Опрос задания ─────────── */

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
  const id = job.value?.id
  if (!id) {
    stopPolling()
    return
  }
  const res = await readJob(id)
  if (!res.ok) return
  applyJob(res.job)
  if (res.job.state === 'done') stopPolling()
}

function reset() {
  stopPolling()
  rows.value = []
  job.value = null
  error.value = ''
}

/* ─────────── Отображение ─────────── */

const STATE_LABEL: Record<RowState, string> = {
  new: 'Ожидает анализа',
  analyzing: 'Анализ фото…',
  ready: 'Готов к генерации',
  generating: 'Генерация кадров…',
  saving: 'Сохраняем карточку…',
  done: 'Готово',
  fail: 'Ошибка',
}

const STATE_TONE: Record<RowState, string> = {
  new: 'bg-ink-100 text-ink-600',
  analyzing: 'bg-sky-100 text-sky-700',
  ready: 'bg-brand-50 text-brand-700',
  generating: 'bg-amber-100 text-amber-700',
  saving: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700',
  fail: 'bg-rose-100 text-rose-700',
}

function rowProgress(row: Row) {
  if (!row.images.length) return 0
  const done = row.images.filter((i) => i.state === 'success').length
  return Math.round((done / row.images.length) * 100)
}
</script>

<template>
  <div class="page space-y-5 animate-fade-in">
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="onFiles"
    />

    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <h1 class="text-2xl sm:text-[28px] font-extrabold text-ink-900 tracking-tight">
          Пакетная генерация
        </h1>
        <p class="text-sm text-ink-500 mt-1">
          Загрузите до {{ MAX_ITEMS }} фото разных товаров — карточки создадутся за один проход.
        </p>
      </div>
      <RouterLink to="/studios/product-cards" class="btn btn-ghost btn-sm shrink-0">
        <Icon name="card" :size="15" />
        Один товар
      </RouterLink>
    </div>

    <!-- Ошибки уровня страницы -->
    <div
      v-if="error"
      class="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100"
    >
      <Icon name="alert" :size="16" class="text-rose-600 mt-0.5 shrink-0" />
      <p class="text-xs text-rose-700 flex-1">{{ error }}</p>
      <button type="button" class="text-xs font-semibold text-rose-700" @click="error = ''">
        Скрыть
      </button>
    </div>

    <!-- Зона загрузки -->
    <div
      v-if="canAddMore && !running && !finished"
      class="rounded-2xl border-2 border-dashed p-6 text-center transition"
      :class="dragOver ? 'border-brand-400 bg-brand-50/40' : 'border-ink-200 bg-white'"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <div class="grid place-items-center w-12 h-12 mx-auto rounded-2xl bg-brand-50 text-brand-600">
        <Icon name="upload" :size="22" />
      </div>
      <p class="mt-3 font-bold text-ink-900 text-sm">Перетащите фото товаров сюда</p>
      <p class="text-xs text-ink-500 mt-1">
        Добавлено {{ rows.length }} из {{ MAX_ITEMS }} · JPG, PNG или WebP, до 25 МБ
      </p>
      <button type="button" class="btn btn-primary btn-sm mt-3" @click="pick">
        Выбрать файлы
      </button>
    </div>

    <!-- Список товаров -->
    <div v-if="rows.length" class="card p-4 sm:p-5">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-extrabold text-ink-900 text-base">Товары ({{ rows.length }})</h2>
        <button
          v-if="!running"
          type="button"
          class="text-xs font-semibold text-ink-500 hover:text-ink-900"
          @click="reset"
        >
          Очистить
        </button>
      </div>

      <div class="space-y-2.5">
        <div
          v-for="row in rows"
          :key="row.id"
          class="flex items-start gap-3 p-3 rounded-xl border border-ink-100"
        >
          <img
            v-if="row.preview"
            :src="row.preview"
            :alt="row.name"
            class="w-14 h-14 rounded-lg object-cover bg-ink-100 shrink-0"
          />
          <div v-else class="w-14 h-14 rounded-lg bg-ink-100 shrink-0" />

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-sm font-semibold text-ink-900 truncate">
                {{ row.analysis?.title || row.name }}
              </p>
              <span
                class="text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0"
                :class="STATE_TONE[row.state]"
              >
                {{ STATE_LABEL[row.state] }}
              </span>
            </div>
            <p class="text-[11px] text-ink-500 mt-0.5 truncate">
              {{ row.analysis?.category || fmtSize(row.size) }}
            </p>

            <!-- Предупреждение о дубле -->
            <RouterLink
              v-if="row.similar.some((s) => s.similarity >= 90)"
              :to="`/studios/product-cards/${row.similar[0].id}`"
              class="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 hover:text-amber-800"
            >
              <Icon name="alert" :size="13" />
              Похож на «{{ row.similar[0].title }}» ({{ row.similar[0].similarity }}%)
            </RouterLink>

            <p v-if="row.error" class="text-[11px] text-rose-600 mt-1">{{ row.error }}</p>

            <!-- Прогресс кадров -->
            <div v-if="row.images.length" class="mt-2">
              <div class="h-1.5 rounded-full bg-ink-100 overflow-hidden">
                <div
                  class="h-full bg-brand-600 rounded-full transition-all duration-700"
                  :style="{ width: `${rowProgress(row)}%` }"
                />
              </div>
              <p class="text-[10px] text-ink-500 mt-1">
                {{ row.images.filter((i) => i.state === 'success').length }} из
                {{ row.images.length }} кадров
                <span v-if="row.anchorUrl" class="text-emerald-600">· модель зафиксирована</span>
              </p>
            </div>
          </div>

          <RouterLink
            v-if="row.cardId"
            :to="`/studios/product-cards/${row.cardId}`"
            class="btn btn-sm btn-outline shrink-0"
          >
            Открыть
          </RouterLink>
          <button
            v-else-if="!running"
            type="button"
            class="grid place-items-center w-8 h-8 rounded-lg text-ink-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
            @click="removeRow(row.id)"
          >
            <Icon name="trash" :size="15" />
          </button>
        </div>
      </div>

      <!-- Сводка и действия -->
      <div class="mt-4 pt-3 border-t border-ink-100">
        <div v-if="job" class="mb-3">
          <div class="flex items-center justify-between text-[11px] font-semibold mb-1.5">
            <span class="text-ink-600">
              Товаров готово {{ job.progress.itemsDone }} из {{ job.progress.items }} ·
              кадров {{ job.progress.imagesDone }} из {{ job.progress.images }}
            </span>
            <span v-if="job.progress.imagesFailed" class="text-rose-600">
              ошибок: {{ job.progress.imagesFailed }}
            </span>
          </div>
          <p class="text-[11px] text-ink-500">
            Товары обрабатываются волнами по {{ job.concurrency }} — так сервис генерации не
            отклоняет кадры из-за перегрузки.
          </p>
        </div>

        <div v-if="duplicates.length && !job" class="mb-3 flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-100">
          <Icon name="alert" :size="15" class="text-amber-600 mt-0.5 shrink-0" />
          <p class="text-[11px] text-amber-800">
            {{ duplicates.length }}
            {{ duplicates.length === 1 ? 'товар похож' : 'товара похожи' }}
            на уже созданные. Проверьте список — лишние можно удалить перед запуском.
          </p>
        </div>

        <div class="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <p class="text-[11px] text-ink-500">
            <template v-if="!job">
              К генерации: {{ analyzedRows.length }}
              {{ analyzedRows.length === 1 ? 'товар' : 'товаров' }} ·
              {{ framesTotal }} кадров
            </template>
            <template v-else-if="finished">
              Пакет завершён. Карточки сохранены в проектах.
            </template>
          </p>

          <div class="flex gap-2">
            <button
              v-if="rows.some((r) => !r.analysis) && !job"
              type="button"
              class="btn btn-md btn-outline"
              :disabled="busy"
              @click="analyzeAll"
            >
              {{ busy ? busyText || 'Анализируем…' : 'Анализировать фото' }}
            </button>
            <button
              v-if="!job"
              type="button"
              class="btn btn-md btn-primary"
              :disabled="busy || !analyzedRows.length"
              @click="startGeneration"
            >
              Создать {{ analyzedRows.length || '' }}
              {{ analyzedRows.length === 1 ? 'карточку' : 'карточек' }}
              <Icon name="arrowRight" :size="16" />
            </button>
            <RouterLink v-if="finished" to="/projects" class="btn btn-md btn-primary">
              Открыть проекты
              <Icon name="arrowRight" :size="16" />
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
