<script setup lang="ts">
/**
 * Логотип Coolay.
 *
 * dark — лого для тёмного фона (словесная часть белая). Присланный дизайнером
 * файл именно такой, поэтому на светлом фоне нужен отдельный logo-on-light.png,
 * иначе текст сливается с подложкой.
 *
 * ?v=3 — сброс кэша после смены бренда: без параметра браузеры и CDN ещё долго
 * отдавали бы прежний логотип по тому же пути.
 *
 * width/height проставлены по реальной пропорции исходника (680x98 => 6.94),
 * чтобы браузер зарезервировал место и логотип не «дёргал» вёрстку при загрузке.
 */
defineProps<{ collapsed?: boolean; dark?: boolean }>()
</script>

<template>
  <div class="select-none flex items-center overflow-visible" aria-label="Coolay">
    <img
      v-if="collapsed"
      src="/favicon.png?v=3"
      alt="Coolay"
      class="h-9 w-9 object-contain"
      width="36"
      height="36"
    />
    <img
      v-else
      :src="dark ? '/logo.png?v=3' : '/logo-on-light.png?v=3'"
      alt="Coolay"
      class="h-8 w-auto max-w-[222px] object-contain object-left"
      width="222"
      height="32"
    />
  </div>
</template>
