/**
 * Coolay — оркестратор генерации изображений карточки (db.skuJobs).
 *
 * ЗАЧЕМ. Раньше /api/sku/images ставил все ракурсы одной пачкой и независимо:
 * каждая задача видела только фото товара, поэтому Nano Banana придумывала
 * модель заново на каждый кадр. Результат — «вид спереди» и «вид сзади» с
 * разными людьми и в разной одежде, будто товар снимали в двух студиях.
 *
 * КАК РЕШЕНО (двухфазный конвейер с якорем):
 *
 *   Фаза 1 — «товарные» слоты (main/cutout/folded/fabric) и ПЕРВЫЙ слот с
 *            человеком запускаются сразу. Между собой они не связаны:
 *            на них нет модели или она задаёт эталон.
 *   Фаза 2 — как только якорный кадр готов, Gemini описывает по нему
 *            «паспорт модели» (лицо, волосы, кожа, телосложение + ВСЯ прочая
 *            одежда и обувь). Остальные слоты с человеком получают
 *            якорное фото ВТОРЫМ референсом плюс текстовый замок
 *            «тот же человек, та же остальная одежда, меняется только ракурс».
 *
 * ПОЧЕМУ СОСТОЯНИЕ В БАЗЕ, А НЕ В ПАМЯТИ. Фаза 2 начинается через минуты
 * после запроса. Держать это в памяти процесса нельзя: pm2 restart (а он
 * происходит при каждом деплое) потерял бы все активные задания без следа.
 *
 * Эндпоинты:
 *   POST /api/sku/job        — создать задание (одиночное или пакетное)
 *   GET  /api/sku/job?id=    — состояние задания, попутно двигает конвейер
 */

import { load, save, uid, nowIso } from './store.js'
import {
  IMAGE_SLOTS,
  MODEL_SLOTS,
  buildImagePrompt,
  createImageTask,
  readTask,
  describeModel,
  resolveTemplatePlan,
} from './sku.js'

/** Слоты с человеком в кадре, в порядке приоритета для роли якоря. */
const ANCHOR_PRIORITY = ['front', 'back', 'lifestyle']

/**
 * Сколько товаров пакета обрабатываем одновременно.
 * Заказчик просил до 10 в пакете. Все 10 разом — это до 60 параллельных
 * задач в kie.ai: сервис начинает отвечать rate-limit'ом, часть кадров
 * падает, а кредиты за них уже списаны. Поэтому товары идут волнами.
 */
const BATCH_CONCURRENCY = 3

function pickAnchor(slots) {
  return ANCHOR_PRIORITY.find((s) => slots.includes(s)) || null
}

/**
 * Планы шаблонов на время запроса: itemId → Map(slotId → ref).
 * Держим ВНЕ объекта задания, потому что db целиком уходит в JSON.stringify,
 * а Map сериализуется в бесполезный {} и мусорит базу.
 */
const planCache = new Map()

/**
 * Замки по заданию. Фронтенд опрашивает GET каждые 4 секунды, а фаза 2
 * (describeModel + постановка слотов) длится дольше. Без замка два запроса
 * одновременно проходят проверку `state === 'queued'` и создают одну и ту же
 * задачу в kie.ai дважды — двойное списание кредитов у заказчика.
 */
const jobLocks = new Map()

function withJobLock(jobId, fn) {
  const prev = jobLocks.get(jobId) || Promise.resolve()
  const next = prev.then(fn, fn).catch((e) => {
    console.error(`[skujobs] ${jobId}: ${e.message}`)
  })
  jobLocks.set(
    jobId,
    next.finally(() => {
      if (jobLocks.get(jobId) === next) jobLocks.delete(jobId)
    }),
  )
  return next
}

/* ─────────────────────────── создание задания ─────────────────────────── */

/**
 * Одна единица работы = один товар.
 * @returns {object} item
 */
function makeItem(input) {
  const slots = [...new Set((input.slots || []).filter((s) => IMAGE_SLOTS[s]))].slice(0, 7)
  const modelSlots = slots.filter((s) => MODEL_SLOTS.has(s))
  const anchor = pickAnchor(modelSlots)
  return {
    id: uid('item'),
    imageUrl: input.imageUrl,
    productPrompt: input.productPrompt || 'the product from the reference photo',
    gender: input.gender || '',
    templateId: input.templateId || '',
    settings: input.settings || {},
    slots,
    /** Слот-якорь: его результат задаёт модель для остальных. */
    anchorSlot: anchor,
    /** Слоты, ожидающие готовности якоря. */
    waiting: modelSlots.filter((s) => s !== anchor),
    anchorUrl: '',
    modelPassport: null,
    /** slotId → { taskId, state, url, error, credits } */
    images: slots.map((slotId) => ({ slotId, taskId: null, state: 'queued' })),
    label: input.label || '',
    startedAt: null,
    doneAt: null,
  }
}

/* ─────────────────────────── продвижение конвейера ─────────────────────────── */

function itemImage(item, slotId) {
  return item.images.find((i) => i.slotId === slotId)
}

function itemActive(item) {
  return item.images.some((i) => i.state === 'queued' || i.state === 'processing')
}

/** Запуск конкретного слота. Ошибку записываем в слот, а не роняем задание. */
async function launchSlot(item, slotId, plan, extraRefUrl = null, passport = null) {
  const rec = itemImage(item, slotId)
  if (!rec || rec.state !== 'queued') return
  const ref = plan?.get(slotId)
  const prompt = buildImagePrompt({
    slotId,
    productPrompt: item.productPrompt,
    settings: item.settings,
    extraPrompt: ref?.prompt || '',
    hasRefImage: !!ref?.publicUrl,
    gender: item.gender,
    anchorRef: !!extraRefUrl,
    modelPassport: passport,
  })
  try {
    rec.taskId = await createImageTask({
      imageUrl: item.imageUrl,
      prompt,
      aspect: IMAGE_SLOTS[slotId].aspect,
      // Референс шаблона и якорь модели могут прийти вместе: порядок
      // важен, поэтому передаём отдельными аргументами.
      refUrl: ref?.publicUrl || null,
      anchorUrl: extraRefUrl,
    })
    rec.state = 'processing'
  } catch (e) {
    rec.state = 'fail'
    rec.error = e.message
  }
}

/**
 * План шаблона для товара. Держим в planCache, а не в item: объект задания
 * целиком уходит в JSON.stringify при save(), а Map сериализуется в пустое {}
 * — только мусорило бы базу и вводило в заблуждение.
 */
async function planFor(item) {
  let plan = planCache.get(item.id)
  if (!plan) {
    plan = await resolveTemplatePlan(item.templateId, item.slots)
    planCache.set(item.id, plan)
    // Кеш не должен расти бесконечно в долгоживущем процессе.
    if (planCache.size > 500) {
      for (const k of [...planCache.keys()].slice(0, 250)) planCache.delete(k)
    }
  }
  return plan
}

/** Фаза 1: товарные слоты + якорь. */
async function startItem(item) {
  item.startedAt = nowIso()
  const plan = await planFor(item)
  const first = item.slots.filter((s) => !item.waiting.includes(s))
  for (const slotId of first) {
    await launchSlot(item, slotId, plan)
    await new Promise((r) => setTimeout(r, 120)) // мягкий rate-limit
  }
}

/**
 * Фаза 2: якорь готов — снимаем «паспорт модели» и пускаем остальные слоты.
 * Паспорт не критичен: если Gemini не ответил, якорное фото само по себе
 * уже держит внешность, просто замок будет слабее.
 */
async function releaseWaiting(item) {
  if (!item.waiting.length || !item.anchorUrl) return
  if (!item.modelPassport) {
    try {
      item.modelPassport = await describeModel(item.anchorUrl)
    } catch {
      item.modelPassport = null
    }
  }
  const plan = await planFor(item)
  // Список очищаем ДО запуска: launchSlot уходит в await, и повторный
  // проход не должен увидеть те же слоты снова.
  const pending = [...item.waiting]
  item.waiting = []
  for (const slotId of pending) {
    await launchSlot(item, slotId, plan, item.anchorUrl, item.modelPassport)
    await new Promise((r) => setTimeout(r, 120))
  }
}

/** Опрос активных задач одного товара и продвижение фаз. */
async function refreshItem(item) {
  const inFlight = item.images.filter((i) => i.state === 'processing' && i.taskId)
  if (inFlight.length) {
    const results = await Promise.all(
      inFlight.map(async (rec) => {
        try {
          return { rec, r: await readTask(rec.taskId) }
        } catch (e) {
          return { rec, r: { state: 'fail', error: e.message } }
        }
      }),
    )
    for (const { rec, r } of results) {
      if (r.state === 'success') {
        rec.state = 'success'
        rec.url = r.url || ''
        rec.credits = r.credits || 0
        // Якорь готов — запоминаем кадр, по нему построим модель для остальных.
        if (rec.slotId === item.anchorSlot && rec.url) item.anchorUrl = rec.url
      } else if (r.state === 'fail') {
        rec.state = 'fail'
        rec.error = r.error || 'Генерация не удалась'
        // Якорь не удался — ждать больше нечего, иначе остальные кадры
        // с моделью зависли бы в очереди навсегда.
        if (rec.slotId === item.anchorSlot) item.anchorUrl = ''
      }
    }
  }

  const anchorRec = item.anchorSlot ? itemImage(item, item.anchorSlot) : null

  if (item.waiting.length) {
    if (item.anchorUrl) {
      await releaseWaiting(item)
    } else if (anchorRec && anchorRec.state === 'fail') {
      // Без якоря пускаем оставшиеся слоты как раньше — единый образ
      // сохранить не выйдет, но кадры пользователь получит.
      const plan = await planFor(item)
      const pending = [...item.waiting]
      item.waiting = []
      for (const slotId of pending) {
        await launchSlot(item, slotId, plan)
        await new Promise((r) => setTimeout(r, 120))
      }
    }
  }

  if (!itemActive(item) && !item.doneAt) item.doneAt = nowIso()
}

/**
 * Двигает всё задание: обновляет активные товары и добирает следующие
 * из очереди, соблюдая BATCH_CONCURRENCY.
 */
async function advanceJob(job) {
  const started = job.items.filter((i) => i.startedAt)
  const active = started.filter((i) => itemActive(i))

  await Promise.all(active.map((i) => refreshItem(i)))

  // Освободились места — запускаем следующие товары пакета.
  let free = BATCH_CONCURRENCY - job.items.filter((i) => i.startedAt && itemActive(i)).length
  if (free > 0) {
    for (const item of job.items) {
      if (free <= 0) break
      if (item.startedAt) continue
      await startItem(item)
      free--
    }
  }

  const allDone = job.items.every((i) => i.startedAt && !itemActive(i))
  job.state = allDone ? 'done' : 'running'
  job.updatedAt = nowIso()
}

/* ─────────────────────────── публичное представление ─────────────────────────── */

function publicItem(item) {
  const total = item.images.length
  const done = item.images.filter((i) => i.state === 'success').length
  const failed = item.images.filter((i) => i.state === 'fail').length
  return {
    id: item.id,
    label: item.label,
    imageUrl: item.imageUrl,
    slots: item.slots,
    anchorSlot: item.anchorSlot,
    anchorUrl: item.anchorUrl,
    modelPassport: item.modelPassport,
    images: item.images.map((i) => ({
      slotId: i.slotId,
      state: i.state,
      url: i.url || '',
      error: i.error || '',
      credits: i.credits || 0,
      taskId: i.taskId,
    })),
    progress: { total, done, failed },
    state: item.startedAt ? (itemActive(item) ? 'running' : 'done') : 'queued',
    startedAt: item.startedAt,
    doneAt: item.doneAt,
  }
}

function publicJob(job) {
  const items = job.items.map(publicItem)
  return {
    id: job.id,
    state: job.state,
    kind: job.kind,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    concurrency: BATCH_CONCURRENCY,
    items,
    progress: {
      items: items.length,
      itemsDone: items.filter((i) => i.state === 'done').length,
      images: items.reduce((s, i) => s + i.progress.total, 0),
      imagesDone: items.reduce((s, i) => s + i.progress.done, 0),
      imagesFailed: items.reduce((s, i) => s + i.progress.failed, 0),
    },
  }
}

/* ─────────────────────────── роутер ─────────────────────────── */

/** Сколько кадров всего запросили — по этому числу списываются кредиты. */
export function countJobImages(items) {
  return items.reduce(
    (sum, it) => sum + [...new Set((it.slots || []).filter((s) => IMAGE_SLOTS[s]))].length,
    0,
  )
}

export async function skuJobsRouter(req, res, ctx) {
  const { url, sendJson, readBody, auth, charge } = ctx
  const path = url.pathname
  if (path !== '/api/sku/job') return false

  if (!auth?.client) {
    sendJson(res, 401, { ok: false, error: 'Требуется вход' })
    return true
  }

  const db = load()
  const clientId = auth.client.id

  /* ── Создание задания ── */
  if (req.method === 'POST') {
    let d
    try {
      d = JSON.parse(await readBody(req))
    } catch (e) {
      const tooBig = e.message === 'PAYLOAD_TOO_LARGE'
      sendJson(res, tooBig ? 413 : 400, {
        ok: false,
        error: tooBig ? 'Файл слишком большой (макс. 30 МБ)' : 'Некорректный запрос',
      })
      return true
    }

    const rawItems = Array.isArray(d?.items) ? d.items : d?.imageUrl ? [d] : []
    if (!rawItems.length) {
      sendJson(res, 400, { ok: false, error: 'Нет товаров для генерации' })
      return true
    }
    // Заказчик просил до 10 товаров в пакете.
    const items = rawItems
      .slice(0, 10)
      .filter((x) => typeof x?.imageUrl === 'string' && /^https?:\/\//.test(x.imageUrl))
      .map(makeItem)
      .filter((x) => x.slots.length)

    if (!items.length) {
      sendJson(res, 400, { ok: false, error: 'Нет корректных изображений или ракурсов' })
      return true
    }

    // Кредиты списываем сразу за все кадры задания: считать по факту нельзя,
    // иначе пользователь запускает пакет, не имея на него баланса.
    const cost = countJobImages(items)
    if (charge && !(await charge(cost, 'sku:job'))) {
      sendJson(res, 402, { ok: false, error: 'Кредит-токены закончились — обновите тариф' })
      return true
    }

    const job = {
      id: uid('job'),
      clientId,
      accountId: auth.account?.id || null,
      kind: items.length > 1 ? 'batch' : 'single',
      state: 'running',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      items,
    }
    db.skuJobs.unshift(job)
    // Задания — рабочий журнал, а не архив: держим последние 200 на клиента.
    const mine = db.skuJobs.filter((j) => j.clientId === clientId)
    if (mine.length > 200) {
      const drop = new Set(mine.slice(200).map((j) => j.id))
      db.skuJobs = db.skuJobs.filter((j) => !drop.has(j.id))
    }

    await withJobLock(job.id, () => advanceJob(job))
    await save()
    sendJson(res, 200, { ok: true, job: publicJob(job) })
    return true
  }

  /* ── Опрос состояния: он же двигает конвейер ── */
  if (req.method === 'GET') {
    const id = url.searchParams.get('id') || ''
    const job = db.skuJobs.find((j) => j.id === id && j.clientId === clientId)
    if (!job) {
      sendJson(res, 404, { ok: false, error: 'Задание не найдено' })
      return true
    }
    if (job.state !== 'done') {
      await withJobLock(job.id, () => advanceJob(job))
      await save()
    }
    sendJson(res, 200, { ok: true, job: publicJob(job) })
    return true
  }

  return false
}
