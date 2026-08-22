<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import { homeScenarios } from '@/data/mock'
import { isFail, teamApi, type ActivityItem, type UsageState } from '@/data/platformApi'
import { useProductCardsStore } from '@/stores/productCards'

const router = useRouter()
const cardsStore = useProductCardsStore()

/*
 * СТАТИСТИКА СЧИТАЕТСЯ ПО ФАКТУ, а не берётся из демо-набора.
 *
 * Раньше плитки показывали красивые, но выдуманные числа (12 458 генераций,
 * 3 256 товаров, «↑18% за неделю»). На демо это выглядело солидно, а в работе
 * вводило в заблуждение: цифры не менялись после генерации, и по ним нельзя
 * было понять ни расход кредитов, ни реальный объём каталога.
 */
const usage = ref<UsageState | null>(null)
const activity = ref<ActivityItem[]>([])

onMounted(async () => {
  const [u, a] = await Promise.all([teamApi.usage(), teamApi.activity(8)])
  // Клиент API не бросает исключения, а возвращает Fail — молча пропускаем:
  // дашборд не должен падать целиком из-за одной плитки.
  if (!isFail(u)) usage.value = u.usage
  if (!isFail(a)) activity.value = a.activity
})

/** Кадры, реально сгенерированные во всех карточках. */
const framesDone = computed(() =>
  cardsStore.cards.reduce(
    (sum, c) => sum + (c.images || []).filter((i) => i.state === 'success' && i.url).length,
    0,
  ),
)

const cardsTotal = computed(() => cardsStore.cards.length)

/** Карточки, созданные за последние 7 дней — вместо вымышленного тренда. */
const cardsThisWeek = computed(() => {
  const weekAgo = Date.now() - 7 * 86400000
  return cardsStore.cards.filter((c) => Date.parse(c.createdAt || '') >= weekAgo).length
})

const creditsLeft = computed(() => usage.value?.left ?? 0)
const creditsLimit = computed(() => usage.value?.limit ?? 0)

/**
 * Вид события в журнале. Типы приходят с сервера (team.js, telegram.js);
 * для незнакомого типа берём нейтральное оформление, чтобы новое событие
 * на бэкенде не приводило к пустой иконке в интерфейсе.
 */
const activityLook: Record<string, { icon: string; tone: string }> = {
  card_created: { icon: 'card', tone: 'bg-emerald-50 text-emerald-700' },
  project_created: { icon: 'folder', tone: 'bg-brand-50 text-brand-700' },
  project_updated: { icon: 'edit', tone: 'bg-sky-50 text-sky-700' },
  employee_added: { icon: 'userPlus', tone: 'bg-amber-50 text-amber-700' },
  bot_login: { icon: 'send', tone: 'bg-sky-50 text-sky-700' },
  web_app: { icon: 'send', tone: 'bg-sky-50 text-sky-700' },
  access_granted: { icon: 'unlock', tone: 'bg-emerald-50 text-emerald-700' },
  access_revoked: { icon: 'ban', tone: 'bg-red-50 text-red-600' },
  claimed: { icon: 'user', tone: 'bg-ink-100 text-ink-600' },
  released: { icon: 'user', tone: 'bg-ink-100 text-ink-600' },
}

function look(type: string) {
  return activityLook[type] || { icon: 'sparkles', tone: 'bg-ink-100 text-ink-600' }
}

/** Время события: «сегодня, 11:24» — привычнее, чем полная дата. */
function fmtActivityTime(iso: string) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return `Сегодня, ${time}`
  if (days === 1) return `Вчера, ${time}`
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`
}

/*
 * «Недавние проекты» показывают РЕАЛЬНО созданные карточки вместо прежней
 * заглушки: на демо-данных блок вводил в заблуждение — выглядел как история
 * работы, но не менялся после генерации и вёл на общий список.
 */
onMounted(() => {
  void cardsStore.restore()
})

/** Дата в человеческом виде: «сегодня», «вчера», иначе короткая дата. */
function fmtWhen(iso: string) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'вчера'
  if (days < 7) return `${days} дн. назад`
  return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const recentProjects = computed(() =>
  cardsStore.recentCards.slice(0, 4).map((c) => ({
    id: c.id,
    title: c.content?.ru?.name || c.analysis?.title || c.sku,
    // Показываем готовый кадр, а не исходное фото: пользователь узнаёт
    // карточку по результату генерации.
    thumbnail: c.images?.find((i) => i.state === 'success' && i.url)?.url || c.sourceImage || '',
    type: c.analysis?.productType || 'Карточка товара',
    updatedAt: fmtWhen(c.updatedAt || c.createdAt),
    to: `/studios/product-cards/${c.id}`,
  })),
)
const assistantOpen = ref(false)

const toneBg: Record<string, string> = {
  mint: 'from-emerald-50 to-white border-emerald-100',
  sky: 'from-sky-50 to-white border-sky-100',
  rose: 'from-rose-50 to-white border-rose-100',
  amber: 'from-amber-50 to-white border-amber-100',
  brand: 'from-brand-50 to-white border-brand-100',
  lime: 'from-lime-50 to-white border-lime-100',
}

const fmt = (n: number) => n.toLocaleString('ru-RU')

function openAssistant() {
  assistantOpen.value = true
}
</script>

<template>
  <div class="page space-y-5 animate-fade-in pb-20">
    <!-- Greeting + compact metrics -->
    <div class="grid grid-cols-1 xl:grid-cols-[minmax(300px,1fr)_minmax(600px,1.35fr)] gap-5 items-center">
      <div>
        <h1 class="text-2xl sm:text-[28px] font-extrabold text-ink-900 tracking-tight">
          Добро пожаловать в Coolay!
        </h1>
        <p class="text-ink-400 mt-1 text-[13px] leading-relaxed max-w-xl">
          Подготовьте товар к продаже: создайте карточку, обработайте фото,
          наденьте одежду на модель или запустите пакетную обработку.
        </p>
      </div>

      <div class="card px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-1 divide-x divide-ink-100">
        <div class="flex items-center gap-2.5 px-2">
          <span class="grid place-items-center w-9 h-9 rounded-xl bg-brand-50 text-brand-600 shrink-0">
            <Icon name="sparkles" :size="18" />
          </span>
          <div class="min-w-0">
            <p class="text-[10px] text-ink-400">Кадров создано</p>
            <p class="text-lg font-extrabold leading-tight text-ink-900">{{ fmt(framesDone) }}</p>
            <p class="text-[9px] text-ink-400">Во всех карточках</p>
          </div>
        </div>
        <RouterLink to="/studios/product-cards/history" class="flex items-center gap-2.5 px-3 group">
          <span class="grid place-items-center w-9 h-9 rounded-xl bg-brand-50 text-brand-600 shrink-0">
            <Icon name="folder" :size="18" />
          </span>
          <div>
            <p class="text-[10px] text-ink-400">Карточки</p>
            <p class="text-lg font-extrabold leading-tight text-ink-900 group-hover:text-brand-600">{{ fmt(cardsTotal) }}</p>
            <p class="text-[9px] text-ink-400">Всего</p>
          </div>
        </RouterLink>
        <RouterLink to="/studios/product-cards/history" class="flex items-center gap-2.5 px-3 group">
          <span class="grid place-items-center w-9 h-9 rounded-xl bg-rose-50 text-rose-500 shrink-0">
            <Icon name="shoppingBag" :size="18" />
          </span>
          <div>
            <p class="text-[10px] text-ink-400">За неделю</p>
            <p class="text-lg font-extrabold leading-tight text-ink-900 group-hover:text-rose-500">{{ fmt(cardsThisWeek) }}</p>
            <p class="text-[9px] text-ink-400">Новых карточек</p>
          </div>
        </RouterLink>
        <div class="flex items-center gap-2.5 px-3">
          <span class="grid place-items-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
            <Icon name="bolt" :size="18" />
          </span>
          <div>
            <p class="text-[10px] text-ink-400">Осталось</p>
            <p class="text-lg font-extrabold leading-tight text-ink-900">{{ fmt(creditsLeft) }}</p>
            <p class="text-[9px] text-ink-400">
              {{ creditsLimit ? `из ${fmt(creditsLimit)}` : 'кредитов' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Scenarios -->
    <section>
      <div class="flex items-end justify-between gap-3 mb-3">
        <div>
          <h2 class="font-extrabold text-ink-900 text-base sm:text-lg">Что хотите сделать?</h2>
          <p class="text-xs text-ink-400 mt-0.5">Выберите сценарий — Coolay подберёт нужные инструменты для задачи</p>
        </div>
        <RouterLink
          to="/tools"
          class="text-sm font-bold text-ink-700 hover:text-ink-900 inline-flex items-center gap-1 shrink-0"
        >
          Все инструменты <Icon name="chevronRight" :size="16" />
        </RouterLink>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <RouterLink
          v-for="s in homeScenarios"
          :key="s.id"
          :to="s.to"
          class="group relative overflow-hidden rounded-2xl border bg-white p-2.5 transition-all hover:shadow-card hover:-translate-y-0.5"
          :class="toneBg[s.tone]"
        >
          <div class="relative aspect-[4/3] rounded-xl overflow-hidden bg-ink-50 mb-2.5">
            <img :src="s.image" :alt="s.title" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            <span class="absolute right-2 bottom-2 grid place-items-center w-7 h-7 rounded-full bg-white text-brand-600 shadow-soft">
              <Icon :name="s.icon" :size="14" />
            </span>
          </div>
          <div class="min-w-0">
            <h3 class="font-bold text-[13px] text-ink-900 leading-snug min-h-[34px]">{{ s.title }}</h3>
            <p class="text-[10px] text-ink-400 mt-1 leading-relaxed line-clamp-3 min-h-[42px]">{{ s.description }}</p>
            <div class="mt-2 flex justify-end">
              <span class="grid place-items-center w-7 h-7 rounded-full text-ink-700 group-hover:bg-ink-900 group-hover:text-accent transition-colors">
                <Icon name="chevronRight" :size="15" />
              </span>
            </div>
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- Projects + Activity -->
    <div class="grid grid-cols-1 xl:grid-cols-5 gap-5">
      <section class="xl:col-span-3">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-extrabold text-ink-900 text-base">Недавние проекты</h2>
          <RouterLink
            to="/projects"
            class="text-sm font-bold text-ink-700 hover:text-ink-900 inline-flex items-center gap-1"
          >
            Все проекты <Icon name="chevronRight" :size="16" />
          </RouterLink>
        </div>
        <!-- Пока нет ни одной карточки: ведём к созданию, а не показываем пустоту -->
        <RouterLink
          v-if="!recentProjects.length && !cardsStore.loading"
          to="/studios/product-cards"
          class="flex items-center gap-3 p-4 rounded-xl border border-dashed border-ink-200 hover:border-brand-400 hover:bg-brand-50/40 transition"
        >
          <div class="grid place-items-center w-10 h-10 rounded-xl bg-brand-50 text-brand-600 shrink-0">
            <Icon name="sparkles" :size="18" />
          </div>
          <div class="min-w-0">
            <div class="font-bold text-ink-900 text-sm">Здесь появятся ваши карточки</div>
            <div class="text-xs text-ink-500 mt-0.5">
              Загрузите фото товара — и создайте первую карточку
            </div>
          </div>
        </RouterLink>

        <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <RouterLink
            v-for="p in recentProjects"
            :key="p.id"
            :to="p.to"
            class="group block min-w-0"
          >
            <div class="relative aspect-[16/9] rounded-xl overflow-hidden bg-ink-100 mb-2">
              <img
                v-if="p.thumbnail"
                :src="p.thumbnail"
                :alt="p.title"
                class="w-full h-full object-cover"
                loading="lazy"
              />
              <div v-else class="w-full h-full grid place-items-center text-ink-400">
                <Icon name="image" :size="20" />
              </div>
              <button
                type="button"
                class="absolute top-1.5 right-1.5 grid place-items-center w-7 h-7 rounded-lg bg-white/90 text-ink-500 hover:text-ink-900"
                @click.prevent
              >
                <Icon name="more" :size="15" />
              </button>
            </div>
            <div class="min-w-0 px-0.5">
              <div class="font-bold text-ink-900 text-[12px] truncate group-hover:text-brand-600">
                {{ p.title }}
              </div>
              <div class="text-[10px] text-emerald-600 mt-1">{{ p.type }}</div>
              <div class="text-[9px] text-ink-400 mt-0.5">{{ p.updatedAt }}</div>
            </div>
          </RouterLink>
        </div>
      </section>

      <section class="xl:col-span-2">
        <div class="flex items-center justify-between mb-3">
          <h2 class="font-extrabold text-ink-900 text-base">Последняя активность</h2>
          <RouterLink
            to="/history"
            class="text-sm font-bold text-ink-700 hover:text-ink-900 inline-flex items-center gap-1"
          >
            История <Icon name="chevronRight" :size="16" />
          </RouterLink>
        </div>
        <div class="card divide-y divide-ink-50 px-1">
          <div
            v-for="a in activity"
            :key="a.id"
            class="flex items-center gap-2.5 px-3 py-2"
          >
            <span
              class="grid place-items-center w-8 h-8 rounded-lg shrink-0"
              :class="look(a.type).tone"
            >
              <Icon :name="look(a.type).icon" :size="15" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-[12px] font-semibold text-ink-900 truncate">{{ a.text }}</div>
              <div class="text-[9px] text-ink-400 mt-0.5">{{ fmtActivityTime(a.at) }}</div>
            </div>
          </div>
          <!-- Пустое состояние вместо демо-списка: пустой журнал честнее
               выдуманных событий, по которым непонятно, что происходит. -->
          <div v-if="!activity.length" class="px-3 py-8 text-center">
            <p class="text-[12px] font-semibold text-ink-500">Пока ничего не происходило</p>
            <p class="text-[10px] text-ink-400 mt-1">
              Создайте карточку товара — событие появится здесь.
            </p>
          </div>
        </div>
      </section>
    </div>

    <!-- Bottom help banner -->
    <div
      class="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 via-fuchsia-50/40 to-white px-5 py-3.5"
    >
      <div class="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
        <div class="min-w-0 flex-1">
          <h3 class="font-extrabold text-ink-900 text-sm">Не знаете, с чего начать?</h3>
          <p class="text-[11px] text-ink-500 mt-1">
            Быстрые подсказки:
            <RouterLink to="/studios/product-cards" class="font-semibold text-ink-800 hover:underline">карточка товара</RouterLink>,
            <RouterLink to="/studios/product-cards/history" class="font-semibold text-ink-800 hover:underline">история карточек</RouterLink>
            или
            <RouterLink to="/templates" class="font-semibold text-ink-800 hover:underline">готовые шаблоны</RouterLink>.
          </p>
        </div>
        <button type="button" class="btn btn-md shrink-0 bg-[hsl(66.03deg_100%_55.1%)] text-ink-900 hover:brightness-110" @click="openAssistant">
          <Icon name="sparkles" :size="18" />
          Открыть ассистента
        </button>
      </div>
    </div>

    <!-- Simple assistant modal -->
    <teleport to="body">
      <div
        v-if="assistantOpen"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        @click.self="assistantOpen = false"
      >
        <div class="w-full max-w-md card shadow-pop p-6 animate-scale-in">
          <div class="flex items-start justify-between gap-3 mb-4">
            <div>
              <div class="chip bg-accent text-ink-900 mb-2">
                <Icon name="sparkles" :size="14" /> Coolay Assistant
              </div>
              <h3 class="text-lg font-extrabold text-ink-900">Чем помочь?</h3>
              <p class="text-sm text-ink-500 mt-1">Выберите сценарий — я открою нужный раздел.</p>
            </div>
            <button
              type="button"
              class="grid place-items-center w-9 h-9 rounded-lg hover:bg-ink-50 text-ink-500"
              @click="assistantOpen = false"
            >
              <Icon name="x" :size="18" />
            </button>
          </div>
          <div class="space-y-2">
            <button
              v-for="s in homeScenarios.slice(0, 4)"
              :key="s.id"
              type="button"
              class="w-full flex items-center gap-3 px-3 h-12 rounded-xl border border-ink-100 hover:border-ink-900 hover:bg-ink-50 text-left transition"
              @click="assistantOpen = false; router.push(s.to)"
            >
              <Icon :name="s.icon" :size="18" class="text-ink-700" />
              <span class="text-sm font-semibold text-ink-900">{{ s.title }}</span>
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>
