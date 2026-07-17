// Клиент генерации (через наш бэкенд-прокси).
// API-ключ kie.ai хранится только на сервере, фронт ходит на /api.

export interface GenerateParams {
  image: string // data URL загруженного фото товара
  prompt: string
  resolution: '1K' | '2K' | '4K'
  aspect_ratio: string
  output_format?: 'png' | 'jpg'
}

export interface GenerateResult {
  ok: boolean
  url?: string
  taskId?: string
  creditsConsumed?: number
  error?: string
}

// --- Маппинг человеко-понятных подписей UI в параметры API ---

export function mapResolution(quality: string): '1K' | '2K' | '4K' {
  if (quality.includes('4K')) return '4K'
  if (quality.includes('2K')) return '2K'
  return '1K' // черновик 0.5K и стандарт 1K → 1K (минимум у API)
}

export function mapAspect(aspect: string): string {
  const m = aspect.match(/(\d+:\d+)/)
  return m ? m[1] : 'auto'
}

// Описание фона → текст для prompt
const BG_PROMPT: Record<string, string> = {
  Случайный: '',
  'Белый студийный': 'on a clean seamless white studio background',
  Градиент: 'on a smooth soft gradient background',
  Интерьер: 'in a stylish modern interior setting',
  Природа: 'in a natural outdoor environment with soft daylight',
  Прозрачный: 'on a transparent background, isolated product cutout',
}

export interface PromptOptions {
  toolTitle: string
  isVirtualModel: boolean
  modelName?: string
  poseName?: string
  background: string
  brandStyle: boolean
  userPrompt: string
}

// Собираем финальный prompt из настроек пользователя
export function buildPrompt(o: PromptOptions): string {
  const parts: string[] = []

  if (o.isVirtualModel) {
    parts.push(
      `Professional e-commerce fashion photo: a realistic human model wearing/holding the product from the reference image`,
    )
    if (o.modelName) parts.push(`model style: ${o.modelName}`)
    if (o.poseName && o.poseName !== 'Случайный') parts.push(`pose: ${o.poseName}`)
  } else {
    parts.push(`Professional e-commerce product photo of the item from the reference image`)
  }

  const bg = BG_PROMPT[o.background]
  if (bg) parts.push(bg)

  parts.push('high detail, sharp focus, commercial product photography, studio lighting')

  if (o.brandStyle) parts.push('consistent brand style, premium look')
  if (o.userPrompt.trim()) parts.push(o.userPrompt.trim())

  return parts.join(', ')
}

export async function generateImage(params: GenerateParams): Promise<GenerateResult> {
  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    const json = (await resp.json().catch(() => ({}))) as GenerateResult
    if (!resp.ok || !json.ok) {
      return { ok: false, error: json.error || 'Ошибка генерации' }
    }
    return json
  } catch {
    return { ok: false, error: 'Нет связи с сервером генерации' }
  }
}

// --- Умная генерация: анализ фото → построение задания → генерация ---

export interface SmartGenerateParams {
  image: string // data URL
  toolSlug: string
  toolTitle: string
  userPrompt?: string // что дописал пользователь
  extras?: string // доп. настройки (фон, модель, поза…)
  resolution: '1K' | '2K' | '4K'
  aspect_ratio: string
  output_format?: 'png' | 'jpg'
}

export interface SmartGenerateResult extends GenerateResult {
  prompt?: string // итоговое задание для генерации
  promptedBy?: 'gemini' | 'fallback'
}

export async function generateSmart(
  params: SmartGenerateParams,
): Promise<SmartGenerateResult> {
  try {
    const resp = await fetch('/api/generate-smart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    const json = (await resp.json().catch(() => ({}))) as SmartGenerateResult
    if (!resp.ok || !json.ok) {
      return { ok: false, error: json.error || 'Ошибка генерации' }
    }
    return json
  } catch {
    return { ok: false, error: 'Нет связи с сервером генерации' }
  }
}
