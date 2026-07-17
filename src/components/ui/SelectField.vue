<script setup lang="ts">
import { ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'

defineProps<{ label?: string; options: string[]; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
const open = ref(false)
</script>

<template>
  <div>
    <label v-if="label" class="label">{{ label }}</label>
    <div class="relative">
      <button
        type="button"
        @click="open = !open"
        @blur="open = false"
        class="input flex items-center justify-between text-left"
        :class="open ? 'border-ink-900 ring-4 ring-accent/30' : ''"
      >
        <span class="font-medium text-ink-900">{{ modelValue }}</span>
        <Icon name="chevronDown" :size="16" class="text-ink-400 transition-transform" :class="open ? 'rotate-180' : ''" />
      </button>
      <transition name="dropdown">
        <ul
          v-if="open"
          class="absolute z-20 mt-1.5 w-full card shadow-pop p-1.5 max-h-56 overflow-y-auto"
        >
          <li
            v-for="opt in options"
            :key="opt"
            @mousedown.prevent="emit('update:modelValue', opt); open = false"
            class="flex items-center justify-between px-3 h-9 rounded-lg text-sm font-medium cursor-pointer hover:bg-ink-50"
            :class="opt === modelValue ? 'text-ink-900' : 'text-ink-600'"
          >
            {{ opt }}
            <Icon v-if="opt === modelValue" name="check" :size="15" class="text-accent-600" />
          </li>
        </ul>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
