<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ value: number; size?: number; stroke?: number; label?: string }>(),
  { size: 64, stroke: 6 },
)

const r = computed(() => (props.size - props.stroke) / 2)
const c = computed(() => 2 * Math.PI * r.value)
const offset = computed(() => c.value * (1 - Math.max(0, Math.min(100, props.value)) / 100))

const color = computed(() => {
  if (props.value >= 85) return '#10b981'
  if (props.value >= 60) return '#f59e0b'
  return '#ef4444'
})
</script>

<template>
  <div class="relative shrink-0" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :width="size" :height="size" class="-rotate-90">
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="r"
        fill="none"
        stroke="#EDEDED"
        :stroke-width="stroke"
      />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="r"
        fill="none"
        :stroke="color"
        :stroke-width="stroke"
        stroke-linecap="round"
        :stroke-dasharray="c"
        :stroke-dashoffset="offset"
        class="transition-all duration-700"
      />
    </svg>
    <div class="absolute inset-0 grid place-items-center">
      <span class="font-extrabold text-ink-900" :style="{ fontSize: size / 4.2 + 'px' }">
        {{ Math.round(value) }}%
      </span>
    </div>
  </div>
</template>
