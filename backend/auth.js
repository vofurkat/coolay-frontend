/**
 * Авторизация клиентов SaaS-платформы Coolay.
 *
 * Модель. Клиент (Client) — это компания/workspace: у неё тариф, кредиты и
 * все данные (проекты, сотрудники, шаблоны). Аккаунт (Account) — логин
 * человека, привязан к клиенту. При самостоятельной регистрации создаются
 * оба: клиент + первый аккаунт-владелец.
 *
 * Пароли — scrypt (встроен в node:crypto, без внешних зависимостей).
 * Сессии — httpOnly cookie `coolay_sid`, токен хранится в базе с датой
 * истечения. Стало быть, «выход» — это удаление записи на сервере, а не
 * только чистка браузера, как было у фейкового admin/admin.
 *
 * Google Sign-In: фронт получает ID-token через Google Identity Services,
 * сервер проверяет подпись через tokeninfo-эндпоинт Google (без SDK).
 * Требует GOOGLE_CLIENT_ID в .env; без него кнопка Google просто скрыта.
 *
 * Эндпоинты:
 *   POST /api/auth/register  — регистрация (компания, email, пароль)
 *   POST /api/auth/login     — вход по email+паролю
 *   POST /api/auth/google    — вход/регистрация через Google ID-token
 *   POST /api/auth/logout    — выход (удаление сессии)
 *   GET  /api/auth/me        — текущий аккаунт + клиент + конфиг (googleClientId)
 */
import crypto from 'node:crypto'
import { load, save, uid, nowIso } from './store.js'
import { getPlan } from './plans.js'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 дней
const COOKIE_NAME = 'coolay_sid'

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function normEmail(v) {
  return clean(v, 160).toLowerCase()
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/* ─────────────────────────── Пароли (scrypt) ─────────────────────────── */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split(':')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = crypto.scryptSync(password, salt, expected.length)
  // timingSafeEqual — сравнение за постоянное время, обычный === уязвим
  // к тайминг-атаке на подбор пароля.
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

/* ─────────────────────────── Сессии ─────────────────────────── */

function parseCookies(req) {
  const header = req.headers.cookie || ''
  const out = {}
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim())
  }
  return out
}

function sessionCookie(token, maxAgeMs) {
  const secure = process.env.NODE_ENV !== 'development'
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ]
    .filter(Boolean)
    .join('; ')
}

/** Чистка истёкших сессий — вызываем лениво при каждом создании новой. */
function pruneSessions(db) {
  const now = Date.now()
  db.sessions = db.sessions.filter((s) => Date.parse(s.expiresAt) > now)
}

function createSession(db, accountId, clientId) {
  pruneSessions(db)
  const token = crypto.randomBytes(32).toString('hex')
  db.sessions.push({
    token,
    accountId,
    clientId,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  })
  return token
}

/**
 * Текущая клиентская сессия по cookie. null — не авторизован.
 * Возвращает { session, account, client } одним объектом, потому что почти
 * везде нужны все трое, а искать их по отдельности в каждом роуте — дублирование.
 */
export function getAuth(req) {
  const db = load()
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) return null
  const session = db.sessions.find((s) => s.token === token)
  if (!session || Date.parse(session.expiresAt) < Date.now()) return null
  const account = db.accounts.find((a) => a.id === session.accountId)
  const client = db.clients.find((c) => c.id === session.clientId)
  if (!account || !client) return null
  if (client.status === 'blocked') return { blocked: true, session, account, client }
  client.lastActiveAt = nowIso() // не сохраняем сразу — запишется при ближайшем save()
  return { session, account, client }
}

/** Публичное представление аккаунта — без passHash. */
function publicAccount(a) {
  return { id: a.id, email: a.email, name: a.name, role: a.role, provider: a.provider }
}

function publicClient(c) {
  const plan = getPlan(c.plan)
  const limit = (c.credits?.limit || 0) + (c.credits?.extra || 0)
  const used = Math.max(0, c.credits?.used || 0)
  return {
    id: c.id,
    name: c.name,
    plan: c.plan,
    planLabel: plan?.label || c.plan,
    status: c.status,
    credits: {
      limit,
      used,
      left: Math.max(0, limit - used),
      periodStart: c.credits?.periodStart || null,
    },
  }
}

/* ─────────────────────────── Регистрация клиента ─────────────────────────── */

export function createClientWithAccount(db, { company, email, name, passHash, provider }) {
  const plan = getPlan('free')
  const client = {
    id: uid('cli'),
    name: company,
    email,
    plan: 'free',
    credits: {
      limit: plan.monthlyCredits,
      used: 0,
      extra: 0,
      periodStart: nowIso(),
    },
    status: 'active',
    createdAt: nowIso(),
    lastActiveAt: nowIso(),
  }
  const account = {
    id: uid('acc'),
    clientId: client.id,
    email,
    name: name || company,
    passHash: passHash || null,
    provider: provider || 'password',
    role: 'owner',
    createdAt: nowIso(),
  }
  db.clients.push(client)
  db.accounts.push(account)
  return { client, account }
}

/* ─────────────────────────── Google ─────────────────────────── */

/**
 * Проверка Google ID-token через официальный tokeninfo-эндпоинт.
 * Это сетевой вызов на каждый вход — приемлемо: входы редки, а проверять
 * подпись JWT самостоятельно без библиотек значит вручную тянуть JWKS и
 * реализовывать RS256 — больше кода, больше мест для ошибки.
 */
async function verifyGoogleToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('GOOGLE_NOT_CONFIGURED')
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  )
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok || json.aud !== clientId) throw new Error('GOOGLE_TOKEN_INVALID')
  if (json.email_verified !== 'true' && json.email_verified !== true)
    throw new Error('GOOGLE_EMAIL_UNVERIFIED')
  return { email: normEmail(json.email), name: clean(json.name, 120) || json.email }
}

/* ─────────────────────────── Роутер ─────────────────────────── */

export async function authRouter(req, res, { url, sendJson, readBody }) {
  const db = load()
  const p = url.pathname

  async function body() {
    try {
      return JSON.parse(await readBody(req))
    } catch {
      return null
    }
  }

  function loginOk(account, client) {
    const token = createSession(db, account.id, client.id)
    res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL_MS))
    return { ok: true, account: publicAccount(account), client: publicClient(client) }
  }

  if (p === '/api/auth/register' && req.method === 'POST') {
    const d = (await body()) || {}
    const company = clean(d.company, 140)
    const name = clean(d.name, 120)
    const email = normEmail(d.email)
    const password = typeof d.password === 'string' ? d.password : ''
    if (!company) return sendJson(res, 400, { ok: false, error: 'Укажите название компании' }), true
    if (!EMAIL_RE.test(email))
      return sendJson(res, 400, { ok: false, error: 'Укажите корректный email' }), true
    if (password.length < 8)
      return sendJson(res, 400, { ok: false, error: 'Пароль — минимум 8 символов' }), true
    if (db.accounts.some((a) => a.email === email))
      return sendJson(res, 409, { ok: false, error: 'Этот email уже зарегистрирован' }), true

    const { client, account } = createClientWithAccount(db, {
      company,
      email,
      name,
      passHash: hashPassword(password),
      provider: 'password',
    })
    await save()
    sendJson(res, 200, loginOk(account, client))
    return true
  }

  if (p === '/api/auth/login' && req.method === 'POST') {
    const d = (await body()) || {}
    const email = normEmail(d.email)
    const password = typeof d.password === 'string' ? d.password : ''
    const account = db.accounts.find((a) => a.email === email)
    // Единый текст ошибки: не раскрываем, существует ли email в базе.
    if (!account || !account.passHash || !verifyPassword(password, account.passHash)) {
      sendJson(res, 401, { ok: false, error: 'Неверный email или пароль' })
      return true
    }
    const client = db.clients.find((c) => c.id === account.clientId)
    if (!client) return sendJson(res, 500, { ok: false, error: 'Клиент не найден' }), true
    if (client.status === 'blocked')
      return sendJson(res, 403, { ok: false, error: 'Аккаунт заблокирован. Обратитесь в поддержку.' }), true
    const out = loginOk(account, client)
    await save()
    sendJson(res, 200, out)
    return true
  }

  if (p === '/api/auth/google' && req.method === 'POST') {
    const d = (await body()) || {}
    let g
    try {
      g = await verifyGoogleToken(String(d.credential || ''))
    } catch (e) {
      const msg =
        e.message === 'GOOGLE_NOT_CONFIGURED'
          ? 'Вход через Google не настроен'
          : 'Не удалось подтвердить аккаунт Google'
      sendJson(res, 401, { ok: false, error: msg })
      return true
    }
    let account = db.accounts.find((a) => a.email === g.email)
    let client
    if (account) {
      client = db.clients.find((c) => c.id === account.clientId)
      if (!client) return sendJson(res, 500, { ok: false, error: 'Клиент не найден' }), true
      if (client.status === 'blocked')
        return sendJson(res, 403, { ok: false, error: 'Аккаунт заблокирован. Обратитесь в поддержку.' }), true
    } else {
      // Первый вход через Google = регистрация: компания — из имени,
      // переименовать можно потом в настройках.
      const created = createClientWithAccount(db, {
        company: g.name,
        email: g.email,
        name: g.name,
        provider: 'google',
      })
      account = created.account
      client = created.client
    }
    const out = loginOk(account, client)
    await save()
    sendJson(res, 200, out)
    return true
  }

  if (p === '/api/auth/logout' && req.method === 'POST') {
    const token = parseCookies(req)[COOKIE_NAME]
    if (token) {
      db.sessions = db.sessions.filter((s) => s.token !== token)
      await save()
    }
    res.setHeader('Set-Cookie', sessionCookie('', 0))
    sendJson(res, 200, { ok: true })
    return true
  }

  if (p === '/api/auth/me' && req.method === 'GET') {
    const auth = getAuth(req)
    // googleClientId отдаём и неавторизованным: он нужен на экране входа.
    const config = { googleClientId: process.env.GOOGLE_CLIENT_ID || '' }
    if (!auth || auth.blocked) {
      sendJson(res, 401, { ok: false, error: auth?.blocked ? 'Аккаунт заблокирован' : 'Не авторизован', config })
      return true
    }
    sendJson(res, 200, {
      ok: true,
      account: publicAccount(auth.account),
      client: publicClient(auth.client),
      config,
    })
    return true
  }

  return false
}

export { publicClient, publicAccount, COOKIE_NAME, parseCookies }
