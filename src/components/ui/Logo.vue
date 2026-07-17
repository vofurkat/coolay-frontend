<script setup lang="ts">
defineProps<{ collapsed?: boolean; dark?: boolean }>()
</script>

<template>
  <div class="select-none flex items-center overflow-visible" aria-label="Coolay">
    <img
      v-if="collapsed"
      src="/favicon.png"
      alt="Coolay"
      class="h-9 w-9 object-contain"
      width="36"
      height="36"
    />
    <img
      v-else
      :src="dark ? '/logo.png' : '/logo-on-light.png'"
      alt="Coolay"
      class="h-8 w-auto max-w-[200px] object-contain object-left"
      width="200"
      height="32"
    />
  </div>
</template>
