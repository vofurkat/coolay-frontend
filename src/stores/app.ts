import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const sidebarMobileOpen = ref(false)

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }
  function toggleMobileSidebar() {
    sidebarMobileOpen.value = !sidebarMobileOpen.value
  }
  function closeMobileSidebar() {
    sidebarMobileOpen.value = false
  }

  return { sidebarCollapsed, sidebarMobileOpen, toggleSidebar, toggleMobileSidebar, closeMobileSidebar }
})
