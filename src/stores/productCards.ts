import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  SkuCard,
  SkuChannel,
  SkuDraft,
  SkuImage,
  SkuSlotDef,
  SkuSlotId,
} from '@/types/sku'
import { LANG_LIST } from '@/types/sku'

const DRAFT_KEY = 'coolay_sku_draft'
const CARDS_KEY = 'coolay_sku_cards'

/** Каталог слотов изображений (шаг 4) */
export const SLOT_DEFS: SkuSlotDef[] = [
  {
    id: 'main',
    title: 'Основное фото',
    subtitle: 'Студийное',
    badge: 'Будет создано',
    mode: 'required',
    aspect: '3:4',
    icon: 'image',
  },
  {
    id: 'front',
    title: 'Вид спереди',
    subtitle: 'На модели',
    badge: 'Будет создано',
    mode: 'auto',
    aspect: '3:4',
    icon: 'user',
  },
  {
    id: 'back',
    title: 'Вид сзади',
    subtitle: 'На модели',
    badge: 'Будет создано',
    mode: 'auto',
    aspect: '3:4',
    icon: 'users',
  },
  {
    id: 'fabric',
    title: 'Детали ткани',
    subtitle: 'Крупный план',
    badge: 'Будет создано',
    mode: 'auto',
    aspect: '1:1',
    icon: 'expand',
  },
  {
    id: 'folded',
    title: 'Сложенный вид',
    subtitle: 'На белом фоне',
    badge: 'Будет создано',
    mode: 'auto',
    aspect: '1:1',
    icon: 'box',
  },
  {
    id: 'cutout',
    title: 'Без фона',
    subtitle: 'Для маркетплейсов',
    badge: 'Автоматически',
    mode: 'auto',
    aspect: '3:4',
    icon: 'scissors',
  },
  {
    id: 'lifestyle',
    title: 'Lifestyle сцена',
    subtitle: 'В интерьере',
    badge: 'Опционально',
    mode: 'optional',
    aspect: '4:3',
    icon: 'palette',
  },
]

export const DEFAULT_SLOTS: SkuSlotId[] = ['main', 'front', 'back', 'fabric', 'folded', 'cutout']

export function emptyDraft(): SkuDraft {
  return {
    step: 1,
    savedAt: Date.now(),
    fileName: '',
    fileSize: 0,
    fileDimensions: '',
    localPreview: '',
    sourceImage: '',
    analysis: null,
    analysisCredits: 0,
    sku: '',
    productId: '',
    content: {},
    specs: [],
    activeLang: 'ru',
    tone: 'Нейтральный',
    withAdvantages: true,
    userNotes: '',
    contentCredits: 0,
    selectedSlots: [...DEFAULT_SLOTS],
    imageSettings: {
      style: 'Чистый студийный',
      background: 'Белый',
      shadow: true,
      shadowType: 'Реалистичная тень',
      quality: 'Высокое (1К)',
    },
    images: [],
    imageCredits: 0,
    savedCardId: null,
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function defaultChannels(): SkuChannel[] {
  return [
    { id: 'site', name: 'Сайт', short: 'C', tone: 'bg-ink-900 text-white', status: 'ready' },
    { id: 'wb', name: 'Wildberries', short: 'WB', tone: 'bg-fuchsia-600 text-white', status: 'ready' },
    { id: 'ozon', name: 'Ozon', short: 'OZ', tone: 'bg-blue-600 text-white', status: 'ready' },
    { id: 'shopify', name: 'Shopify', short: 'SH', tone: 'bg-emerald-600 text-white', status: 'ready' },
    { id: 'ms', name: 'МойСклад', short: 'МС', tone: 'bg-amber-500 text-white', status: 'check' },
  ]
}

/** Оценка готовности карточки по фактическому содержимому */
export function computeReadiness(card: {
  content: SkuCard['content']
  specs: SkuCard['specs']
  images: SkuImage[]
}) {
  const ru = card.content.ru
  let content = 0
  if (ru) {
    content =
      (ru.name ? 30 : 0) +
      (ru.short ? 25 : 0) +
      (ru.full && ru.full.length > 250 ? 30 : ru.full ? 15 : 0) +
      (ru.advantages.length >= 4 ? 15 : ru.advantages.length * 3)
  }

  const specs = Math.min(100, Math.round((card.specs.length / 10) * 100))

  const seoParts = ru?.seo
  const seo = seoParts
    ? Math.min(
        100,
        (seoParts.title ? 35 : 0) +
          (seoParts.description ? 35 : 0) +
          Math.min(30, seoParts.keywords.length * 5),
      )
    : 0

  const done = card.images.filter((i) => i.state === 'success').length
  const images = card.images.length ? Math.round((done / card.images.length) * 100) : 0

  const langsReady = LANG_LIST.filter((l) => card.content[l]?.name).length
  const adaptation = Math.round((langsReady / LANG_LIST.length) * 100)

  const total = Math.round((content + specs + seo + images + adaptation) / 5)
  return { total, content, specs, seo, images, adaptation }
}

export const useProductCardsStore = defineStore('productCards', () => {
  const draft = ref<SkuDraft>(emptyDraft())
  const cards = ref<SkuCard[]>([])
  const loaded = ref(false)

  /** Восстановление из localStorage — вызывается на монтировании страниц модуля */
  function restore() {
    if (loaded.value) return
    const d = readJson<Partial<SkuDraft> | null>(DRAFT_KEY, null)
    if (d && typeof d === 'object') {
      draft.value = { ...emptyDraft(), ...d }
    }
    cards.value = readJson<SkuCard[]>(CARDS_KEY, [])
    loaded.value = true
  }

  function persistDraft() {
    draft.value.savedAt = Date.now()
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft.value))
    } catch {
      // Превью в data URL может переполнить квоту — сохраняем без него.
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft.value, localPreview: '' }))
      } catch {
        /* ignore */
      }
    }
  }

  function persistCards() {
    try {
      localStorage.setItem(CARDS_KEY, JSON.stringify(cards.value))
    } catch {
      /* ignore */
    }
  }

  function resetDraft() {
    draft.value = emptyDraft()
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
  }

  function setStep(step: number) {
    draft.value.step = Math.max(1, Math.min(5, step))
    persistDraft()
  }

  /**
   * Есть ли незавершённый мастер, к которому можно вернуться.
   * Сохранённая карточка (шаг 5 / savedCardId) — уже готовый результат,
   * а не черновик: иначе лендинг студии вечно показывает
   * «Есть незавершённая карточка · Шаг 5 из 5».
   */
  const hasDraft = computed(() => {
    const d = draft.value
    if (d.savedCardId) return false
    if (d.step >= 5) return false
    return d.step > 1 && !!(d.sourceImage || d.localPreview)
  })

  const recentCards = computed(() => cards.value.slice(0, 12))

  function getCard(id: string) {
    return cards.value.find((c) => c.id === id || c.sku === id) || null
  }

  /** Сохранение готовой карточки в историю (шаг 5) */
  function saveCard(author: string): SkuCard {
    const d = draft.value
    const now = new Date().toISOString()
    const images = d.images.filter((i) => i.state === 'success')
    const readiness = computeReadiness({ content: d.content, specs: d.specs, images: d.images })

    const card: SkuCard = {
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sku: d.sku,
      productId: d.productId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      author,
      createdVia: 'AI-генерация',
      sourceImage: d.sourceImage || d.localPreview,
      images,
      analysis: d.analysis!,
      content: d.content,
      specs: d.specs,
      tone: d.tone,
      credits:
        Math.round((d.analysisCredits + d.contentCredits + d.imageCredits) * 100) / 100,
      creditBreakdown: {
        analysis: d.analysisCredits || 0,
        content: d.contentCredits || 0,
        images: d.imageCredits || 0,
      },
      channels: defaultChannels(),
      versions: [
        {
          id: 'v1',
          label: 'v1.0',
          createdAt: now,
          author,
          current: true,
          note: 'Создана через AI-генерацию',
        },
      ],
      activity: [
        {
          id: 'a1',
          text: 'Карточка создана через AI-генерацию',
          author,
          createdAt: now,
          icon: 'sparkles',
        },
      ],
      readiness,
    }

    cards.value = [card, ...cards.value].slice(0, 200)
    persistCards()
    draft.value.savedCardId = card.id
    persistDraft()
    return card
  }

  function updateCard(id: string, patch: Partial<SkuCard>, note?: string) {
    const i = cards.value.findIndex((c) => c.id === id)
    if (i === -1) return
    const prev = cards.value[i]
    const updated: SkuCard = { ...prev, ...patch, updatedAt: new Date().toISOString() }
    updated.readiness = computeReadiness(updated)
    if (note) {
      updated.activity = [
        {
          id: `a-${Date.now()}`,
          text: note,
          author: prev.author,
          createdAt: updated.updatedAt,
          icon: 'edit',
        },
        ...prev.activity,
      ].slice(0, 30)
    }
    cards.value.splice(i, 1, updated)
    persistCards()
  }

  function removeCard(id: string) {
    cards.value = cards.value.filter((c) => c.id !== id)
    persistCards()
  }

  return {
    draft,
    cards,
    hasDraft,
    recentCards,
    restore,
    persistDraft,
    resetDraft,
    setStep,
    getCard,
    saveCard,
    updateCard,
    removeCard,
  }
})
