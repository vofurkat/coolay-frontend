import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'

const STORAGE_KEY = 'coolay_auth'

// Демо-учётка (пока без бэкенда)
const DEMO = { login: 'admin', password: 'admin' }

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)

  const isAuthenticated = computed(() => !!token.value)

  function restore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        user.value = data.user
        token.value = data.token
      }
    } catch {
      /* ignore */
    }
  }

  async function login(loginValue: string, password: string): Promise<{ ok: boolean; error?: string }> {
    // Имитация запроса к API
    await new Promise((r) => setTimeout(r, 700))

    if (loginValue.trim() === DEMO.login && password === DEMO.password) {
      const u: User = {
        id: 'u1',
        name: 'Алексей Коваль',
        email: 'admin@coolay.studio',
        role: 'Администратор',
        company: 'Coolay Studio',
      }
      user.value = u
      token.value = 'demo-token-' + Date.now()
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: u, token: token.value }))
      return { ok: true }
    }
    return { ok: false, error: 'Неверный логин или пароль' }
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  return { user, token, isAuthenticated, restore, login, logout }
})
