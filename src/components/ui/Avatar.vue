<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ name: string; size?: number }>()

const initials = computed(() =>
  props.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase(),
)
const s = computed(() => props.size || 38)
</script>

<template>
  <div
    class="grid place-items-center rounded-full bg-ink-900 text-accent font-bold shrink-0"
    :style="{ width: s + 'px', height: s + 'px', fontSize: s * 0.38 + 'px' }"
  >
    {{ initials }}
  </div>
</template>
