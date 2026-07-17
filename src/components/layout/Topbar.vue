<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { homeScenarios } from '@/data/mock'

const app = useAppStore()
const auth = useAuthStore()
const router = useRouter()
const menuOpen = ref(false)
const startOpen = ref(false)
const query = ref('')

const searchHits = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return homeScenarios.filter(
    (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  ).slice(0, 5)
})

function logout() {
  auth.logout()
  router.push({ name: 'login' })
}

function goSearch(to: string) {
  query.value = ''
  router.push(to)
}

function onSearchEnter() {
  if (searchHits.value[0]) goSearch(searchHits.value[0].to)
  else router.push('/tools')
}
</script>

<template>
  <header
    class="h-[68px] shrink-0 bg-white/80 backdrop-blur-xl border-b border-ink-100 flex items-center gap-3 px-4 lg:px-6 sticky top-0 z-30"
  >
    <button
      class="hidden lg:grid place-items-center w-10 h-10 rounded-xl text-ink-500 hover:bg-ink-100 transition"
      @click="app.toggleSidebar"
    >
      <Icon name="grid" :size="20" />
    </button>
    <button
      class="lg:hidden grid place-items-center w-10 h-10 rounded-xl text-ink-500 hover:bg-ink-100 transition"
      @click="app.toggleMobileSidebar"
    >
      <Icon name="grid" :size="20" />
    </button>

    <!-- Search -->
    <div class="relative flex-1 max-w-xl">
      <Icon name="search" :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        v-model="query"
        type="text"
        placeholder="Найдите инструмент, товар, шаблон или проект…"
        class="w-full h-10 pl-10 pr-14 rounded-xl bg-ink-50 border border-transparent text-sm placeholder:text-ink-400 focus:outline-none focus:bg-white focus:border-ink-200 transition"
        @keydown.enter.prevent="onSearchEnter"
      />
      <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-ink-300 border border-ink-200 rounded-md px-1.5 py-0.5 hidden sm:inline">
        ⌘K
      </span>

      <div
        v-if="searchHits.length"
        class="absolute left-0 right-0 top-[calc(100%+6px)] card shadow-pop p-1.5 z-50"
      >
        <button
          v-for="hit in searchHits"
          :key="hit.id"
          type="button"
          class="w-full flex items-center gap-3 px-3 h-11 rounded-lg text-sm font-medium text-ink-700 hover:bg-ink-50 text-left"
          @click="goSearch(hit.to)"
        >
          <Icon :name="hit.icon" :size="16" />
          <span class="truncate">{{ hit.title }}</span>
        </button>
      </div>
    </div>

    <div class="flex-1" />

    <!-- Start work -->
    <div class="relative hidden sm:block">
      <button
        type="button"
        class="btn btn-dark btn-sm"
        @click="startOpen = !startOpen"
      >
        <Icon name="plus" :size="18" />
        <span>Начать работу</span>
        <Icon name="chevronDown" :size="14" />
      </button>
      <div
        v-if="startOpen"
        class="absolute right-0 mt-2 w-72 card shadow-pop p-1.5 z-50"
        @mouseleave="startOpen = false"
      >
        <button
          v-for="s in homeScenarios"
          :key="s.id"
          type="button"
          class="w-full flex items-center gap-3 px-3 h-11 rounded-lg text-sm font-medium text-ink-700 hover:bg-ink-50 text-left"
          @click="startOpen = false; router.push(s.to)"
        >
          <Icon :name="s.icon" :size="16" />
          <span class="truncate">{{ s.title }}</span>
        </button>
      </div>
    </div>

    <button class="relative grid place-items-center w-10 h-10 rounded-xl text-ink-500 hover:bg-ink-100 transition">
      <Icon name="bell" :size="20" />
      <span class="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
    </button>

    <div class="relative">
      <button
        class="flex items-center gap-2.5 pl-1 pr-2 h-11 rounded-xl hover:bg-ink-100 transition"
        @click="menuOpen = !menuOpen"
      >
        <Avatar :name="auth.user?.name || 'User'" :size="34" />
        <div class="hidden md:block text-left leading-tight">
          <div class="text-sm font-bold text-ink-900">{{ auth.user?.name }}</div>
          <div class="text-[11px] text-ink-400 font-medium">{{ auth.user?.role }}</div>
        </div>
        <Icon name="chevronDown" :size="16" class="text-ink-400 hidden md:block" />
      </button>

      <transition name="pop">
        <div
          v-if="menuOpen"
          class="absolute right-0 mt-2 w-60 card shadow-pop p-1.5 z-50"
          @click="menuOpen = false"
        >
          <div class="px-3 py-2.5 border-b border-ink-100 mb-1">
            <div class="text-sm font-bold text-ink-900">{{ auth.user?.name }}</div>
            <div class="text-xs text-ink-400">{{ auth.user?.email }}</div>
          </div>
          <RouterLink to="/settings" class="flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium text-ink-700 hover:bg-ink-50">
            <Icon name="settings" :size="18" /> Настройки
          </RouterLink>
          <RouterLink to="/integrations" class="flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium text-ink-700 hover:bg-ink-50">
            <Icon name="store" :size="18" /> Интеграции
          </RouterLink>
          <button
            class="w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
            @click="logout"
          >
            <Icon name="logout" :size="18" /> Выйти
          </button>
        </div>
      </transition>
    </div>
  </header>
</template>

<style scoped>
.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
</style>
