<script setup lang="ts">
import { useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import type { Tool } from '@/types'

const props = defineProps<{ tool: Tool; compact?: boolean }>()
const router = useRouter()

function open() {
  router.push(`/tools/${props.tool.slug}`)
}
</script>

<template>
  <button
    @click="open"
    class="group relative text-left card p-4 hover:border-ink-900 hover:shadow-card transition-all duration-300 hover:-translate-y-0.5 overflow-hidden"
    :class="tool.accent ? 'ring-2 ring-accent border-accent' : ''"
  >
    <!-- badges -->
    <div class="absolute top-3 right-3 flex gap-1.5">
      <span v-if="tool.isNew" class="chip bg-accent text-ink-900 text-[10px] px-2 py-0.5">NEW</span>
      <span v-if="tool.isPro" class="chip bg-ink-900 text-accent text-[10px] px-2 py-0.5">PRO</span>
    </div>

    <div
      class="grid place-items-center w-12 h-12 rounded-xl transition-all duration-300"
      :class="
        tool.accent
          ? 'bg-accent text-ink-900'
          : 'bg-ink-50 text-ink-900 group-hover:bg-ink-900 group-hover:text-accent'
      "
    >
      <Icon :name="tool.icon" :size="24" />
    </div>

    <h3 class="mt-3.5 font-bold text-ink-900 text-[15px] leading-snug">{{ tool.title }}</h3>
    <p v-if="!compact" class="mt-1 text-[13px] text-ink-400 leading-relaxed line-clamp-2">{{ tool.description }}</p>

    <div
      class="mt-3 inline-flex items-center gap-1 text-xs font-bold text-ink-900 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      Открыть <Icon name="chevronRight" :size="14" />
    </div>
  </button>
</template>
