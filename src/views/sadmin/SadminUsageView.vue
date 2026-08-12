<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sadminApi, isFail, type UsageLogItem } from '@/data/platformApi'
const usage = ref<UsageLogItem[]>([])
const total = ref(0)
const error = ref('')
onMounted(async () => {
  const res = await sadminApi.usage('', 200)
  if (isFail(res)) { error.value = res.error; return }
  usage.value = res.usage
  total.value = res.total
})
const fmt = (s: string) => new Date(s).toLocaleString('ru-RU')
</script>
<template>
  <div>
    <h1 class="text-2xl font-extrabold text-ink-900 mb-1">Списания кредитов</h1>
    <p class="text-sm text-ink-400 mb-6">Всего записей: {{ total }} (показаны последние 200)</p>
    <div v-if="error" class="rounded-xl bg-red-50 text-red-600 px-4 py-3 mb-4">{{ error }}</div>
    <div class="card overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-xs text-ink-400 border-b border-ink-100">
          <th class="p-3">Когда</th><th class="p-3">Клиент</th><th class="p-3">Инструмент</th><th class="p-3">Источник</th><th class="p-3 text-right">Кредиты</th>
        </tr></thead>
        <tbody>
          <tr v-for="u in usage" :key="u.id" class="border-b border-ink-50">
            <td class="p-3 text-ink-400">{{ fmt(u.at) }}</td>
            <td class="p-3 font-medium text-ink-900">{{ u.clientName }}</td>
            <td class="p-3">{{ u.tool }}</td>
            <td class="p-3 text-ink-400">{{ u.source }}</td>
            <td class="p-3 text-right font-bold text-red-600">−{{ u.credits }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!usage.length" class="text-sm text-ink-400 py-8 text-center">Списаний ещё не было</div>
    </div>
  </div>
</template>
