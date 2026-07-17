<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'
import { uniquenessMeta, isDuplicate } from '@/data/similarity'
import type { Generation } from '@/types'

const props = defineProps<{ gen: Generation }>()
const emit = defineEmits<{ close: [] }>()

function fmt(iso: string) {
  return new Date(iso).toLocaleString('ru', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const meta = uniquenessMeta(props.gen.similarity)
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center p-4" @click.self="emit('close')">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="emit('close')" />
    <div class="relative w-full max-w-xl card shadow-pop animate-scale-in max-h-[85vh] flex flex-col">
      <!-- header -->
      <div class="flex items-start justify-between p-5 border-b border-ink-100">
        <div class="flex items-center gap-3">
          <img :src="gen.thumbnail" class="w-12 h-14 rounded-lg object-cover" />
          <div>
            <h3 class="font-extrabold text-lg text-ink-900 leading-tight">Проверка уникальности</h3>
            <p class="text-sm text-ink-400">{{ gen.toolTitle }}</p>
          </div>
        </div>
        <button class="grid place-items-center w-9 h-9 rounded-xl text-ink-500 hover:bg-ink-100" @click="emit('close')">
          <Icon name="x" :size="20" />
        </button>
      </div>

      <!-- verdict -->
      <div class="p-5">
        <div
          class="rounded-2xl p-4 flex items-center gap-4"
          :class="isDuplicate(gen.similarity) ? 'bg-red-50' : gen.similarity >= 50 ? 'bg-amber-50' : 'bg-green-50'"
        >
          <div class="relative shrink-0">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="6" />
              <circle
                cx="32" cy="32" r="28" fill="none" stroke-width="6" stroke-linecap="round"
                :stroke="isDuplicate(gen.similarity) ? '#dc2626' : gen.similarity >= 50 ? '#d97706' : '#16a34a'"
                :stroke-dasharray="2 * Math.PI * 28"
                :stroke-dashoffset="2 * Math.PI * 28 * (1 - gen.similarity / 100)"
                transform="rotate(-90 32 32)"
              />
            </svg>
            <span class="absolute inset-0 grid place-items-center font-extrabold text-ink-900">{{ gen.similarity }}%</span>
          </div>
          <div>
            <span class="chip" :class="meta.cls">
              <span class="w-2 h-2 rounded-full" :class="meta.dotCls" /> {{ meta.label }}
            </span>
            <p class="text-sm font-semibold text-ink-900 mt-2">
              <template v-if="isDuplicate(gen.similarity)">Товар уже загружали ранее</template>
              <template v-else-if="gen.similarity >= 50">Найдены похожие товары</template>
              <template v-else>Совпадений не найдено — товар уникален</template>
            </p>
            <p class="text-xs text-ink-500">Максимальная схожесть с базой товаров — {{ gen.similarity }}%</p>
          </div>
        </div>
      </div>

      <!-- matches list -->
      <div v-if="gen.similarMatches?.length" class="px-5 pb-5 overflow-y-auto">
        <p class="label mb-2">Совпадения в базе ({{ gen.similarMatches.length }})</p>
        <ul class="space-y-2">
          <li
            v-for="m in gen.similarMatches"
            :key="m.id"
            class="flex items-center gap-3 rounded-xl border border-ink-100 p-2.5 hover:border-ink-200 transition"
          >
            <img :src="m.thumbnail" class="w-11 h-13 rounded-lg object-cover shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="font-bold text-ink-900 text-sm truncate">{{ m.title }}</p>
              <div class="flex items-center gap-1.5 text-xs text-ink-400 mt-0.5">
                <Avatar :name="m.author" :size="18" />
                <span class="truncate">{{ m.author }}</span>
                <span>·</span>
                <span class="whitespace-nowrap">{{ fmt(m.createdAt) }}</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div
                class="font-extrabold text-lg leading-none"
                :class="isDuplicate(m.similarity) ? 'text-red-600' : m.similarity >= 50 ? 'text-amber-600' : 'text-green-600'"
              >
                {{ m.similarity }}%
              </div>
              <div class="text-[10px] text-ink-400 uppercase tracking-wide">схожесть</div>
            </div>
          </li>
        </ul>
      </div>

      <!-- footer -->
      <div class="p-5 border-t border-ink-100 flex flex-col sm:flex-row gap-2.5">
        <button class="btn btn-outline btn-md flex-1" @click="emit('close')">Закрыть</button>
        <button v-if="gen.similarMatches?.length" class="btn btn-dark btn-md flex-1">
          <Icon name="eye" :size="18" /> Открыть существующий
        </button>
      </div>
    </div>
  </div>
</template>
