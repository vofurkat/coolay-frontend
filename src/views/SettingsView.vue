<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'
import UserModal from '@/components/settings/UserModal.vue'
import { useAuthStore } from '@/stores/auth'
import { isFail, teamApi, type Employee, type EmployeeRole, type EmployeeStatus } from '@/data/platformApi'

const auth = useAuthStore()
const tab = ref<'profile' | 'users' | 'workspace' | 'billing'>('profile')
const tabs = [
  { key: 'profile', label: 'Профиль', icon: 'user' },
  { key: 'users', label: 'Пользователи', icon: 'users' },
  { key: 'workspace', label: 'Рабочее пространство', icon: 'grid' },
  { key: 'billing', label: 'Тариф и оплата', icon: 'crown' },
] as const

const form = ref({
  name: auth.user?.name || '',
  email: auth.user?.email || '',
  company: auth.user?.company || '',
})

/* ---------- Сотрудники ----------
 * Раньше вкладка работала на моковом массиве: администратор «добавлял»
 * сотрудника, тот исчезал после перезагрузки и бот его не знал. Теперь
 * это тот же список /api/team/employees, который читает Telegram-бот.
 */
const members = ref<Employee[]>([])
const loading = ref(false)
const listError = ref('')
const saving = ref(false)
const modalError = ref('')

async function loadMembers() {
  loading.value = true
  listError.value = ''
  // Клиент API не бросает исключения, а возвращает Fail — проверяем через isFail.
  const r = await teamApi.employees()
  if (isFail(r)) listError.value = r.error || 'Не удалось загрузить сотрудников'
  else members.value = r.employees
  loading.value = false
}
onMounted(() => void loadMembers())

const search = ref('')
const filteredMembers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return members.value
  return members.value.filter(
    (m) =>
      m.fullName.toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q.replace(/\D/g, '')),
  )
})

const activeCount = computed(() => members.value.filter((m) => m.status === 'active').length)
const blockedCount = computed(() => members.value.filter((m) => m.status === 'blocked').length)
const botCount = computed(() => members.value.filter((m) => m.telegramId).length)

const roleMeta: Record<EmployeeRole, { label: string; cls: string }> = {
  owner: { label: 'Владелец', cls: 'bg-accent text-ink-900' },
  admin: { label: 'Администратор', cls: 'bg-ink-900 text-accent' },
  editor: { label: 'Редактор', cls: 'bg-ink-100 text-ink-700' },
  viewer: { label: 'Наблюдатель', cls: 'bg-ink-50 text-ink-500' },
}

const statusMeta: Record<EmployeeStatus, { label: string; cls: string; dot: string }> = {
  active: { label: 'Активен', cls: 'bg-green-50 text-green-600', dot: 'bg-green-500' },
  blocked: { label: 'Заблокирован', cls: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
  invited: { label: 'Ожидает входа', cls: 'bg-amber-50 text-amber-600', dot: 'bg-amber-500' },
}

/*
 * Подпись статуса через функцию, а не statusMeta[m.status] напрямую: если на
 * сервере когда-нибудь появится новый статус, интерфейс покажет его как есть,
 * а не рухнет на обращении к полю у undefined, унося с собой всю таблицу.
 */
function statusLook(s: EmployeeStatus) {
  return statusMeta[s] || { label: s, cls: 'bg-ink-100 text-ink-600', dot: 'bg-ink-400' }
}

const modalOpen = ref(false)
const editing = ref<Employee | null>(null)
const menuFor = ref<string | null>(null)

function openAdd() {
  editing.value = null
  modalError.value = ''
  modalOpen.value = true
}
function openEdit(m: Employee) {
  menuFor.value = null
  editing.value = m
  modalError.value = ''
  modalOpen.value = true
}

async function saveMember(payload: Partial<Employee>) {
  saving.value = true
  modalError.value = ''
  const r = editing.value
    ? await teamApi.updateEmployee(editing.value.id, payload)
    : await teamApi.createEmployee(payload)

  if (isFail(r)) {
    // Ошибку показываем в модале, а не закрываем его: иначе введённые данные
    // потерялись бы и их пришлось бы набирать заново. Сервер сообщает
    // содержательно — например «Сотрудник с таким телефоном уже есть».
    modalError.value = r.error || 'Не удалось сохранить'
  } else if (editing.value) {
    const idx = members.value.findIndex((x) => x.id === r.employee.id)
    if (idx >= 0) members.value[idx] = r.employee
    modalOpen.value = false
  } else {
    members.value.unshift(r.employee)
    modalOpen.value = false
  }
  saving.value = false
}

async function toggleBlock(m: Employee) {
  menuFor.value = null
  if (m.role === 'owner') return
  const next: EmployeeStatus = m.status === 'blocked' ? 'active' : 'blocked'
  const prev = m.status
  m.status = next // оптимистично, чтобы интерфейс не «залипал»
  const r = await teamApi.updateEmployee(m.id, { status: next })
  if (isFail(r)) {
    m.status = prev // откат: на сервере ничего не изменилось
    listError.value = r.error || 'Не удалось изменить статус'
  }
}

async function removeMember(m: Employee) {
  menuFor.value = null
  if (m.role === 'owner') return
  if (!confirm(`Удалить сотрудника ${m.fullName}? Доступ к боту прекратится.`)) return
  const backup = members.value
  members.value = members.value.filter((x) => x.id !== m.id)
  const r = await teamApi.removeEmployee(m.id)
  if (isFail(r)) {
    members.value = backup // откат: сотрудник на сервере остался
    listError.value = r.error || 'Не удалось удалить сотрудника'
  }
}

function fmt(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Телефон хранится цифрами — показываем в читаемом виде. */
function fmtPhone(p: string) {
  if (!p) return '—'
  const d = p.replace(/\D/g, '')
  if (d.length === 11) return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`
  return '+' + d
}
</script>

<template>
  <div class="page space-y-6 animate-fade-in">
    <PageHeader title="Настройки" subtitle="Управление аккаунтом, командой и рабочим пространством" />

    <div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
      <button
        v-for="t in tabs"
        :key="t.key"
        @click="tab = t.key"
        class="btn btn-sm whitespace-nowrap"
        :class="tab === t.key ? 'btn-dark' : 'btn-outline'"
      >
        <Icon :name="t.icon" :size="16" /> {{ t.label }}
      </button>
    </div>

    <!-- Profile -->
    <div v-if="tab === 'profile'" class="card p-6 space-y-6 max-w-3xl">
      <div class="flex items-center gap-4">
        <Avatar :name="form.name" :size="72" />
        <div>
          <button class="btn btn-outline btn-sm"><Icon name="upload" :size="16" /> Загрузить фото</button>
          <p class="text-xs text-ink-400 mt-2">JPG или PNG, до 5 МБ</p>
        </div>
      </div>
      <div class="grid sm:grid-cols-2 gap-4">
        <div>
          <label class="label">Имя</label>
          <input v-model="form.name" class="input" />
        </div>
        <div>
          <label class="label">Email</label>
          <input v-model="form.email" class="input" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">Компания</label>
          <input v-model="form.company" class="input" />
        </div>
      </div>
      <div class="flex justify-end gap-3">
        <button class="btn btn-ghost btn-md">Отмена</button>
        <button class="btn btn-accent btn-md">Сохранить изменения</button>
      </div>
    </div>

    <!-- Users -->
    <div v-else-if="tab === 'users'" class="space-y-4">
      <!-- toolbar -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="chip bg-ink-50 text-ink-600"><Icon name="users" :size="14" /> Всего: {{ members.length }}</span>
          <span class="chip bg-green-50 text-green-600"><span class="w-2 h-2 rounded-full bg-green-500" /> {{ activeCount }}</span>
          <span v-if="blockedCount" class="chip bg-red-50 text-red-600"><span class="w-2 h-2 rounded-full bg-red-500" /> {{ blockedCount }}</span>
          <span class="chip bg-ink-900 text-accent"><Icon name="send" :size="13" /> в боте: {{ botCount }}</span>
        </div>
        <div class="relative sm:ml-auto sm:w-64">
          <Icon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input v-model="search" class="input pl-9" placeholder="Поиск по имени, email или телефону" />
        </div>
        <button class="btn btn-accent btn-md shrink-0" @click="openAdd">
          <Icon name="userPlus" :size="18" /> Добавить
        </button>
      </div>

      <!-- table -->
      <div class="card overflow-visible">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-ink-100 bg-ink-50/60">
                <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Пользователь</th>
                <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Телефон</th>
                <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Роль</th>
                <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Telegram</th>
                <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Статус</th>
                <th class="text-right font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Был(а)</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in filteredMembers"
                :key="m.id"
                class="border-b border-ink-50 hover:bg-ink-50/60 transition"
                :class="m.status === 'blocked' ? 'opacity-60' : ''"
              >
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <Avatar :name="m.fullName" :size="36" />
                    <div class="min-w-0">
                      <p class="font-bold text-ink-900 whitespace-nowrap">{{ m.fullName }}</p>
                      <p class="text-xs text-ink-400 truncate">{{ m.email || '—' }}</p>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 whitespace-nowrap font-mono text-xs text-ink-700">
                  {{ fmtPhone(m.phone) }}
                </td>
                <td class="px-4 py-3">
                  <span class="chip whitespace-nowrap" :class="roleMeta[m.role].cls">{{ roleMeta[m.role].label }}</span>
                </td>
                <td class="px-4 py-3">
                  <span
                    v-if="m.telegramId"
                    class="chip bg-green-50 text-green-600 whitespace-nowrap"
                    :title="m.telegramUsername ? '@' + m.telegramUsername : ''"
                  >
                    <Icon name="check" :size="13" />
                    {{ m.telegramUsername ? '@' + m.telegramUsername : 'подключён' }}
                  </span>
                  <span v-else class="chip bg-amber-50 text-amber-600 whitespace-nowrap">
                    <Icon name="alert" :size="13" /> не подключён
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span class="chip whitespace-nowrap" :class="statusLook(m.status).cls">
                    <span class="w-1.5 h-1.5 rounded-full" :class="statusLook(m.status).dot" />
                    {{ statusLook(m.status).label }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right text-ink-400 whitespace-nowrap">{{ fmt(m.lastActive) }}</td>
                <td class="px-4 py-3 text-right">
                  <div class="relative inline-block">
                    <button
                      class="grid place-items-center w-8 h-8 rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-900"
                      :disabled="m.role === 'owner'"
                      :class="m.role === 'owner' ? 'opacity-30 cursor-not-allowed' : ''"
                      @click="menuFor = menuFor === m.id ? null : m.id"
                    >
                      <Icon name="more" :size="18" />
                    </button>
                    <!-- dropdown -->
                    <div
                      v-if="menuFor === m.id"
                      class="absolute right-0 top-full mt-1 w-48 card shadow-pop py-1 z-20 animate-scale-in"
                    >
                      <button class="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50" @click="openEdit(m)">
                        <Icon name="edit" :size="16" /> Редактировать
                      </button>
                      <button class="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-700 hover:bg-ink-50" @click="toggleBlock(m)">
                        <Icon :name="m.status === 'blocked' ? 'unlock' : 'ban'" :size="16" />
                        {{ m.status === 'blocked' ? 'Разблокировать' : 'Заблокировать' }}
                      </button>
                      <div class="h-px bg-ink-100 my-1" />
                      <button class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50" @click="removeMember(m)">
                        <Icon name="trash" :size="16" /> Удалить
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="loading" class="text-center py-12 text-ink-400">
          <Icon name="loader" :size="20" class="animate-spin inline-block" />
          <p class="mt-2 text-sm">Загружаем сотрудников…</p>
        </div>
        <div v-else-if="!members.length" class="text-center py-12 px-6">
          <p class="font-bold text-ink-900">Сотрудников пока нет</p>
          <p class="text-sm text-ink-400 mt-1 max-w-md mx-auto">
            Добавьте сотрудника с номером телефона — и он сможет создавать карточки прямо
            в Telegram через @coolay_bot, без пароля и входа на сайт.
          </p>
          <button class="btn btn-accent btn-md mt-4" @click="openAdd">
            <Icon name="userPlus" :size="18" /> Добавить сотрудника
          </button>
        </div>
        <div v-else-if="!filteredMembers.length" class="text-center py-12 text-ink-400">
          Ничего не найдено
        </div>
      </div>
      <p v-if="listError" class="text-sm text-red-600">{{ listError }}</p>
      <p class="text-xs text-ink-400">
        Владельца нельзя заблокировать или удалить. Заблокированные сотрудники не могут входить
        и создавать генерации — ни на сайте, ни через бота.
      </p>
    </div>

    <!-- Workspace -->
    <div v-else-if="tab === 'workspace'" class="card p-6 space-y-5 max-w-3xl">
      <h3 class="font-bold text-ink-900">Стиль бренда</h3>
      <div>
        <label class="label">Акцентный цвет бренда</label>
        <div class="flex items-center gap-3">
          <span class="w-10 h-10 rounded-xl bg-accent border border-ink-200" />
          <input value="#E7FE17" class="input max-w-[160px] font-mono" />
        </div>
      </div>
      <div>
        <label class="label">Маркетплейсы по умолчанию</label>
        <div class="flex flex-wrap gap-2">
          <span class="chip bg-ink-900 text-accent">Wildberries <Icon name="x" :size="12" /></span>
          <span class="chip bg-ink-900 text-accent">Ozon <Icon name="x" :size="12" /></span>
          <button class="chip bg-ink-50 text-ink-500 hover:bg-ink-100"><Icon name="plus" :size="12" /> Добавить</button>
        </div>
      </div>
    </div>

    <!-- Billing -->
    <div v-else class="space-y-4 max-w-3xl">
      <div class="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="chip bg-accent text-ink-900 mb-2"><Icon name="crown" :size="13" /> Текущий тариф</div>
          <h3 class="text-xl font-extrabold text-ink-900">Business</h3>
          <p class="text-ink-400 text-sm">1000 кредитов в месяц · до 5 участников</p>
        </div>
        <button class="btn btn-dark btn-md">Изменить тариф</button>
      </div>
      <RouterLink to="/usage" class="card p-5 flex items-center justify-between gap-3 hover:border-ink-200">
        <div>
          <p class="text-sm font-bold text-ink-900">Журнал списаний</p>
          <p class="text-xs text-ink-400 mt-0.5">Сколько кредит-токенов ушло и на какую операцию</p>
        </div>
        <Icon name="arrowRight" :size="16" class="text-ink-400" />
      </RouterLink>
    </div>

    <!-- Add / edit modal -->
    <UserModal
      v-if="modalOpen"
      :member="editing"
      :saving="saving"
      :server-error="modalError"
      @close="modalOpen = false"
      @save="saveMember"
    />
  </div>
</template>
