<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
    <div>
      <h1 class="text-2xl sm:text-[28px] font-extrabold text-ink-900 tracking-tight">{{ title }}</h1>
      <p v-if="subtitle" class="text-ink-400 mt-1 text-sm sm:text-base">{{ subtitle }}</p>
    </div>
    <div class="flex items-center gap-2.5">
      <slot name="actions" />
    </div>
  </div>
</template>
