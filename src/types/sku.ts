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
