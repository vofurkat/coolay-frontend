/**
 * Клиент платформенного API: шаблоны, команда, проекты, квоты, Telegram.
 *
 * Здесь намеренно НЕ используется axios — в проекте уже есть паттерн на
 * нативном fetch (skuApi.ts, generateApi.ts), и добавлять зависимость ради
 * четырёх методов значит увеличить бандл без выгоды.
 *
 * Все методы возвращают либо успешный payload, либо { ok: false, error },
 * то есть НИКОГДА не бросают исключение. Это сознательный выбор: экраны
 * показывают текст ошибки в интерфейсе, а не падают в белый экран, и
 * try/catch не нужно дублировать в каждом компоненте.
 */

export interface Fail {
  ok: false
  error: string
}

export function isFail(v: unknown): v is Fail {
  return !!v && typeof v === 'object' && (v as Fail).ok === false
}

async function request<T>(path: string, init?: RequestInit): Promise<T | Fail> {
  try {
    const resp = await fetch(path, {
      ...init,
      headers:
        init?.body instanceof FormData
          ? init?.headers
          : { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    })
    const json = await resp.json().catch(() => ({}) as Record<string, unknown>)
    if (!resp.ok || (json as { ok?: boolean })?.ok === false) {
      return {
        ok: false,
        error: (json as { error?: string })?.error || `Ошибка ${resp.status}`,
      }
    }
    return json as T
  } catch {
    return { ok: false, error: 'Нет связи с сервером' }
  }
}

const get = <T>(p: string) => request<T>(p)
const post = <T>(p: string, body?: unknown) =>
  request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) })
const patch = <T>(p: string, body: unknown) =>
  request<T>(p, { method: 'PATCH', body: JSON.stringify(body) })
const del = <T>(p: string) => request<T>(p, { method: 'DELETE' })

/* ─────────────────────────── Шаблоны ─────────────────────────── */

export interface TemplateReference {
  id: string
  /** Путь вида /api/files/xxx.jpg либо внешний https-URL. */
  image: string
  prompt: string
  label: string
}

export interface Template {
  id: string
  name: string
  /** Уровни категории: ['Мужское','Рубашки','Классические']. */
  category: string[]
  /** Тот же путь строкой — для показа в интерфейсе. */
  categoryPath: string
  description: string
  references: TemplateReference[]
  slotHints: Record<string, string>
  usageCount: number
  /** Системный шаблон платформы: виден всем клиентам, read-only. */
  isSystem?: boolean
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

export interface CategoryNode {
  name: string
  path: string[]
  children: CategoryNode[]
  count: number
}

export interface TemplateInput {
  name: string
  category: string[] | string
  description?: string
  references: Array<{
    id?: string
    /** data:-URL для новой картинки либо существующий путь. */
    image?: string
    prompt?: string
    label?: string
  }>
  slotHints?: Record<string, string>
  createdBy?: string
}

export const templatesApi = {
  list(params: { category?: string[]; q?: string } = {}) {
    const qs = new URLSearchParams()
    if (params.category?.length) qs.set('category', params.category.join('/'))
    if (params.q) qs.set('q', params.q)
    const suffix = qs.toString() ? `?${qs}` : ''
    return get<{ ok: true; templates: Template[] }>(`/api/templates${suffix}`)
  },
  categories() {
    return get<{ ok: true; categories: CategoryNode[] }>('/api/templates/categories')
  },
  create(input: TemplateInput) {
    return post<{ ok: true; template: Template }>('/api/templates', input)
  },
  update(id: string, input: Partial<TemplateInput>) {
    return patch<{ ok: true; template: Template }>(`/api/templates/${id}`, input)
  },
  remove(id: string) {
    return del<{ ok: true }>(`/api/templates/${id}`)
  },
  duplicate(id: string) {
    return post<{ ok: true; template: Template }>(`/api/templates/${id}/duplicate`)
  },
  /** Счётчик применений — вызывается при запуске генерации по шаблону. */
  use(id: string) {
    return post<{ ok: true; template: Template }>(`/api/templates/${id}/use`)
  },
}

/* ─────────────────────────── Команда ─────────────────────────── */

export type EmployeeRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type EmployeeStatus = 'active' | 'blocked' | 'pending'

export interface Employee {
  id: string
  fullName: string
  phone: string
  email: string
  role: EmployeeRole
  status: EmployeeStatus
  canGenerate: boolean
  telegramId: number | null
  /** Пустая строка, а не null — так отдаёт бэкенд. */
  telegramUsername: string
  botVerifiedAt: string | null
  lastActive: string | null
  createdAt: string
}

export interface ProjectShare {
  employeeId: string
  name: string
  role: EmployeeRole
  addedAt: string
}

export interface SharedProject {
  id: string
  name: string
  description: string
  status: string
  cardIds: string[]
  cover: string
  ownerId: string
  ownerName: string
  createdAt: string
  updatedAt: string
  lockedBy: string | null
  lockedByName: string | null
  lockedAt: string | null
  shares: ProjectShare[]
  /** Роль текущего пользователя именно в этом проекте. */
  myAccess: EmployeeRole | null
  activity: ActivityItem[]
}

export interface UsageState {
  plan: string
  planLabel: string
  limit: number
  used: number
  left: number
  percent: number
  periodStart: string
  plans: Array<{ key: string; label: string; limit: number }>
}

export interface ActivityItem {
  id: string
  type: string
  text: string
  projectId: string | null
  employeeId: string | null
  at: string
}

export const teamApi = {
  employees() {
    return get<{ ok: true; employees: Employee[] }>('/api/team/employees')
  },
  createEmployee(input: Partial<Employee>) {
    return post<{ ok: true; employee: Employee }>('/api/team/employees', input)
  },
  updateEmployee(id: string, input: Partial<Employee>) {
    return patch<{ ok: true; employee: Employee }>(`/api/team/employees/${id}`, input)
  },
  removeEmployee(id: string) {
    return del<{ ok: true }>(`/api/team/employees/${id}`)
  },

  projects(scope: 'mine' | 'shared' | 'all' = 'all', userId?: string) {
    const qs = new URLSearchParams({ scope })
    if (userId) qs.set('userId', userId)
    return get<{ ok: true; projects: SharedProject[] }>(`/api/team/projects?${qs}`)
  },
  createProject(input: { name: string; description?: string; ownerId?: string }) {
    return post<{ ok: true; project: SharedProject }>('/api/team/projects', input)
  },
  updateProject(id: string, input: Record<string, unknown>) {
    return patch<{ ok: true; project: SharedProject }>(`/api/team/projects/${id}`, input)
  },
  removeProject(id: string) {
    return del<{ ok: true }>(`/api/team/projects/${id}`)
  },
  share(projectId: string, employeeId: string, role: EmployeeRole) {
    return post<{ ok: true; project: SharedProject }>(`/api/team/projects/${projectId}/share`, {
      employeeId,
      role,
    })
  },
  unshare(projectId: string, employeeId: string) {
    return del<{ ok: true; project: SharedProject }>(
      `/api/team/projects/${projectId}/share/${employeeId}`,
    )
  },
  /** Мягкая блокировка «я работаю» / снятие её через release. */
  claim(projectId: string, employeeId: string, release = false) {
    return post<{ ok: true; project: SharedProject }>(`/api/team/projects/${projectId}/claim`, {
      employeeId,
      release,
    })
  },

  usage() {
    return get<{ ok: true; usage: UsageState }>('/api/team/usage')
  },
  usageLog(limit = 200) {
    return get<{ ok: true; usage: UsageLogItem[]; total: number }>(
      `/api/team/usage/log?limit=${limit}`,
    )
  },
  setPlan(plan: string) {
    return post<{ ok: true; usage: UsageState }>('/api/team/usage/plan', { plan })
  },
  activity(limit = 30) {
    return get<{ ok: true; activity: ActivityItem[] }>(`/api/team/activity?limit=${limit}`)
  },
}

/* ─────────────────────────── Telegram ─────────────────────────── */

export interface TelegramStatus {
  configured: boolean
  bot: { id: number; username: string; name: string } | null
  webhook: { url: string; pending: number; lastError: string } | null
  miniAppUrl: string
  verified: number
  total: number
}

/** Сотрудник в разрезе подключения к боту — подмножество Employee. */
export interface BotEmployeeInfo {
  id: string
  fullName: string
  phone: string
  status: EmployeeStatus
  canGenerate: boolean
  telegramId: number | null
  telegramUsername: string
  botVerifiedAt: string | null
  lastActive: string | null
}

/**
 * Состояние бота для владельца компании.
 * Токена здесь нет намеренно — это серверный секрет, в браузер он не попадает.
 */
export interface BotInfo {
  configured: boolean
  botAvailable: boolean
  bot: { id: number; username: string; name: string } | null
  miniAppUrl: string
  botLink: string
  employees: BotEmployeeInfo[]
  linked: number
  total: number
}

export const telegramApi = {
  /** Состояние бота и сотрудники своей компании. Токен не отдаётся. */
  botInfo() {
    return get<{ ok: true } & BotInfo>('/api/telegram/bot-info')
  },
  /*
   * status и setup — платформенные операции, закрыты сессией супер-админа.
   * Из клиентского интерфейса они не вызываются; оставлены для админки.
   */
  status() {
    return get<{ ok: true } & TelegramStatus>('/api/telegram/status')
  },
  setup() {
    return post<{ ok: true; webhook: string }>('/api/telegram/setup')
  },
  /** Авторизация Mini App: initData проверяется на сервере по HMAC. */
  miniAppAuth(initData: string) {
    return post<{ ok: true; employee: Employee; usage: UsageState }>(
      '/api/telegram/miniapp/auth',
      { initData },
    )
  },
  miniAppPhotos(initData: string) {
    return post<{ ok: true; photos: Array<{ id: string; image: string; at: string }> }>(
      '/api/telegram/miniapp/photos',
      { initData },
    )
  },
}

/* ─────────────────────────── Авторизация клиентов ─────────────────────────── */

export interface AuthAccount {
  id: string
  email: string
  name: string
  role: string
  provider: string
}

export interface AuthClient {
  id: string
  name: string
  plan: string
  planLabel: string
  status: string
  credits: { limit: number; used: number; left: number; periodStart: string | null }
}

export interface AuthMe {
  ok: true
  account: AuthAccount
  client: AuthClient
  config: { googleClientId: string }
}

export const authApi = {
  me() {
    return get<AuthMe>('/api/auth/me')
  },
  register(data: { company: string; name: string; email: string; password: string }) {
    return post<{ ok: true; account: AuthAccount; client: AuthClient }>('/api/auth/register', data)
  },
  login(email: string, password: string) {
    return post<{ ok: true; account: AuthAccount; client: AuthClient }>('/api/auth/login', {
      email,
      password,
    })
  },
  google(credential: string) {
    return post<{ ok: true; account: AuthAccount; client: AuthClient }>('/api/auth/google', {
      credential,
    })
  },
  logout() {
    return post<{ ok: true }>('/api/auth/logout')
  },
  /** googleClientId нужен на экране входа ещё ДО авторизации: /me отдаёт
   *  config даже с 401, но request() превращает 401 в Fail — поэтому
   *  отдельный «сырой» запрос. */
  async loginConfig(): Promise<{ googleClientId: string }> {
    try {
      const resp = await fetch('/api/auth/me')
      const json = await resp.json().catch(() => ({}))
      return { googleClientId: json?.config?.googleClientId || '' }
    } catch {
      return { googleClientId: '' }
    }
  },
}

/* ─────────────────────────── Супер-админка (/sadmin) ─────────────────────────── */

export interface SadminUser {
  id: string
  login: string
  name: string
  createdAt: string
  lastLoginAt: string | null
}

export interface SadminClientRow {
  id: string
  name: string
  email: string | null
  plan: string
  planLabel: string
  status: string
  credits: { limit: number; used: number; left: number; extra: number; periodStart: string | null }
  accounts: number
  employees: number
  projects: number
  templates: number
  createdAt: string
  lastActiveAt: string | null
}

export interface SadminPlan {
  key: string
  label: string
  monthlyCredits: number
  price: number
  currency: string
  description: string
  updatedAt: string
  clients?: number
}

export interface SadminStats {
  clients: number
  clientsActive: number
  clientsBlocked: number
  clientsNew7d: number
  accounts: number
  byPlan: Record<string, number>
  creditsUsed30d: number
  generations30d: number
  systemTemplates: number
  admins: number
}

export interface UsageLogItem {
  id: string
  clientId: string
  clientName?: string
  accountId: string | null
  tool: string
  credits: number
  source: string
  meta?: Record<string, unknown> | null
  at: string
}

/** Человекочитаемые названия операций в журнале списаний. */
export const USAGE_TOOL_LABELS: Record<string, string> = {
  'sku:analyze': 'Анализ фото',
  'sku:content': 'Генерация контента',
  'sku:images': 'Генерация изображений',
  generate: 'Генерация изображения',
  'generate-smart': 'Умная генерация',
  generation: 'Генерация',
}

export function usageToolLabel(tool: string) {
  return USAGE_TOOL_LABELS[tool] || tool
}

export interface SadminLogItem {
  id: string
  adminId: string
  adminLogin: string
  action: string
  target: string | null
  details: string | null
  at: string
}

export const sadminApi = {
  login(login: string, password: string) {
    return post<{ ok: true; admin: SadminUser }>('/api/sadmin/auth/login', { login, password })
  },
  logout() {
    return post<{ ok: true }>('/api/sadmin/auth/logout')
  },
  me() {
    return get<{ ok: true; admin: SadminUser }>('/api/sadmin/auth/me')
  },
  stats() {
    return get<{
      ok: true
      stats: SadminStats
      recentClients: SadminClientRow[]
      recentUsage: UsageLogItem[]
    }>('/api/sadmin/stats')
  },
  clients(q = '') {
    return get<{ ok: true; clients: SadminClientRow[] }>(
      `/api/sadmin/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    )
  },
  client(id: string) {
    return get<{
      ok: true
      client: SadminClientRow
      accounts: Array<{ id: string; email: string; name: string; role: string; provider: string; createdAt: string }>
      usage: UsageLogItem[]
      plans: SadminPlan[]
    }>(`/api/sadmin/clients/${id}`)
  },
  updateClient(id: string, data: { plan?: string; status?: string; name?: string }) {
    return patch<{ ok: true; client: SadminClientRow }>(`/api/sadmin/clients/${id}`, data)
  },
  addCredits(id: string, amount: number, comment = '') {
    return post<{ ok: true; client: SadminClientRow }>(`/api/sadmin/clients/${id}/credits`, {
      amount,
      comment,
    })
  },
  usage(clientId = '', limit = 100) {
    const params = new URLSearchParams()
    if (clientId) params.set('clientId', clientId)
    params.set('limit', String(limit))
    return get<{ ok: true; usage: UsageLogItem[]; total: number }>(`/api/sadmin/usage?${params}`)
  },
  plans() {
    return get<{ ok: true; plans: SadminPlan[] }>('/api/sadmin/plans')
  },
  createPlan(data: Partial<SadminPlan>) {
    return post<{ ok: true; plan: SadminPlan }>('/api/sadmin/plans', data)
  },
  updatePlan(key: string, data: Partial<SadminPlan>) {
    return patch<{ ok: true; plan: SadminPlan }>(`/api/sadmin/plans/${key}`, data)
  },
  deletePlan(key: string) {
    return del<{ ok: true }>(`/api/sadmin/plans/${key}`)
  },
  templates() {
    return get<{ ok: true; templates: Template[]; categories: CategoryNode[] }>(
      '/api/sadmin/templates',
    )
  },
  createTemplate(data: unknown) {
    return post<{ ok: true; template: Template }>('/api/sadmin/templates', data)
  },
  updateTemplate(id: string, data: unknown) {
    return patch<{ ok: true; template: Template }>(`/api/sadmin/templates/${id}`, data)
  },
  deleteTemplate(id: string) {
    return del<{ ok: true }>(`/api/sadmin/templates/${id}`)
  },
  admins() {
    return get<{ ok: true; admins: SadminUser[]; meId: string }>('/api/sadmin/admins')
  },
  createAdmin(data: { login: string; name: string; password: string }) {
    return post<{ ok: true; admin: SadminUser }>('/api/sadmin/admins', data)
  },
  updateAdmin(id: string, data: { name?: string; password?: string }) {
    return patch<{ ok: true; admin: SadminUser }>(`/api/sadmin/admins/${id}`, data)
  },
  deleteAdmin(id: string) {
    return del<{ ok: true }>(`/api/sadmin/admins/${id}`)
  },
  log(limit = 100) {
    return get<{ ok: true; log: SadminLogItem[]; total: number }>(`/api/sadmin/log?limit=${limit}`)
  },
}
