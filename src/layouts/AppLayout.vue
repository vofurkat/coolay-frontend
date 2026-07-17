<script setup lang="ts">
import { RouterView } from 'vue-router'
import Sidebar from '@/components/layout/Sidebar.vue'
import Topbar from '@/components/layout/Topbar.vue'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
</script>

<template>
  <div class="h-screen w-screen flex overflow-hidden bg-ink-50">
    <!-- Desktop sidebar -->
    <div class="hidden lg:block h-full shrink-0">
      <Sidebar />
    </div>

    <!-- Mobile sidebar drawer -->
    <transition name="drawer">
      <div v-if="app.sidebarMobileOpen" class="lg:hidden fixed inset-0 z-50 flex">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="app.closeMobileSidebar" />
        <div class="relative h-full" @click="app.closeMobileSidebar">
          <Sidebar />
        </div>
      </div>
    </transition>

    <!-- Main -->
    <div class="flex-1 flex flex-col min-w-0 h-full">
      <Topbar />
      <main class="flex-1 overflow-y-auto">
        <RouterView v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
</style>
