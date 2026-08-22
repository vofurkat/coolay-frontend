/**
 * Супер-админка платформы Coolay (/sadmin).
 *
 * Отдельный контур авторизации: свои пользователи (sadminUsers), свои сессии
 * (sadminSessions) и своя cookie — компрометация клиентской сессии не даёт
 * доступа к админке, и наоборот. Каждое изменяющее действие пишется в журнал
 * sadminLog: кто, что, когда — иначе спустя месяц невозможно понять, почему
 * у клиента изменился тариф.
 *
 * Эндпоинты (все под /api/sadmin/, кроме login всё требует admin-сессию):
 *   POST   /api/sadmin/auth/login        — вход супер-админа
 *   POST   /api/sadmin/auth/logout
 *   GET    /api/sadmin/auth/me
 *   GET    /api/sadmin/stats             — сводка для дашборда
 *   GET    /api/sadmin/clients           — список клиентов (?q=)
 *   GET    /api/sadmin/clients/:id       — карточка клиента
 *   PATCH  /api/sadmin/clients/:id       — тариф / блокировка / имя
 *   POST   /api/sadmin/clients/:id/credits — начислить/списать кредиты
 *   GET    /api/sadmin/usage             — журнал списаний (?clientId=&limit=)
 *   GET    /api/sadmin/plans             — тарифы
 *   POST   /api/sadmin/plans             — создать тариф
 *   PATCH  /api/sadmin/plans/:key        — изменить тариф
 *   DELETE /api/sadmin/plans/:key        — удалить тариф
 *   GET    /api/sadmin/templates         — системные шаблоны
 *   POST   /api/sadmin/templates         — создать системный шаблон
 *   PATCH  /api/sadmin/templates/:id     — изменить
 *   DELETE /api/sadmin/templates/:id     — удалить
 *   GET    /api/sadmin/admins            — админы панели
 *   POST   /api/sadmin/admins            — создать админа
 *   PATCH  /api/sadmin/admins/:id        — сменить имя/пароль
 *   DELETE /api/sadmin/admins/:id        — удалить (кроме себя и последнего)
 *   GET    /api/sadmin/log               — журнал действий админов
 */
import crypto from 'node:crypto'
import { load, save, uid, nowIso, removeUploadByUrl } from './store.js'
import { hashPassword, verifyPassword, parseCookies } from './auth.js'
import { listPlans, clientUsage, getPlan } from './plans.js'
import { normRefs, normCategory, publicTemplate, buildTree } from './templates.js'

const ADMIN_COOKIE = 'coolay_admin_sid'
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000 // 12 часов: у админки короче жизнь сессии

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function adminCookie(token, maxAgeMs) {
  const secure = process.env.NODE_ENV !== 'development'
  return [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ]
    .filter(Boolean)
    .join('; ')
}

/**
 * Текущий супер-админ платформы по cookie, либо null.
 * Экспортируется, потому что платформенными операциями занимается не только
 * /api/sadmin/: подключение Telegram-бота (webhook, кнопка меню) — тоже
 * настройка всей платформы, и повторять проверку сессии во втором месте
 * означало бы рано или поздно разойтись с этой в правилах.
 */
export function getAdmin(req, db = load()) {
  const token = parseCookies(req)[ADMIN_COOKIE]
  if (!token) return null
  const session = db.sadminSessions.find((s) => s.token === token)
  if (!session || Date.parse(session.expiresAt) < Date.now()) return null
  const admin = db.sadminUsers.find((a) => a.id === session.adminId)
  if (!admin || admin.status === 'blocked') return null
  return admin
}

function logAction(db, admin, action, target, details) {
  db.sadminLog.unshift({
    id: uid('alog'),
    adminId: admin.id,
    adminLogin: admin.login,
    action,
    target: target || null,
    details: details || null,
    at: nowIso(),
  })
  if (db.sadminLog.length > 10000) db.sadminLog.length = 10000
}

function publicAdmin(a) {
  return { id: a.id, login: a.login, name: a.name, createdAt: a.createdAt, lastLoginAt: a.lastLoginAt || null }
}

/** Список клиентов с агрегатами — общий и для списка, и для карточки. */
function clientRow(db, c) {
  const u = clientUsage(c)
  return {
    id: c.id,
    name: c.name,
    email: c.email || null,
    plan: c.plan,
    planLabel: u.planLabel,
    status: c.status,
    credits: { limit: u.limit, used: u.used, left: u.left, extra: c.credits?.extra || 0, periodStart: u.periodStart },
    accounts: db.accounts.filter((a) => a.clientId === c.id).length,
    employees: db.employees.filter((e) => e.clientId === c.id).length,
    projects: db.projects.filter((p) => p.clientId === c.id).length,
    templates: db.templates.filter((t) => t.clientId === c.id && !t.isSystem).length,
    createdAt: c.createdAt,
    lastActiveAt: c.lastActiveAt || null,
  }
}

export async function sadminRouter(req, res, { url, sendJson, readBody }) {
  const p = url.pathname
  if (!p.startsWith('/api/sadmin/')) return false

  const db = load()

  async function body() {
    try {
      return JSON.parse(await readBody(req))
    } catch {
      return null
    }
  }

  /* ── Вход/выход — доступны без сессии ── */
  if (p === '/api/sadmin/auth/login' && req.method === 'POST') {
    const d = (await body()) || {}
    const login = clean(d.login, 80).toLowerCase()
    const password = typeof d.password === 'string' ? d.password : ''
    const admin = db.sadminUsers.find((a) => a.login === login)
    if (!admin || !verifyPassword(password, admin.passHash)) {
      sendJson(res, 401, { ok: false, error: 'Неверный логин или пароль' })
      return true
    }
    // Чистим истёкшие admin-сессии лениво, как и клиентские.
    const now = Date.now()
    db.sadminSessions = db.sadminSessions.filter((s) => Date.parse(s.expiresAt) > now)
    const token = crypto.randomBytes(32).toString('hex')
    db.sadminSessions.push({
      token,
      adminId: admin.id,
      createdAt: nowIso(),
      expiresAt: new Date(now + ADMIN_TTL_MS).toISOString(),
    })
    admin.lastLoginAt = nowIso()
    logAction(db, admin, 'login', null, null)
    await save()
    res.setHeader('Set-Cookie', adminCookie(token, ADMIN_TTL_MS))
    sendJson(res, 200, { ok: true, admin: publicAdmin(admin) })
    return true
  }

  if (p === '/api/sadmin/auth/logout' && req.method === 'POST') {
    const token = parseCookies(req)[ADMIN_COOKIE]
    if (token) {
      db.sadminSessions = db.sadminSessions.filter((s) => s.token !== token)
      await save()
    }
    res.setHeader('Set-Cookie', adminCookie('', 0))
    sendJson(res, 200, { ok: true })
    return true
  }

  /* ── Всё остальное — только с admin-сессией ── */
  const admin = getAdmin(req, db)
  if (p === '/api/sadmin/auth/me' && req.method === 'GET') {
    if (!admin) return sendJson(res, 401, { ok: false, error: 'Не авторизован' }), true
    sendJson(res, 200, { ok: true, admin: publicAdmin(admin) })
    return true
  }
  if (!admin) {
    sendJson(res, 401, { ok: false, error: 'Требуется вход супер-админа' })
    return true
  }

  /* ── Дашборд ── */
  if (p === '/api/sadmin/stats' && req.method === 'GET') {
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const creditsUsed30d = db.usageLog
      .filter((u) => Date.parse(u.at) > monthAgo)
      .reduce((s, u) => s + (u.credits || 0), 0)
    const byPlan = {}
    for (const c of db.clients) byPlan[c.plan] = (byPlan[c.plan] || 0) + 1
    sendJson(res, 200, {
      ok: true,
      stats: {
        clients: db.clients.length,
        clientsActive: db.clients.filter((c) => c.status === 'active').length,
        clientsBlocked: db.clients.filter((c) => c.status === 'blocked').length,
        clientsNew7d: db.clients.filter((c) => Date.parse(c.createdAt) > weekAgo).length,
        accounts: db.accounts.length,
        byPlan,
        creditsUsed30d,
        generations30d: db.usageLog.filter((u) => Date.parse(u.at) > monthAgo).length,
        systemTemplates: db.templates.filter((t) => t.isSystem).length,
        admins: db.sadminUsers.length,
      },
      recentClients: [...db.clients]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 6)
        .map((c) => clientRow(db, c)),
      recentUsage: db.usageLog.slice(0, 10),
    })
    return true
  }

  /* ── Клиенты ── */
  if (p === '/api/sadmin/clients' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase()
    let list = db.clients
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          db.accounts.some((a) => a.clientId === c.id && a.email.toLowerCase().includes(q)),
      )
    }
    list = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    sendJson(res, 200, { ok: true, clients: list.map((c) => clientRow(db, c)) })
    return true
  }

  const mClient = /^\/api\/sadmin\/clients\/([A-Za-z0-9_]+)$/.exec(p)
  if (mClient) {
    const client = db.clients.find((c) => c.id === mClient[1])
    if (!client) return sendJson(res, 404, { ok: false, error: 'Клиент не найден' }), true

    if (req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        client: clientRow(db, client),
        accounts: db.accounts
          .filter((a) => a.clientId === client.id)
          .map((a) => ({ id: a.id, email: a.email, name: a.name, role: a.role, provider: a.provider, createdAt: a.createdAt })),
        usage: db.usageLog.filter((u) => u.clientId === client.id).slice(0, 50),
        plans: listPlans(),
      })
      return true
    }

    if (req.method === 'PATCH') {
      const d = (await body()) || {}
      const changes = []
      if (d.plan !== undefined) {
        const plan = listPlans().find((x) => x.key === d.plan)
        if (!plan) return sendJson(res, 400, { ok: false, error: 'Неизвестный тариф' }), true
        if (plan.key !== client.plan) {
          changes.push(`тариф ${client.plan} → ${plan.key}`)
          client.plan = plan.key
          // Новый тариф = новый месячный пакет; extra-кредиты сохраняются.
          client.credits.limit = plan.monthlyCredits
          client.credits.used = 0
          client.credits.periodStart = nowIso()
        }
      }
      if (d.status !== undefined && ['active', 'blocked'].includes(d.status) && d.status !== client.status) {
        changes.push(d.status === 'blocked' ? 'блокировка' : 'разблокировка')
        client.status = d.status
        // При блокировке гасим все живые сессии клиента — иначе он работает
        // до истечения cookie, и «блокировка» ничего не блокирует.
        if (d.status === 'blocked') {
          const accIds = new Set(db.accounts.filter((a) => a.clientId === client.id).map((a) => a.id))
          db.sessions = db.sessions.filter((s) => !accIds.has(s.accountId))
        }
      }
      if (d.name !== undefined) {
        const n = clean(d.name, 140)
        if (n && n !== client.name) {
          changes.push(`имя «${client.name}» → «${n}»`)
          client.name = n
        }
      }
      if (changes.length) {
        logAction(db, admin, 'client.update', client.id, changes.join('; '))
        await save()
      }
      sendJson(res, 200, { ok: true, client: clientRow(db, client) })
      return true
    }
  }

  const mCredits = /^\/api\/sadmin\/clients\/([A-Za-z0-9_]+)\/credits$/.exec(p)
  if (mCredits && req.method === 'POST') {
    const client = db.clients.find((c) => c.id === mCredits[1])
    if (!client) return sendJson(res, 404, { ok: false, error: 'Клиент не найден' }), true
    const d = (await body()) || {}
    const amount = Math.trunc(Number(d.amount))
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1000000) {
      sendJson(res, 400, { ok: false, error: 'Укажите количество кредитов (положительное или отрицательное)' })
      return true
    }
    client.credits.extra = Math.max(0, (client.credits.extra || 0) + amount)
    logAction(db, admin, 'client.credits', client.id, `${amount > 0 ? '+' : ''}${amount} кредитов${d.comment ? ` — ${clean(d.comment, 200)}` : ''}`)
    await save()
    sendJson(res, 200, { ok: true, client: clientRow(db, client) })
    return true
  }

  /* ── Журнал списаний ── */
  if (p === '/api/sadmin/usage' && req.method === 'GET') {
    const clientId = url.searchParams.get('clientId') || ''
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100))
    let list = db.usageLog
    if (clientId) list = list.filter((u) => u.clientId === clientId)
    const names = new Map(db.clients.map((c) => [c.id, c.name]))
    sendJson(res, 200, {
      ok: true,
      usage: list.slice(0, limit).map((u) => ({ ...u, clientName: names.get(u.clientId) || u.clientId })),
      total: list.length,
    })
    return true
  }

  /* ── Тарифы ── */
  if (p === '/api/sadmin/plans' && req.method === 'GET') {
    const counts = {}
    for (const c of db.clients) counts[c.plan] = (counts[c.plan] || 0) + 1
    sendJson(res, 200, { ok: true, plans: listPlans().map((x) => ({ ...x, clients: counts[x.key] || 0 })) })
    return true
  }

  if (p === '/api/sadmin/plans' && req.method === 'POST') {
    const d = (await body()) || {}
    const key = clean(d.key, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '')
    const label = clean(d.label, 60)
    const monthlyCredits = Math.max(0, Math.trunc(Number(d.monthlyCredits) || 0))
    const price = Math.max(0, Number(d.price) || 0)
    if (!key || !label) return sendJson(res, 400, { ok: false, error: 'Укажите ключ и название тарифа' }), true
    listPlans() // гарантирует seed
    if (db.plans.some((x) => x.key === key))
      return sendJson(res, 409, { ok: false, error: 'Тариф с таким ключом уже есть' }), true
    const plan = {
      key,
      label,
      monthlyCredits,
      price,
      currency: clean(d.currency, 8) || 'USD',
      description: clean(d.description, 300),
      updatedAt: nowIso(),
    }
    db.plans.push(plan)
    logAction(db, admin, 'plan.create', key, `${label}: ${monthlyCredits} кр., $${price}`)
    await save()
    sendJson(res, 200, { ok: true, plan })
    return true
  }

  const mPlan = /^\/api\/sadmin\/plans\/([a-z0-9_-]+)$/.exec(p)
  if (mPlan) {
    listPlans()
    const plan = db.plans.find((x) => x.key === mPlan[1])
    if (!plan) return sendJson(res, 404, { ok: false, error: 'Тариф не найден' }), true

    if (req.method === 'PATCH') {
      const d = (await body()) || {}
      const changes = []
      if (d.label !== undefined) {
        const v = clean(d.label, 60)
        if (v) { changes.push(`название → ${v}`); plan.label = v }
      }
      if (d.monthlyCredits !== undefined) {
        const v = Math.max(0, Math.trunc(Number(d.monthlyCredits) || 0))
        changes.push(`кредиты → ${v}`); plan.monthlyCredits = v
      }
      if (d.price !== undefined) {
        const v = Math.max(0, Number(d.price) || 0)
        changes.push(`цена → ${v}`); plan.price = v
      }
      if (d.currency !== undefined) plan.currency = clean(d.currency, 8) || plan.currency
      if (d.description !== undefined) plan.description = clean(d.description, 300)
      plan.updatedAt = nowIso()
      if (changes.length) logAction(db, admin, 'plan.update', plan.key, changes.join('; '))
      await save()
      sendJson(res, 200, { ok: true, plan })
      return true
    }

    if (req.method === 'DELETE') {
      if (db.clients.some((c) => c.plan === plan.key))
        return sendJson(res, 409, { ok: false, error: 'На этом тарифе есть клиенты — сначала переведите их' }), true
      if (db.plans.length <= 1)
        return sendJson(res, 409, { ok: false, error: 'Нельзя удалить последний тариф' }), true
      db.plans = db.plans.filter((x) => x.key !== plan.key)
      logAction(db, admin, 'plan.delete', plan.key, null)
      await save()
      sendJson(res, 200, { ok: true })
      return true
    }
  }

  /* ── Системные шаблоны (видны всем клиентам, read-only для них) ── */
  const systemTemplates = () => db.templates.filter((t) => t.isSystem)

  if (p === '/api/sadmin/templates' && req.method === 'GET') {
    const list = [...systemTemplates()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    sendJson(res, 200, {
      ok: true,
      templates: list.map(publicTemplate),
      categories: buildTree(list),
    })
    return true
  }

  if (p === '/api/sadmin/templates' && req.method === 'POST') {
    const d = (await body()) || {}
    const name = clean(d.name, 120)
    const category = normCategory(d.category)
    if (!name) return sendJson(res, 400, { ok: false, error: 'Укажите название шаблона' }), true
    if (!category.length) return sendJson(res, 400, { ok: false, error: 'Укажите категорию' }), true
    let references
    try {
      references = await normRefs(d.references, [])
    } catch (e) {
      sendJson(res, 400, { ok: false, error: `Фото референса: ${e.message}` })
      return true
    }
    if (!references.length)
      return sendJson(res, 400, { ok: false, error: 'Добавьте хотя бы один референс' }), true
    const tpl = {
      id: uid('tpl'),
      clientId: null,
      isSystem: true,
      name,
      category,
      description: clean(d.description, 600),
      references,
      slotHints: d.slotHints && typeof d.slotHints === 'object' ? d.slotHints : {},
      usageCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: admin.login,
    }
    db.templates.push(tpl)
    logAction(db, admin, 'template.create', tpl.id, name)
    await save()
    sendJson(res, 200, { ok: true, template: publicTemplate(tpl) })
    return true
  }

  const mTpl = /^\/api\/sadmin\/templates\/([A-Za-z0-9_]+)$/.exec(p)
  if (mTpl) {
    const tpl = db.templates.find((t) => t.id === mTpl[1] && t.isSystem)
    if (!tpl) return sendJson(res, 404, { ok: false, error: 'Системный шаблон не найден' }), true

    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, template: publicTemplate(tpl) })
      return true
    }

    if (req.method === 'PATCH') {
      const d = (await body()) || {}
      if (d.name !== undefined) {
        const n = clean(d.name, 120)
        if (!n) return sendJson(res, 400, { ok: false, error: 'Название не может быть пустым' }), true
        tpl.name = n
      }
      if (d.category !== undefined) {
        const c = normCategory(d.category)
        if (!c.length) return sendJson(res, 400, { ok: false, error: 'Категория не может быть пустой' }), true
        tpl.category = c
      }
      if (d.description !== undefined) tpl.description = clean(d.description, 600)
      if (d.references !== undefined) {
        let refs
        try {
          refs = await normRefs(d.references, tpl.references)
        } catch (e) {
          sendJson(res, 400, { ok: false, error: `Фото референса: ${e.message}` })
          return true
        }
        if (!refs.length) return sendJson(res, 400, { ok: false, error: 'Нужен хотя бы один референс' }), true
        const keep = new Set(refs.map((r) => r.image))
        const usedElsewhere = new Set(
          db.templates.filter((t) => t.id !== tpl.id).flatMap((t) => t.references.map((r) => r.image)),
        )
        for (const old of tpl.references) {
          if (old.image && !keep.has(old.image) && !usedElsewhere.has(old.image)) await removeUploadByUrl(old.image)
        }
        tpl.references = refs
      }
      if (d.slotHints !== undefined && typeof d.slotHints === 'object') tpl.slotHints = d.slotHints
      tpl.updatedAt = nowIso()
      logAction(db, admin, 'template.update', tpl.id, tpl.name)
      await save()
      sendJson(res, 200, { ok: true, template: publicTemplate(tpl) })
      return true
    }

    if (req.method === 'DELETE') {
      db.templates = db.templates.filter((t) => t.id !== tpl.id)
      const stillUsed = new Set(db.templates.flatMap((t) => t.references.map((r) => r.image)))
      for (const r of tpl.references) {
        if (r.image && !stillUsed.has(r.image)) await removeUploadByUrl(r.image)
      }
      logAction(db, admin, 'template.delete', tpl.id, tpl.name)
      await save()
      sendJson(res, 200, { ok: true })
      return true
    }
  }

  /* ── Админы панели ── */
  if (p === '/api/sadmin/admins' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, admins: db.sadminUsers.map(publicAdmin), meId: admin.id })
    return true
  }

  if (p === '/api/sadmin/admins' && req.method === 'POST') {
    const d = (await body()) || {}
    const login = clean(d.login, 80).toLowerCase()
    const name = clean(d.name, 120)
    const password = typeof d.password === 'string' ? d.password : ''
    if (!/^[a-z0-9._@-]{3,}$/.test(login))
      return sendJson(res, 400, { ok: false, error: 'Логин: минимум 3 символа (латиница, цифры, . _ @ -)' }), true
    if (password.length < 8)
      return sendJson(res, 400, { ok: false, error: 'Пароль — минимум 8 символов' }), true
    if (db.sadminUsers.some((a) => a.login === login))
      return sendJson(res, 409, { ok: false, error: 'Такой логин уже есть' }), true
    const created = {
      id: uid('adm'),
      login,
      name: name || login,
      passHash: hashPassword(password),
      createdAt: nowIso(),
    }
    db.sadminUsers.push(created)
    logAction(db, admin, 'admin.create', created.id, login)
    await save()
    sendJson(res, 200, { ok: true, admin: publicAdmin(created) })
    return true
  }

  const mAdm = /^\/api\/sadmin\/admins\/([A-Za-z0-9_]+)$/.exec(p)
  if (mAdm) {
    const target = db.sadminUsers.find((a) => a.id === mAdm[1])
    if (!target) return sendJson(res, 404, { ok: false, error: 'Админ не найден' }), true

    if (req.method === 'PATCH') {
      const d = (await body()) || {}
      if (d.name !== undefined) {
        const n = clean(d.name, 120)
        if (n) target.name = n
      }
      if (d.password !== undefined) {
        const pw = typeof d.password === 'string' ? d.password : ''
        if (pw.length < 8) return sendJson(res, 400, { ok: false, error: 'Пароль — минимум 8 символов' }), true
        target.passHash = hashPassword(pw)
        // Смена пароля сбрасывает чужие сессии этого админа.
        db.sadminSessions = db.sadminSessions.filter(
          (s) => s.adminId !== target.id || s.token === parseCookies(req)[ADMIN_COOKIE],
        )
        logAction(db, admin, 'admin.password', target.id, target.login)
      }
      await save()
      sendJson(res, 200, { ok: true, admin: publicAdmin(target) })
      return true
    }

    if (req.method === 'DELETE') {
      if (target.id === admin.id)
        return sendJson(res, 400, { ok: false, error: 'Нельзя удалить самого себя' }), true
      if (db.sadminUsers.length <= 1)
        return sendJson(res, 400, { ok: false, error: 'Нельзя удалить последнего админа' }), true
      db.sadminUsers = db.sadminUsers.filter((a) => a.id !== target.id)
      db.sadminSessions = db.sadminSessions.filter((s) => s.adminId !== target.id)
      logAction(db, admin, 'admin.delete', target.id, target.login)
      await save()
      sendJson(res, 200, { ok: true })
      return true
    }
  }

  /* ── Журнал действий админов ── */
  if (p === '/api/sadmin/log' && req.method === 'GET') {
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100))
    sendJson(res, 200, { ok: true, log: db.sadminLog.slice(0, limit), total: db.sadminLog.length })
    return true
  }

  return false
}

/**
 * Первичный супер-админ. Вызывается при старте сервера: если админов нет,
 * создаёт одного с логином/паролем из env (SADMIN_LOGIN / SADMIN_PASSWORD)
 * или заводскими значениями. Идempotентно — при повторных стартах молчит.
 */
export async function ensureFirstAdmin() {
  const db = load()
  if (db.sadminUsers.length) return null
  const login = (process.env.SADMIN_LOGIN || 'sadmin').toLowerCase()
  const password = process.env.SADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url')
  db.sadminUsers.push({
    id: uid('adm'),
    login,
    name: 'Super Admin',
    passHash: hashPassword(password),
    createdAt: nowIso(),
  })
  await save()
  console.log(`[sadmin] создан первый супер-админ: ${login} / ${password}`)
  return { login, password }
}
