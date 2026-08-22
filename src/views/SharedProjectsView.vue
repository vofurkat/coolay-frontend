<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Check,
  Eye,
  LoaderCircle,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  Users,
  X,
} from '@lucide/vue'
import {
  isFail,
  teamApi,
  type ActivityItem,
  type Employee,
  type EmployeeRole,
  type SharedProject,
} from '@/data/platformApi'
import { useAuthStore } from '@/stores/auth'

/**
 * Совместная работа над проектами.
 *
 * Заказчик: «мои работу можеть продолжить или видет если есть у сотрудника
 * доступ совместо продолжить». Отсюда три вещи в интерфейсе:
 *  1. видно, у кого есть доступ и с какой ролью;
 *  2. видно, кто прямо сейчас работает (мягкая блокировка);
 *  3. можно «продолжить» — перейти в проект, если роль позволяет.
 */
const auth = useAuthStore()

/**
 * Кто «я» с точки зрения бэкенда. В демо-входе id пользователя не совпадает
 * с id сотрудника в базе, поэтому берём первого владельца/админа как себя.
 * Это временный мост: когда появится реальная авторизация сотрудников
 * (задача 6, вход по телефону через бота), здесь будет id из сессии.
 */
const meId = ref('')

const projects = ref<SharedProject[]>([])
const employees = ref<Employee[]>([])
const activity = ref<ActivityItem[]>([])
const loading = ref(true)
const pageError = ref('')
const busyId = ref('')

const scope = ref<'shared' | 'mine' | 'all'>('shared')

const shareFor = ref<SharedProject | null>(null)
const shareEmployee = ref('')
const shareRole = ref<EmployeeRole>('editor')
const shareError = ref('')

const ROLE_LABEL: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  editor: 'Редактор',
  viewer: 'Просмотр',
}

async function loadAll() {
  loading.value = true
  pageError.value = ''
  const emps = await teamApi.employees()
  if (!isFail(emps)) {
    employees.value = emps.employees
    if (!meId.value) {
      const owner = emps.employees.find((e) => e.role === 'owner' || e.role === 'admin')
      meId.value = owner?.id || emps.employees[0]?.id || ''
    }
  }
  const [list, act] = await Promise.all([
    teamApi.projects(scope.value, meId.value || undefined),
    teamApi.activity(20),
  ])
  loading.value = false
  if (isFail(list)) {
    pageError.value = list.error
    return
  }
  projects.value = list.projects
  if (!isFail(act)) activity.value = act.activity
}

onMounted(loadAll)

function setScope(s: 'shared' | 'mine' | 'all') {
  scope.value = s
  loadAll()
}

/** Сотрудники, у которых доступа к проекту ещё нет. */
const candidates = computed(() => {
  const p = shareFor.value
  if (!p) return []
  const taken = new Set([p.ownerId, ...p.shares.map((s) => s.employeeId)])
  return employees.value.filter((e) => !taken.has(e.id))
})

function openShare(p: SharedProject) {
  shareFor.value = p
  shareError.value = ''
  shareRole.value = 'editor'
  shareEmployee.value = candidates.value[0]?.id || ''
}

async function grant() {
  const p = shareFor.value
  if (!p || !shareEmployee.value) {
    shareError.value = 'Выберите сотрудника'
    return
  }
  busyId.value = p.id
  const res = await teamApi.share(p.id, shareEmployee.value, shareRole.value)
  busyId.value = ''
  if (isFail(res)) {
    shareError.value = res.error
    return
  }
  shareFor.value = null
  await loadAll()
}

async function revoke(p: SharedProject, employeeId: string) {
  busyId.value = p.id
  const res = await teamApi.unshare(p.id, employeeId)
  busyId.value = ''
  if (isFail(res)) {
    pageError.value = res.error
    return
  }
  await loadAll()
}

/** Взять проект в работу / отпустить. */
async function toggleClaim(p: SharedProject) {
  if (!meId.value) return
  const mine = p.lockedBy === meId.value
  busyId.value = p.id
  const res = await teamApi.claim(p.id, meId.value, mine)
  busyId.value = ''
  if (isFail(res)) {
    pageError.value = res.error
    return
  }
  await loadAll()
}

/** Может ли текущий пользователь менять проект. */
function canEdit(p: SharedProject) {
  return p.myAccess === 'owner' || p.myAccess === 'admin' || p.myAccess === 'editor'
}

/** Владелец или админ вправе выдавать доступ. */
function canManage(p: SharedProject) {
  return p.myAccess === 'owner' || p.myAccess === 'admin'
}

function shortTime(iso: string) {
  const d = new Date(iso)
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин назад`
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)} ч назад`
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const meName = computed(
  () => employees.value.find((e) => e.id === meId.value)?.fullName || auth.user?.name || 'Вы',
)
</script>

<template>
  <div class="page animate-fade-in">
    <header class="mb-6">
      <h1 class="text-xl sm:text-2xl font-bold text-ink-900">Общие со мной</h1>
      <p class="text-sm text-ink-500 mt-1">
        Проекты команды: видно, у кого есть доступ и кто работает прямо сейчас —
        можно продолжить работу вместе.
      </p>
    </header>

    <!-- Кто я + фильтры -->
    <div class="flex flex-wrap items-center gap-3 mb-5">
      <div class="inline-flex p-1 rounded-xl bg-ink-100">
        <button
          v-for="s in (['shared', 'mine', 'all'] as const)"
          :key="s"
          type="button"
          class="px-3 h-8 rounded-lg text-xs font-semibold transition-colors"
          :class="scope === s ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800'"
          @click="setScope(s)"
        >
          {{ s === 'shared' ? 'Со мной поделились' : s === 'mine' ? 'Мои' : 'Все' }}
        </button>
      </div>

      <label class="flex items-center gap-2 ml-auto">
        <span class="text-xs text-ink-500">Я вошёл как</span>
        <select
          v-model="meId"
          class="input h-9 w-auto min-w-[180px] text-xs"
          @change="loadAll"
        >
          <option v-for="e in employees" :key="e.id" :value="e.id">
            {{ e.fullName }} · {{ ROLE_LABEL[e.role] }}
          </option>
        </select>
      </label>
    </div>

    <p v-if="pageError" class="text-sm text-red-600 mb-4">{{ pageError }}</p>

    <div class="grid lg:grid-cols-[1fr_300px] gap-5">
      <section class="min-w-0 space-y-4">
        <div v-if="loading" class="space-y-4">
          <div v-for="i in 2" :key="i" class="card p-5">
            <div class="h-4 w-1/3 rounded bg-ink-100 animate-pulse" />
            <div class="h-3 w-1/2 rounded bg-ink-100 animate-pulse mt-3" />
          </div>
        </div>

        <div v-else-if="!projects.length" class="card p-10 text-center">
          <div class="mx-auto w-12 h-12 rounded-2xl bg-brand-50 grid place-items-center mb-4">
            <Users :size="22" :stroke-width="1.6" class="text-ink-700" />
          </div>
          <h3 class="text-sm font-bold text-ink-900">
            {{ scope === 'shared' ? 'С вами пока не делились' : 'Проектов нет' }}
          </h3>
          <p class="text-xs text-ink-500 mt-1.5 max-w-sm mx-auto">
            Когда владелец выдаст доступ, проект появится здесь — и вы сможете
            продолжить работу с того места, где её оставили.
          </p>
        </div>

        <article
          v-for="p in projects"
          :key="p.id"
          class="card p-5"
          :class="busyId === p.id ? 'opacity-60 pointer-events-none' : ''"
        >
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <h3 class="text-sm font-bold text-ink-900 truncate">{{ p.name }}</h3>
                <span
                  class="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                  :class="
                    p.myAccess === 'viewer'
                      ? 'bg-ink-100 text-ink-600'
                      : 'bg-brand-50 text-ink-800'
                  "
                >
                  {{ ROLE_LABEL[p.myAccess || 'viewer'] }}
                </span>
              </div>
              <p class="text-xs text-ink-500 mt-1">
                Владелец: {{ p.ownerName }} · {{ p.cardIds.length }} карточек ·
                изменён {{ shortTime(p.updatedAt) }}
              </p>
            </div>
            <LoaderCircle
              v-if="busyId === p.id"
              :size="16"
              class="animate-spin text-ink-400 mt-1"
            />
          </div>

          <p v-if="p.description" class="text-xs text-ink-600 mt-2">{{ p.description }}</p>

          <!-- Кто сейчас работает -->
          <div
            v-if="p.lockedBy"
            class="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl text-xs"
            :class="p.lockedBy === meId ? 'bg-brand-50 text-ink-800' : 'bg-amber-50 text-amber-800'"
          >
            <Lock :size="13" :stroke-width="1.9" class="shrink-0" />
            <span class="min-w-0 truncate">
              {{
                p.lockedBy === meId
                  ? 'Вы взяли проект в работу'
                  : `${p.lockedByName} работает над проектом`
              }}
              <span v-if="p.lockedAt" class="opacity-70">· {{ shortTime(p.lockedAt) }}</span>
            </span>
          </div>

          <!-- Доступы -->
          <div class="mt-4">
            <p class="text-[11px] font-semibold text-ink-500 mb-2">
              Доступ есть у {{ p.shares.length + 1 }}
            </p>
            <div class="flex flex-wrap gap-1.5">
              <span
                class="inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-lg bg-ink-900 text-white text-[11px]"
              >
                {{ p.ownerName }}
                <span class="opacity-60">владелец</span>
              </span>
              <span
                v-for="s in p.shares"
                :key="s.employeeId"
                class="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg bg-ink-50 border border-ink-100 text-[11px] text-ink-700"
              >
                {{ s.name }}
                <span class="text-ink-400">{{ ROLE_LABEL[s.role] }}</span>
                <button
                  v-if="canManage(p)"
                  type="button"
                  class="grid place-items-center w-5 h-5 rounded text-ink-400 hover:text-red-600 hover:bg-red-50"
                  :title="`Убрать доступ ${s.name}`"
                  @click="revoke(p, s.employeeId)"
                >
                  <X :size="11" :stroke-width="2.4" />
                </button>
              </span>

              <button
                v-if="canManage(p)"
                type="button"
                class="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-ink-200 text-[11px] text-ink-600 hover:border-brand-400 hover:text-ink-900"
                @click="openShare(p)"
              >
                <Plus :size="11" :stroke-width="2.4" />
                Дать доступ
              </button>
            </div>
          </div>

          <div class="flex items-center gap-2 mt-4 pt-3 border-t border-ink-100">
            <!-- Просмотр без права правки: честно говорим об этом -->
            <span
              v-if="!canEdit(p)"
              class="inline-flex items-center gap-1.5 text-[11px] text-ink-500"
            >
              <Eye :size="13" :stroke-width="1.8" />
              Только просмотр
            </span>

            <button
              v-else
              type="button"
              class="btn btn-ghost h-9 px-3 text-xs"
              @click="toggleClaim(p)"
            >
              <component
                :is="p.lockedBy === meId ? LockOpen : Lock"
                :size="13"
                :stroke-width="1.9"
              />
              {{ p.lockedBy === meId ? 'Отпустить' : 'Взять в работу' }}
            </button>

            <RouterLink :to="`/projects`" class="btn btn-brand h-9 px-3 text-xs ml-auto">
              <Check :size="13" :stroke-width="2" />
              {{ canEdit(p) ? 'Продолжить' : 'Открыть' }}
            </RouterLink>
          </div>
        </article>
      </section>

      <!-- Лента активности -->
      <aside class="card p-4 h-fit lg:sticky lg:top-4">
        <h2 class="text-xs font-semibold text-ink-700 mb-3">Что происходило</h2>
        <ol v-if="activity.length" class="space-y-3">
          <li v-for="a in activity" :key="a.id" class="flex gap-2.5">
            <span class="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-400" />
            <div class="min-w-0">
              <p class="text-xs text-ink-700 leading-snug">{{ a.text }}</p>
              <p class="text-[10px] text-ink-400 mt-0.5">{{ shortTime(a.at) }}</p>
            </div>
          </li>
        </ol>
        <p v-else class="text-xs text-ink-400">Пока ничего не происходило</p>
      </aside>
    </div>

    <!-- Выдача доступа -->
    <Teleport to="body">
      <div
        v-if="shareFor"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      >
        <div class="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" @click="shareFor = null" />
        <div
          class="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6"
        >
          <h2 class="text-base font-bold text-ink-900">Дать доступ</h2>
          <p class="text-xs text-ink-500 mt-1 mb-4">
            Проект «{{ shareFor.name }}» — сотрудник сможет продолжить работу
            вместе с вами.
          </p>

          <div v-if="!candidates.length" class="text-xs text-ink-500 mb-4">
            Доступ уже есть у всех сотрудников. Добавьте нового в
            <RouterLink to="/settings?tab=users" class="underline">настройках</RouterLink>.
          </div>

          <template v-else>
            <label class="block mb-3">
              <span class="block text-xs font-semibold text-ink-700 mb-1.5">Сотрудник</span>
              <select v-model="shareEmployee" class="input">
                <option v-for="e in candidates" :key="e.id" :value="e.id">
                  {{ e.fullName }}{{ e.phone ? ` · ${e.phone}` : '' }}
                </option>
              </select>
            </label>

            <div class="mb-4">
              <span class="block text-xs font-semibold text-ink-700 mb-1.5">Права</span>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="r in (['editor', 'viewer'] as const)"
                  :key="r"
                  type="button"
                  class="p-3 rounded-xl border text-left transition-colors"
                  :class="
                    shareRole === r
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-ink-200 hover:border-ink-300'
                  "
                  @click="shareRole = r"
                >
                  <span class="block text-xs font-bold text-ink-900">
                    {{ ROLE_LABEL[r] }}
                  </span>
                  <span class="block text-[10px] text-ink-500 mt-0.5">
                    {{ r === 'editor' ? 'Может продолжать работу' : 'Только смотрит' }}
                  </span>
                </button>
              </div>
            </div>
          </template>

          <p v-if="shareError" class="text-xs text-red-600 mb-3">{{ shareError }}</p>

          <div class="flex items-center gap-3">
            <button type="button" class="btn btn-ghost h-10" @click="shareFor = null">
              Отмена
            </button>
            <button
              type="button"
              class="btn btn-brand h-10 ml-auto"
              :disabled="!candidates.length"
              @click="grant"
            >
              Выдать доступ
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
