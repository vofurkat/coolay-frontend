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
import {
  createCard,
  deleteCard,
  importCards,
  listCards,
  patchCard,
} from '@/data/skuApi'

/**
 * ГДЕ ЖИВУТ ДАННЫЕ.
 *
 * Черновик мастера (DRAFT_KEY) остаётся в localStorage: это незавершённая
 * работа одного человека за одним браузером, серверу она не нужна.
 *
 * Готовые карточки переехали на сервер (/api/sku/cards). В localStorage они
 * лежали до этого, и это ломало сразу многое: историю не видел ни коллега,
 * ни Telegram-бот, ни тот же пользователь с телефона; проверить «такой товар
 * уже создавали» было не с чем; очистка кэша браузера уносила весь каталог.
 *
 * LEGACY_CARDS_KEY читается один раз — чтобы перенести накопленное на сервер,
 * после чего ключ удаляется.
 */
const DRAFT_KEY = 'coolay_sku_draft'
const LEGACY_CARDS_KEY = 'coolay_sku_cards'
const MIGRATED_KEY = 'coolay_sku_cards_migrated'

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
  const loading = ref(false)
  const error = ref('')
  /** Идёт ли перенос старой истории из браузера на сервер. */
  const migrating = ref(false)

  /**
   * Восстановление состояния модуля.
   * Черновик — из localStorage (он локальный), карточки — с сервера.
   * Вызывается при монтировании страниц модуля, поэтому защищено от
   * повторного входа: параллельные вызовы ждут один и тот же запрос.
   */
  let restorePromise: Promise<void> | null = null

  function restoreDraft() {
    const d = readJson<Partial<SkuDraft> | null>(DRAFT_KEY, null)
    if (d && typeof d === 'object') {
      draft.value = { ...emptyDraft(), ...d }
    }
  }

  async function restore(force = false) {
    restoreDraft()
    if (loaded.value && !force) return
    if (restorePromise) return restorePromise
    restorePromise = (async () => {
      loading.value = true
      error.value = ''
      try {
        await migrateLegacyCards()
        const res = await listCards()
        if (res.ok) {
          cards.value = res.cards
          loaded.value = true
        } else {
          error.value = res.error
        }
      } finally {
        loading.value = false
        restorePromise = null
      }
    })()
    return restorePromise
  }

  /**
   * Разовый перенос карточек из localStorage на сервер.
   * Флаг ставим только после успешного ответа: иначе сбой сети привёл бы
   * к потере истории — ключ бы очистился, а на сервер ничего не легло.
   */
  async function migrateLegacyCards() {
    let legacy: SkuCard[] = []
    try {
      if (localStorage.getItem(MIGRATED_KEY)) return
      legacy = readJson<SkuCard[]>(LEGACY_CARDS_KEY, [])
    } catch {
      return
    }
    if (!legacy.length) {
      try {
        localStorage.setItem(MIGRATED_KEY, '1')
        localStorage.removeItem(LEGACY_CARDS_KEY)
      } catch {
        /* приватный режим — не критично */
      }
      return
    }
    migrating.value = true
    try {
      const res = await importCards(legacy)
      if (res.ok) {
        localStorage.setItem(MIGRATED_KEY, '1')
        localStorage.removeItem(LEGACY_CARDS_KEY)
      }
    } catch {
      /* перенос повторится при следующем открытии */
    } finally {
      migrating.value = false
    }
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

  /**
   * Сохранение готовой карточки на сервер (шаг 5).
   * При ошибке возвращаем null, а не бросаем: мастер покажет текст ошибки,
   * но готовые кадры и контент у пользователя на шаге останутся.
   */
  async function saveCard(author: string): Promise<SkuCard | null> {
    const d = draft.value
    const now = new Date().toISOString()
    const images = d.images.filter((i) => i.state === 'success')
    const readiness = computeReadiness({ content: d.content, specs: d.specs, images: d.images })

    const payload: Partial<SkuCard> & { imageHash?: string } = {
      sku: d.sku,
      productId: d.productId,
      status: 'active',
      author,
      createdVia: 'AI-генерация',
      sourceImage: d.sourceImage || d.localPreview,
      images,
      analysis: d.analysis!,
      content: d.content,
      specs: d.specs,
      tone: d.tone,
      credits: Math.round((d.analysisCredits + d.contentCredits + d.imageCredits) * 100) / 100,
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
      // Эти три поля — основа для повторной генерации и поиска дублей:
      // без них кнопка «Перегенерировать» дала бы другую модель.
      imageHash: d.imageHash || '',
      anchorUrl: d.anchorUrl || '',
      modelPassport: d.modelPassport || null,
    }

    error.value = ''
    const res = await createCard(payload)
    if (!res.ok) {
      error.value = res.error
      return null
    }
    cards.value = [res.card, ...cards.value.filter((c) => c.id !== res.card.id)]
    draft.value.savedCardId = res.card.id
    persistDraft()
    return res.card
  }

  async function updateCard(id: string, patch: Partial<SkuCard>, note?: string) {
    const i = cards.value.findIndex((c) => c.id === id)
    if (i === -1) return null
    const prev = cards.value[i]
    const merged: SkuCard = { ...prev, ...patch }
    const body: Partial<SkuCard> = { ...patch, readiness: computeReadiness(merged) }
    if (note) {
      body.activity = [
        {
          id: `a-${Date.now()}`,
          text: note,
          author: prev.author,
          createdAt: new Date().toISOString(),
          icon: 'edit',
        },
        ...prev.activity,
      ].slice(0, 30)
    }

    // Оптимистичное обновление: правка в UI видна сразу, без ожидания сети.
    cards.value.splice(i, 1, { ...merged, ...body, updatedAt: new Date().toISOString() })

    const res = await patchCard(id, body)
    if (!res.ok) {
      error.value = res.error
      // Откат: иначе пользователь видит несохранённую правку как сохранённую.
      const back = cards.value.findIndex((c) => c.id === id)
      if (back !== -1) cards.value.splice(back, 1, prev)
      return null
    }
    const idx = cards.value.findIndex((c) => c.id === id)
    if (idx !== -1) cards.value.splice(idx, 1, res.card)
    return res.card
  }

  async function removeCard(id: string) {
    const prev = cards.value
    cards.value = cards.value.filter((c) => c.id !== id)
    const res = await deleteCard(id)
    if (!res.ok) {
      error.value = res.error
      cards.value = prev
      return false
    }
    return true
  }

  return {
    draft,
    cards,
    loading,
    loaded,
    error,
    migrating,
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
