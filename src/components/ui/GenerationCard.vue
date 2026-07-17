<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import type { Generation } from '@/types'
import { sourceMeta } from '@/data/sources'
import { uniquenessMeta } from '@/data/similarity'

defineProps<{ gen: Generation }>()
defineEmits<{ 'open-similar': []; 'open-image': [] }>()

const statusMap: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Готово', cls: 'bg-green-50 text-green-600' },
  processing: { label: 'В работе', cls: 'bg-accent/20 text-accent-700' },
  failed: { label: 'Ошибка', cls: 'bg-red-50 text-red-600' },
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="group card overflow-hidden hover:shadow-card transition-all duration-300 hover:-translate-y-0.5">
    <div class="relative aspect-[4/5] overflow-hidden bg-ink-100">
      <img
        :src="gen.thumbnail"
        :alt="gen.toolTitle"
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-zoom-in"
        @click="$emit('open-image')"
      />
      <div v-if="gen.status === 'processing'" class="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-[2px]">
        <svg class="animate-spin text-accent" width="32" height="32" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
        </svg>
      </div>
      <span class="absolute top-2.5 left-2.5 chip text-[10px] backdrop-blur" :class="statusMap[gen.status].cls">
        {{ statusMap[gen.status].label }}
      </span>
      <!-- Similarity badge -->
      <button
        class="absolute top-2.5 right-2.5 chip text-[10px] backdrop-blur cursor-pointer"
        :class="uniquenessMeta(gen.similarity).cls"
        @click.stop="$emit('open-similar')"
        title="Проверка уникальности"
      >
        <span class="w-1.5 h-1.5 rounded-full" :class="uniquenessMeta(gen.similarity).dotCls" />
        {{ gen.similarity }}%
      </button>
      <!-- hover actions -->
      <div class="absolute inset-x-0 bottom-0 p-2.5 flex gap-1.5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-gradient-to-t from-black/60 to-transparent">
        <a :href="gen.thumbnail" target="_blank" rel="noopener" download class="btn btn-accent btn-sm flex-1 h-8 text-xs"><Icon name="download" :size="14" /> Скачать</a>
        <button class="grid place-items-center w-8 h-8 rounded-lg bg-white/90 text-ink-900 hover:bg-white" title="Увеличить" @click.stop="$emit('open-image')"><Icon name="expand" :size="14" /></button>
      </div>
    </div>
    <div class="p-3">
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-bold text-ink-900 truncate">{{ gen.toolTitle }}</span>
        <span class="chip bg-ink-50 text-ink-500 text-[10px] shrink-0"><Icon name="bolt" :size="11" /> {{ gen.credits }}</span>
      </div>
      <!-- Автор -->
      <div class="flex items-center gap-1.5 text-[11px] text-ink-500 mt-1.5">
        <Icon name="user" :size="12" class="shrink-0" />
        <span class="truncate font-medium">{{ gen.author }}</span>
      </div>
      <!-- Устройство + время -->
      <div class="flex items-center justify-between gap-2 text-[11px] text-ink-400 mt-1">
        <span class="inline-flex items-center gap-1 truncate">
          <Icon :name="sourceMeta[gen.source].icon" :size="12" class="shrink-0" />
          {{ sourceMeta[gen.source].label }}
        </span>
        <span class="inline-flex items-center gap-1 shrink-0">
          <Icon name="clock" :size="12" /> {{ fmt(gen.createdAt) }}
        </span>
      </div>
    </div>
  </div>
</template>
