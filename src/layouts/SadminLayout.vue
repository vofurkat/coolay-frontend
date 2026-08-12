<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, RouterLink, RouterView } from 'vue-router'
import { sadminApi, isFail, type SadminUser } from '@/data/platformApi'
import Logo from '@/components/ui/Logo.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const admin = ref<SadminUser | null>(null)
const checking = ref(true)

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

const nav = [
  { to: '/sadmin', label: 'Обзор', icon: 'layout', exact: true },
  { to: '/sadmin/clients', label: 'Клиенты', icon: 'users' },
  { to: '/sadmin/plans', label: 'Тарифы', icon: 'store' },
  { to: '/sadmin/usage', label: 'Списания', icon: 'list' },
  { to: '/sadmin/templates', label: 'Системные шаблоны', icon: 'layout' },
  { to: '/sadmin/admins', label: 'Администраторы', icon: 'user' },
  { to: '/sadmin/log', label: 'Журнал', icon: 'list' },
]
</script>

<template>
  <div v-if="checking" class="min-h-screen grid place-items-center text-ink-400">Проверка доступа…</div>
  <div v-else-if="admin" class="min-h-screen flex bg-ink-50">
    <aside class="w-64 shrink-0 bg-ink-900 text-white flex flex-col">
      <div class="p-5 border-b border-white/10 flex items-center gap-2">
        <Logo dark />
        <span class="text-[10px] font-bold uppercase tracking-wider bg-accent text-ink-900 rounded px-1.5 py-0.5">admin</span>
      </div>
      <nav class="flex-1 p-3 space-y-1">
        <RouterLink
          v-for="n in nav" :key="n.to" :to="n.to"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/[0.06] transition"
          :class="{ 'bg-white/[0.1] !text-white': n.exact ? $route.path === n.to : $route.path.startsWith(n.to) }"
        >
          <Icon :name="n.icon" :size="17" /> {{ n.label }}
        </RouterLink>
      </nav>
      <div class="p-4 border-t border-white/10">
        <div class="text-sm font-bold">{{ admin.name }}</div>
        <div class="text-xs text-white/40 mb-3">{{ admin.login }}</div>
        <button class="btn btn-outline btn-sm w-full !border-white/20 !text-white/70 hover:!text-white" @click="logout">Выйти</button>
      </div>
    </aside>
    <main class="flex-1 min-w-0 p-6 lg:p-8 overflow-auto">
      <RouterView />
    </main>
  </div>
</template>
