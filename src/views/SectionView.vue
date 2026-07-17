<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import PageHeader from '@/components/ui/PageHeader.vue'
import Icon from '@/components/ui/Icon.vue'

const route = useRoute()

const title = computed(() => (route.meta.title as string) || 'Раздел')
const description = computed(() => (route.meta.description as string) || '')
const icon = computed(() => (route.meta.icon as string) || 'sparkles')
</script>

<template>
  <div class="p-6 lg:p-8 max-w-5xl animate-fade-in">
    <PageHeader :title="title" :subtitle="description" />

    <div
      class="mt-8 rounded-3xl border border-ink-100 bg-white p-8 sm:p-10 shadow-soft"
    >
      <div
        class="grid place-items-center w-14 h-14 rounded-2xl bg-accent/20 text-ink-900 mb-5"
      >
        <Icon :name="icon" :size="26" />
      </div>
      <h2 class="text-xl font-extrabold text-ink-900">{{ title }}</h2>
      <p class="mt-2 text-ink-500 max-w-xl leading-relaxed">
        {{ description || 'Раздел в разработке. Скоро здесь появится полноценный сценарий Coolay.' }}
      </p>
      <div class="mt-6 flex flex-wrap gap-3">
        <RouterLink to="/tools" class="btn btn-accent btn-md">
          <Icon name="tools" :size="18" />
          Открыть инструменты
        </RouterLink>
        <RouterLink to="/" class="btn btn-ghost btn-md">
          На главную
        </RouterLink>
      </div>
    </div>
  </div>
</template>
