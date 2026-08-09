<script setup lang="ts">
import { ref, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import GenerationCard from '@/components/ui/GenerationCard.vue'
import Avatar from '@/components/ui/Avatar.vue'
import Icon from '@/components/ui/Icon.vue'
import SimilarModal from '@/components/tool/SimilarModal.vue'
import { useGenerationsStore } from '@/stores/generations'
import { sourceMeta } from '@/data/sources'
import { uniquenessMeta, isDuplicate, DUPLICATE_THRESHOLD } from '@/data/similarity'
import type { DeviceSource, Generation } from '@/types'

const gens = useGenerationsStore()

const filter = ref<'all' | 'completed' | 'processing' | 'failed'>('all')
const sourceFilter = ref<'all' | DeviceSource>('all')
const uniqFilter = ref<'all' | 'unique' | 'duplicate'>('all')
const view = ref<'grid' | 'table'>('table')

const selectedGen = ref<Generation | null>(null)
const lightbox = ref<Generation | null>(null)

const filters = [
  { key: 'all', label: 'Все' },
  { key: 'completed', label: 'Готовые' },
  { key: 'processing', label: 'В работе' },
  { key: 'failed', label: 'Ошибки' },
] as const

const sourceFilters = [
  { key: 'all', label: 'Все устройства', icon: 'grid' },
  { key: 'web', label: 'Веб', icon: 'monitor' },
  { key: 'app', label: 'Приложение', icon: 'smartphone' },
  { key: 'telegram', label: 'Telegram', icon: 'telegram' },
] as const

const list = computed(() =>
  gens.recent.filter((g) => {
    const byStatus = filter.value === 'all' || g.status === filter.value
    const bySource = sourceFilter.value === 'all' || g.source === sourceFilter.value
    const byUniq =
      uniqFilter.value === 'all' ||
      (uniqFilter.value === 'duplicate' ? isDuplicate(g.similarity) : !isDuplicate(g.similarity))
    return byStatus && bySource && byUniq
  }),
)

const duplicateCount = computed(() => gens.duplicatesCount)

const statusMap: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Готово', cls: 'bg-green-50 text-green-600' },
  processing: { label: 'В работе', cls: 'bg-accent/20 text-accent-700' },
  failed: { label: 'Ошибка', cls: 'bg-red-50 text-red-600' },
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('ru', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="page space-y-6 animate-fade-in">
    <PageHeader title="История генераций" subtitle="Все созданные изображения — кто, чем и с какого устройства">
      <template #actions>
        <div class="flex items-center rounded-xl border border-ink-200 bg-white p-0.5">
          <button
            class="grid place-items-center w-9 h-9 rounded-lg transition"
            :class="view === 'table' ? 'bg-ink-900 text-accent' : 'text-ink-400 hover:text-ink-900'"
            @click="view = 'table'"
          >
            <Icon name="layers" :size="18" />
          </button>
          <button
            class="grid place-items-center w-9 h-9 rounded-lg transition"
            :class="view === 'grid' ? 'bg-ink-900 text-accent' : 'text-ink-400 hover:text-ink-900'"
            @click="view = 'grid'"
          >
            <Icon name="grid" :size="18" />
          </button>
        </div>
        <button v-if="gens.hasData" class="btn btn-outline btn-md"><Icon name="download" :size="18" /> Экспорт</button>
      </template>
    </PageHeader>

    <!-- Empty state -->
    <div v-if="!gens.hasData" class="card p-10 sm:p-16 text-center">
      <div class="grid place-items-center w-16 h-16 rounded-2xl bg-ink-50 text-ink-300 mx-auto mb-4">
        <Icon name="clock" :size="30" />
      </div>
      <h2 class="text-xl font-extrabold text-ink-900">История пуста</h2>
      <p class="text-ink-400 mt-2 max-w-md mx-auto">
        Здесь будут все созданные генерации с информацией о том, кто и с какого устройства
        их создал, а также проверкой уникальности товара.
      </p>
      <RouterLink to="/tools" class="btn btn-accent btn-lg mt-6 inline-flex">
        <Icon name="sparkles" :size="18" /> Создать генерацию
      </RouterLink>
    </div>

    <!-- Filters -->
    <div v-if="gens.hasData" class="flex flex-col sm:flex-row sm:items-center gap-3">
      <div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          v-for="f in filters"
          :key="f.key"
          @click="filter = f.key"
          class="btn btn-sm whitespace-nowrap"
          :class="filter === f.key ? 'btn-dark' : 'btn-outline'"
        >
          {{ f.label }}
        </button>
      </div>
      <div class="hidden sm:block w-px h-6 bg-ink-200" />
      <div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          v-for="s in sourceFilters"
          :key="s.key"
          @click="sourceFilter = s.key"
          class="btn btn-sm whitespace-nowrap"
          :class="sourceFilter === s.key ? 'btn-dark' : 'btn-outline'"
        >
          <Icon :name="s.icon" :size="15" /> {{ s.label }}
        </button>
      </div>
      <div class="hidden sm:block w-px h-6 bg-ink-200" />
      <div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          @click="uniqFilter = 'all'"
          class="btn btn-sm whitespace-nowrap"
          :class="uniqFilter === 'all' ? 'btn-dark' : 'btn-outline'"
        >
          Все
        </button>
        <button
          @click="uniqFilter = 'unique'"
          class="btn btn-sm whitespace-nowrap"
          :class="uniqFilter === 'unique' ? 'btn-dark' : 'btn-outline'"
        >
          Уникальные
        </button>
        <button
          @click="uniqFilter = 'duplicate'"
          class="btn btn-sm whitespace-nowrap"
          :class="uniqFilter === 'duplicate' ? 'btn-dark' : 'btn-outline'"
        >
          Дубликаты
        </button>
      </div>
    </div>

    <!-- Duplicate warning banner -->
    <div
      v-if="gens.hasData && duplicateCount > 0"
      class="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3"
    >
      <span class="grid place-items-center w-9 h-9 rounded-xl bg-red-100 text-red-600 shrink-0">
        <Icon name="layers" :size="18" />
      </span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-ink-900">Найдено возможных дубликатов: {{ duplicateCount }}</p>
        <p class="text-xs text-ink-500">Схожесть с ранее загруженными товарами выше {{ DUPLICATE_THRESHOLD }}%. Проверьте, чтобы не загружать повторно.</p>
      </div>
      <button class="btn btn-outline btn-sm shrink-0" @click="uniqFilter = 'duplicate'">Показать</button>
    </div>

    <!-- Table view -->
    <div v-if="gens.hasData && view === 'table'" class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-ink-100 bg-ink-50/60">
              <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Генерация</th>
              <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Автор</th>
              <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Устройство</th>
              <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Уникальность</th>
              <th class="text-left font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Статус</th>
              <th class="text-right font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Кредиты</th>
              <th class="text-right font-bold text-ink-500 text-xs uppercase tracking-wide px-4 py-3">Дата</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="g in list"
              :key="g.id"
              class="border-b border-ink-50 hover:bg-ink-50/60 transition group"
            >
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <button
                    class="relative w-10 h-12 rounded-lg overflow-hidden shrink-0 group/img ring-0 hover:ring-2 hover:ring-accent transition"
                    @click="lightbox = g"
                    title="Открыть фото"
                  >
                    <img :src="g.thumbnail" :alt="g.toolTitle" class="w-full h-full object-cover" />
                    <span class="absolute inset-0 grid place-items-center bg-black/40 opacity-0 group-hover/img:opacity-100 transition">
                      <Icon name="expand" :size="14" class="text-white" />
                    </span>
                  </button>
                  <span class="font-bold text-ink-900">{{ g.toolTitle }}</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <Avatar :name="g.author" :size="28" />
                  <span class="font-medium text-ink-700 whitespace-nowrap">{{ g.author }}</span>
                </div>
              </td>
              <td class="px-4 py-3">
                <span class="chip bg-ink-50 text-ink-600 whitespace-nowrap">
                  <Icon :name="sourceMeta[g.source].icon" :size="14" />
                  {{ sourceMeta[g.source].label }}
                </span>
              </td>
              <td class="px-4 py-3">
                <button
                  class="inline-flex items-center gap-2 group/uniq"
                  @click="selectedGen = g"
                >
                  <span class="chip whitespace-nowrap" :class="uniquenessMeta(g.similarity).cls">
                    <span class="w-1.5 h-1.5 rounded-full" :class="uniquenessMeta(g.similarity).dotCls" />
                    {{ g.similarity }}%
                  </span>
                  <span class="text-xs text-ink-400 group-hover/uniq:text-ink-700 underline decoration-dotted whitespace-nowrap">
                    {{ uniquenessMeta(g.similarity).label }}
                  </span>
                </button>
              </td>
              <td class="px-4 py-3">
                <span class="chip whitespace-nowrap" :class="statusMap[g.status].cls">{{ statusMap[g.status].label }}</span>
              </td>
              <td class="px-4 py-3 text-right font-bold text-ink-900">
                <span class="inline-flex items-center gap-1 justify-end"><Icon name="bolt" :size="13" class="text-ink-400" /> {{ g.credits }}</span>
              </td>
              <td class="px-4 py-3 text-right text-ink-400 whitespace-nowrap">{{ fmt(g.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="list.length === 0" class="text-center py-16 text-ink-400">Ничего не найдено</div>
    </div>

    <!-- Grid view -->
    <div v-else-if="gens.hasData" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      <GenerationCard v-for="g in list" :key="g.id" :gen="g" @open-similar="selectedGen = g" @open-image="lightbox = g" />
    </div>

    <!-- Similar / uniqueness modal -->
    <SimilarModal v-if="selectedGen" :gen="selectedGen" @close="selectedGen = null" />

    <!-- Лайтбокс: увеличенный просмотр фото -->
    <Teleport to="body">
      <div
        v-if="lightbox"
        class="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
        @click.self="lightbox = null"
      >
        <button
          class="absolute top-4 right-4 grid place-items-center w-11 h-11 rounded-xl bg-white/10 text-white hover:bg-white/20 transition"
          @click="lightbox = null"
        >
          <Icon name="x" :size="22" />
        </button>
        <div class="max-w-4xl w-full" @click.stop>
          <img :src="lightbox.thumbnail" :alt="lightbox.toolTitle" class="w-full max-h-[80vh] object-contain rounded-2xl" />
          <div class="mt-4 flex flex-wrap items-center justify-center gap-3 text-white">
            <span class="font-bold">{{ lightbox.toolTitle }}</span>
            <span class="opacity-50">·</span>
            <span class="inline-flex items-center gap-1.5 text-sm opacity-80">
              <Avatar :name="lightbox.author" :size="22" /> {{ lightbox.author }}
            </span>
            <span class="opacity-50">·</span>
            <span class="text-sm opacity-80">{{ fmt(lightbox.createdAt) }}</span>
            <a
              :href="lightbox.thumbnail"
              target="_blank"
              rel="noopener"
              download
              class="btn btn-accent btn-sm ml-1"
            >
              <Icon name="download" :size="16" /> Скачать
            </a>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
