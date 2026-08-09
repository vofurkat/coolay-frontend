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
  bot: { id: number; username: string; firstName: string } | null
  webhook: { url: string; pendingUpdateCount: number; lastErrorMessage?: string } | null
  miniAppUrl: string
  employeesLinked: number
}

export const telegramApi = {
  status() {
    return get<{ ok: true; status: TelegramStatus }>('/api/telegram/status')
  },
  setup() {
    return post<{ ok: true; status: TelegramStatus }>('/api/telegram/setup')
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
