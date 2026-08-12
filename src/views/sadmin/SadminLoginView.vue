<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { sadminApi, isFail } from '@/data/platformApi'
import Logo from '@/components/ui/Logo.vue'
import Icon from '@/components/ui/Icon.vue'

const router = useRouter()
const login = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  loading.value = true
  const res = await sadminApi.login(login.value, password.value)
  loading.value = false
  if (isFail(res)) {
    error.value = res.error
    return
  }
  router.replace('/sadmin')
}
</script>

<template>
  <div class="min-h-screen grid place-items-center bg-ink-900 p-6">
    <div class="w-full max-w-sm bg-white rounded-2xl p-8 shadow-2xl">
      <div class="flex items-center gap-2 mb-6">
        <Logo />
        <span class="text-[10px] font-bold uppercase tracking-wider bg-ink-900 text-white rounded px-1.5 py-0.5">admin</span>
      </div>
      <h1 class="text-2xl font-extrabold text-ink-900 mb-1">Панель управления</h1>
      <p class="text-sm text-ink-400 mb-6">Доступ только для администраторов платформы</p>
      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="label">Логин</label>
          <div class="relative">
            <Icon name="user" :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input v-model="login" type="text" class="input pl-11" autocomplete="username" required />
          </div>
        </div>
        <div>
          <label class="label">Пароль</label>
          <div class="relative">
            <Icon name="lock" :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input v-model="password" type="password" class="input pl-11" autocomplete="current-password" required />
          </div>
        </div>
        <div v-if="error" class="rounded-xl bg-red-50 text-red-600 text-sm font-medium px-4 py-3">{{ error }}</div>
        <button type="submit" class="btn btn-dark btn-lg w-full" :disabled="loading">
          {{ loading ? 'Входим…' : 'Войти' }}
        </button>
      </form>
    </div>
  </div>
</template>
