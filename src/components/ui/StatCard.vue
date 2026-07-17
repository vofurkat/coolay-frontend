<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'

defineProps<{
  label: string
  value: string | number
  icon: string
  trend?: number
  suffix?: string
  accent?: boolean
}>()
</script>

<template>
  <div class="card p-5 hover:shadow-card transition-shadow duration-300 group">
    <div class="flex items-start justify-between">
      <div
        class="grid place-items-center w-11 h-11 rounded-xl transition-colors"
        :class="accent ? 'bg-accent text-ink-900' : 'bg-ink-900 text-accent group-hover:bg-ink-800'"
      >
        <Icon :name="icon" :size="22" />
      </div>
      <div
        v-if="trend !== undefined"
        class="chip"
        :class="trend >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'"
      >
        <span>{{ trend >= 0 ? '↑' : '↓' }} {{ Math.abs(trend) }}%</span>
      </div>
    </div>
    <div class="mt-4">
      <div class="text-3xl font-extrabold text-ink-900 tracking-tight">
        {{ value }}<span v-if="suffix" class="text-lg text-ink-400 font-bold">{{ suffix }}</span>
      </div>
      <div class="text-sm text-ink-400 font-medium mt-0.5">{{ label }}</div>
    </div>
  </div>
</template>
