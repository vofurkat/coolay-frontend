<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/data/platformApi'
import Logo from '@/components/ui/Logo.vue'
import Icon from '@/components/ui/Icon.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const mode = ref<'login' | 'register'>('login')

const email = ref('')
const password = ref('')
const company = ref('')
const name = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

const googleClientId = ref('')
const googleBtn = ref<HTMLElement | null>(null)

function goNext() {
  const redirect = (route.query.redirect as string) || '/'
  router.push(redirect)
}

async function submit() {
  error.value = ''
  loading.value = true
  const res =
    mode.value === 'login'
      ? await auth.login(email.value, password.value)
      : await auth.register({
          company: company.value,
          name: name.value,
          email: email.value,
          password: password.value,
        })
  loading.value = false
  if (res.ok) goNext()
  else error.value = res.error || 'Ошибка'
}

/* ── Google Identity Services ──
 * Скрипт грузим лениво и только если сервер настроен (есть GOOGLE_CLIENT_ID):
 * без него кнопка не показывается вовсе — нерабочая кнопка хуже её отсутствия. */
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void
        }
      }
    }
  }
}

function renderGoogle() {
  if (!googleClientId.value || !window.google || !googleBtn.value) return
  window.google.accounts.id.initialize({
    client_id: googleClientId.value,
    callback: async (resp) => {
      error.value = ''
      loading.value = true
      const res = await auth.loginWithGoogle(resp.credential)
      loading.value = false
      if (res.ok) goNext()
      else error.value = res.error || 'Ошибка входа через Google'
    },
  })
  window.google.accounts.id.renderButton(googleBtn.value, {
    theme: 'outline',
    size: 'large',
    width: 400,
    text: 'continue_with',
  })
}

onMounted(async () => {
  const cfg = await authApi.loginConfig()
  googleClientId.value = cfg.googleClientId
  if (!googleClientId.value) return
  if (window.google) {
    renderGoogle()
    return
  }
  const s = document.createElement('script')
  s.src = 'https://accounts.google.com/gsi/client'
  s.async = true
  s.onload = renderGoogle
  document.head.appendChild(s)
})

// При переключении вкладок контейнер кнопки Google пересоздаётся — рендерим заново.
watch(mode, async () => {
  error.value = ''
  await nextTick()
  renderGoogle()
})

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

        <h2 class="text-3xl font-extrabold text-ink-900">
          {{ mode === 'login' ? 'С возвращением' : 'Создайте аккаунт' }}
        </h2>
        <p class="text-ink-400 mt-2 mb-6">
          {{
            mode === 'login'
              ? 'Войдите в аккаунт, чтобы продолжить работу'
              : 'Бесплатный тариф — 50 кредит-токенов на старт'
          }}
        </p>

        <!-- Tabs -->
        <div class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-ink-50 mb-6">
          <button
            type="button"
            class="py-2 rounded-lg text-sm font-bold transition"
            :class="mode === 'login' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-400 hover:text-ink-700'"
            @click="mode = 'login'"
          >
            Вход
          </button>
          <button
            type="button"
            class="py-2 rounded-lg text-sm font-bold transition"
            :class="mode === 'register' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-400 hover:text-ink-700'"
            @click="mode = 'register'"
          >
            Регистрация
          </button>
        </div>

        <form @submit.prevent="submit" class="space-y-4">
          <div v-if="mode === 'register'">
            <label class="label">Название компании</label>
            <div class="relative">
              <Icon name="store" :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input v-model="company" type="text" class="input pl-11" placeholder="Например: Modano Shop" required />
            </div>
          </div>

          <div v-if="mode === 'register'">
            <label class="label">Ваше имя</label>
            <div class="relative">
              <Icon name="user" :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input v-model="name" type="text" class="input pl-11" placeholder="Как к вам обращаться" />
            </div>
          </div>

          <div>
            <label class="label">Email</label>
            <div class="relative">
              <Icon name="mail" :size="18" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                v-model="email"
                type="email"
                class="input pl-11"
                placeholder="you@company.com"
                autocomplete="username"
                required
              />
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
                :placeholder="mode === 'register' ? 'Минимум 8 символов' : 'Введите пароль'"
                :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
                required
                :minlength="mode === 'register' ? 8 : undefined"
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
            <span>
              {{ loading ? 'Секунду…' : mode === 'login' ? 'Войти' : 'Создать аккаунт' }}
            </span>
            <Icon v-if="!loading" name="chevronRight" :size="18" />
          </button>
        </form>

        <!-- Google Sign-In: показывается только если сервер настроен -->
        <template v-if="googleClientId">
          <div class="flex items-center gap-3 my-5">
            <div class="h-px flex-1 bg-ink-100" />
            <span class="text-xs text-ink-400 font-medium">или</span>
            <div class="h-px flex-1 bg-ink-100" />
          </div>
          <div ref="googleBtn" class="flex justify-center" />
        </template>

        <p class="mt-6 text-center text-sm text-ink-400">
          <template v-if="mode === 'login'">
            Нет аккаунта?
            <button type="button" class="font-bold text-ink-900 hover:text-accent-600" @click="mode = 'register'">
              Зарегистрируйтесь
            </button>
          </template>
          <template v-else>
            Уже есть аккаунт?
            <button type="button" class="font-bold text-ink-900 hover:text-accent-600" @click="mode = 'login'">
              Войти
            </button>
          </template>
        </p>
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
