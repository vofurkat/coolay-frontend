<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sadminApi, isFail, type SadminStats, type SadminClientRow, type UsageLogItem } from '@/data/platformApi'

const stats = ref<SadminStats | null>(null)
const recentClients = ref<SadminClientRow[]>([])
const recentUsage = ref<UsageLogItem[]>([])
const error = ref('')

onMounted(async () => {
  const res = await sadminApi.stats()
  if (isFail(res)) { error.value = res.error; return }
  stats.value = res.stats
  recentClients.value = res.recentClients
  recentUsage.value = res.recentUsage
})
const fmt = (s: string) => new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>
<template>
  <div>
    <h1 class="text-2xl font-extrabold text-ink-900 mb-6">Обзор платформы</h1>
    <div v-if="error" class="rounded-xl bg-red-50 text-red-600 px-4 py-3 mb-4">{{ error }}</div>
    <div v-if="stats" class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <div class="card p-5"><div class="text-3xl font-extrabold text-ink-900">{{ stats.clients }}</div><div class="text-sm text-ink-400">Клиентов ({{ stats.clientsActive }} активных)</div></div>
      <div class="card p-5"><div class="text-3xl font-extrabold text-ink-900">+{{ stats.clientsNew7d }}</div><div class="text-sm text-ink-400">Новых за 7 дней</div></div>
      <div class="card p-5"><div class="text-3xl font-extrabold text-ink-900">{{ stats.creditsUsed30d }}</div><div class="text-sm text-ink-400">Кредитов за 30 дней ({{ stats.generations30d }} генераций)</div></div>
      <div class="card p-5"><div class="text-3xl font-extrabold text-ink-900">{{ stats.systemTemplates }}</div><div class="text-sm text-ink-400">Системных шаблонов</div></div>
    </div>
    <div class="grid lg:grid-cols-2 gap-6">
      <div class="card p-5">
        <h2 class="font-bold text-ink-900 mb-3">Недавние клиенты</h2>
        <RouterLink v-for="c in recentClients" :key="c.id" :to="`/sadmin/clients/${c.id}`" class="flex items-center justify-between py-2.5 border-b border-ink-50 last:border-0 hover:bg-ink-50 -mx-2 px-2 rounded-lg">
          <div><div class="text-sm font-bold text-ink-900">{{ c.name }}</div><div class="text-xs text-ink-400">{{ c.email }}</div></div>
          <span class="chip" :class="c.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'">{{ c.planLabel }}</span>
        </RouterLink>
        <div v-if="!recentClients.length" class="text-sm text-ink-400 py-4 text-center">Пока нет клиентов</div>
      </div>
      <div class="card p-5">
        <h2 class="font-bold text-ink-900 mb-3">Последние списания</h2>
        <div v-for="u in recentUsage" :key="u.id" class="flex items-center justify-between py-2.5 border-b border-ink-50 last:border-0 text-sm">
          <span class="text-ink-700">{{ u.tool }}</span>
          <span class="text-ink-400 text-xs">{{ fmt(u.at) }} · −{{ u.credits }} кр.</span>
        </div>
        <div v-if="!recentUsage.length" class="text-sm text-ink-400 py-4 text-center">Списаний ещё не было</div>
      </div>
    </div>
  </div>
</template>
