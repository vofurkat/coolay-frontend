<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sadminApi, isFail, type SadminClientRow } from '@/data/platformApi'

const clients = ref<SadminClientRow[]>([])
const q = ref('')
const error = ref('')
async function loadList() {
  const res = await sadminApi.clients(q.value)
  if (isFail(res)) { error.value = res.error; return }
  clients.value = res.clients
}
onMounted(loadList)
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString('ru-RU') : '—')
</script>
<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-extrabold text-ink-900">Клиенты</h1>
      <input v-model="q" @input="loadList" type="search" class="input max-w-xs" placeholder="Поиск по имени или email…" />
    </div>
    <div v-if="error" class="rounded-xl bg-red-50 text-red-600 px-4 py-3 mb-4">{{ error }}</div>
    <div class="card overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-xs text-ink-400 border-b border-ink-100">
          <th class="p-3">Клиент</th><th class="p-3">Тариф</th><th class="p-3">Кредиты</th><th class="p-3">Статус</th><th class="p-3">Регистрация</th><th class="p-3">Активность</th>
        </tr></thead>
        <tbody>
          <tr v-for="c in clients" :key="c.id" class="border-b border-ink-50 hover:bg-ink-50 cursor-pointer" @click="$router.push(`/sadmin/clients/${c.id}`)">
            <td class="p-3"><div class="font-bold text-ink-900">{{ c.name }}</div><div class="text-xs text-ink-400">{{ c.email }}</div></td>
            <td class="p-3">{{ c.planLabel }}</td>
            <td class="p-3">{{ c.credits.left }} / {{ c.credits.limit }}</td>
            <td class="p-3"><span class="chip" :class="c.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'">{{ c.status === 'active' ? 'Активен' : 'Заблокирован' }}</span></td>
            <td class="p-3 text-ink-400">{{ fmt(c.createdAt) }}</td>
            <td class="p-3 text-ink-400">{{ fmt(c.lastActiveAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!clients.length" class="text-sm text-ink-400 py-8 text-center">Клиентов не найдено</div>
    </div>
  </div>
</template>
