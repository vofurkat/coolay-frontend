<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute, RouterLink, RouterView } from 'vue-router'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ListOrdered,
  Layers,
  ShieldCheck,
  ScrollText,
  LogOut,
  Menu,
  X,
} from '@lucide/vue'
import { sadminApi, isFail, type SadminUser } from '@/data/platformApi'
import Logo from '@/components/ui/Logo.vue'

const router = useRouter()
const route = useRoute()
const admin = ref<SadminUser | null>(null)
const checking = ref(true)
const mobileOpen = ref(false)

onMounted(async () => {
  const res = await sadminApi.me()
  checking.value = false
  if (isFail(res)) {
    router.replace({ name: 'sadmin-login' })
    return
  }
  admin.value = res.admin
})

async function logout() {
  await sadminApi.logout()
  router.replace({ name: 'sadmin-login' })
}

/**
 * Меню сгруппировано по смыслу: сначала то, куда админ ходит каждый день
 * (клиенты, деньги), потом контент, потом редкие системные разделы.
 */
const sections = [
  {
    title: '',
    items: [{ to: '/sadmin', label: 'Обзор', icon: LayoutDashboard, exact: true }],
  },
  {
    title: 'Клиенты и биллинг',
    items: [
      { to: '/sadmin/clients', label: 'Клиенты', icon: Users },
      { to: '/sadmin/plans', label: 'Тарифы', icon: CreditCard },
      { to: '/sadmin/usage', label: 'Списания', icon: ListOrdered },
    ],
  },
  {
    title: 'Контент',
    items: [{ to: '/sadmin/templates', label: 'Системные шаблоны', icon: Layers }],
  },
  {
    title: 'Система',
    items: [
      { to: '/sadmin/admins', label: 'Администраторы', icon: ShieldCheck },
      { to: '/sadmin/log', label: 'Журнал действий', icon: ScrollText },
    ],
  },
]

function isActive(item: { to: string; exact?: boolean }) {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to)
}

const initials = computed(() =>
  (admin.value?.name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase(),
)
</script>

<template>
  <div v-if="checking" class="min-h-screen grid place-items-center bg-ink-50">
    <div class="flex items-center gap-3 text-ink-400">
      <svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
      </svg>
      Проверка доступа…
    </div>
  </div>

  <div v-else-if="admin" class="min-h-screen flex bg-ink-50">
    <!-- Mobile overlay -->
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-30 bg-ink-900/50 lg:hidden"
      @click="mobileOpen = false"
    />

    <!-- Sidebar -->
    <aside
      class="fixed lg:static inset-y-0 left-0 z-40 w-[264px] shrink-0 bg-ink-900 text-white flex flex-col transition-transform lg:translate-x-0"
      :class="mobileOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="px-5 py-5 flex items-center gap-2.5 border-b border-white/[0.07]">
        <Logo dark />
        <span
          class="text-[10px] font-extrabold uppercase tracking-widest bg-accent text-ink-900 rounded-md px-2 py-1"
        >
          Admin
        </span>
        <button
          type="button"
          class="ml-auto lg:hidden text-white/50 hover:text-white"
          @click="mobileOpen = false"
        >
          <X :size="20" />
        </button>
      </div>

      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <div v-for="sec in sections" :key="sec.title || 'top'">
          <div
            v-if="sec.title"
            class="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/30"
          >
            {{ sec.title }}
          </div>
          <div class="space-y-0.5">
            <RouterLink
              v-for="item in sec.items"
              :key="item.to"
              :to="item.to"
              class="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors"
              :class="
                isActive(item)
                  ? 'bg-accent text-ink-900 font-bold shadow-lg shadow-accent/20'
                  : 'text-white/55 hover:text-white hover:bg-white/[0.06]'
              "
              @click="mobileOpen = false"
            >
              <component
                :is="item.icon"
                :size="18"
                :stroke-width="isActive(item) ? 2.2 : 1.8"
                class="shrink-0"
                :class="isActive(item) ? 'text-ink-900' : 'text-white/40 group-hover:text-white/80'"
              />
              {{ item.label }}
            </RouterLink>
          </div>
        </div>
      </nav>

      <div class="p-3 border-t border-white/[0.07]">
        <div class="flex items-center gap-3 px-2 py-2">
          <span
            class="grid place-items-center w-9 h-9 rounded-full bg-accent/15 text-accent text-xs font-extrabold shrink-0"
          >
            {{ initials }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-bold truncate">{{ admin.name }}</div>
            <div class="text-[11px] text-white/35 truncate">{{ admin.login }}</div>
          </div>
          <button
            type="button"
            class="grid place-items-center w-9 h-9 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.08] transition"
            title="Выйти"
            @click="logout"
          >
            <LogOut :size="17" :stroke-width="1.8" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <div class="flex-1 min-w-0 flex flex-col">
      <!-- Mobile topbar -->
      <div class="lg:hidden sticky top-0 z-20 flex items-center gap-3 bg-white border-b border-ink-100 px-4 py-3">
        <button type="button" class="text-ink-500" @click="mobileOpen = true">
          <Menu :size="22" />
        </button>
        <span class="font-bold text-ink-900">Coolay Admin</span>
      </div>
      <main class="flex-1 p-5 lg:p-8 overflow-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>
