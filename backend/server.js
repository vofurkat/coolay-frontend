import './env.js' // должен быть первым: наполняет process.env из .env
import http from 'node:http'
import fs from 'node:fs'
import { requireKieKey } from './env.js'
import { skuRouter } from './sku.js'
import { cardsRouter } from './cards.js'
import { skuJobsRouter } from './skujobs.js'
import { templatesRouter } from './templates.js'
import { teamRouter } from './team.js'
import { telegramRouter } from './telegram.js'
import { authRouter, getAuth } from './auth.js'
import { sadminRouter, ensureFirstAdmin } from './sadmin.js'
import { consumeCredits } from './plans.js'
import { resolveUpload, CONTENT_TYPES, load } from './store.js'

/**
 * Coolay backend — прокси к kie.ai + хранилище данных приложения.
 *
 * Эндпоинты:
 *  POST /api/generate        — прямая генерация Nano Banana 2 по готовому prompt
 *  POST /api/generate-smart  — 2 шага: Gemini 3 Flash анализирует фото + инструмент
 *                              + текст пользователя → строит prompt → Nano Banana 2
 *  POST /api/sku/analyze     — Gemini 3.6 Flash: распознавание товара по фото
 *  POST /api/sku/content     — Gemini 3.6 Flash: контент карточки RU/EN/UZ/TR + SEO
 *  POST /api/sku/images      — Nano Banana 2 Lite: студийные фото товара
 *  GET  /api/sku/task        — статус задач генерации изображений
 *  /api/templates/*          — шаблоны карточек по категориям (templates.js)
 *  /api/team/*               — сотрудники, совместные проекты, план и квота (team.js)
 *  /api/telegram/*           — бот @coolay_bot и Mini App (telegram.js)
 *  GET  /api/files/:name     — отдача загруженных изображений
 *  GET  /api/health
 *
 * Секреты (KIE_API_KEY, TELEGRAM_BOT_TOKEN) хранятся ТОЛЬКО на сервере в .env.
 */

const PORT = process.env.PORT || 8793
const KIE_API_KEY = requireKieKey()

const KIE_BASE = 'https://api.kie.ai'
const KIE_UPLOAD = 'https://kieai.redpandaai.co/api/file-base64-upload'
const GEMINI_MODEL = 'gemini-3-flash'

const ALLOWED_RES = new Set(['1K', '2K', '4K'])
const ALLOWED_AR = new Set([
  '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5',
  '5:4', '8:1', '9:16', '16:9', '21:9', 'auto',
])
const ALLOWED_FMT = new Set(['png', 'jpg'])

const MAX_BODY = 35 * 1024 * 1024
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

// --- Инструкции для Gemini по каждому инструменту ---
// Gemini получает фото + эту задачу и пишет финальный prompt для Nano Banana 2.
const TOOL_INSTRUCTIONS = {
  'start-photo':
    'Turn this product photo into a clean professional e-commerce studio shot. Keep the product identical, improve lighting and presentation.',
  'remove-bg':
    'Remove the background completely. Keep ONLY the main product with clean precise edges, place it on a pure plain white background. Do not alter the product itself.',
  'virtual-model':
    'Place this clothing/product on a realistic human fashion model in a natural pose, professional e-commerce fashion photography. Keep the product design, color and details identical.',
  'ai-background':
    'Keep the product exactly as is, but replace the background with an attractive, fitting scene that matches the product. Realistic lighting and shadows that blend product with the new background.',
  'invisible-mannequin':
    'Create a ghost mannequin / invisible mannequin effect: show the garment as if worn by an invisible person, with natural 3D shape and hollow neckline, on a clean white background. Keep fabric, color and details identical.',
  upscale:
    'Upscale and enhance this product image: increase sharpness, detail and clarity to high resolution while keeping the product 100% identical. No stylistic changes.',
  retouch:
    'Professionally retouch this product photo: remove dust, scratches, blemishes and imperfections, even out lighting, keep the product natural and identical. No heavy stylization.',
  shadow:
    'Add a natural realistic soft shadow under the product, as in professional product photography, on a clean light background. Keep the product identical.',
  resize:
    'Reframe and center the product cleanly for a marketplace product card (Wildberries/Ozon style): product centered on a clean background with comfortable margins. Keep the product identical.',
}

const DEFAULT_INSTRUCTION =
  'Improve this product photo into a clean professional e-commerce image. Keep the product identical.'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('PAYLOAD_TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// --- Загрузка изображения → публичный URL ---
async function uploadImage(dataUrl) {
  const resp = await fetch(KIE_UPLOAD, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64Data: dataUrl,
      uploadPath: 'images/coolay',
      fileName: `product-${Date.now()}.png`,
    }),
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok || !json?.data?.downloadUrl) {
    throw new Error(`UPLOAD_FAILED: ${json?.msg || resp.status}`)
  }
  return json.data.downloadUrl
}

// --- Gemini 3 Flash: строим грамотный prompt по фото + задаче + тексту пользователя ---
async function buildPromptWithGemini({ imageUrl, toolTitle, instruction, userPrompt, extras }) {
  const system =
    'You are an expert prompt engineer for the Nano Banana 2 image editing model. ' +
    'Look at the product photo and write ONE concise, vivid English prompt (max 90 words) that instructs ' +
    'the image model to perform the requested task. Always preserve the real product identity, shape, color and logo. ' +
    'Output ONLY the final prompt text, no preamble, no quotes, no markdown.'

  const userParts = [
    `Task (tool "${toolTitle}"): ${instruction}`,
    extras ? `Extra settings: ${extras}` : '',
    userPrompt && userPrompt.trim()
      ? `Additional user requirements (must be respected): ${userPrompt.trim()}`
      : '',
    'Now look at the attached product photo and write the final prompt.',
  ]
    .filter(Boolean)
    .join('\n')

  const resp = await fetch(`${KIE_BASE}/${GEMINI_MODEL}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: userParts },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  })
  const json = await resp.json().catch(() => ({}))
  const text = json?.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string') throw new Error('GEMINI_FAILED')
  return text.trim().replace(/^["']|["']$/g, '').slice(0, 20000)
}

// Фоллбэк-prompt без Gemini (если анализ не удался)
function fallbackPrompt(instruction, userPrompt) {
  const parts = [
    instruction,
    'High detail, sharp focus, professional commercial product photography, realistic lighting.',
  ]
  if (userPrompt && userPrompt.trim()) parts.push(userPrompt.trim())
  return parts.join(' ')
}

// --- Создание задачи Nano Banana 2 ---
async function createTask(input) {
  const resp = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nano-banana-2', input }),
  })
  const json = await resp.json().catch(() => ({}))
  if (json?.code !== 200 || !json?.data?.taskId) {
    throw new Error(`CREATE_FAILED: ${json?.msg || resp.status} (code ${json?.code})`)
  }
  return json.data.taskId
}

// --- Опрос статуса ---
async function pollTask(taskId) {
  const started = Date.now()
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const resp = await fetch(
      `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${KIE_API_KEY}` } },
    )
    const json = await resp.json().catch(() => ({}))
    const data = json?.data
    const state = data?.state
    if (state === 'success') {
      let urls = []
      try {
        urls = JSON.parse(data.resultJson || '{}').resultUrls || []
      } catch {
        urls = []
      }
      if (!urls.length) throw new Error('NO_RESULT_URL')
      return { url: urls[0], creditsConsumed: data.creditsConsumed || 0 }
    }
    if (state === 'fail' || state === 'failed') {
      throw new Error(`GENERATION_FAILED: ${data?.failMsg || 'unknown'}`)
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('TIMEOUT')
}

function normSettings(payload) {
  return {
    resolution: ALLOWED_RES.has(payload.resolution) ? payload.resolution : '1K',
    aspect_ratio: ALLOWED_AR.has(payload.aspect_ratio) ? payload.aspect_ratio : 'auto',
    output_format: ALLOWED_FMT.has(payload.output_format) ? payload.output_format : 'jpg',
  }
}

function errorResponse(res, e) {
  console.error('[error]', e.message)
  const map = {
    UPLOAD_FAILED: 'Не удалось загрузить изображение',
    CREATE_FAILED: 'Сервис генерации отклонил запрос',
    GENERATION_FAILED: 'Генерация не удалась, попробуйте другое фото',
    NO_RESULT_URL: 'Сервис не вернул результат',
    TIMEOUT: 'Превышено время ожидания, попробуйте ещё раз',
  }
  const key = e.message.split(':')[0]
  return sendJson(res, 502, { ok: false, error: map[key] || 'Ошибка генерации' })
}

/**
 * Списание кредит-токенов за генерацию в инструментах (/api/generate*).
 * Списываем ДО запуска — квоту нельзя обойти через DevTools.
 * Возвращает true, если можно продолжать; иначе сам отвечает 402.
 */
async function chargeGeneration(res, auth, tool) {
  const db = load()
  const ok = await consumeCredits(db, auth.client, {
    count: 1,
    tool,
    accountId: auth.account.id,
    source: 'web',
  })
  if (!ok) {
    sendJson(res, 402, { ok: false, error: 'Кредит-токены закончились — обновите тариф' })
    return false
  }
  return true
}

/**
 * Списание N кредит-токенов без формирования ответа.
 *
 * Отличие от chargeGeneration: у пакетного задания стоимость переменная
 * (до 10 товаров × 7 ракурсов), и решение, что ответить клиенту, принимает
 * сам модуль заданий. Поэтому здесь только boolean.
 */
async function chargeCredits(auth, count, tool) {
  if (!auth?.client || count <= 0) return true
  const db = load()
  return consumeCredits(db, auth.client, {
    count,
    tool,
    accountId: auth.account?.id,
    source: 'web',
  })
}

// --- Прямая генерация (готовый prompt) ---
async function handleGenerate(req, res) {
  let payload
  try {
    payload = JSON.parse(await readBody(req))
  } catch (e) {
    if (e.message === 'PAYLOAD_TOO_LARGE')
      return sendJson(res, 413, { ok: false, error: 'Файл слишком большой (макс. 30 МБ)' })
    return sendJson(res, 400, { ok: false, error: 'Некорректный запрос' })
  }
  const { image, prompt } = payload || {}
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/'))
    return sendJson(res, 400, { ok: false, error: 'Нужно изображение товара (data URL)' })
  if (!prompt || !prompt.trim())
    return sendJson(res, 400, { ok: false, error: 'Пустой prompt' })

  const s = normSettings(payload)
  try {
    const imageUrl = await uploadImage(image)
    const taskId = await createTask({ prompt: prompt.slice(0, 20000), image_input: [imageUrl], ...s })
    const { url, creditsConsumed } = await pollTask(taskId)
    return sendJson(res, 200, { ok: true, url, taskId, creditsConsumed })
  } catch (e) {
    return errorResponse(res, e)
  }
}

// --- Умная генерация: Gemini → Nano Banana 2 ---
async function handleGenerateSmart(req, res) {
  let payload
  try {
    payload = JSON.parse(await readBody(req))
  } catch (e) {
    if (e.message === 'PAYLOAD_TOO_LARGE')
      return sendJson(res, 413, { ok: false, error: 'Файл слишком большой (макс. 30 МБ)' })
    return sendJson(res, 400, { ok: false, error: 'Некорректный запрос' })
  }

  const { image, toolSlug, toolTitle, userPrompt, extras } = payload || {}
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/'))
    return sendJson(res, 400, { ok: false, error: 'Нужно изображение товара (data URL)' })

  const instruction = TOOL_INSTRUCTIONS[toolSlug] || DEFAULT_INSTRUCTION
  const s = normSettings(payload)

  try {
    const imageUrl = await uploadImage(image)

    // Шаг 1 — Gemini строит prompt (с фоллбэком при сбое)
    let prompt
    let promptedBy = 'gemini'
    try {
      prompt = await buildPromptWithGemini({
        imageUrl,
        toolTitle: toolTitle || toolSlug || 'product',
        instruction,
        userPrompt,
        extras,
      })
    } catch (ge) {
      console.error('[gemini fallback]', ge.message)
      prompt = fallbackPrompt(instruction, userPrompt)
      promptedBy = 'fallback'
    }

    // Шаг 2 — Nano Banana 2
    const taskId = await createTask({ prompt, image_input: [imageUrl], ...s })
    const { url, creditsConsumed } = await pollTask(taskId)

    return sendJson(res, 200, { ok: true, url, taskId, creditsConsumed, prompt, promptedBy })
  } catch (e) {
    return errorResponse(res, e)
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {})

  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname

  if (req.method === 'GET' && path === '/api/health')
    return sendJson(res, 200, {
      ok: true,
      service: 'coolay-backend',
      sku: true,
      templates: true,
      team: true,
      auth: true,
      telegram: !!process.env.TELEGRAM_BOT_TOKEN,
      // Флаги новых модулей — deploy.sh по ним проверяет, что прод поднялся
      // с полным набором роутов, а не с частично скопированными файлами.
      cards: true,
      jobs: true,
    })

  // Отдача загруженных изображений (референсы шаблонов, фото из Telegram)
  if (req.method === 'GET' && path.startsWith('/api/files/')) {
    const full = resolveUpload(path.slice('/api/files/'.length))
    if (!full) return sendJson(res, 404, { ok: false, error: 'Файл не найден' })
    const ext = (full.split('.').pop() || '').toLowerCase()
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
      // В имени файла есть случайный хеш, поэтому содержимое по этому адресу
      // никогда не меняется — кэшируем надолго.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    })
    return fs.createReadStream(full).pipe(res)
  }

  // Авторизация клиентов (регистрация / вход / Google / сессия)
  if (path.startsWith('/api/auth/')) {
    const handled = await authRouter(req, res, { url, sendJson, readBody })
    if (handled) return
    return sendJson(res, 404, { ok: false, error: 'Not found' })
  }

  // Супер-админка платформы (/sadmin)
  if (path.startsWith('/api/sadmin/')) {
    const handled = await sadminRouter(req, res, { url, sendJson, readBody })
    if (handled) return
    return sendJson(res, 404, { ok: false, error: 'Not found' })
  }

  // Текущая клиентская сессия — один раз на запрос, передаём во все роутеры.
  let auth = getAuth(req)
  if (auth?.blocked) {
    return sendJson(res, 403, { ok: false, error: 'Аккаунт заблокирован — обратитесь в поддержку Coolay' })
  }

  // Модуль карточек товара (SKU)
  if (path.startsWith('/api/sku/')) {
    // Хранилище карточек и поиск похожих — до skuRouter: у него общий
    // префикс /api/sku/, а списание кредитов здесь не нужно.
    const byCards = await cardsRouter(req, res, { url, sendJson, readBody, auth })
    if (byCards) return

    // Задания генерации сами списывают кредиты (кадров может быть до 60),
    // поэтому получают функцию списания, а не фиксированную ставку.
    const byJobs = await skuJobsRouter(req, res, {
      url,
      sendJson,
      readBody,
      auth,
      charge: (count, tool) => chargeCredits(auth, count, tool),
    })
    if (byJobs) return

    const handled = await skuRouter(req, res, { url, sendJson, readBody, auth })
    if (handled) return
    return sendJson(res, 404, { ok: false, error: 'Not found' })
  }

  // Шаблоны карточек по категориям
  if (path.startsWith('/api/templates')) {
    const handled = await templatesRouter(req, res, { url, sendJson, readBody, auth })
    if (handled) return
    return sendJson(res, 404, { ok: false, error: 'Not found' })
  }

  // Сотрудники, совместные проекты, план и квота
  if (path.startsWith('/api/team/')) {
    const handled = await teamRouter(req, res, { url, sendJson, readBody, auth })
    if (handled) return
    return sendJson(res, 404, { ok: false, error: 'Not found' })
  }

  // Telegram-бот и Mini App (авторизация своя — по Telegram ID)
  if (path.startsWith('/api/telegram/')) {
    const handled = await telegramRouter(req, res, { url, sendJson, readBody, auth })
    if (handled) return
    return sendJson(res, 404, { ok: false, error: 'Not found' })
  }

  if (req.method === 'POST' && (path === '/api/generate' || path === '/api/generate-smart')) {
    if (!auth) return sendJson(res, 401, { ok: false, error: 'Требуется вход' })
    const tool = path === '/api/generate' ? 'generate' : 'generate-smart'
    if (!(await chargeGeneration(res, auth, tool))) return
    return path === '/api/generate' ? handleGenerate(req, res) : handleGenerateSmart(req, res)
  }
  return sendJson(res, 404, { ok: false, error: 'Not found' })
})

await ensureFirstAdmin()

server.listen(PORT, '127.0.0.1', () => {
  console.log(`coolay-backend listening on http://127.0.0.1:${PORT}`)
})
