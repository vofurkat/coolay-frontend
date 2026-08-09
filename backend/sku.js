/**
 * Coolay — модуль карточек товара (SKU).
 *
 * Эндпоинты:
 *   POST /api/sku/analyze   — Gemini 3.6 Flash: распознавание товара по фото
 *   POST /api/sku/content   — Gemini 3.6 Flash: контент карточки на RU/EN/UZ/TR + SEO
 *   POST /api/sku/images    — Nano Banana 2 Lite: постановка задач на студийные фото
 *   GET  /api/sku/task      — статус одной задачи генерации изображения
 *
 * Ключ kie.ai живёт только на сервере.
 */

import { requireKieKey } from './env.js'

const KIE_API_KEY = requireKieKey()
const KIE_BASE = 'https://api.kie.ai'
const KIE_UPLOAD = 'https://kieai.redpandaai.co/api/file-base64-upload'

const GEMINI_URL = `${KIE_BASE}/gemini/v1/models/gemini-3-6-flash:streamGenerateContent`
const IMAGE_MODEL = 'nano-banana-2-lite'

const ALLOWED_AR = new Set([
  '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5',
  '5:4', '8:1', '9:16', '16:9', '21:9', 'auto',
])

const LANGS = ['ru', 'en', 'uz', 'tr']
const LANG_NAMES = { ru: 'Russian', en: 'English', uz: 'Uzbek (latin script)', tr: 'Turkish' }

const TONES = {
  Нейтральный: 'neutral, factual, informative',
  Продающий: 'persuasive and sales-driven, benefit focused, with a light call to action',
  Премиальный: 'premium and elegant, emphasise quality, craftsmanship and materials',
  Маркетплейсный: 'marketplace-optimised: keyword rich, structured, scannable',
  Лаконичный: 'short, concise, minimal wording, no fluff',
}

// ─────────────────────────── низкоуровневые утилиты ───────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** fetch с таймаутом (иначе висящий апстрим держит соединение вечно) */
async function fetchJson(url, options = {}, timeoutMs = 120000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { ...options, signal: ctrl.signal })
    const text = await resp.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* не JSON */
    }
    return { resp, json, text }
  } finally {
    clearTimeout(t)
  }
}

function authHeaders() {
  return { Authorization: `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' }
}

/** data URL → { mime, base64 } */
function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl || '')
  if (!m) throw new Error('BAD_IMAGE')
  return { mime: m[1], base64: m[2] }
}

/** Загрузка картинки в хранилище kie.ai → публичный URL (нужен Nano Banana). */
async function uploadImage(dataUrl) {
  const { mime } = parseDataUrl(dataUrl)
  const ext = mime.split('/')[1].replace('jpeg', 'jpg')
  const { resp, json } = await fetchJson(
    KIE_UPLOAD,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        base64Data: dataUrl,
        uploadPath: 'images/coolay/sku',
        fileName: `sku-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
      }),
    },
    120000,
  )
  const url = json?.data?.downloadUrl
  if (!resp.ok || !url) throw new Error(`UPLOAD_FAILED: ${json?.msg || resp.status}`)
  return url
}

/**
 * Вызов Gemini 3.6 Flash с обязательным function call — получаем строго
 * структурированный JSON вместо свободного текста.
 */
async function geminiCall({ prompt, imageDataUrl, fn, thinkingLevel = 'low' }) {
  const parts = [{ text: prompt }]
  if (imageDataUrl) {
    const { mime, base64 } = parseDataUrl(imageDataUrl)
    parts.push({ inline_data: { mime_type: mime, data: base64 } })
  }

  const body = {
    stream: false,
    contents: [{ role: 'user', parts }],
    tools: [{ functionDeclarations: [fn] }],
    generationConfig: { thinkingConfig: { includeThoughts: false, thinkingLevel } },
  }

  const { resp, json, text } = await fetchJson(
    GEMINI_URL,
    { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) },
    180000,
  )

  if (!resp.ok || json?.code >= 400) {
    throw new Error(`GEMINI_FAILED: ${json?.msg || resp.status}`)
  }

  const candidateParts = json?.candidates?.[0]?.content?.parts || []
  const call = candidateParts.find((p) => p.functionCall)?.functionCall
  if (call?.args) return { args: call.args, credits: json?.credits_consumed || 0 }

  // Фоллбэк: модель ответила текстом — пробуем достать JSON из него.
  const raw = candidateParts.map((p) => p.text).filter(Boolean).join('\n') || text
  const m = raw && raw.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      return { args: JSON.parse(m[0]), credits: json?.credits_consumed || 0 }
    } catch {
      /* ниже */
    }
  }
  throw new Error('GEMINI_NO_RESULT')
}

// ─────────────────────────── схемы функций Gemini ───────────────────────────

const S = (description) => ({ type: 'STRING', description })
const SARR = (description) => ({ type: 'ARRAY', description, items: { type: 'STRING' } })

const ANALYZE_FN = {
  name: 'report_product_analysis',
  description: 'Report the full visual analysis of the product photo for an e-commerce product card.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: S('Short product name in Russian, 2-4 words. Example: "Мужская футболка"'),
      subtitle: S('One short clarifying line in Russian. Example: "Базовая футболка с коротким рукавом"'),
      confidence: { type: 'NUMBER', description: 'Recognition confidence, integer 0-100' },
      category: S('Category path in Russian, format "Мужское > Одежда > Футболки"'),
      color: S('Main colour in Russian, e.g. "Тёмно-зелёный"'),
      material: S('Material in Russian, e.g. "Хлопок (вероятно 100%)"'),
      gender: S('Gender in Russian: Мужской / Женский / Унисекс / Детский'),
      season: S('Season in Russian, e.g. "Всесезонный"'),
      productType: S('Product type in Russian, e.g. "Футболка"'),
      style: S('Style in Russian, e.g. "Классический / Повседневный"'),
      pattern: S('Pattern in Russian, e.g. "Однотонный"'),
      cut: S('Cut / fit in Russian, e.g. "Прямой"'),
      neckline: S('Neckline or closure in Russian, e.g. "Круглый". Use "—" if not applicable'),
      sleeve: S('Sleeve type in Russian, e.g. "Короткий". Use "—" if not applicable'),
      brand: S('Brand if clearly visible on the photo, otherwise empty string'),
      doubts: SARR('3-6 short Russian sentences about what could NOT be determined reliably from the photo'),
      recommendations: SARR('3-6 short Russian actionable recommendations to improve the product card'),
      imagePrompt: S(
        'One concise ENGLISH description of the product for an image generation model: object, colour, material, shape, key details. Max 40 words.',
      ),
    },
    required: [
      'title', 'subtitle', 'confidence', 'category', 'color', 'material', 'gender',
      'season', 'productType', 'style', 'pattern', 'cut', 'doubts', 'recommendations', 'imagePrompt',
    ],
  },
}

/**
 * Схема контента одного языка.
 * Намеренно ПЛОСКАЯ: на вложенных объектах gemini-3.6-flash отдаёт null-поля.
 * Характеристики просим только для базового (русского) прохода.
 */
function contentFn(label, withSpecs) {
  const properties = {
    name: S(`Product title in ${label}, 40-150 characters`),
    short: S(`Short description in ${label}, 90-200 characters, 1-2 sentences`),
    full: S(`Full description in ${label}, 350-900 characters, 2-3 paragraphs separated by \\n\\n`),
    advantages: SARR(`Exactly 5 key product advantages in ${label}, each 3-6 words`),
    seoTitle: S(`SEO title in ${label}, max 70 characters`),
    seoDescription: S(`SEO meta description in ${label}, max 160 characters`),
    seoKeywords: SARR(`6-8 search keywords in ${label}`),
  }
  const required = ['name', 'short', 'full', 'advantages', 'seoTitle', 'seoDescription', 'seoKeywords']

  if (withSpecs) {
    properties.specLabels = SARR('8-12 specification names in Russian, e.g. "Цвет", "Материал"')
    properties.specValues = SARR('8-12 specification values in Russian, in the SAME order as specLabels')
    required.push('specLabels', 'specValues')
  }

  return {
    name: 'report_card',
    description: `Report the complete product card content in ${label}.`,
    parameters: { type: 'OBJECT', properties, required },
  }
}

// ─────────────────────────── пресеты изображений ───────────────────────────

const IMAGE_SLOTS = {
  main: {
    title: 'Основное фото',
    subtitle: 'Студийное',
    prompt:
      'Hero e-commerce studio product shot of the SAME product, centred, full product visible, crisp focus, even soft studio lighting, no props, no text.',
    aspect: '3:4',
  },
  front: {
    title: 'Вид спереди',
    subtitle: 'На модели',
    prompt:
      'Front view fashion e-commerce photo: a realistic human model wearing/holding the SAME product, natural relaxed pose, facing camera, clean light studio background, full-length framing.',
    aspect: '3:4',
  },
  back: {
    title: 'Вид сзади',
    subtitle: 'На модели',
    prompt:
      'Back view fashion e-commerce photo: the same realistic human model seen from behind wearing/holding the SAME product, clean light studio background, full-length framing.',
    aspect: '3:4',
  },
  fabric: {
    title: 'Детали ткани',
    subtitle: 'Крупный план',
    prompt:
      'Extreme macro close-up of the material/texture of the SAME product: weave, stitching and surface detail clearly visible, soft directional light, shallow depth of field.',
    aspect: '1:1',
  },
  folded: {
    title: 'Сложенный вид',
    subtitle: 'На белом фоне',
    prompt:
      'The SAME product neatly folded / neatly arranged flat-lay on a pure white surface, top-down view, soft natural shadow, minimal styling.',
    aspect: '1:1',
  },
  cutout: {
    title: 'Без фона',
    subtitle: 'Для маркетплейсов',
    prompt:
      'Clean packshot cutout of the SAME product completely isolated on a pure plain white background, no shadow gradient, sharp precise edges, marketplace ready. Show ONLY the product itself.',
    aspect: '3:4',
  },
  lifestyle: {
    title: 'Lifestyle сцена',
    subtitle: 'В интерьере',
    prompt:
      'Lifestyle editorial scene featuring the SAME product in a tasteful modern interior, warm natural daylight, shallow depth of field, realistic context.',
    aspect: '4:3',
  },
}

const STYLE_PROMPT = {
  'Чистый студийный': 'clean studio product photography, professional e-commerce look',
  'На модели': 'fashion photography on a realistic human model',
  Лайфстайл: 'lifestyle photography in a real-life context',
  Минимализм: 'minimalist composition, lots of negative space, muted palette',
}

const BG_PROMPT = {
  Белый: 'pure seamless white background',
  'Светло-серый': 'soft light grey seamless studio background',
  Прозрачный: 'plain flat white background for easy background removal',
}

const SHADOW_PROMPT = {
  'Реалистичная тень': 'natural realistic contact shadow under the product',
  'Мягкая тень': 'very soft diffused shadow under the product',
  'Без тени': 'no visible shadow',
}

function buildImagePrompt({ slotId, productPrompt, settings }) {
  const slot = IMAGE_SLOTS[slotId]
  if (!slot) return null
  const parts = [
    slot.prompt,
    `Product: ${productPrompt}.`,
    'Keep the product identity, colour, proportions, material and every detail 100% identical to the reference photo. Do not invent a different product.',
  ]

  // Слоты только с товаром: если исходное фото сделано на модели или в
  // интерьере, модель/окружение нужно убрать явно — иначе они «протекают»
  // в результат (например, packshot получается с человеком в кадре).
  const productOnly = slotId === 'main' || slotId === 'cutout' || slotId === 'folded'
  if (productOnly) {
    parts.push(
      'Show the product alone as a standalone object: no human model, no body parts, no hands, no face, no mannequin, no background scene, no props, no furniture.',
    )
  }

  // Для lifestyle/на модели фон из настроек не навязываем.
  const sceneSlot = slotId === 'lifestyle' || slotId === 'front' || slotId === 'back'
  if (!sceneSlot) {
    const bg = BG_PROMPT[settings.background]
    if (bg) parts.push(bg + '.')
    const sh = settings.shadow ? SHADOW_PROMPT[settings.shadowType] : SHADOW_PROMPT['Без тени']
    if (sh) parts.push(sh + '.')
  }

  const st = STYLE_PROMPT[settings.style]
  if (st && slotId === 'main') parts.push(st + '.')

  parts.push('High resolution, commercial quality, photorealistic, no text, no watermark, no logo overlay.')
  return parts.join(' ')
}

async function createImageTask({ imageUrl, prompt, aspect }) {
  const { resp, json } = await fetchJson(
    `${KIE_BASE}/api/v1/jobs/createTask`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: IMAGE_MODEL,
        input: {
          image_urls: [imageUrl],
          prompt: prompt.slice(0, 5000),
          aspect_ratio: ALLOWED_AR.has(aspect) ? aspect : 'auto',
        },
      }),
    },
    60000,
  )
  if (json?.code !== 200 || !json?.data?.taskId) {
    throw new Error(`CREATE_FAILED: ${json?.msg || resp.status}`)
  }
  return json.data.taskId
}

async function readTask(taskId) {
  const { json } = await fetchJson(
    `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${KIE_API_KEY}` } },
    60000,
  )
  const data = json?.data
  if (!data) return { state: 'unknown' }
  if (data.state === 'success') {
    let urls = []
    try {
      urls = JSON.parse(data.resultJson || '{}').resultUrls || []
    } catch {
      urls = []
    }
    return { state: 'success', url: urls[0] || null, credits: data.creditsConsumed || 0 }
  }
  if (data.state === 'fail' || data.state === 'failed') {
    return { state: 'fail', error: data.failMsg || 'Генерация не удалась' }
  }
  return { state: 'processing' }
}

// ─────────────────────────── SKU ───────────────────────────

function makeSku() {
  const alphabet = '0123456789ABCDEF'
  let s = ''
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return `SKU-${s}`
}

function makeProductId() {
  return `PRD-${Math.floor(10000 + Math.random() * 89999)}`
}

// ─────────────────────────── нормализация ───────────────────────────

const str = (v, fb = '') => (typeof v === 'string' && v.trim() ? v.trim() : fb)
const arr = (v, max = 8) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, max) : []

function normalizeAnalysis(a) {
  const conf = Number(a.confidence)
  return {
    title: str(a.title, 'Товар'),
    subtitle: str(a.subtitle),
    confidence: Number.isFinite(conf) ? Math.max(1, Math.min(100, Math.round(conf <= 1 ? conf * 100 : conf))) : 85,
    category: str(a.category, '—'),
    color: str(a.color, '—'),
    material: str(a.material, '—'),
    gender: str(a.gender, '—'),
    season: str(a.season, '—'),
    productType: str(a.productType, '—'),
    style: str(a.style, '—'),
    pattern: str(a.pattern, '—'),
    cut: str(a.cut, '—'),
    neckline: str(a.neckline, '—'),
    sleeve: str(a.sleeve, '—'),
    brand: str(a.brand),
    doubts: arr(a.doubts, 6),
    recommendations: arr(a.recommendations, 6),
    imagePrompt: str(a.imagePrompt, str(a.title, 'product')),
  }
}

function normalizeLang(l) {
  if (!l || typeof l !== 'object') return null
  const name = str(l.name).slice(0, 150)
  if (!name) return null
  return {
    name,
    short: str(l.short).slice(0, 200),
    full: str(l.full).slice(0, 3000),
    advantages: arr(l.advantages, 6),
    seo: {
      title: str(l.seoTitle).slice(0, 120),
      description: str(l.seoDescription).slice(0, 300),
      keywords: arr(l.seoKeywords, 8),
    },
  }
}

/** specLabels + specValues → [{label, value}] */
function zipSpecs(args) {
  const labels = arr(args.specLabels, 14)
  const values = arr(args.specValues, 14)
  const out = []
  for (let i = 0; i < Math.min(labels.length, values.length); i++) {
    out.push({ label: labels[i], value: values[i] })
  }
  return out
}

// ─────────────────────────── обработчики ───────────────────────────

async function handleAnalyze(payload) {
  const { image } = payload || {}
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    return { status: 400, body: { ok: false, error: 'Нужно фото товара' } }
  }

  // 1. Публичный URL (нужен на шаге генерации изображений)
  const imageUrl = await uploadImage(image)

  // 2. Распознавание
  const prompt = [
    'You are a senior e-commerce catalog specialist.',
    'Carefully analyse the attached product photo and call report_product_analysis with everything you can determine.',
    'All human-readable values MUST be in Russian, except imagePrompt which must be English.',
    'Be honest: put everything that cannot be reliably determined from the photo into doubts.',
    'Never invent a brand that is not visible on the photo.',
  ].join(' ')

  const { args, credits } = await geminiCall({ prompt, imageDataUrl: image, fn: ANALYZE_FN, thinkingLevel: 'low' })

  return {
    status: 200,
    body: { ok: true, imageUrl, analysis: normalizeAnalysis(args), credits },
  }
}

async function handleContent(payload) {
  const { analysis, tone, userNotes, withAdvantages } = payload || {}
  if (!analysis || typeof analysis !== 'object') {
    return { status: 400, body: { ok: false, error: 'Нет данных анализа' } }
  }

  const langs = Array.isArray(payload.langs) && payload.langs.length
    ? payload.langs.filter((l) => LANGS.includes(l))
    : LANGS

  const toneText = TONES[tone] || TONES['Нейтральный']
  const facts = [
    `Product: ${analysis.title || ''} — ${analysis.subtitle || ''}`,
    `Category: ${analysis.category || ''}`,
    `Colour: ${analysis.color || ''}`,
    `Material: ${analysis.material || ''}`,
    `Gender: ${analysis.gender || ''}`,
    `Season: ${analysis.season || ''}`,
    `Type: ${analysis.productType || ''}`,
    `Style: ${analysis.style || ''}`,
    `Pattern: ${analysis.pattern || ''}`,
    `Cut: ${analysis.cut || ''}`,
    analysis.neckline && analysis.neckline !== '—' ? `Neckline: ${analysis.neckline}` : '',
    analysis.sleeve && analysis.sleeve !== '—' ? `Sleeve: ${analysis.sleeve}` : '',
    analysis.brand ? `Brand: ${analysis.brand}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const notes = userNotes && String(userNotes).trim() ? String(userNotes).trim().slice(0, 800) : ''

  function buildPrompt(lang, withSpecs, ruRef) {
    return [
      'You are a senior e-commerce copywriter and SEO specialist.',
      `Write a complete marketplace-ready product card in ${LANG_NAMES[lang]} and call report_card.`,
      '',
      'Known facts about the product (source of truth):',
      facts,
      '',
      `Writing tone: ${toneText}.`,
      withAdvantages === false
        ? 'Keep the advantages short and factual.'
        : 'Highlight concrete customer benefits in the advantages.',
      notes ? `Extra requirements from the seller: ${notes}` : '',
      ruRef
        ? `\nThis is the approved Russian version — adapt it natively, do NOT transliterate:\nTITLE: ${ruRef.name}\nSHORT: ${ruRef.short}\nFULL: ${ruRef.full}`
        : '',
      '',
      `All text MUST be written natively in ${LANG_NAMES[lang]}. Never mix languages.`,
      'Do NOT invent facts that contradict the known facts. Do not mention any brand name.',
      withSpecs ? 'specLabels and specValues must have the same length and describe real product specifications.' : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  // 1. Русская версия — эталон и источник характеристик.
  const ruRes = await geminiCall({
    prompt: buildPrompt('ru', true, null),
    fn: contentFn('Russian', true),
    thinkingLevel: 'low',
  })
  const ru = normalizeLang(ruRes.args)
  if (!ru) return { status: 502, body: { ok: false, error: 'Модель не вернула контент' } }

  let credits = ruRes.credits || 0
  const content = { ru }

  // 2. Остальные языки — параллельно, с русской версией как ориентиром.
  const others = langs.filter((l) => l !== 'ru')
  const results = await Promise.allSettled(
    others.map((l) =>
      geminiCall({
        prompt: buildPrompt(l, false, ru),
        fn: contentFn(LANG_NAMES[l], false),
        thinkingLevel: 'low',
      }),
    ),
  )
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') {
      console.error('[sku:content]', others[i], r.reason?.message)
      return
    }
    const n = normalizeLang(r.value.args)
    if (n) content[others[i]] = n
    credits += r.value.credits || 0
  })

  // 3. Характеристики
  let specs = zipSpecs(ruRes.args)
  if (!specs.length) {
    specs = [
      { label: 'Цвет', value: analysis.color || '—' },
      { label: 'Материал', value: analysis.material || '—' },
      { label: 'Пол', value: analysis.gender || '—' },
      { label: 'Сезон', value: analysis.season || '—' },
      { label: 'Крой', value: analysis.cut || '—' },
      { label: 'Узор', value: analysis.pattern || '—' },
    ].filter((s) => s.value && s.value !== '—')
  }

  return {
    status: 200,
    body: {
      ok: true,
      sku: str(payload.sku) || makeSku(),
      productId: str(payload.productId) || makeProductId(),
      content,
      specs,
      credits: Math.round(credits * 100) / 100,
    },
  }
}

async function handleImages(payload) {
  const { imageUrl, slots, settings, productPrompt } = payload || {}
  if (!imageUrl || typeof imageUrl !== 'string' || !/^https?:\/\//.test(imageUrl)) {
    return { status: 400, body: { ok: false, error: 'Нет исходного изображения' } }
  }
  const wanted = (Array.isArray(slots) ? slots : []).filter((s) => IMAGE_SLOTS[s]).slice(0, 7)
  if (!wanted.length) return { status: 400, body: { ok: false, error: 'Не выбрано ни одного ракурса' } }

  const s = {
    style: str(settings?.style, 'Чистый студийный'),
    background: str(settings?.background, 'Белый'),
    shadow: settings?.shadow !== false,
    shadowType: str(settings?.shadowType, 'Реалистичная тень'),
  }
  const pp = str(productPrompt, 'the product from the reference photo')

  const tasks = []
  for (const slotId of wanted) {
    const prompt = buildImagePrompt({ slotId, productPrompt: pp, settings: s })
    try {
      const taskId = await createImageTask({
        imageUrl,
        prompt,
        aspect: IMAGE_SLOTS[slotId].aspect,
      })
      tasks.push({ slotId, taskId, state: 'processing' })
    } catch (e) {
      tasks.push({ slotId, taskId: null, state: 'fail', error: e.message })
    }
    await sleep(120) // мягкий rate-limit
  }

  return { status: 200, body: { ok: true, tasks } }
}

async function handleTasks(taskIds) {
  const ids = taskIds.filter(Boolean).slice(0, 10)
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        return { taskId: id, ...(await readTask(id)) }
      } catch (e) {
        return { taskId: id, state: 'fail', error: e.message }
      }
    }),
  )
  return { status: 200, body: { ok: true, tasks: results } }
}

export const skuSlots = IMAGE_SLOTS

/**
 * Роутер модуля. Возвращает true, если запрос обработан.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ url: URL, sendJson: Function, readBody: Function }} ctx
 */
export async function skuRouter(req, res, ctx) {
  const { url, sendJson, readBody } = ctx
  const path = url.pathname

  if (!path.startsWith('/api/sku/')) return false

  try {
    if (req.method === 'GET' && path === '/api/sku/task') {
      const ids = (url.searchParams.get('taskIds') || url.searchParams.get('taskId') || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
      if (!ids.length) return sendJson(res, 400, { ok: false, error: 'Нет taskId' }), true
      const r = await handleTasks(ids)
      sendJson(res, r.status, r.body)
      return true
    }

    if (req.method === 'GET' && path === '/api/sku/slots') {
      sendJson(res, 200, {
        ok: true,
        slots: Object.entries(IMAGE_SLOTS).map(([id, v]) => ({
          id,
          title: v.title,
          subtitle: v.subtitle,
          aspect: v.aspect,
        })),
      })
      return true
    }

    if (req.method !== 'POST') return false

    let payload
    try {
      payload = JSON.parse(await readBody(req))
    } catch (e) {
      const tooBig = e.message === 'PAYLOAD_TOO_LARGE'
      sendJson(res, tooBig ? 413 : 400, {
        ok: false,
        error: tooBig ? 'Файл слишком большой (макс. 30 МБ)' : 'Некорректный запрос',
      })
      return true
    }

    let r
    if (path === '/api/sku/analyze') r = await handleAnalyze(payload)
    else if (path === '/api/sku/content') r = await handleContent(payload)
    else if (path === '/api/sku/images') r = await handleImages(payload)
    else return false

    sendJson(res, r.status, r.body)
    return true
  } catch (e) {
    console.error('[sku]', e.message)
    const map = {
      BAD_IMAGE: 'Некорректный формат изображения',
      UPLOAD_FAILED: 'Не удалось загрузить изображение',
      GEMINI_FAILED: 'Сервис анализа временно недоступен',
      GEMINI_NO_RESULT: 'Модель не смогла разобрать фото — попробуйте другое изображение',
      CREATE_FAILED: 'Сервис генерации отклонил запрос',
    }
    const key = e.message.split(':')[0]
    sendJson(res, 502, { ok: false, error: map[key] || 'Ошибка обработки' })
    return true
  }
}
