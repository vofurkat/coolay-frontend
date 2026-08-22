<script setup lang="ts">
/**
 * Панель Telegram-бота.
 *
 * ПОЧЕМУ ЗДЕСЬ НЕТ ПОЛЯ ДЛЯ ТОКЕНА. Раньше панель предлагала вставить токен
 * бота в браузере и «подключала» его на клиенте. Это неверно по существу:
 * токен — серверный секрет, он даёт полный контроль над ботом (чтение всех
 * сообщений сотрудников, отправка от его имени, подмена webhook). Попав в
 * браузер, он оказался бы в истории запросов, в расширениях и в логах прокси.
 * Поэтому токен живёт только в .env на сервере, а панель показывает уже
 * подключённого бота.
 *
 * ПОЧЕМУ НЕТ КНОПКИ «ДОБАВИТЬ СОТРУДНИКА». Сотрудники живут в одном месте —
 * «Настройки → Пользователи». Вторая форма добавления рядом означала бы два
 * списка, которые со временем разойдутся; вместо неё здесь ссылка на раздел.
 *
 * ПОЧЕМУ НЕТ «ПРОВЕРИТЬ ПО НОМЕРУ». Раньше кнопка вызывала имитацию с
 * Math.random() и рисовала случайный результат. Реально проверить сотрудника
 * со стороны сайта невозможно: Telegram не даёт искать людей по номеру. Связь
 * возникает только когда сотрудник сам напишет боту и поделится контактом,
 * поэтому здесь показывается фактическое состояние этой связи.
 */
import { computed, onMounted, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import Avatar from '@/components/ui/Avatar.vue'
import { isFail, telegramApi, type BotEmployeeInfo, type BotInfo } from '@/data/platformApi'

const info = ref<BotInfo | null>(null)
const loading = ref(true)
const error = ref('')
const copied = ref<'app' | 'bot' | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  // Клиент API не бросает исключения, а возвращает Fail — проверяем через isFail.
  const r = await telegramApi.botInfo()
  if (isFail(r)) error.value = r.error || 'Не удалось загрузить состояние бота'
  else info.value = r
  loading.value = false
}

onMounted(load)

function copy(text: string, what: 'app' | 'bot') {
  if (!text) return
  navigator.clipboard?.writeText(text).then(() => {
    copied.value = what
    setTimeout(() => (copied.value = null), 1500)
  })
}

/** Подключённые к боту — вверх списка: именно они могут работать. */
const employees = computed<BotEmployeeInfo[]>(() => {
  const list = [...(info.value?.employees || [])]
  return list.sort((a, b) => {
    if (!!a.telegramId !== !!b.telegramId) return a.telegramId ? -1 : 1
    return a.fullName.localeCompare(b.fullName, 'ru')
  })
})

const canWork = computed(
  () => employees.value.filter((e) => e.telegramId && e.canGenerate && e.status !== 'blocked').length,
)
const waiting = computed(() => employees.value.filter((e) => !e.telegramId).length)

function fmtPhone(p: string) {
  const d = (p || '').replace(/\D/g, '')
  if (d.length === 11) return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`
  return p ? '+' + d : '—'
}

function fmtDate(s: string | null) {
  if (!s) return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

/** Состояние сотрудника одной строкой — без вымышленных «проверок». */
function state(e: BotEmployeeInfo) {
  if (e.status === 'blocked')
    return { label: 'Заблокирован', cls: 'bg-red-50 text-red-600', dot: 'bg-red-500' }
  if (!e.telegramId)
    return { label: 'Ещё не открыл бота', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' }
  if (!e.canGenerate)
    return { label: 'Генерации отключены', cls: 'bg-ink-100 text-ink-500', dot: 'bg-ink-400' }
  return { label: 'Работает в боте', cls: 'bg-green-50 text-green-600', dot: 'bg-green-500' }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Состояние подключения -->
    <div class="card p-6">
      <div class="flex items-start gap-4">
        <div class="grid place-items-center w-12 h-12 rounded-xl bg-sky-100 text-sky-600 shrink-0">
          <Icon name="telegram" :size="24" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-extrabold text-ink-900">Telegram-бот</h3>
            <span
              v-if="info?.botAvailable && !info?.botStale"
              class="chip bg-green-50 text-green-600 text-[10px]"
            >
              <Icon name="check" :size="11" /> Подключён
            </span>
            <!-- Бот настроен, но Telegram сейчас недоступен: это сбой связи,
                 а не отсутствие подключения — так и пишем. -->
            <span
              v-else-if="info?.botAvailable"
              class="chip bg-amber-50 text-amber-700 text-[10px]"
            >
              <Icon name="alert" :size="11" /> Нет связи с Telegram
            </span>
            <span
              v-else-if="!loading"
              class="chip bg-amber-50 text-amber-700 text-[10px]"
            >
              Не подключён
            </span>
          </div>
          <p class="text-sm text-ink-400 mt-0.5">
            Сотрудник создаёт карточки прямо в Telegram — по одному товару или сразу пакетом,
            без входа на сайт.
          </p>
        </div>
      </div>

      <div v-if="loading" class="mt-5 text-sm text-ink-400 flex items-center gap-2">
        <Icon name="loader" :size="16" class="animate-spin" /> Загружаем состояние…
      </div>

      <p
        v-else-if="error"
        class="mt-5 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm px-3 py-2.5"
      >
        {{ error }}
      </p>

      <!-- Бот подключён -->
      <div v-else-if="info?.botAvailable" class="mt-5 space-y-3">
        <!-- Бот работает, сотрудники им пользуются, но getMe сейчас не прошёл.
             Показываем это как временный сбой связи и не пугаем «отключением». -->
        <p
          v-if="info.botStale"
          class="rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm px-3.5 py-2.5"
        >
          Связь с Telegram сейчас недоступна — данные о боте показаны из последнего
          успешного запроса. Бот подключён, сотрудники продолжают работать.
        </p>
        <div class="grid sm:grid-cols-2 gap-3">
          <div class="rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            <p class="text-xs text-ink-400">Бот</p>
            <p class="font-bold text-ink-900 truncate">
              {{ info.bot?.name }}
              <span class="text-ink-400 font-medium">@{{ info.bot?.username }}</span>
            </p>
          </div>
          <div class="rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            <p class="text-xs text-ink-400">Сотрудников работает</p>
            <p class="font-bold text-ink-900">
              {{ canWork }}<span class="text-ink-400 font-medium"> из {{ info.total }}</span>
            </p>
          </div>
        </div>

        <div
          v-if="info.botLink"
          class="flex items-center gap-2 rounded-xl border border-ink-100 p-2 pl-3"
        >
          <Icon name="telegram" :size="16" class="text-ink-400 shrink-0" />
          <span class="text-sm text-ink-600 truncate flex-1">{{ info.botLink }}</span>
          <button class="btn btn-outline btn-sm shrink-0" @click="copy(info.botLink, 'bot')">
            <Icon :name="copied === 'bot' ? 'check' : 'copy'" :size="14" />
            {{ copied === 'bot' ? 'Скопировано' : 'Ссылка' }}
          </button>
        </div>

        <div
          v-if="info.miniAppUrl"
          class="flex items-center gap-2 rounded-xl border border-ink-100 p-2 pl-3"
        >
          <Icon name="link" :size="16" class="text-ink-400 shrink-0" />
          <span class="text-sm text-ink-600 truncate flex-1">{{ info.miniAppUrl }}</span>
          <button class="btn btn-outline btn-sm shrink-0" @click="copy(info.miniAppUrl, 'app')">
            <Icon :name="copied === 'app' ? 'check' : 'copy'" :size="14" />
            {{ copied === 'app' ? 'Скопировано' : 'Мини-апп' }}
          </button>
        </div>

        <!-- Инструкция: администратору важно понимать, что делать сотруднику,
             иначе «ещё не открыл бота» выглядит как поломка. -->
        <div class="rounded-xl bg-sky-50/70 border border-sky-100 p-3.5 text-sm text-ink-600">
          <p class="font-bold text-ink-900 mb-1.5">Как подключить сотрудника</p>
          <ol class="space-y-1 list-decimal list-inside">
            <li>
              Добавьте его в
              <RouterLink to="/settings" class="font-semibold text-sky-700 hover:underline">
                Настройки → Пользователи
              </RouterLink>
              с номером телефона, привязанным к его Telegram.
            </li>
            <li>Он открывает бота и нажимает «Старт».</li>
            <li>Бот просит поделиться контактом — сотрудник нажимает кнопку.</li>
            <li>Номер сверяется с базой, и доступ открывается автоматически.</li>
          </ol>
        </div>
      </div>

      <!-- Бот действительно не подключён: токена нет либо Telegram его отклонил.
           Причины разные, и лечатся они по-разному, поэтому не сваливаем их в
           одну формулировку. -->
      <div v-else class="mt-5">
        <p
          class="rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm px-3.5 py-3"
        >
          <template v-if="info?.configured">
            <span class="font-bold">Telegram отклонил токен бота.</span>
            Скорее всего токен отозвали или заменили в @BotFather. Обратитесь в поддержку Coolay —
            нужно прописать актуальный токен на сервере.
          </template>
          <template v-else>
            <span class="font-bold">Бот не подключён.</span>
            Токен бота хранится в настройках сервера и не вводится через браузер — так он не
            попадёт ни в историю запросов, ни в расширения. Обратитесь в поддержку Coolay, чтобы
            подключить бота вашей компании.
          </template>
        </p>
      </div>
    </div>

    <!-- Сотрудники -->
    <div v-if="!loading && !error" class="card p-6">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 class="font-extrabold text-ink-900">Сотрудники в боте</h3>
          <p class="text-sm text-ink-400 mt-0.5">
            Список тот же, что в «Настройках» — здесь видно, кто уже дошёл до бота.
          </p>
        </div>
        <RouterLink to="/settings" class="btn btn-dark btn-sm shrink-0">
          <Icon name="userPlus" :size="16" /> Добавить сотрудника
        </RouterLink>
      </div>

      <div v-if="employees.length" class="mt-4 -mx-2 overflow-x-auto">
        <table class="w-full text-sm min-w-[620px]">
          <thead>
            <tr class="border-b border-ink-100 text-left">
              <th class="font-bold text-ink-500 text-xs uppercase tracking-wide px-2 py-2.5">
                Сотрудник
              </th>
              <th class="font-bold text-ink-500 text-xs uppercase tracking-wide px-2 py-2.5">
                Телефон
              </th>
              <th class="font-bold text-ink-500 text-xs uppercase tracking-wide px-2 py-2.5">
                Состояние
              </th>
              <th class="font-bold text-ink-500 text-xs uppercase tracking-wide px-2 py-2.5">
                Подключён
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in employees" :key="e.id" class="border-b border-ink-50 hover:bg-ink-50/50">
              <td class="px-2 py-3">
                <div class="flex items-center gap-2.5">
                  <Avatar :name="e.fullName" :size="32" />
                  <div class="min-w-0">
                    <p class="font-semibold text-ink-900 truncate">{{ e.fullName }}</p>
                    <p v-if="e.telegramUsername" class="text-xs text-sky-600">
                      @{{ e.telegramUsername }}
                    </p>
                  </div>
                </div>
              </td>
              <td class="px-2 py-3 whitespace-nowrap text-ink-600">{{ fmtPhone(e.phone) }}</td>
              <td class="px-2 py-3">
                <span class="chip whitespace-nowrap" :class="state(e).cls">
                  <span class="w-1.5 h-1.5 rounded-full" :class="state(e).dot" />
                  {{ state(e).label }}
                </span>
              </td>
              <td class="px-2 py-3 whitespace-nowrap text-ink-500 text-xs">
                {{ fmtDate(e.botVerifiedAt) || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="mt-4 text-center py-8 px-6">
        <p class="font-bold text-ink-900">Сотрудников пока нет</p>
        <p class="text-sm text-ink-400 mt-1 max-w-md mx-auto">
          Добавьте сотрудника с номером телефона — и он сможет создавать карточки в Telegram,
          без пароля и входа на сайт.
        </p>
        <RouterLink to="/settings" class="btn btn-accent btn-md mt-4">
          <Icon name="userPlus" :size="18" /> Перейти в Настройки
        </RouterLink>
      </div>

      <p v-if="waiting" class="text-xs text-ink-400 mt-3">
        Ждут первого входа в бота: <span class="font-bold text-ink-700">{{ waiting }}</span> —
        им нужно открыть бота и поделиться контактом.
      </p>
    </div>
  </div>
</template>
