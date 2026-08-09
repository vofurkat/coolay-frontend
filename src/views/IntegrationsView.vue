<script setup lang="ts">
import { ref, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import { erpIntegrations } from '@/data/mock'
import type { IntegrationCategory } from '@/types'
import TelegramBotPanel from '@/components/integrations/TelegramBotPanel.vue'

const items = ref([...erpIntegrations])

const filter = ref<'all' | IntegrationCategory>('all')

const categories = [
  { key: 'all', label: 'Все', icon: 'grid' },
  { key: 'erp', label: 'ERP и маркетплейсы', icon: 'store' },
  { key: 'telegram', label: 'Telegram-бот', icon: 'telegram' },
  { key: 'whatsapp', label: 'WhatsApp-бот', icon: 'whatsapp' },
] as const

// Цвет «логотипа» в зависимости от категории
const catLogoCls: Record<IntegrationCategory, string> = {
  erp: 'bg-ink-100 text-ink-600',
  telegram: 'bg-sky-100 text-sky-600',
  whatsapp: 'bg-green-100 text-green-600',
}

const list = computed(() =>
  filter.value === 'all' ? items.value : items.value.filter((i) => i.category === filter.value),
)

function countOf(cat: 'all' | IntegrationCategory) {
  return cat === 'all' ? items.value.length : items.value.filter((i) => i.category === cat).length
}

const connectedCount = computed(() => items.value.filter((i) => i.connected).length)

function toggle(id: string) {
  const it = items.value.find((i) => i.id === id)
  if (it) it.connected = !it.connected
}
</script>

<template>
  <div class="page space-y-6 animate-fade-in">
    <PageHeader
      title="Интеграции"
      subtitle="Подключите ERP, Telegram- и WhatsApp-ботов для работы с каталогом и генерациями"
    >
      <template #actions>
        <span class="chip bg-ink-50 text-ink-600">
          <span class="w-2 h-2 rounded-full bg-green-500" />
          Активно: {{ connectedCount }}
        </span>
      </template>
    </PageHeader>

    <!-- Highlight -->
    <div class="relative overflow-hidden rounded-2xl bg-ink-900 p-6">
      <div class="absolute -top-12 -right-8 w-56 h-56 rounded-full bg-accent/15 blur-3xl" />
      <div class="relative flex items-start gap-4">
        <div class="grid place-items-center w-12 h-12 rounded-xl bg-accent text-ink-900 shrink-0">
          <Icon name="bolt" :size="24" />
        </div>
        <div>
          <h3 class="text-lg font-extrabold text-white">Главное отличие Coolay</h3>
          <p class="text-white/50 text-sm mt-1 max-w-xl">
            В отличие от аналогов, мы работаем напрямую с вашей ERP, а также принимаем заявки
            из Telegram и WhatsApp. Товары подтягиваются автоматически, а готовые карточки
            возвращаются в систему и боты.
          </p>
        </div>
      </div>
    </div>

    <!-- Category filter -->
    <div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
      <button
        v-for="c in categories"
        :key="c.key"
        @click="filter = c.key"
        class="btn btn-sm whitespace-nowrap"
        :class="filter === c.key ? 'btn-dark' : 'btn-outline'"
      >
        <Icon :name="c.icon" :size="16" /> {{ c.label }}
        <span
          class="ml-1 inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold"
          :class="filter === c.key ? 'bg-accent text-ink-900' : 'bg-ink-100 text-ink-500'"
        >
          {{ countOf(c.key) }}
        </span>
      </button>
    </div>

    <!-- Telegram-бот: токен + сотрудники -->
    <TelegramBotPanel v-if="filter === 'telegram'" />

    <!-- List -->
    <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="erp in list" :key="erp.id" class="card p-5 flex flex-col">
        <div class="flex items-start gap-4">
          <div
            class="grid place-items-center w-14 h-14 rounded-xl font-extrabold text-lg shrink-0"
            :class="erp.connected ? 'bg-accent text-ink-900' : catLogoCls[erp.category]"
          >
            {{ erp.logo }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-bold text-ink-900">{{ erp.name }}</h3>
              <span v-if="erp.connected" class="chip bg-green-50 text-green-600 text-[10px]">
                <Icon name="check" :size="11" /> Подключено
              </span>
            </div>
            <p class="text-sm text-ink-400 mt-0.5">{{ erp.description }}</p>
            <p v-if="erp.connected && erp.productsSynced" class="text-xs text-ink-500 font-semibold mt-2">
              <Icon name="box" :size="13" class="inline" /> {{ erp.productsSynced.toLocaleString('ru') }} товаров синхронизировано
            </p>
          </div>
        </div>
        <button
          v-if="erp.category === 'telegram'"
          class="btn btn-md w-full mt-4 btn-dark"
          @click="filter = 'telegram'"
        >
          <Icon name="settings" :size="16" /> Настроить бота
        </button>
        <button
          v-else
          class="btn btn-md w-full mt-4"
          :class="erp.connected ? 'btn-outline' : 'btn-dark'"
          @click="toggle(erp.id)"
        >
          {{ erp.connected ? 'Отключить' : 'Подключить' }}
        </button>
      </div>
    </div>

    <div v-if="list.length === 0" class="card p-10 text-center text-ink-400">
      В этой категории пока нет интеграций
    </div>
  </div>
</template>
