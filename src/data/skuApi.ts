// Клиент модуля «Карточки товара». Ключ kie.ai живёт только на бэкенде.

import type {
  LangCode,
  SkuAnalysis,
  SkuContent,
  SkuImageSettings,
  SkuSlotId,
  SkuSpec,
} from '@/types/sku'

interface Fail {
  ok: false
  error: string
}

async function post<T>(path: string, body: unknown): Promise<T | Fail> {
  try {
    const resp = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
  try {
    const resp = await fetch(`/api/sku/task?taskIds=${encodeURIComponent(taskIds.join(','))}`)
    const json = await resp.json().catch(() => ({}))
    if (!resp.ok || !json?.ok) return { ok: false, error: json?.error || 'Ошибка опроса задач' }
    return json as TasksOk
  } catch {
    return { ok: false, error: 'Нет связи с сервером' }
  }
}
