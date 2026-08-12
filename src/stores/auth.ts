import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'
import { authApi, isFail, type AuthClient } from '@/data/platformApi'

/**
 * Реальная авторизация через /api/auth (httpOnly cookie-сессия).
 *
 * Токен НЕ хранится в localStorage — сессия живёт в httpOnly cookie,
 * недоступной из JS: XSS не может её украсть. Поэтому «restore» — это
 * запрос /api/auth/me, а не чтение localStorage, как было у фейкового
 * admin/admin.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const client = ref<AuthClient | null>(null)
  const googleClientId = ref('')
  /** null — ещё не проверяли сессию; после restore() всегда boolean. */
  const checked = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  function applyAuth(account: { id: string; email: string; name: string; role: string }, c: AuthClient) {
    user.value = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role === 'owner' ? 'Владелец' : 'Сотрудник',
      company: c.name,
    }
    client.value = c
  }

  /** Проверка живой сессии на сервере. Вызывается гардом роутера один раз. */
  async function restore() {
    const res = await authApi.me()
    checked.value = true
    if (isFail(res)) {
      user.value = null
      client.value = null
      return false
    }
    googleClientId.value = res.config?.googleClientId || ''
    applyAuth(res.account, res.client)
    return true
  }

  async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const res = await authApi.login(email, password)
    if (isFail(res)) return { ok: false, error: res.error }
    applyAuth(res.account, res.client)
    return { ok: true }
  }

  async function register(data: {
    company: string
    name: string
    email: string
    password: string
  }): Promise<{ ok: boolean; error?: string }> {
    const res = await authApi.register(data)
    if (isFail(res)) return { ok: false, error: res.error }
    applyAuth(res.account, res.client)
    return { ok: true }
  }

  async function loginWithGoogle(credential: string): Promise<{ ok: boolean; error?: string }> {
    const res = await authApi.google(credential)
    if (isFail(res)) return { ok: false, error: res.error }
    applyAuth(res.account, res.client)
    return { ok: true }
  }

  async function logout() {
    await authApi.logout()
    user.value = null
    client.value = null
  }

  return {
    user,
    client,
    googleClientId,
    checked,
    isAuthenticated,
    restore,
    login,
    register,
    loginWithGoogle,
    logout,
  }
})
