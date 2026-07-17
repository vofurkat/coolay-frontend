<script setup lang="ts">
import Icon from '@/components/ui/Icon.vue'

defineProps<{
  title: string
  items: { id: string; name: string; image: string }[]
  selected: string
  allowUpload?: boolean
}>()
const emit = defineEmits<{ select: [id: string]; close: [] }>()
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center p-4" @click.self="emit('close')">
    <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="emit('close')" />
    <div class="relative w-full max-w-2xl card shadow-pop animate-scale-in max-h-[80vh] flex flex-col">
      <!-- header -->
      <div class="flex items-center justify-between p-5 border-b border-ink-100">
        <h3 class="font-extrabold text-lg text-ink-900">{{ title }}</h3>
        <button class="grid place-items-center w-9 h-9 rounded-xl text-ink-500 hover:bg-ink-100" @click="emit('close')">
          <Icon name="x" :size="20" />
        </button>
      </div>
      <!-- grid -->
      <div class="p-5 overflow-y-auto">
        <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
          <button
            v-if="allowUpload"
            class="aspect-[3/4] rounded-xl border-2 border-dashed border-ink-200 grid place-items-center text-ink-400 hover:border-ink-900 hover:text-ink-900 transition group"
          >
            <div class="text-center">
              <Icon name="plus" :size="26" class="mx-auto" />
              <span class="text-xs font-semibold mt-1 block">Загрузить</span>
            </div>
          </button>
          <button
            v-for="item in items"
            :key="item.id"
            @click="emit('select', item.id); emit('close')"
            class="group relative aspect-[3/4] rounded-xl overflow-hidden ring-2 transition-all"
            :class="selected === item.id ? 'ring-accent' : 'ring-transparent hover:ring-ink-200'"
          >
            <img :src="item.image" :alt="item.name" class="w-full h-full object-cover" />
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
              <span class="text-white text-xs font-semibold">{{ item.name }}</span>
            </div>
            <div
              v-if="selected === item.id"
              class="absolute top-2 right-2 grid place-items-center w-6 h-6 rounded-full bg-accent text-ink-900"
            >
              <Icon name="check" :size="14" />
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
