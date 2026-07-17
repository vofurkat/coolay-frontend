<script setup lang="ts">
import { ref, computed } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import ToolCard from '@/components/ui/ToolCard.vue'
import Icon from '@/components/ui/Icon.vue'
import { tools, categoryLabels } from '@/data/tools'

const active = ref<string>('all')
const query = ref('')

const categories = Object.keys(categoryLabels)

const filtered = computed(() =>
  tools.filter((t) => {
    const byCat = active.value === 'all' || t.category === active.value
    const byQuery =
      !query.value ||
      t.title.toLowerCase().includes(query.value.toLowerCase()) ||
      t.description.toLowerCase().includes(query.value.toLowerCase())
    return byCat && byQuery
  }),
)
</script>

<template>
  <div class="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6 animate-fade-in">
    <PageHeader title="AI-инструменты" subtitle="Выберите инструмент для генерации карточек и обработки фото">
      <template #actions>
        <div class="relative">
          <Icon name="search" :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input v-model="query" type="text" placeholder="Поиск инструмента…" class="input pl-11 sm:w-72" />
        </div>
      </template>
    </PageHeader>

    <!-- Category tabs -->
    <div class="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
      <button
        v-for="cat in categories"
        :key="cat"
        @click="active = cat"
        class="btn btn-sm whitespace-nowrap"
        :class="active === cat ? 'btn-dark' : 'btn-outline'"
      >
        {{ categoryLabels[cat] }}
      </button>
    </div>

    <!-- Grid -->
    <transition-group
      tag="div"
      class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4"
      name="list"
    >
      <ToolCard v-for="t in filtered" :key="t.id" :tool="t" />
    </transition-group>

    <div v-if="filtered.length === 0" class="text-center py-20">
      <div class="grid place-items-center w-16 h-16 rounded-2xl bg-ink-100 text-ink-400 mx-auto mb-4">
        <Icon name="search" :size="28" />
      </div>
      <p class="font-bold text-ink-900">Ничего не найдено</p>
      <p class="text-ink-400 text-sm mt-1">Попробуйте изменить запрос или категорию</p>
    </div>
  </div>
</template>

<style scoped>
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
