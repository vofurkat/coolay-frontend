// Типы модуля «Карточки товара» (SKU).

export type LangCode = 'ru' | 'en' | 'uz' | 'tr'

export const LANG_LIST: LangCode[] = ['ru', 'en', 'uz', 'tr']

export const LANG_LABEL: Record<LangCode, string> = {
  ru: 'RU',
  en: 'EN',
  uz: 'UZ',
  tr: 'TR',
}

export const LANG_FULL: Record<LangCode, string> = {
  ru: 'Русский',
  en: 'English',
  uz: "O'zbekcha",
  tr: 'Türkçe',
}

/** Результат AI-анализа фото (шаг 2) */
export interface SkuAnalysis {
  title: string
  subtitle: string
  confidence: number // 0..100
  category: string
  color: string
  material: string
  gender: string
  season: string
  productType: string
  style: string
  pattern: string
  cut: string
  neckline: string
  sleeve: string
  brand: string
  doubts: string[]
  recommendations: string[]
  imagePrompt: string
}

/** Канонические значения пола — ими правит пользователь на шаге анализа. */
export const GENDER_OPTIONS = [
  { value: 'Мужской', label: 'Мужское' },
  { value: 'Женский', label: 'Женское' },
  { value: 'Унисекс', label: 'Унисекс' },
  { value: 'Детский', label: 'Детское' },
] as const

export type SkuGender = (typeof GENDER_OPTIONS)[number]['value']

const GENDER_ADJ: Record<SkuGender, { m: string; f: string; n: string; pl: string; cat: string; en: string }> = {
  Мужской: { m: 'Мужской', f: 'Мужская', n: 'Мужское', pl: 'Мужские', cat: 'Мужское', en: "men's" },
  Женский: { m: 'Женский', f: 'Женская', n: 'Женское', pl: 'Женские', cat: 'Женское', en: "women's" },
  Детский: { m: 'Детский', f: 'Детская', n: 'Детское', pl: 'Детские', cat: 'Детское', en: "children's" },
  Унисекс: { m: 'Унисекс', f: 'Унисекс', n: 'Унисекс', pl: 'Унисекс', cat: 'Унисекс', en: 'unisex' },
}

const GENDERED_WORD =
  /женск(?:ий|ая|ое|ие)|мужск(?:ой|ая|ое|ие)|детск(?:ий|ая|ое|ие)/gi

/** Свести ответ модели / подпись кнопки к каноническому значению. */
export function normalizeGender(raw: string): SkuGender | '' {
  const s = (raw || '').trim().toLowerCase()
  if (!s || s === '—') return ''
  if (/жен|woman|women|female/.test(s)) return 'Женский'
  if (/дет|child|kid/.test(s)) return 'Детский'
  if (/унисекс|unisex/.test(s)) return 'Унисекс'
  if (/муж|man|men|male/.test(s)) return 'Мужской'
  return ''
}

function adjFor(gender: SkuGender, form: 'm' | 'f' | 'n' | 'pl') {
  return GENDER_ADJ[gender][form]
}

/** Заменить «мужская/женская/…» в названии и описании на выбранный пол. */
export function rewriteGenderedText(text: string, gender: string): string {
  const g = normalizeGender(gender)
  if (!text || !g) return text
  return text.replace(GENDERED_WORD, (m) => {
    const low = m.toLowerCase()
    const form: 'm' | 'f' | 'n' | 'pl' = /ая$/.test(low)
      ? 'f'
      : /ое$/.test(low)
        ? 'n'
        : /ие$/.test(low)
          ? 'pl'
          : 'm'
    const next = adjFor(g, form)
    return m[0] === m[0].toUpperCase() ? next : next.toLowerCase()
  })
}

export function rewriteGenderedCategory(category: string, gender: string): string {
  const g = normalizeGender(gender)
  if (!category || !g) return category
  return category.replace(/^(Мужское|Женское|Детское|Унисекс)/i, GENDER_ADJ[g].cat)
}

export function rewriteImagePromptGender(prompt: string, gender: string): string {
  const g = normalizeGender(gender)
  if (!g) return prompt || ''
  let p = (prompt || '')
    .replace(/\b(men'?s|women'?s|male|female|unisex|kids?'?s?|children'?s|boys?'?s?|girls?'?s?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  const tag = GENDER_ADJ[g].en
  if (p && !new RegExp(`\\b${tag.replace("'", "'?")}\\b`, 'i').test(p)) p = `${tag} ${p}`
  return p || tag
}

export interface SkuSeo {
  title: string
  description: string
  keywords: string[]
}

/** Контент карточки на одном языке (шаг 3) */
export interface SkuLangContent {
  name: string
  short: string
  full: string
  advantages: string[]
  seo: SkuSeo
}

export type SkuContent = Partial<Record<LangCode, SkuLangContent>>

export interface SkuSpec {
  label: string
  value: string
}

/** Идентификаторы слотов изображений (шаг 4) */
export type SkuSlotId = 'main' | 'front' | 'back' | 'fabric' | 'folded' | 'cutout' | 'lifestyle'

export type SkuSlotMode = 'auto' | 'optional' | 'required'

export interface SkuSlotDef {
  id: SkuSlotId
  title: string
  subtitle: string
  badge: string
  mode: SkuSlotMode
  aspect: string
  icon: string
}

export type SkuImageState = 'idle' | 'processing' | 'success' | 'fail'

export interface SkuImage {
  slotId: SkuSlotId
  taskId: string | null
  state: SkuImageState
  url?: string
  error?: string
  credits?: number
}

export interface SkuImageSettings {
  style: string
  background: string
  shadow: boolean
  shadowType: string
  quality: string
}

/** Канал публикации */
export type ChannelStatus = 'ready' | 'check' | 'published' | 'draft'

export interface SkuChannel {
  id: string
  name: string
  short: string
  tone: string
  status: ChannelStatus
}

export interface SkuVersion {
  id: string
  label: string
  createdAt: string
  author: string
  current?: boolean
  note?: string
}

export interface SkuActivity {
  id: string
  text: string
  author: string
  createdAt: string
  icon: string
}

export type SkuCardStatus = 'active' | 'draft' | 'archived'

/** Готовая карточка товара — то, что хранится в истории */
export interface SkuCard {
  id: string
  sku: string
  productId: string
  status: SkuCardStatus
  createdAt: string
  updatedAt: string
  author: string
  createdVia: string

  sourceImage: string // публичный URL исходного фото
  images: SkuImage[]

  analysis: SkuAnalysis
  content: SkuContent
  specs: SkuSpec[]

  tone: string
  credits: number
  /** Списание по операциям мастера — для журнала на карточке. */
  creditBreakdown?: {
    analysis: number
    content: number
    images: number
  }

  channels: SkuChannel[]
  versions: SkuVersion[]
  activity: SkuActivity[]

  readiness: {
    total: number
    content: number
    specs: number
    seo: number
    images: number
    adaptation: number
  }
}

/** Черновик мастера — переживает перезагрузку страницы */
export interface SkuDraft {
  step: number // 1..5
  savedAt: number

  fileName: string
  fileSize: number
  fileDimensions: string
  localPreview: string // data URL (для превью)
  sourceImage: string // публичный URL после загрузки

  analysis: SkuAnalysis | null
  analysisCredits: number

  sku: string
  productId: string
  content: SkuContent
  specs: SkuSpec[]
  activeLang: LangCode
  tone: string
  withAdvantages: boolean
  userNotes: string
  contentCredits: number

  selectedSlots: SkuSlotId[]
  imageSettings: SkuImageSettings
  images: SkuImage[]
  imageCredits: number

  savedCardId: string | null
}
