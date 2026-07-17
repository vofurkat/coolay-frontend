<script setup lang="ts">
import { ref, computed } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'
import { telegramBot, botEmployees } from '@/data/mock'
import type { TelegramBotConfig, BotEmployee, BotEmployeeStatus } from '@/types'

// --- Конфигурация бота ---
const bot = ref<TelegramBotConfig>({ ...telegramBot })
const tokenInput = ref(bot.value.token)
const connecting = ref(false)
const tokenError = ref<string | null>(null)
const copied = ref(false)

// Проверка формата токена Telegram: 123456789:AA... (>=35 символов)
function isValidToken(t: string) {
  return /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(t.trim())
}

function connectBot() {
  tokenError.value = null
  if (!isValidToken(tokenInput.value)) {
    tokenError.value = 'Неверный формат токена. Получите его у @BotFather'
    return
  }
  connecting.value = true
  // Демо: имитируем обращение к Telegram getMe по токену
  setTimeout(() => {
    connecting.value = false
    bot.value = {
      ...bot.value,
      token: tokenInput.value.trim(),
      connected: true,
      botUsername: '@coolay_studio_bot',
      botName: 'Coolay Studio',
    }
  }, 1100)
}

function disconnectBot() {
  bot.value = { ...bot.value, connected: false, token: '', botUsername: '', botName: '' }
  tokenInput.value = ''
}

function copyMiniApp() {
  if (!bot.value.miniAppUrl) return
  navigator.clipboard?.writeText(bot.value.miniAppUrl).then(() => {
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  })
}

const maskedToken = computed(() => {
  const t = bot.value.token
  if (!t) return ''
  const [id] = t.split(':')
  return `${id}:••••••••••••••••`
})

// --- Сотрудники с доступом через бота ---
const employees = ref<BotEmployee[]>([...botEmployees])

const showAdd = ref(false)
const newName = ref('')
const newPhone = ref('')
const addError = ref<string | null>(null)
const checking = ref<string | null>(null) // id проверяемого сотрудника

const statusMeta: Record<BotEmployeeStatus, { label: string; cls: string; dot: string }> = {
  verified: { label: 'Найден в Telegram', cls: 'bg-green-50 text-green-600', dot: 'bg-green-500' },
  pending: { label: 'Ожидает проверки', cls: 'bg-amber-50 text-amber-600', dot: 'bg-amber-500' },
  not_found: { label: 'Не найден', cls: 'bg-red-50 text-red-600', dot: 'bg-red-500' },
}

function normalizePhone(p: string) {
  const digits = p.replace(/\D/g, '')
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
    const d = '7' + digits.slice(1)
    return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`
  }
  return p.trim()
}

function addEmployee() {
  addError.value = null
  if (!newName.value.trim()) {
    addError.value = 'Укажите ФИО сотрудника'
    return
  }
  const digits = newPhone.value.replace(/\D/g, '')
  if (digits.length < 10) {
    addError.value = 'Укажите корректный номер телефона'
    return
  }
  const emp: BotEmployee = {
    id: 'be' + Date.now(),
    fullName: newName.value.trim(),
    phone: normalizePhone(newPhone.value),
    status: 'pending',
    canGenerate: false,
    addedAt: new Date().toISOString(),
  }
  employees.value.unshift(emp)
  // сразу проверяем в боте
  verifyInBot(emp.id)
  newName.value = ''
  newPhone.value = ''
  showAdd.value = false
}

// Проверка сотрудника в Telegram по номеру (демо-имитация поиска через бота)
function verifyInBot(id: string) {
  const emp = employees.value.find((e) => e.id === id)
  if (!emp) return
  checking.value = id
  emp.status = 'pending'
  setTimeout(() => {
    checking.value = null
    // Демо: считаем, что сотрудник написал боту /start и поделился контактом
    const found = Math.random() > 0.25
    if (found) {
      emp.status = 'verified'
      emp.telegramId = Math.floor(100000000 + Math.random() * 800000000)
      emp.telegramUsername = '@' + emp.fullName.split(' ')[0].toLowerCase()
      emp.canGenerate = true
    } else {
      emp.status = 'not_found'
      emp.canGenerate = false
    }
  }, 1400)
}

function toggleAccess(id: string) {
  const emp = employees.value.find((e) => e.id === id)
  if (emp && emp.status === 'verified') emp.canGenerate = !emp.canGenerate
}

function removeEmployee(id: string) {
  employees.value = employees.value.filter((e) => e.id !== id)
}

const verifiedCount = computed(() => employees.value.filter((e) => e.canGenerate).length)
</script>

<template>
  <div class="space-y-6">
    <!-- Подключение бота через токен -->
    <div class="card p-6">
      <div class="flex items-start gap-4">
        <div class="grid place-items-center w-12 h-12 rounded-xl bg-sky-100 text-sky-600 shrink-0">
          <Icon name="telegram" :size="24" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-extrabold text-ink-900">Telegram-бот</h3>
            <span v-if="bot.connected" class="chip bg-green-50 text-green-600 text-[10px]">
              <Icon name="check" :size="11" /> Подключён
            </span>
          </div>
          <p class="text-sm text-ink-400 mt-0.5">
            Сотрудники создают карточки прямо в Telegram через мини-приложение с теми же инструментами.
          </p>
        </div>
      </div>

      <!-- форма токена -->
      <div v-if="!bot.connected" class="mt-5 space-y-3">
        <div>
          <label class="label">Токен бота (BotFather)</label>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300"><Icon name="key" :size="16" /></span>
              <input
                v-model="tokenInput"
                type="text"
                placeholder="123456789:AAH…"
                class="input pl-9"
                :class="tokenError ? '!border-red-300' : ''"
                @input="tokenError = null"
              />
            </div>
            <button class="btn btn-dark btn-md shrink-0" :disabled="connecting" @click="connectBot">
              <svg v-if="connecting" class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.25" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
              </svg>
              <Icon v-else name="link" :size="18" />
              {{ connecting ? 'Проверяем…' : 'Подключить' }}
            </button>
          </div>
          <p v-if="tokenError" class="text-xs text-red-500 mt-1.5">{{ tokenError }}</p>
          <p v-else class="text-xs text-ink-400 mt-1.5">
            Создайте бота у <span class="font-semibold text-ink-600">@BotFather</span> и вставьте полученный токен.
          </p>
        </div>
      </div>

      <!-- подключённый бот -->
      <div v-else class="mt-5 space-y-3">
        <div class="grid sm:grid-cols-2 gap-3">
          <div class="rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            <p class="text-xs text-ink-400">Бот</p>
            <p class="font-bold text-ink-900">{{ bot.botName }} <span class="text-ink-400 font-medium">{{ bot.botUsername }}</span></p>
          </div>
          <div class="rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            <p class="text-xs text-ink-400">Токен</p>
            <p class="font-mono text-sm text-ink-700 truncate">{{ maskedToken }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 rounded-xl border border-ink-100 p-2 pl-3">
          <Icon name="link" :size="16" class="text-ink-400 shrink-0" />
          <span class="text-sm text-ink-600 truncate flex-1">{{ bot.miniAppUrl }}</span>
          <button class="btn btn-outline btn-sm shrink-0" @click="copyMiniApp">
            <Icon :name="copied ? 'check' : 'copy'" :size="14" /> {{ copied ? 'Скопировано' : 'Мини-апп' }}
          </button>
        </div>
        <button class="btn btn-outline btn-sm" @click="disconnectBot">Отключить бота</button>
      </div>
    </div>

    <!-- Сотрудники с доступом к генерациям через бота -->
    <div class="card p-6">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 class="font-extrabold text-ink-900">Сотрудники с доступом через бота</h3>
          <p class="text-sm text-ink-400 mt-0.5">
            Добавьте ФИО и номер телефона — мы проверим сотрудника в боте по номеру и выдадим доступ к генерациям.
          </p>
        </div>
        <button
          class="btn btn-dark btn-sm shrink-0"
          :disabled="!bot.connected"
          :title="bot.connected ? '' : 'Сначала подключите бота'"
          @click="showAdd = !showAdd"
        >
          <Icon name="userPlus" :size="16" /> Добавить сотрудника
        </button>
      </div>

      <p v-if="!bot.connected" class="mt-4 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-sm px-3 py-2.5">
        Подключите Telegram-бота выше, чтобы добавлять сотрудников и проверять их по номеру.
      </p>

      <!-- форма добавления -->
      <div v-if="showAdd && bot.connected" class="mt-4 rounded-xl border border-ink-200 p-4 space-y-3 bg-ink-50/40">
        <div class="grid sm:grid-cols-2 gap-3">
          <div>
            <label class="label">ФИО</label>
            <input v-model="newName" type="text" placeholder="Иванов Иван Иванович" class="input" @input="addError = null" />
          </div>
          <div>
            <label class="label">Телефон (как в Telegram)</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300"><Icon name="phone" :size="16" /></span>
              <input v-model="newPhone" type="tel" placeholder="+7 999 123-45-67" class="input pl-9" @input="addError = null" />
            </div>
          </div>
        </div>
        <p v-if="addError" class="text-xs text-red-500">{{ addError }}</p>
        <div class="flex gap-2">
          <button class="btn btn-dark btn-sm" @click="addEmployee"><Icon name="check" :size="15" /> Добавить и проверить</button>
          <button class="btn btn-outline btn-sm" @click="showAdd = false">Отмена</button>
        </div>
      </div>

      <!-- список -->
      <div v-if="employees.length" class="mt-4 -mx-2 overflow-x-auto">
        <table class="w-full text-sm min-w-[640px]">
          <thead>
            <tr class="border-b border-ink-100 text-left">
              <th class="font-bold text-ink-500 text-xs uppercase tracking-wide px-2 py-2.5">Сотрудник</th>
              <th class="font-bold text-ink-500 text-xs uppercase tracking-wide px-2 py-2.5">Телефон</th>
              <th class="font-bold text-ink-500 text-xs uppercase tracking-wide px-2 py-2.5">Проверка в боте</th>
              <th class="font-bold text-ink-500 text-xs uppercase tracking-wide px-2 py-2.5">Генерации</th>
              <th class="px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in employees" :key="e.id" class="border-b border-ink-50 hover:bg-ink-50/50">
              <td class="px-2 py-3">
                <div class="flex items-center gap-2.5">
                  <Avatar :name="e.fullName" :size="32" />
                  <div class="min-w-0">
                    <p class="font-semibold text-ink-900 truncate">{{ e.fullName }}</p>
                    <p v-if="e.telegramUsername" class="text-xs text-sky-600">{{ e.telegramUsername }}</p>
                  </div>
                </div>
              </td>
              <td class="px-2 py-3 whitespace-nowrap text-ink-600">{{ e.phone }}</td>
              <td class="px-2 py-3">
                <span v-if="checking === e.id" class="inline-flex items-center gap-2 text-ink-500 text-xs">
                  <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                  </svg>
                  Проверяем по номеру…
                </span>
                <span v-else class="chip whitespace-nowrap" :class="statusMeta[e.status].cls">
                  <span class="w-1.5 h-1.5 rounded-full" :class="statusMeta[e.status].dot" />
                  {{ statusMeta[e.status].label }}
                </span>
              </td>
              <td class="px-2 py-3">
                <label v-if="e.status === 'verified'" class="inline-flex items-center cursor-pointer select-none">
                  <span class="relative inline-block">
                    <input :checked="e.canGenerate" type="checkbox" class="peer sr-only" @change="toggleAccess(e.id)" />
                    <span class="block w-10 h-5.5 rounded-full bg-ink-200 peer-checked:bg-accent transition" style="height:1.375rem" />
                    <span class="absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow peer-checked:translate-x-[18px] transition" style="width:1.125rem;height:1.125rem" />
                  </span>
                </label>
                <button
                  v-else-if="e.status === 'not_found'"
                  class="btn btn-outline btn-sm h-7 text-xs"
                  @click="verifyInBot(e.id)"
                >
                  <Icon name="refresh" :size="13" /> Повторить
                </button>
                <span v-else class="text-xs text-ink-400">—</span>
              </td>
              <td class="px-2 py-3 text-right">
                <button class="grid place-items-center w-8 h-8 rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600 ml-auto" title="Удалить" @click="removeEmployee(e.id)">
                  <Icon name="trash" :size="16" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="mt-4 text-center py-8 text-ink-400 text-sm">Сотрудники ещё не добавлены</div>

      <p v-if="employees.length" class="text-xs text-ink-400 mt-3">
        Доступ к генерациям через бота имеют: <span class="font-bold text-ink-700">{{ verifiedCount }}</span>
      </p>
    </div>
  </div>
</template>
