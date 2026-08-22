// Клиент модуля «Карточки товара». Ключ kie.ai живёт только на бэкенде.

import type {
  LangCode,
  SkuAnalysis,
  SkuCard,
  SkuContent,
  SkuImageSettings,
  SkuModelPassport,
  SkuSlotId,
  SkuSpec,
} from '@/types/sku'

interface Fail {
  ok: false
  error: string
}

/** Общий разбор ответа: сервер всегда отвечает { ok, ... } либо { ok:false, error }. */
async function request<T>(path: string, init?: RequestInit): Promise<T | Fail> {
  try {
    const resp = await fetch(path, {
      ...init,
      // Сессия живёт в httpOnly-cookie: без credentials сервер не узнает клиента.
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
    })
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok || !json?.ok) {
      return { ok: false, error: json?.error || 'Сервис временно недоступен' }
    }
    return json as T
  } catch {
    return { ok: false, error: 'Нет связи с сервером' }
  }
}

async function post<T>(path: string, body: unknown): Promise<T | Fail> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

// ─── Шаг 2: анализ фото ───

export interface AnalyzeOk {
  ok: true
  imageUrl: string
  analysis: SkuAnalysis
  credits: number
}

export function analyzePhoto(image: string) {
  return post<AnalyzeOk>('/api/sku/analyze', { image })
}

// ─── Шаг 3: контент + SKU ───

export interface ContentOk {
  ok: true
  sku: string
  productId: string
  content: SkuContent
  specs: SkuSpec[]
  credits: number
}

export interface ContentParams {
  analysis: SkuAnalysis
  tone: string
  withAdvantages: boolean
  userNotes?: string
  langs?: LangCode[]
  sku?: string
  productId?: string
}

export function generateContent(params: ContentParams) {
  return post<ContentOk>('/api/sku/content', params)
}

// ─── Шаг 4: изображения ───

export interface ImageTask {
  slotId: SkuSlotId
  taskId: string | null
  state: 'processing' | 'fail'
  error?: string
}

export interface ImagesOk {
  ok: true
  tasks: ImageTask[]
}

export function createImages(params: {
  imageUrl: string
  productPrompt: string
  slots: SkuSlotId[]
  settings: SkuImageSettings
  /** Пол из анализа — чтобы слоты «на модели» не рисовали не ту аудиторию. */
  gender?: string
  /** Шаблон: его референсы заменяют стандартные фото карточки. */
  templateId?: string
}) {
  return post<ImagesOk>('/api/sku/images', params)
}

export interface TaskState {
  taskId: string
  state: 'processing' | 'success' | 'fail' | 'unknown'
  url?: string
  credits?: number
  error?: string
}

export interface TasksOk {
  ok: true
  tasks: TaskState[]
}

export async function pollTasks(taskIds: string[]): Promise<TasksOk | Fail> {
  if (!taskIds.length) return { ok: true, tasks: [] }
  return request<TasksOk>(`/api/sku/task?taskIds=${encodeURIComponent(taskIds.join(','))}`)
}

/* ─────────────────── Задания генерации (единая модель) ─────────────────── */

/**
 * ЗАЧЕМ ЗАДАНИЯ ВМЕСТО ПРЯМОГО СОЗДАНИЯ ЗАДАЧ.
 * Раньше фронтенд сам ставил все ракурсы разом и опрашивал их по taskId.
 * Каждый кадр генерировался независимо, поэтому модель на «виде спереди» и
 * «виде сзади» получалась разной. Теперь порядком управляет сервер:
 * сначала якорный кадр, потом остальные — с якорем как референсом.
 * Побочная выгода: пакет до 10 товаров идёт через тот же механизм.
 */

export interface JobItemImage {
  slotId: SkuSlotId
  state: 'queued' | 'processing' | 'success' | 'fail'
  url: string
  error: string
  credits: number
  taskId: string | null
}

export interface JobItem {
  id: string
  label: string
  imageUrl: string
  slots: SkuSlotId[]
  /** Слот, задающий модель для остальных кадров. */
  anchorSlot: SkuSlotId | null
  anchorUrl: string
  modelPassport: SkuModelPassport | null
  images: JobItemImage[]
  progress: { total: number; done: number; failed: number }
  state: 'queued' | 'running' | 'done'
  startedAt: string | null
  doneAt: string | null
}

export interface SkuJob {
  id: string
  state: 'running' | 'done'
  kind: 'single' | 'batch'
  createdAt: string
  updatedAt: string
  /** Сколько товаров пакета сервер ведёт одновременно. */
  concurrency: number
  items: JobItem[]
  progress: {
    items: number
    itemsDone: number
    images: number
    imagesDone: number
    imagesFailed: number
  }
}

export interface JobOk {
  ok: true
  job: SkuJob
}

export interface JobItemInput {
  imageUrl: string
  productPrompt: string
  slots: SkuSlotId[]
  settings: SkuImageSettings
  gender?: string
  templateId?: string
  /** Подпись товара в пакете — чтобы пользователь понимал, что генерируется. */
  label?: string
  /**
   * Готовый якорный кадр из карточки. Передаётся при повторной генерации
   * отдельного ракурса: иначе сервер выбрал бы якорем сам же
   * перегенерируемый кадр и подставил бы другого человека.
   */
  anchorUrl?: string
  modelPassport?: SkuModelPassport
}

/** Одиночная генерация (мастер карточки). */
export function createJob(item: JobItemInput) {
  return post<JobOk>('/api/sku/job', item)
}

/** Пакетная генерация: до 10 товаров за раз. */
export function createBatchJob(items: JobItemInput[]) {
  return post<JobOk>('/api/sku/job', { items })
}

/** Опрос задания. Этот же запрос двигает конвейер на сервере. */
export function readJob(id: string) {
  return request<JobOk>(`/api/sku/job?id=${encodeURIComponent(id)}`)
}

/* ─────────────────── Карточки на сервере ─────────────────── */

export interface CardsOk {
  ok: true
  cards: SkuCard[]
  total: number
}

export interface CardOk {
  ok: true
  card: SkuCard
}

export function listCards(limit = 200) {
  return request<CardsOk>(`/api/sku/cards?limit=${limit}`)
}

export function createCard(card: Partial<SkuCard> & { imageHash?: string }) {
  return post<CardOk>('/api/sku/cards', card)
}

export function patchCard(id: string, patch: Partial<SkuCard>) {
  return request<CardOk>(`/api/sku/cards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function deleteCard(id: string) {
  return request<{ ok: true }>(`/api/sku/cards/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Разовый перенос истории из localStorage на сервер. */
export function importCards(cards: unknown[]) {
  return post<{ ok: true; added: number; total: number }>('/api/sku/cards/import', { cards })
}

/* ─────────────────── Похожие товары ─────────────────── */

export interface SimilarMatch {
  similarity: number
  id: string
  sku: string
  title: string
  thumbnail: string
  author: string
  createdAt: string
  /** Тот же самый кадр, а не просто похожий товар. */
  exact: boolean
}

export interface SimilarOk {
  ok: true
  matches: SimilarMatch[]
  duplicate: boolean
  threshold: number
}

/**
 * Поиск похожих товаров.
 *
 * analysis необязателен: мастер карточек передаёт и разбор, и хеш фото, а
 * простые инструменты работают с одним изображением без AI-анализа. Сервер
 * считает оба признака независимо и берёт максимум, поэтому запрос с одним
 * хешем корректен — просто ловит только пересохранённое фото, а не тот же
 * товар, переснятый другим кадром.
 */
export function findSimilar(params: { analysis?: SkuAnalysis; imageHash?: string }) {
  return post<SimilarOk>('/api/sku/similar', params)
}

/**
 * Перцептивный хеш dHash (64 бита) — считаем в браузере.
 *
 * ПОЧЕМУ НЕ НА СЕРВЕРЕ. Бэкенд намеренно без внешних зависимостей, а в
 * стандартной библиотеке Node нет декодера JPEG. В браузере декодер уже есть
 * (canvas), поэтому хеш считает клиент, а сервер лишь сравнивает готовые
 * значения по расстоянию Хэмминга — это чистая арифметика.
 *
 * dHash сравнивает соседние пиксели по яркости, поэтому устойчив к
 * пересжатию, ресайзу и умеренной коррекции экспозиции.
 */
export async function imageHash(src: string): Promise<string> {
  const W = 9 // 9×8 сравнений соседей = 64 бита
  const H = 8
  try {
    const img = await loadImage(src)
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return ''
    ctx.drawImage(img, 0, 0, W, H)
    const { data } = ctx.getImageData(0, 0, W, H)

    const gray: number[] = []
    for (let i = 0; i < W * H; i++) {
      const o = i * 4
      // Восприимчивость глаза к каналам разная — берём взвешенную яркость.
      gray.push(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2])
    }

    let bits = ''
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W - 1; x++) {
        bits += gray[y * W + x] < gray[y * W + x + 1] ? '1' : '0'
      }
    }
    // Биты → hex: короче для передачи и совпадает с разбором на сервере.
    let hex = ''
    for (let i = 0; i < bits.length; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
    }
    return hex
  } catch {
    // Хеш — не обязательное условие: без него сработает сравнение атрибутов.
    return ''
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Для внешних URL нужен CORS, иначе canvas «запятнан» и getImageData падает.
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'))
    img.src = src
  })
}
