<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Logo from '@/components/ui/Logo.vue'
import Icon from '@/components/ui/Icon.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const login = ref('admin')
const password = ref('admin')
const showPassword = ref(false)
const remember = ref(true)
const loading = ref(false)
const error = ref('')

async function submit() {
  error.value = ''
  loading.value = true
  const res = await auth.login(login.value, password.value)
  loading.value = false
  if (res.ok) {
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
  } else {
    error.value = res.error || 'Ошибка входа'
  }
}

const features = [
  { icon: 'scissors', text: 'Удаление фона за секунды' },
  { icon: 'users', text: 'Виртуальные AI-модели' },
  { icon: 'store', text: 'Прямая интеграция с 1С и МойСклад' },
  { icon: 'layers', text: 'Пакетная обработка карточек' },
]
</script>

<template>
  <div class="min-h-screen w-full flex bg-white">
    <!-- Left brand panel -->
    <div class="hidden lg:flex w-[46%] relative bg-ink-900 overflow-hidden">
      <!-- decorative -->
      <div class="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
      <div class="absolute bottom-0 -left-20 w-80 h-80 rounded-full bg-accent/10 blur-3xl" />
      <div
        class="absolute inset-0 opacity-[0.05]"
        style="background-image: radial-gradient(#fff 1px, transparent 1px); background-size: 28px 28px"
      />

      <div class="relative z-10 flex flex-col justify-between p-12 w-full">
        <Logo dark />

        <div class="space-y-8">
          <div>
            <div class="chip bg-accent text-ink-900 mb-5">
              <Icon name="sparkles" :size="14" /> AI-студия карточек товаров
            </div>
            <h1 class="text-4xl xl:text-5xl font-extrabold text-white leading-[1.1] text-balance">
              Создавай продающие
              <span class="text-accent">карточки товаров</span>
              за секунды
            </h1>
            <p class="mt-4 text-white/50 text-lg max-w-md">
              Подключи свою ERP-систему и генерируй фото, фоны и модели на AI — прямо из каталога.
            </p>
          </div>

          <ul class="space-y-3">
            <li v-for="f in features" :key="f.text" class="flex items-center gap-3 text-white/80">
              <span class="grid place-items-center w-9 h-9 rounded-lg bg-white/[0.06] text-accent shrink-0">
                <Icon :name="f.icon" :size="18" />
              </span>
              <span class="text-sm font-medium">{{ f.text }}</span>
            </li>
          </ul>
        </div>

        <p class="text-white/30 text-xs">© 2026 Coolay Studio. Все права защищены.</p>
      </div>
    </div>

    <!-- Right form panel -->
    <div class="flex-1 flex items-center justify-center p-6 sm:p-12">
      <div class="w-full max-w-[400px] animate-fade-in">
        <div class="lg:hidden mb-8">
          <Logo />
        </div>

        <h2 class="text-3xl font-extrabold text-ink-900">С возвращением</h2>
        <p class="text-ink-400 mt-2 mb-8">Войдите в аккаунт, чтобы продолжить работу</p>

        <form @submit.prevent="submit" class="space-y-5">
          <div>
            <label class="label">Логин</label>
            <div class="relative">
              <Icon name="user" :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input v-model="login" type="text" class="input pl-11" placeholder="Введите логин" autocomplete="username" />
            </div>
          </div>

          <div>
            <label class="label">Пароль</label>
            <div class="relative">
              <Icon name="lock" :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="input pl-11 pr-11"
                placeholder="Введите пароль"
                autocomplete="current-password"
              />
              <button
                type="button"
                class="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
                @click="showPassword = !showPassword"
              >
                <Icon :name="showPassword ? 'eyeOff' : 'eye'" :size="18" />
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input v-model="remember" type="checkbox" class="peer sr-only" />
              <span
                class="w-5 h-5 rounded-md border-2 border-ink-200 grid place-items-center peer-checked:bg-accent peer-checked:border-accent transition"
              >
                <Icon v-if="remember" name="check" :size="14" class="text-ink-900" />
              </span>
              <span class="text-sm text-ink-600 font-medium">Запомнить меня</span>
            </label>
            <a href="#" class="text-sm font-semibold text-ink-900 hover:text-accent-600">Забыли пароль?</a>
          </div>

          <transition name="shake">
            <div v-if="error" class="flex items-center gap-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium px-4 py-3">
              <Icon name="x" :size="16" /> {{ error }}
            </div>
          </transition>

          <button type="submit" class="btn btn-accent btn-lg w-full" :disabled="loading">
            <svg v-if="loading" class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            </svg>
            <span>{{ loading ? 'Входим…' : 'Войти' }}</span>
            <Icon v-if="!loading" name="chevronRight" :size="18" />
          </button>
        </form>

        <div class="mt-6 rounded-xl bg-ink-50 border border-ink-100 px-4 py-3 text-xs text-ink-500">
          <span class="font-semibold text-ink-700">Демо-доступ:</span> логин <code class="text-ink-900 font-bold">admin</code> · пароль <code class="text-ink-900 font-bold">admin</code>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shake-enter-active {
  animation: shake 0.4s;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}
</style>
