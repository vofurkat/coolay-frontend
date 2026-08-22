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
import { load, readUploadAsDataUrl } from './store.js'
import { consumeCredits } from './plans.js'

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

export { IMAGE_SLOTS }

/**
 * Слоты, где в кадре есть человек. Только они участвуют в якорном
 * конвейере: остальные кадры показывают товар отдельно, и «единая модель»
 * для них не имеет смысла.
 */
export const MODEL_SLOTS = new Set(['front', 'back', 'lifestyle'])

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

/**
 * Пользователь на шаге AI-анализа может поправить пол.
 * Без явного хинта слоты «на модели» рисуют «realistic human model» —
 * и мужская вещь часто выходит на женщине (или наоборот).
 */
function genderModelHint(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (!s || s === '—' || s === '-') return null
  if (/жен|woman|women|female/.test(s)) {
    return {
      audience: "women's / female",
      model:
        'The human model MUST be an adult woman (female). Do NOT depict a man, boy, or androgynous figure. Adult female face, body and proportions.',
    }
  }
  if (/дет|child|kid|boy|girl/.test(s)) {
    return {
      audience: "children's",
      model:
        'The human model MUST be a child appropriate for the garment. Do NOT depict an adult model.',
    }
  }
  if (/унисекс|unisex/.test(s)) {
    return {
      audience: 'unisex',
      model:
        'The human model may be male or female; keep the look gender-neutral and adult unless the garment is clearly for children.',
    }
  }
  if (/муж|man|men|male/.test(s)) {
    return {
      audience: "men's / male",
      model:
        'The human model MUST be an adult man (male). Do NOT depict a woman, girl, or androgynous figure. Adult male face, body and proportions.',
    }
  }
  return null
}
export function buildImagePrompt({
  slotId,
  productPrompt,
  settings,
  extraPrompt = '',
  hasRefImage = false,
  gender = '',
  anchorRef = false,
  modelPassport = null,
}) {
  const slot = IMAGE_SLOTS[slotId]
  if (!slot) return null

  const parts = [
    slot.prompt,
    `Product: ${productPrompt}.`,
    'Keep the product identity, colour, proportions, material and every detail 100% identical to the reference photo. Do not invent a different product.',
  ]

  // Вторая картинка — референс шаблона. Её роль нужно объяснить словами:
  // иначе модель воспринимает её как второй товар и лепит гибрид двух вещей.
  if (hasRefImage) {
    parts.push(
      'The FIRST image is the product to reproduce. The SECOND image is a style reference only: copy its composition, framing, camera angle, lighting and mood, but NEVER copy the product, garment, colour or branding from it.',
    )
  }

  // ЯКОРЬ МОДЕЛИ. Ключевая часть регламента: без неё каждый кадр получает
  // новую модель в новой одежде, и карточка выглядит как съёмка разных
  // товаров. Якорное фото — уже сгенерированный нами кадр «вид спереди».
  if (anchorRef) {
    parts.push(
      `The LAST image is the APPROVED CAST REFERENCE from the same photoshoot of this exact product. ` +
        `It defines WHO the model is and WHAT ELSE they wear. ` +
        `You MUST reuse the very same person: identical face, facial features, skin tone, hair colour, hair length and hairstyle, age, body type and height. ` +
        `You MUST also reuse every OTHER garment and accessory worn there (trousers/jeans/skirt, shoes, belt, socks, jewellery) with the same colour and style. ` +
        `Keep the same studio, background, and lighting setup. ` +
        `The ONLY things that may change are the camera angle and the model's pose, exactly as described above. ` +
        `Do NOT cast a different person, do NOT restyle the hair, do NOT swap the other clothing items or shoes.`,
    )
  }

  // Текстовый портрет модели дублирует якорь словами. Картинка задаёт
  // внешность точнее, но на сильных сменах ракурса (вид сзади) генератор
  // склонен «дорисовывать» своё — словесный замок это ограничивает.
  if (modelPassport) {
    const mp = []
    if (modelPassport.model) mp.push(`Model: ${modelPassport.model}`)
    if (modelPassport.hair) mp.push(`Hair: ${modelPassport.hair}`)
    if (modelPassport.outfit) mp.push(`Other garments that must stay identical: ${modelPassport.outfit}`)
    if (modelPassport.shoes) mp.push(`Footwear that must stay identical: ${modelPassport.shoes}`)
    if (modelPassport.scene) mp.push(`Set and lighting: ${modelPassport.scene}`)
    if (mp.length) parts.push(`Cast sheet (must match exactly) — ${mp.join('. ')}.`)
  }
  if (extraPrompt) parts.push(`Art direction: ${extraPrompt}.`)

  const hint = genderModelHint(gender)
  if (hint) {
    parts.push(`Target audience: ${hint.audience} product.`)
  }

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

  // Слоты с человеком: пол из анализа обязателен, иначе генератор
  // подставляет «типичную» женскую модель даже на мужскую одежду.
  if (sceneSlot && hint) {
    parts.push(hint.model)
  }

  const st = STYLE_PROMPT[settings.style]
  if (st && slotId === 'main') parts.push(st + '.')

  parts.push('High resolution, commercial quality, photorealistic, no text, no watermark, no logo overlay.')
  return parts.join(' ')
}

export async function createImageTask({ imageUrl, prompt, aspect, refUrl, anchorUrl }) {
  // Порядок картинок закреплён и описан в промте словами:
  //   1) фото товара — эталон самой вещи;
  //   2) референс шаблона — только композиция и свет;
  //   3) якорный кадр — кто модель и что ещё на ней надето.
  // Промт ссылается на них как FIRST / SECOND / LAST, поэтому менять
  // порядок нельзя: ссылки в тексте перестанут соответствовать входу.
  const images = [imageUrl]
  if (refUrl) images.push(refUrl)
  if (anchorUrl) images.push(anchorUrl)
  const { resp, json } = await fetchJson(
    `${KIE_BASE}/api/v1/jobs/createTask`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        model: IMAGE_MODEL,
        input: {
          image_urls: images,
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

export async function readTask(taskId) {
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

/* ─────────────────────── паспорт модели (якорь) ─────────────────────── */

/** Внешний URL картинки → data URL (Gemini принимает только inline_data). */
async function urlToDataUrl(url, timeoutMs = 60000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { signal: ctrl.signal })
    if (!resp.ok) throw new Error(`FETCH_FAILED: ${resp.status}`)
    const type = (resp.headers.get('content-type') || 'image/png').split(';')[0]
    if (!/^image\//.test(type)) throw new Error('FETCH_FAILED: not an image')
    const buf = Buffer.from(await resp.arrayBuffer())
    if (!buf.length) throw new Error('FETCH_FAILED: empty')
    return `data:${type};base64,${buf.toString('base64')}`
  } finally {
    clearTimeout(t)
  }
}

const MODEL_PASSPORT_FN = {
  name: 'report_cast',
  description:
    'Describe the human model and everything they wear on this e-commerce photo, so that the SAME person in the SAME outfit can be reproduced on other shots.',
  parameters: {
    type: 'OBJECT',
    properties: {
      model: S(
        'The person: apparent age range, gender, ethnicity/skin tone, build, height impression, distinctive facial features. English, max 45 words.',
      ),
      hair: S('Hair: colour, length, texture and exact styling. English, max 20 words.'),
      outfit: S(
        'Every garment EXCEPT the main product (trousers/jeans/skirt/shorts, belt, socks, outerwear, jewellery): type, colour, fit. English, max 40 words. Empty string if nothing else is visible.',
      ),
      shoes: S('Footwear: type, colour, details. English, max 20 words. Empty string if not visible.'),
      scene: S('Background, set and lighting setup. English, max 25 words.'),
    },
    required: ['model', 'hair', 'outfit', 'shoes', 'scene'],
  },
}

/**
 * «Паспорт модели» по якорному кадру.
 *
 * Одной картинки-референса генератору мало: при сильной смене ракурса
 * (вид сзади) он охотно меняет причёску и подменяет джинсы с обувью.
 * Словесное описание работает как второй, независимый замок.
 *
 * Ошибки наверх не пробрасываются: паспорт — улучшение, и его отсутствие
 * не должно останавливать генерацию остальных кадров.
 */
export async function describeModel(anchorUrl) {
  if (!anchorUrl || typeof anchorUrl !== 'string') return null
  try {
    const dataUrl = await urlToDataUrl(anchorUrl)
    const { args } = await geminiCall({
      prompt: [
        'You are a fashion photography continuity supervisor.',
        'Describe the model and their full outfit on the attached photo precisely enough that the SAME person,',
        'in the SAME secondary clothing and shoes, can be reproduced on additional shots from other angles.',
        'Describe only what is actually visible. Call report_cast.',
      ].join(' '),
      imageDataUrl: dataUrl,
      fn: MODEL_PASSPORT_FN,
      thinkingLevel: 'low',
    })
    const out = {
      model: str(args.model),
      hair: str(args.hair),
      outfit: str(args.outfit),
      shoes: str(args.shoes),
      scene: str(args.scene),
    }
    return out.model || out.hair ? out : null
  } catch (e) {
    console.error('[sku:passport]', e.message)
    return null
  }
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

/**
 * Распознавание фото товара.
 * Экспортируется под коротким именем: тот же анализ вызывает Telegram Mini App,
 * а дублировать промт и разбор ответа в двух местах — верный способ получить
 * со временем два разных поведения у сайта и у бота.
 */
export { handleAnalyze as skuAnalyze, handleContent as skuContent }

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

/**
 * Кэш «локальный файл → публичный URL в хранилище kie.ai».
 *
 * Без кэша один и тот же референс заливался бы заново на КАЖДУЮ генерацию:
 * шаблон применяют десятки раз, а картинка не меняется. Ключ — путь файла,
 * а имена файлов содержат случайный хеш и никогда не переиспользуются, поэтому
 * устаревание кэша невозможно.
 */
const refUrlCache = new Map()

async function publicRefUrl(localUrl) {
  if (!localUrl) return null
  if (/^https?:\/\//.test(localUrl)) return localUrl // уже внешний URL
  const cached = refUrlCache.get(localUrl)
  if (cached) return cached
  const dataUrl = await readUploadAsDataUrl(localUrl)
  if (!dataUrl) return null
  try {
    const url = await uploadImage(dataUrl)
    refUrlCache.set(localUrl, url)
    return url
  } catch {
    // Референс — улучшение, а не обязательное условие: если залить не вышло,
    // генерируем по базовому промту, а не роняем весь запрос.
    return null
  }
}

/**
 * Раскладывает референсы шаблона по слотам.
 *
 * Соответствие ищется в три приёма, от точного к приблизительному:
 *  1. slotHints — явное указание «этот референс для слота back»;
 *  2. по названию кадра (label) через таблицу синонимов;
 *  3. по порядку — остатки раздаются свободным слотам.
 * Третий шаг важен: заказчик заводит референсы как «первый, второй, третий»
 * и не обязан знать наши внутренние id слотов.
 */
const LABEL_TO_SLOT = [
  [/главн|основн|hero|main/i, 'main'],
  [/сзад|спин|back/i, 'back'],
  [/спереди|перед|front|модел/i, 'front'],
  [/ткан|фактур|деталь|макро|fabric|detail/i, 'fabric'],
  [/слож|folded|пачк/i, 'folded'],
  [/лайф|lifestyle|интерьер/i, 'lifestyle'],
  [/вырез|cutout|прозрач/i, 'cutout'],
]

export async function resolveTemplatePlan(templateId, wantedSlots) {
  const plan = new Map()
  if (!templateId || typeof templateId !== 'string') return plan

  let tpl = null
  try {
    tpl = load().templates.find((t) => t.id === templateId) || null
  } catch {
    return plan // база недоступна — работаем без шаблона
  }
  if (!tpl || !Array.isArray(tpl.references) || !tpl.references.length) return plan

  const free = new Set(wantedSlots)
  const assign = (slotId, ref) => {
    if (!free.has(slotId)) return false
    plan.set(slotId, { prompt: ref.prompt || '', localUrl: ref.image || '' })
    free.delete(slotId)
    return true
  }

  const rest = []
  // 1. Явные подсказки.
  for (const ref of tpl.references) {
    const hinted = Object.entries(tpl.slotHints || {}).find(([, refId]) => refId === ref.id)?.[0]
    if (hinted && assign(hinted, ref)) continue
    rest.push(ref)
  }
  // 2. По названию кадра.
  const stillRest = []
  for (const ref of rest) {
    const hit = LABEL_TO_SLOT.find(([re]) => re.test(ref.label || ''))
    if (hit && assign(hit[1], ref)) continue
    stillRest.push(ref)
  }
  // 3. По порядку.
  for (const ref of stillRest) {
    const next = wantedSlots.find((s) => free.has(s))
    if (!next) break
    assign(next, ref)
  }

  // Заливаем картинки только для реально задействованных слотов.
  for (const [slotId, entry] of plan) {
    plan.set(slotId, { ...entry, publicUrl: await publicRefUrl(entry.localUrl) })
  }
  return plan
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

  // Шаблон: его референсы заменяют стандартные промты слотов.
  const plan = await resolveTemplatePlan(payload?.templateId, wanted)

  const tasks = []
  for (const slotId of wanted) {
    const ref = plan.get(slotId)
    // Промт шаблона ДОПОЛНЯЕТ базовый, а не затирает его: базовый держит
    // тождественность товара («не придумывай другой товар»), без него
    // генератор начинает рисовать вещь из референса вместо нашей.
    const prompt = buildImagePrompt({
      slotId,
      productPrompt: pp,
      settings: s,
      extraPrompt: ref?.prompt || '',
      hasRefImage: !!ref?.publicUrl,
      gender: payload?.gender || '',
    })
    try {
      const taskId = await createImageTask({
        imageUrl,
        prompt,
        aspect: IMAGE_SLOTS[slotId].aspect,
        refUrl: ref?.publicUrl || null,
      })
      tasks.push({ slotId, taskId, state: 'processing' })
    } catch (e) {
      tasks.push({ slotId, taskId: null, state: 'fail', error: e.message })
    }
    await sleep(120) // мягкий rate-limit
  }

  return { status: 200, body: { ok: true, tasks, templateApplied: plan.size > 0 } }
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
  const { url, sendJson, readBody, auth } = ctx
  const path = url.pathname

  if (!path.startsWith('/api/sku/')) return false

  if (req.method === 'POST' && !auth) {
    sendJson(res, 401, { ok: false, error: 'Требуется вход' })
    return true
  }

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

    // ── Списание кредит-токенов ДО генерации (server-side, нельзя обойти) ──
    const COST = {
      '/api/sku/analyze': () => 1,
      '/api/sku/content': () => 1,
      '/api/sku/images': () =>
        Math.max(1, (Array.isArray(payload?.slots) ? payload.slots : []).filter((x) => IMAGE_SLOTS[x]).length),
    }
    const cost = COST[path] ? COST[path]() : 0
    if (cost > 0 && auth?.client) {
      const db = load()
      const okConsume = await consumeCredits(db, auth.client, {
        count: cost,
        tool: path.replace('/api/', '').replaceAll('/', ':'),
        accountId: auth.account.id,
        source: 'web',
      })
      if (!okConsume) {
        sendJson(res, 402, { ok: false, error: 'Кредит-токены закончились — обновите тариф' })
        return true
      }
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
