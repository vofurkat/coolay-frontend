<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { sadminApi, isFail, type SadminLogItem } from '@/data/platformApi'
const log = ref<SadminLogItem[]>([])
const error = ref('')
onMounted(async () => {
  const res = await sadminApi.log(200)
  if (isFail(res)) { error.value = res.error; return }
  log.value = res.log
})
const fmt = (s: string) => new Date(s).toLocaleString('ru-RU')
</script>
<template>
  <div>
    <h1 class="text-2xl font-extrabold text-ink-900 mb-6">Журнал действий администраторов</h1>
    <div v-if="error" class="rounded-xl bg-red-50 text-red-600 px-4 py-3 mb-4">{{ error }}</div>
    <div class="card overflow-x-auto">
      <table class="w-full text-sm">
        <thead><tr class="text-left text-xs text-ink-400 border-b border-ink-100">
          <th class="p-3">Когда</th><th class="p-3">Админ</th><th class="p-3">Действие</th><th class="p-3">Детали</th>
        </tr></thead>
        <tbody>
          <tr v-for="l in log" :key="l.id" class="border-b border-ink-50">
            <td class="p-3 text-ink-400 whitespace-nowrap">{{ fmt(l.at) }}</td>
            <td class="p-3 font-medium text-ink-900">{{ l.adminLogin }}</td>
            <td class="p-3"><span class="chip bg-ink-50 text-ink-700">{{ l.action }}</span></td>
            <td class="p-3 text-ink-500">{{ l.details || l.target || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!log.length" class="text-sm text-ink-400 py-8 text-center">Журнал пуст</div>
    </div>
  </div>
</template>
