/**
 * Coolay — карточки товара на сервере (db.skuCards).
 *
 * ЗАЧЕМ ПЕРЕЕХАЛИ С localStorage. Раньше готовые карточки лежали в браузере
 * (ключ coolay_sku_cards). Следствия были такие:
 *   - историю не видел ни другой сотрудник, ни бот, ни сам пользователь
 *     с другого устройства;
 *   - «похожий товар уже создавали» проверить было не с чем;
 *   - очистка кэша браузера = безвозвратная потеря всего каталога.
 * Теперь карточки принадлежат клиенту (clientId) и живут в общей базе.
 *
 * Эндпоинты:
 *   GET    /api/sku/cards        — список карточек клиента
 *   POST   /api/sku/cards        — сохранить карточку
 *   PATCH  /api/sku/cards/:id    — правка карточки
 *   DELETE /api/sku/cards/:id    — удаление
 *   POST   /api/sku/cards/import — разовый перенос карточек из localStorage
 *   POST   /api/sku/similar      — поиск похожих товаров перед генерацией
 */

import { load, save, uid, nowIso } from './store.js'

/* ─────────────────────────── нормализация ─────────────────────────── */

const str = (v, fb = '') => (typeof v === 'string' && v.trim() ? v.trim() : fb)
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb)

/**
 * Приведение значения атрибута к сравнимому виду: регистр, пунктуация и
 * слова-заполнители («вероятно», «примерно») мешают сопоставлению —
 * «Хлопок (вероятно 100%)» и «хлопок 100%» это один и тот же материал.
 */
function normAttr(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/вероятно|примерно|возможно|ориентировочно/g, ' ')
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .trim()
}

/* ─────────────────────────── схожесть товаров ─────────────────────────── */

/**
 * КАК СЧИТАЕТСЯ СХОЖЕСТЬ. Два независимых признака:
 *
 *   1. dHash фотографии (64-битный перцептивный хеш). Считается НА КЛИЕНТЕ
 *      через canvas: бэкенд принципиально без внешних зависимостей
 *      (см. комментарий в store.js), а чистого JPEG-декодера в стандартной
 *      библиотеке Node нет — зато в браузере декодер уже есть. Сервер лишь
 *      сравнивает готовые хеши по расстоянию Хэмминга, это чистая арифметика.
 *      Ловит то же фото после пересжатия, ресайза и лёгкой цветокоррекции.
 *
 *   2. Атрибуты AI-анализа — ловят тот же товар, отснятый ДРУГИМ кадром.
 *      Именно этот случай и просил заказчик.
 *
 * Итог берётся как максимум из двух оценок: совпасть достаточно по одному
 * признаку. Товар, снятый заново с другого ракурса, даёт слабый хеш, но
 * сильные атрибуты — и наоборот для пересохранённого файла.
 */

/** Расстояние Хэмминга между hex-строками dHash одинаковой длины. */
function hammingHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return null
  if (a.length !== b.length || !a.length) return null
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16)
    const y = parseInt(b[i], 16)
    if (Number.isNaN(x) || Number.isNaN(y)) return null
    let v = x ^ y
    while (v) {
      dist += v & 1
      v >>= 1
    }
  }
  return dist
}

/**
 * Хеш → проценты. 64-битный dHash: расстояние 0 это тот же кадр,
 * ≤6 бит — пересжатие/ресайз, дальше сходство быстро теряет смысл,
 * поэтому за порогом 16 бит оценку не выдаём вовсе.
 */
function hashScore(a, b) {
  const bits = (a?.length || 0) * 4
  const dist = hammingHex(a, b)
  if (dist === null || !bits) return 0
  const maxDist = Math.round(bits * 0.25) // 16 бит из 64
  if (dist > maxDist) return 0
  return Math.round((1 - dist / maxDist) * 100)
}
const ATTR_WEIGHTS = {
  productType: 26,
  category: 20,
  color: 16,
  material: 12,
  pattern: 8,
  cut: 7,
  gender: 6,
  neckline: 3,
  sleeve: 2,
}

/** Категория — путь «Мужское > Одежда > Футболки»: считаем долю совпавших уровней. */
function categoryScore(a, b) {
  const seg = (v) =>
    String(v || '')
      .split(/[>/]/)
      .map((x) => normAttr(x))
      .filter(Boolean)
  const A = seg(a)
  const B = seg(b)
  if (!A.length || !B.length) return 0
  let hit = 0
  const len = Math.min(A.length, B.length)
  for (let i = 0; i < len; i++) if (A[i] === B[i]) hit++
  return hit / Math.max(A.length, B.length)
}

/** Сравнение одного атрибута: точное совпадение — 1, вхождение — 0.6. */
function attrScore(a, b) {
  const x = normAttr(a)
  const y = normAttr(b)
  if (!x || !y || x === '—' || y === '—') return 0
  if (x === y) return 1
  if (x.includes(y) || y.includes(x)) return 0.6
  // Частичное пересечение слов: «тёмно зелёный» vs «зелёный».
  const xs = new Set(x.split(' '))
  const ys = y.split(' ').filter((w) => xs.has(w))
  if (ys.length) return (0.5 * ys.length) / Math.max(xs.size, y.split(' ').length)
  return 0
}

/** Оценка только по атрибутам анализа. */
function attrTotal(a, b) {
  if (!a || !b) return 0
  let total = 0
  for (const [key, weight] of Object.entries(ATTR_WEIGHTS)) {
    const s = key === 'category' ? categoryScore(a.category, b.category) : attrScore(a[key], b[key])
    total += s * weight
  }
  return Math.round(Math.max(0, Math.min(100, total)))
}

/**
 * Итоговый процент схожести. Максимум из двух признаков — совпасть
 * достаточно по одному: пересохранённый файл даёт сильный хеш при слабых
 * атрибутах, пересъёмка того же товара — наоборот.
 */
export function similarityScore(a, b, hashA, hashB) {
  return Math.max(hashScore(hashA, hashB), attrTotal(a, b))
}

/** Порог, с которого предупреждаем пользователя (запрошено заказчиком: 90%). */
export const DUPLICATE_THRESHOLD = 90
/** Порог «просто похожий» — показываем как подсказку, не блокируя. */
export const SIMILAR_THRESHOLD = 70

/* ─────────────────────────── публичное представление ─────────────────────────── */

function publicCard(c) {
  return {
    id: c.id,
    sku: c.sku,
    productId: c.productId,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    author: c.author,
    createdVia: c.createdVia,
    source: c.source || 'web',
    sourceImage: c.sourceImage,
    images: c.images || [],
    analysis: c.analysis,
    content: c.content || {},
    specs: c.specs || [],
    tone: c.tone,
    credits: c.credits || 0,
    creditBreakdown: c.creditBreakdown || null,
    channels: c.channels || [],
    versions: c.versions || [],
    activity: c.activity || [],
    readiness: c.readiness || null,
    /** Паспорт модели и якорное фото — чтобы повторная генерация дала ту же модель. */
    modelPassport: c.modelPassport || null,
    anchorUrl: c.anchorUrl || '',
    batchId: c.batchId || null,
  }
}

/** Карточки одного клиента, свежие первыми. */
function cardsOf(db, clientId) {
  return db.skuCards
    .filter((c) => c.clientId === clientId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

/**
 * Сборка записи из полезной нагрузки клиента.
 * Экспортируется, потому что тем же путём карточку создаёт Telegram-бот.
 */
export function buildCard(payload, { clientId, author, source = 'web' }) {
  const now = nowIso()
  const analysis = payload?.analysis && typeof payload.analysis === 'object' ? payload.analysis : null
  return {
    id: uid('card'),
    clientId,
    sku: str(payload?.sku, 'SKU-000000'),
    productId: str(payload?.productId),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    author: str(author, 'Пользователь'),
    createdVia: str(payload?.createdVia, 'AI-генерация'),
    source,
    sourceImage: str(payload?.sourceImage),
    imageHash: str(payload?.imageHash),
    images: Array.isArray(payload?.images) ? payload.images.slice(0, 12) : [],
    analysis,
    content: payload?.content && typeof payload.content === 'object' ? payload.content : {},
    specs: Array.isArray(payload?.specs) ? payload.specs.slice(0, 20) : [],
    tone: str(payload?.tone, 'Нейтральный'),
    credits: num(payload?.credits),
    creditBreakdown: payload?.creditBreakdown || null,
    channels: Array.isArray(payload?.channels) ? payload.channels : [],
    versions: Array.isArray(payload?.versions) ? payload.versions : [],
    activity: Array.isArray(payload?.activity) ? payload.activity : [],
    readiness: payload?.readiness || null,
    modelPassport: payload?.modelPassport || null,
    anchorUrl: str(payload?.anchorUrl),
    batchId: str(payload?.batchId) || null,
  }
}

/* ─────────────────────────── роутер ─────────────────────────── */

export async function cardsRouter(req, res, ctx) {
  const { url, sendJson, readBody, auth } = ctx
  const path = url.pathname

  if (!path.startsWith('/api/sku/cards') && path !== '/api/sku/similar') return false
  if (!auth?.client) {
    sendJson(res, 401, { ok: false, error: 'Требуется вход' })
    return true
  }

  const db = load()
  const clientId = auth.client.id

  /* ── Список ── */
  if (path === '/api/sku/cards' && req.method === 'GET') {
    const limit = Math.min(500, Math.max(1, num(url.searchParams.get('limit'), 200)))
    sendJson(res, 200, {
      ok: true,
      cards: cardsOf(db, clientId).slice(0, limit).map(publicCard),
      total: cardsOf(db, clientId).length,
    })
    return true
  }

  /* ── Поиск похожих: вызывается сразу после анализа фото ── */
  if (path === '/api/sku/similar' && req.method === 'POST') {
    let d
    try {
      d = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { ok: false, error: 'Некорректный запрос' })
      return true
    }
    const mine = cardsOf(db, clientId)
    const matches = mine
      .map((c) => ({
        card: c,
        score: similarityScore(d.analysis, c.analysis, d.imageHash, c.imageHash),
      }))
      .filter((m) => m.score >= SIMILAR_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((m) => ({
        similarity: m.score,
        id: m.card.id,
        sku: m.card.sku,
        title: m.card.content?.ru?.name || m.card.analysis?.title || 'Карточка товара',
        thumbnail:
          (m.card.images || []).find((i) => i.state === 'success' && i.url)?.url ||
          m.card.sourceImage ||
          '',
        author: m.card.author,
        createdAt: m.card.createdAt,
        /** Тот же кадр (хеш совпал вплотную) — формулировка в UI строже. */
        exact: hashScore(d.imageHash, m.card.imageHash) >= 95,
      }))
    sendJson(res, 200, {
      ok: true,
      matches,
      duplicate: matches.some((m) => m.similarity >= DUPLICATE_THRESHOLD),
      threshold: DUPLICATE_THRESHOLD,
    })
    return true
  }

  /* ── Создание ── */
  if (path === '/api/sku/cards' && req.method === 'POST') {
    let d
    try {
      d = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { ok: false, error: 'Некорректный запрос' })
      return true
    }
    const card = buildCard(d, { clientId, author: auth.account?.name })
    db.skuCards.unshift(card)
    // Держим разумный предел на клиента, иначе JSON-база разрастается без границ.
    const mine = db.skuCards.filter((c) => c.clientId === clientId)
    if (mine.length > 2000) {
      const drop = new Set(mine.slice(2000).map((c) => c.id))
      db.skuCards = db.skuCards.filter((c) => !drop.has(c.id))
    }
    await save()
    sendJson(res, 200, { ok: true, card: publicCard(card) })
    return true
  }

  /* ── Разовый перенос из localStorage ── */
  if (path === '/api/sku/cards/import' && req.method === 'POST') {
    let d
    try {
      d = JSON.parse(await readBody(req))
    } catch {
      sendJson(res, 400, { ok: false, error: 'Некорректный запрос' })
      return true
    }
    const list = Array.isArray(d?.cards) ? d.cards.slice(0, 500) : []
    // Повторный импорт не должен плодить дубли: тот же SKU у того же клиента
    // считаем уже перенесённым.
    const known = new Set(cardsOf(db, clientId).map((c) => c.sku))
    let added = 0
    for (const raw of list) {
      const sku = str(raw?.sku)
      if (!sku || known.has(sku)) continue
      const card = buildCard(raw, { clientId, author: raw?.author || auth.account?.name })
      // Исходные даты сохраняем — иначе вся история схлопнется в «сегодня».
      if (raw?.createdAt) card.createdAt = raw.createdAt
      if (raw?.updatedAt) card.updatedAt = raw.updatedAt
      db.skuCards.push(card)
      known.add(sku)
      added++
    }
    if (added) await save()
    sendJson(res, 200, { ok: true, added, total: cardsOf(db, clientId).length })
    return true
  }

  /* ── Правка / удаление конкретной карточки ── */
  const m = /^\/api\/sku\/cards\/([A-Za-z0-9_-]+)$/.exec(path)
  if (m) {
    const card = db.skuCards.find((c) => c.id === m[1] && c.clientId === clientId)
    if (!card) {
      sendJson(res, 404, { ok: false, error: 'Карточка не найдена' })
      return true
    }

    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, card: publicCard(card) })
      return true
    }

    if (req.method === 'PATCH') {
      let d
      try {
        d = JSON.parse(await readBody(req))
      } catch {
        sendJson(res, 400, { ok: false, error: 'Некорректный запрос' })
        return true
      }
      // Перечень изменяемых полей закрыт: иначе клиент мог бы переписать
      // clientId и увести карточку в другую компанию.
      for (const key of [
        'status', 'content', 'specs', 'images', 'analysis', 'readiness',
        'channels', 'versions', 'activity', 'tone', 'modelPassport', 'anchorUrl',
      ]) {
        if (d[key] !== undefined) card[key] = d[key]
      }
      card.updatedAt = nowIso()
      await save()
      sendJson(res, 200, { ok: true, card: publicCard(card) })
      return true
    }

    if (req.method === 'DELETE') {
      db.skuCards = db.skuCards.filter((c) => c.id !== card.id)
      await save()
      sendJson(res, 200, { ok: true })
      return true
    }
  }

  return false
}
