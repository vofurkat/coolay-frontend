<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import { useUsageStore } from '@/stores/usage'
import { usageToolLabel } from '@/data/platformApi'

const store = useUsageStore()
const filter = ref('')

onMounted(() => {
  store.load()
  store.loadLog(true)
})

const SOURCE_LABEL: Record<string, string> = {
  web: 'Веб',
  app: 'Приложение',
  telegram: 'Telegram',
}

const list = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return store.log
  return store.log.filter((u) => {
    const label = usageToolLabel(u.tool).toLowerCase()
    return (
      label.includes(q) ||
      u.tool.toLowerCase().includes(q) ||
      (u.source || '').toLowerCase().includes(q)
    )
  })
})

const spentOnPage = computed(() => list.value.reduce((sum, u) => sum + (u.credits || 0), 0))

function fmt(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="page space-y-6 animate-fade-in">
    <PageHeader
      title="Журнал списаний"
      subtitle="Сколько кредит-токенов ушло и на какую операцию"
    >
      <template #actions>
        <button
          class="btn h-9 px-3.5 border border-ink-200 text-ink-700 hover:bg-ink-50 text-xs font-semibold"
          :disabled="store.logLoading"
          @click="store.loadLog(true)"
        >
          <Icon name="refresh" :size="14" />
          Обновить
        </button>
      </template>
    </PageHeader>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="card p-4">
        <p class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Осталось</p>
        <p class="mt-1 text-2xl font-extrabold text-ink-900 tabular-nums">
          {{ (store.usage?.left ?? 0).toLocaleString('ru-RU') }}
          <span class="text-sm font-semibold text-ink-300">
            / {{ (store.usage?.limit ?? 0).toLocaleString('ru-RU') }}
          </span>
        </p>
      </div>
      <div class="card p-4">
        <p class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Потрачено за период</p>
        <p class="mt-1 text-2xl font-extrabold text-ink-900 tabular-nums">
          {{ (store.usage?.used ?? 0).toLocaleString('ru-RU') }}
        </p>
      </div>
      <div class="card p-4">
        <p class="text-[11px] font-bold text-ink-400 uppercase tracking-wide">Записей в журнале</p>
        <p class="mt-1 text-2xl font-extrabold text-ink-900 tabular-nums">
          {{ store.logTotal.toLocaleString('ru-RU') }}
        </p>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-ink-100">
        <div class="relative flex-1 min-w-0">
          <Icon
            name="search"
            :size="14"
            class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300"
          />
          <input
            v-model="filter"
            type="search"
            placeholder="Поиск по операции…"
            class="w-full h-10 pl-9 pr-3 rounded-xl border border-ink-200 text-sm outline-none focus:border-brand-400"
          />
        </div>
        <p class="text-xs text-ink-400 shrink-0">
          На экране −{{ spentOnPage }} кредитов
        </p>
      </div>

      <div v-if="store.logError" class="px-4 py-3 text-sm text-rose-600 bg-rose-50">
        {{ store.logError }}
      </div>

      <div v-else-if="store.logLoading && !store.log.length" class="p-10 text-center text-ink-400 text-sm">
        Загружаем журнал…
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[11px] font-bold uppercase tracking-wide text-ink-400 border-b border-ink-100">
              <th class="px-4 py-3">Когда</th>
              <th class="px-4 py-3">Операция</th>
              <th class="px-4 py-3">Источник</th>
              <th class="px-4 py-3 text-right">Кредиты</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="u in list"
              :key="u.id"
              class="border-b border-ink-50 last:border-0 hover:bg-ink-50/60"
            >
              <td class="px-4 py-3 text-ink-400 whitespace-nowrap">{{ fmt(u.at) }}</td>
              <td class="px-4 py-3">
                <p class="font-semibold text-ink-900">{{ usageToolLabel(u.tool) }}</p>
                <p v-if="usageToolLabel(u.tool) !== u.tool" class="text-[11px] text-ink-300 font-mono">
                  {{ u.tool }}
                </p>
              </td>
              <td class="px-4 py-3 text-ink-500">{{ SOURCE_LABEL[u.source] || u.source || '—' }}</td>
              <td class="px-4 py-3 text-right font-extrabold text-rose-600 tabular-nums">
                −{{ u.credits }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!list.length" class="text-sm text-ink-400 py-12 text-center">
          Списаний ещё не было
        </div>
      </div>
    </div>
  </div>
</template>
