<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'

const props = defineProps<{ current: number; maxReached?: number }>()
const emit = defineEmits<{ (e: 'go', step: number): void }>()

const steps = [
  { id: 1, title: 'Загрузка фото', text: 'Фото товара' },
  { id: 2, title: 'AI-анализ', text: 'Распознавание товара' },
  { id: 3, title: 'Генерация контента', text: 'Текст, характеристики, SEO' },
  { id: 4, title: 'Подготовка изображений', text: 'Обработка и улучшение' },
  { id: 5, title: 'Готовая карточка', text: 'Результат' },
]

function state(id: number) {
  if (id < props.current) return 'done'
  if (id === props.current) return 'active'
  return 'todo'
}

function clickable(id: number) {
  return id < props.current
}
</script>

<template>
  <div class="flex items-start gap-1 overflow-x-auto no-scrollbar py-1">
    <template v-for="(s, i) in steps" :key="s.id">
      <button
        type="button"
        class="flex items-start gap-2.5 shrink-0 text-left rounded-lg px-1 py-1 transition"
        :class="clickable(s.id) ? 'cursor-pointer hover:bg-ink-50' : 'cursor-default'"
        :disabled="!clickable(s.id)"
        @click="clickable(s.id) && emit('go', s.id)"
      >
        <span
          class="grid place-items-center w-6 h-6 rounded-full shrink-0 text-[11px] font-bold mt-0.5 transition"
          :class="{
            'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200': state(s.id) === 'done',
            'bg-violet-600 text-white': state(s.id) === 'active',
            'bg-ink-100 text-ink-400': state(s.id) === 'todo',
          }"
        >
          <Icon v-if="state(s.id) === 'done'" name="check" :size="13" />
          <template v-else>{{ s.id }}</template>
        </span>
        <span class="leading-tight">
          <span
            class="block text-[13px] font-semibold whitespace-nowrap"
            :class="state(s.id) === 'todo' ? 'text-ink-400' : 'text-ink-900'"
            >{{ s.title }}</span
          >
          <span class="block text-[11px] text-ink-400 whitespace-nowrap mt-0.5">{{ s.text }}</span>
        </span>
      </button>
      <span
        v-if="i < steps.length - 1"
        class="hidden md:block flex-1 min-w-[16px] h-px mt-4 shrink"
        :class="s.id < current ? 'bg-emerald-200' : 'bg-ink-100'"
      />
    </template>
  </div>
</template>
