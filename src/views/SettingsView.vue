<script setup lang="ts">
import { ref, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'
import UserModal from '@/components/settings/UserModal.vue'
import { useAuthStore } from '@/stores/auth'
import { teamMembers } from '@/data/mock'
import { sourceMeta } from '@/data/sources'
import type { TeamMember, MemberRole, MemberStatus } from '@/types'

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

/* ---------- Пользователи ---------- */
const members = ref<TeamMember[]>([...teamMembers])

const search = ref('')
const filteredMembers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return members.value
  return members.value.filter(
    (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
  )
})

const activeCount = computed(() => members.value.filter((m) => m.status === 'active').length)
const blockedCount = computed(() => members.value.filter((m) => m.status === 'blocked').length)

const roleMeta: Record<MemberRole, { label: string; cls: string }> = {
  owner: { label: 'Владелец', cls: 'bg-accent text-ink-900' },
  admin: { label: 'Администратор', cls: 'bg-ink-900 text-accent' },
  editor: { label: 'Редактор', cls: 'bg-ink-100 text-ink-700' },
  viewer: { label: 'Наблюдатель', cls: 'bg-ink-50 text-ink-500' },
}

const statusMeta: Record<MemberStatus, { label: string; cls: string; dot: string }> = {
  active: { label: 'Активен', cls: 'bg-green-50 text-green-600', dot: 'bg-green-500' },
  blocked: { label: 'Заблокирован', cls: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
  invited: { label: 'Приглашён', cls: 'bg-amber-50 text-amber-600', dot: 'bg-amber-500' },
}

const modalOpen = ref(false)
const editing = ref<TeamMember | null>(null)
const menuFor = ref<string | null>(null)

function openAdd() {
  editing.value = null
  modalOpen.value = true
}
function openEdit(m: TeamMember) {
  menuFor.value = null
  editing.value = m
  modalOpen.value = true
}
function saveMember(m: TeamMember) {
  const idx = members.value.findIndex((x) => x.id === m.id)
  if (idx >= 0) members.value[idx] = m
  else members.value.unshift(m)
  modalOpen.value = false
}
function toggleBlock(m: TeamMember) {
  menuFor.value = null
  if (m.role === 'owner') return
  m.status = m.status === 'blocked' ? 'active' : 'blocked'
}
function removeMember(m: TeamMember) {
  menuFor.value = null
  if (m.role === 'owner') return
  members.value = members.value.filter((x) => x.id !== m.id)
}

function fmt(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6 animate-fade-in">
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
        </div>
        <div class="relative sm:ml-auto sm:w-64">
          <Icon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input v-model="search" class="input pl-9" placeholder="Поиск по имени или email" />
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
                <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Роль</th>
                <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Устройство</th>
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
                    <Avatar :name="m.name" :size="36" />
                    <div class="min-w-0">
                      <p class="font-bold text-ink-900 whitespace-nowrap">{{ m.name }}</p>
                      <p class="text-xs text-ink-400 truncate">{{ m.email }}</p>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span class="chip whitespace-nowrap" :class="roleMeta[m.role].cls">{{ roleMeta[m.role].label }}</span>
                </td>
                <td class="px-4 py-3">
                  <span class="chip bg-ink-50 text-ink-600 whitespace-nowrap">
                    <Icon :name="sourceMeta[m.source].icon" :size="14" /> {{ sourceMeta[m.source].label }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <span class="chip whitespace-nowrap" :class="statusMeta[m.status].cls">
                    <span class="w-1.5 h-1.5 rounded-full" :class="statusMeta[m.status].dot" />
                    {{ statusMeta[m.status].label }}
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
        <div v-if="filteredMembers.length === 0" class="text-center py-12 text-ink-400">Ничего не найдено</div>
      </div>
      <p class="text-xs text-ink-400">
        Владельца нельзя заблокировать или удалить. Заблокированные пользователи не могут входить и создавать генерации.
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
    </div>

    <!-- Add / edit modal -->
    <UserModal v-if="modalOpen" :member="editing" @close="modalOpen = false" @save="saveMember" />
  </div>
</template>
