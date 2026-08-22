/**
 * Команда, совместные проекты и квота плана.
 *
 * Роли и права. Роль хранится на связи «проект ↔ сотрудник» (shares), а не только
 * на самом сотруднике: один и тот же человек может быть редактором в одном
 * проекте и наблюдателем в другом. Глобальная роль (admin/owner) даёт доступ ко
 * всему и служит запасным вариантом.
 *
 * Уровни доступа к проекту:
 *   viewer  — только смотреть
 *   editor  — смотреть и продолжать работу (менять карточки, генерировать)
 *   owner   — плюс управлять доступами и удалять проект
 *
 * Эндпоинты:
 *   GET/POST/PATCH/DELETE /api/team/employees        — сотрудники (в т.ч. для бота)
 *   GET    /api/team/projects?userId=                — проекты: свои и общие
 *   POST   /api/team/projects                        — создать проект
 *   PATCH  /api/team/projects/:id                    — переименовать / статус
 *   POST   /api/team/projects/:id/share              — выдать доступ
 *   DELETE /api/team/projects/:id/share/:employeeId  — отозвать доступ
 *   POST   /api/team/projects/:id/claim              — «взять в работу» (для совместной работы)
   *   GET    /api/team/usage                           — план и остаток генераций
   *   GET    /api/team/usage/log                       — журнал списаний текущего клиента
   *   POST   /api/team/usage/consume                   — списать генерации
   */
import { load, save, uid, nowIso } from './store.js'
import { clientUsage, consumeCredits, getPlan, listPlans } from './plans.js'

const ROLES = new Set(['viewer', 'editor', 'owner'])
const STATUSES = new Set(['active', 'blocked', 'invited'])
/**
 * PLANS оставлен для обратной совместимости импортов; источник истины
 * теперь plans.js — тарифы управляются из супер-админки и живут в базе.
 */
const PLANS = Object.fromEntries(
  listPlans().map((p) => [p.key, { label: p.label, limit: p.monthlyCredits }]),
)

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/**
 * Нормализация телефона к виду +99890xxxxxxx.
 * Telegram в contact отдаёт номер без «+» и иногда с пробелами/дефисами, а
 * администратор вводит его как угодно. Без единого формата сверка с базой при
 * входе в бот не срабатывала бы.
 */
export function normPhone(raw) {
  const digits = String(raw || '').replace(/\D+/g, '')
  if (!digits) return ''
  return '+' + digits
}

function publicEmployee(e) {
  return {
    id: e.id,
    fullName: e.fullName,
    phone: e.phone,
    email: e.email || '',
    role: e.role,
    status: e.status,
    canGenerate: e.canGenerate !== false,
    telegramId: e.telegramId || null,
    telegramUsername: e.telegramUsername || '',
    botVerifiedAt: e.botVerifiedAt || null,
    lastActive: e.lastActive || null,
    createdAt: e.createdAt,
  }
}

/** Права сотрудника на проект: явный share, владение или глобальная роль. */
export function accessFor(db, projectId, employeeId) {
  const project = db.projects.find((p) => p.id === projectId)
  if (!project) return null
  if (project.ownerId === employeeId) return 'owner'
  const emp = db.employees.find((e) => e.id === employeeId)
  if (emp && (emp.role === 'owner' || emp.role === 'admin')) return 'owner'
  const share = db.shares.find((s) => s.projectId === projectId && s.employeeId === employeeId)
  return share ? share.role : null
}

function logActivity(db, entry) {
  db.activity.unshift({ id: uid('act'), at: nowIso(), ...entry })
  // История нужна для панели «кто что делал», но неограниченный рост файла
  // недопустим — держим последние 500 записей.
  if (db.activity.length > 500) db.activity.length = 500
}

function publicProject(db, p, viewerId) {
  const shares = db.shares
    .filter((s) => s.projectId === p.id)
    .map((s) => {
      const e = db.employees.find((x) => x.id === s.employeeId)
      return {
        employeeId: s.employeeId,
        name: e?.fullName || 'Удалённый сотрудник',
        role: s.role,
        addedAt: s.addedAt,
      }
    })
  const owner = db.employees.find((e) => e.id === p.ownerId)
  return {
    id: p.id,
    name: p.name,
    description: p.description || '',
    status: p.status,
    cardIds: p.cardIds || [],
    cover: p.cover || '',
    ownerId: p.ownerId,
    ownerName: owner?.fullName || p.ownerName || 'Coolay',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    lockedBy: p.lockedBy || null,
    lockedByName: p.lockedBy
      ? db.employees.find((e) => e.id === p.lockedBy)?.fullName || 'Сотрудник'
      : null,
    lockedAt: p.lockedAt || null,
    shares,
    myAccess: viewerId ? accessFor(db, p.id, viewerId) : null,
    activity: db.activity.filter((a) => a.projectId === p.id).slice(0, 12),
  }
}

/**
 * Квота теперь на клиенте, а не глобальная. Вторым аргументом можно
 * передать клиента; без него берётся demo-клиент — единственный сценарий
 * без явного клиента (старый Telegram-бот, привязанный к demo-стенду).
 */
function usageState(db, client) {
  const c = client || db.clients.find((x) => x.id === 'cli_demo') || db.clients[0]
  if (!c) {
    const plan = getPlan('free')
    return {
      plan: plan.key,
      planLabel: plan.label,
      limit: plan.monthlyCredits,
      used: 0,
      left: plan.monthlyCredits,
      percent: 0,
      periodStart: null,
      plans: listPlans().map((p) => ({ key: p.key, label: p.label, limit: p.monthlyCredits })),
    }
  }
  return clientUsage(c)
}

export async function teamRouter(req, res, { url, sendJson, readBody, auth }) {
  const db = load()
  const p = url.pathname

  // Все данные команды принадлежат конкретному клиенту — без входа сюда нельзя.
  if (!auth) {
    sendJson(res, 401, { ok: false, error: 'Требуется вход' })
    return true
  }
  const cid = auth.client.id
  const isMine = (item) => item.clientId === cid

  async function body() {
    try {
      return JSON.parse(await readBody(req))
    } catch {
      return null
    }
  }

  /* ───────────────── Сотрудники ───────────────── */

  if (p === '/api/team/employees' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, employees: db.employees.filter(isMine).map(publicEmployee) })
    return true
  }

  if (p === '/api/team/employees' && req.method === 'POST') {
    const d = await body()
    if (!d) {
      sendJson(res, 400, { ok: false, error: 'Некорректный JSON' })
      return true
    }
    const fullName = clean(d.fullName || d.name, 120)
    const phone = normPhone(d.phone)
    if (!fullName) {
      sendJson(res, 400, { ok: false, error: 'Укажите ФИО сотрудника' })
      return true
    }
    // Телефон обязателен: именно по нему бот пускает сотрудника внутрь.
    if (phone.length < 9) {
      sendJson(res, 400, { ok: false, error: 'Укажите корректный номер телефона' })
      return true
    }
    if (db.employees.some((e) => e.clientId === cid && e.phone === phone)) {
      sendJson(res, 409, { ok: false, error: 'Сотрудник с таким телефоном уже есть' })
      return true
    }
    const emp = {
      id: uid('emp'),
      clientId: cid,
      fullName,
      phone,
      email: clean(d.email, 160),
      role: ROLES.has(d.role) || d.role === 'admin' ? d.role : 'editor',
      status: STATUSES.has(d.status) ? d.status : 'active',
      canGenerate: d.canGenerate !== false,
      telegramId: null,
      telegramUsername: '',
      createdAt: nowIso(),
    }
    db.employees.push(emp)
    logActivity(db, { clientId: cid, type: 'employee_added', employeeId: emp.id, text: `Добавлен сотрудник ${fullName}` })
    await save()
    sendJson(res, 200, { ok: true, employee: publicEmployee(emp) })
    return true
  }

  const mEmp = /^\/api\/team\/employees\/([A-Za-z0-9_]+)$/.exec(p)
  if (mEmp) {
    const emp = db.employees.find((e) => e.id === mEmp[1] && isMine(e))
    if (!emp) {
      sendJson(res, 404, { ok: false, error: 'Сотрудник не найден' })
      return true
    }
    if (req.method === 'PATCH') {
      const d = await body()
      if (!d) {
        sendJson(res, 400, { ok: false, error: 'Некорректный JSON' })
        return true
      }
      if (d.fullName !== undefined) {
        const n = clean(d.fullName, 120)
        if (n) emp.fullName = n
      }
      if (d.phone !== undefined) {
        const ph = normPhone(d.phone)
        if (ph.length >= 9) {
          if (db.employees.some((e) => e.clientId === cid && e.phone === ph && e.id !== emp.id)) {
            sendJson(res, 409, { ok: false, error: 'Такой телефон уже занят' })
            return true
          }
          // Смена телефона сбрасывает привязку Telegram: иначе доступ остался бы
          // у прежнего аккаунта, который к новому номеру не относится.
          if (ph !== emp.phone) {
            emp.telegramId = null
            emp.telegramUsername = ''
            emp.botVerifiedAt = null
          }
          emp.phone = ph
        }
      }
      if (d.email !== undefined) emp.email = clean(d.email, 160)
      if (d.role !== undefined && (ROLES.has(d.role) || d.role === 'admin')) emp.role = d.role
      if (d.status !== undefined && STATUSES.has(d.status)) emp.status = d.status
      if (d.canGenerate !== undefined) emp.canGenerate = !!d.canGenerate
      await save()
      sendJson(res, 200, { ok: true, employee: publicEmployee(emp) })
      return true
    }
    if (req.method === 'DELETE') {
      db.employees = db.employees.filter((e) => e.id !== emp.id)
      // Осиротевшие доступы обязательно убираем, иначе они всплывут при
      // совпадении id у нового сотрудника.
      db.shares = db.shares.filter((s) => s.employeeId !== emp.id)
      await save()
      sendJson(res, 200, { ok: true })
      return true
    }
  }

  /* ───────────────── Проекты ───────────────── */

  if (p === '/api/team/projects' && req.method === 'GET') {
    const userId = url.searchParams.get('userId') || ''
    const scope = url.searchParams.get('scope') || 'all'
    let list = db.projects.filter(isMine)
    if (scope === 'mine') list = list.filter((x) => x.ownerId === userId)
    if (scope === 'shared') {
      // «Общие со мной» — только те, где я не владелец, но доступ выдан явно.
      const ids = new Set(
        db.shares.filter((s) => s.employeeId === userId).map((s) => s.projectId),
      )
      list = list.filter((x) => ids.has(x.id) && x.ownerId !== userId)
    }
    list = [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    sendJson(res, 200, { ok: true, projects: list.map((x) => publicProject(db, x, userId)) })
    return true
  }

  if (p === '/api/team/projects' && req.method === 'POST') {
    const d = await body()
    if (!d) {
      sendJson(res, 400, { ok: false, error: 'Некорректный JSON' })
      return true
    }
    const name = clean(d.name, 140)
    if (!name) {
      sendJson(res, 400, { ok: false, error: 'Укажите название проекта' })
      return true
    }
    const proj = {
      id: uid('prj'),
      clientId: cid,
      name,
      description: clean(d.description, 600),
      status: 'active',
      ownerId: clean(d.ownerId, 40) || 'u1',
      ownerName: clean(d.ownerName, 120),
      cardIds: Array.isArray(d.cardIds) ? d.cardIds.slice(0, 500) : [],
      cover: clean(d.cover, 400),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    db.projects.push(proj)
    logActivity(db, {
      clientId: cid,
      type: 'project_created',
      projectId: proj.id,
      employeeId: proj.ownerId,
      text: `Проект «${name}» создан`,
    })
    await save()
    sendJson(res, 200, { ok: true, project: publicProject(db, proj, proj.ownerId) })
    return true
  }

  const mPrj = /^\/api\/team\/projects\/([A-Za-z0-9_]+)$/.exec(p)
  if (mPrj) {
    const proj = db.projects.find((x) => x.id === mPrj[1] && isMine(x))
    if (!proj) {
      sendJson(res, 404, { ok: false, error: 'Проект не найден' })
      return true
    }
    if (req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        project: publicProject(db, proj, url.searchParams.get('userId') || ''),
      })
      return true
    }
    if (req.method === 'PATCH') {
      const d = await body()
      if (!d) {
        sendJson(res, 400, { ok: false, error: 'Некорректный JSON' })
        return true
      }
      const actor = clean(d.actorId, 40)
      const access = actor ? accessFor(db, proj.id, actor) : 'owner'
      if (access !== 'editor' && access !== 'owner') {
        sendJson(res, 403, { ok: false, error: 'Недостаточно прав для изменения проекта' })
        return true
      }
      if (d.name !== undefined) {
        const n = clean(d.name, 140)
        if (n) proj.name = n
      }
      if (d.description !== undefined) proj.description = clean(d.description, 600)
      if (d.status !== undefined) proj.status = clean(d.status, 30) || proj.status
      if (Array.isArray(d.cardIds)) proj.cardIds = d.cardIds.slice(0, 500)
      if (d.cover !== undefined) proj.cover = clean(d.cover, 400)
      proj.updatedAt = nowIso()
      logActivity(db, {
        clientId: cid,
        type: 'project_updated',
        projectId: proj.id,
        employeeId: actor || null,
        text: `Проект обновлён`,
      })
      await save()
      sendJson(res, 200, { ok: true, project: publicProject(db, proj, actor) })
      return true
    }
    if (req.method === 'DELETE') {
      const actor = url.searchParams.get('actorId') || ''
      const access = actor ? accessFor(db, proj.id, actor) : 'owner'
      if (access !== 'owner') {
        sendJson(res, 403, { ok: false, error: 'Удалять проект может только владелец' })
        return true
      }
      db.projects = db.projects.filter((x) => x.id !== proj.id)
      db.shares = db.shares.filter((s) => s.projectId !== proj.id)
      await save()
      sendJson(res, 200, { ok: true })
      return true
    }
  }

  const mShare = /^\/api\/team\/projects\/([A-Za-z0-9_]+)\/share$/.exec(p)
  if (mShare && req.method === 'POST') {
    const proj = db.projects.find((x) => x.id === mShare[1] && isMine(x))
    if (!proj) {
      sendJson(res, 404, { ok: false, error: 'Проект не найден' })
      return true
    }
    const d = await body()
    if (!d) {
      sendJson(res, 400, { ok: false, error: 'Некорректный JSON' })
      return true
    }
    const employeeId = clean(d.employeeId, 40)
    const role = ROLES.has(d.role) ? d.role : 'editor'
    const emp = db.employees.find((e) => e.id === employeeId)
    if (!emp) {
      sendJson(res, 404, { ok: false, error: 'Сотрудник не найден' })
      return true
    }
    if (proj.ownerId === employeeId) {
      sendJson(res, 400, { ok: false, error: 'Владелец уже имеет полный доступ' })
      return true
    }
    const existing = db.shares.find((s) => s.projectId === proj.id && s.employeeId === employeeId)
    if (existing) existing.role = role
    else db.shares.push({ id: uid('shr'), projectId: proj.id, employeeId, role, addedAt: nowIso() })
    proj.updatedAt = nowIso()
    logActivity(db, {
      clientId: cid,
      type: 'access_granted',
      projectId: proj.id,
      employeeId,
      text: `${emp.fullName} получил доступ (${role === 'viewer' ? 'просмотр' : role === 'editor' ? 'редактирование' : 'владелец'})`,
    })
    await save()
    sendJson(res, 200, { ok: true, project: publicProject(db, proj, clean(d.actorId, 40)) })
    return true
  }

  const mUnshare = /^\/api\/team\/projects\/([A-Za-z0-9_]+)\/share\/([A-Za-z0-9_]+)$/.exec(p)
  if (mUnshare && req.method === 'DELETE') {
    const proj = db.projects.find((x) => x.id === mUnshare[1] && isMine(x))
    if (!proj) {
      sendJson(res, 404, { ok: false, error: 'Проект не найден' })
      return true
    }
    const emp = db.employees.find((e) => e.id === mUnshare[2])
    db.shares = db.shares.filter(
      (s) => !(s.projectId === proj.id && s.employeeId === mUnshare[2]),
    )
    // Если у сотрудника был захвачен проект, снимаем блокировку: иначе проект
    // остался бы «в работе» у человека без доступа.
    if (proj.lockedBy === mUnshare[2]) {
      proj.lockedBy = null
      proj.lockedAt = null
    }
    proj.updatedAt = nowIso()
    logActivity(db, {
      clientId: cid,
      type: 'access_revoked',
      projectId: proj.id,
      employeeId: mUnshare[2],
      text: `${emp?.fullName || 'Сотрудник'} лишён доступа`,
    })
    await save()
    sendJson(res, 200, { ok: true, project: publicProject(db, proj, '') })
    return true
  }

  /**
   * «Взять в работу» / «освободить».
   * Мягкая блокировка: показывает остальным, что коллега уже работает над
   * проектом. Жёсткий запрет намеренно не делаем — задача про совместную работу,
   * а не про монопольный доступ.
   */
  const mClaim = /^\/api\/team\/projects\/([A-Za-z0-9_]+)\/claim$/.exec(p)
  if (mClaim && req.method === 'POST') {
    const proj = db.projects.find((x) => x.id === mClaim[1] && isMine(x))
    if (!proj) {
      sendJson(res, 404, { ok: false, error: 'Проект не найден' })
      return true
    }
    const d = await body()
    if (!d) {
      sendJson(res, 400, { ok: false, error: 'Некорректный JSON' })
      return true
    }
    const actor = clean(d.actorId, 40)
    const access = accessFor(db, proj.id, actor)
    if (access !== 'editor' && access !== 'owner') {
      sendJson(res, 403, { ok: false, error: 'Нужен доступ на редактирование' })
      return true
    }
    const emp = db.employees.find((e) => e.id === actor)
    if (d.release) {
      proj.lockedBy = null
      proj.lockedAt = null
      logActivity(db, {
        clientId: cid,
        type: 'released',
        projectId: proj.id,
        employeeId: actor,
        text: `${emp?.fullName || 'Сотрудник'} освободил проект`,
      })
    } else {
      proj.lockedBy = actor
      proj.lockedAt = nowIso()
      logActivity(db, {
        clientId: cid,
        type: 'claimed',
        projectId: proj.id,
        employeeId: actor,
        text: `${emp?.fullName || 'Сотрудник'} продолжает работу`,
      })
    }
    proj.updatedAt = nowIso()
    await save()
    sendJson(res, 200, { ok: true, project: publicProject(db, proj, actor) })
    return true
  }

  /* ───────────────── План и квота ───────────────── */

  if (p === '/api/team/usage' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, usage: clientUsage(auth.client) })
    return true
  }

  if (p === '/api/team/usage/log' && req.method === 'GET') {
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100))
    const list = (db.usageLog || []).filter((u) => u.clientId === cid)
    sendJson(res, 200, {
      ok: true,
      usage: list.slice(0, limit),
      total: list.length,
    })
    return true
  }

  if (p === '/api/team/usage/consume' && req.method === 'POST') {
    const d = (await body()) || {}
    const n = Number(d.count) || 1
    const okConsume = await consumeCredits(db, auth.client, {
      count: n,
      tool: clean(d.tool, 60) || 'generation',
      accountId: auth.account.id,
      source: 'web',
    })
    if (!okConsume) {
      // 402 — осмысленный код: клиент показывает предложение сменить план.
      sendJson(res, 402, {
        ok: false,
        error: 'Кредит-токены на этом тарифе закончились',
        usage: clientUsage(auth.client),
      })
      return true
    }
    sendJson(res, 200, { ok: true, usage: clientUsage(auth.client) })
    return true
  }

  /**
   * Смена тарифа самим клиентом отключена: тарифы — покупка кредит-токенов,
   * смену выполняет администратор платформы из /sadmin (до появления онлайн-
   * оплаты). Эндпоинт оставлен, чтобы старый фронт получил понятную ошибку, а не 404.
   */
  if (p === '/api/team/usage/plan' && req.method === 'POST') {
    sendJson(res, 403, {
      ok: false,
      error: 'Смена тарифа выполняется администратором платформы. Свяжитесь с поддержкой.',
      usage: clientUsage(auth.client),
    })
    return true
  }

  if (p === '/api/team/activity' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, activity: db.activity.filter(isMine).slice(0, 50) })
    return true
  }

  return false
}

export { usageState, publicEmployee, publicProject, logActivity, PLANS }
