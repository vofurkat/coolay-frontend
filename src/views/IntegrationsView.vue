<script setup lang="ts">
/**
 * Интеграции.
 *
 * ЧТО ИЗМЕНИЛОСЬ И ПОЧЕМУ. Раньше страница показывала «1С — подключено,
 * 1 248 товаров синхронизировано», «МойСклад — 873 товара» и кнопки
 * «Отключить». Ни одной из этих интеграций на сервере не существует: кнопка
 * лишь переключала флаг в памяти браузера и после перезагрузки всё
 * возвращалось. Для владельца это опаснее, чем пустой раздел: можно решить,
 * что каталог уже синхронизируется, и не заметить, что товары никуда не идут.
 *
 * Поэтому теперь реально работающая интеграция (Telegram-бот) отделена от
 * запланированных, а у запланированных нет кнопок, которые ничего не делают.
 */
import { computed, onMounted, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Icon from '@/components/ui/Icon.vue'
import TelegramBotPanel from '@/components/integrations/TelegramBotPanel.vue'
import { isFail, telegramApi } from '@/data/platformApi'

type Category = 'erp' | 'telegram' | 'whatsapp'

interface IntegrationCard {
  id: string
  name: string
  logo: string
  category: Category
  description: string
  /** live — работает сейчас; planned — в разработке, кнопок действий нет. */
  state: 'live' | 'planned'
}

const catalog: IntegrationCard[] = [
  {
    id: 'tg-bot',
    name: 'Telegram-бот',
    logo: 'TG',
    category: 'telegram',
    description:
      'Сотрудник создаёт карточки прямо в Telegram — по одному товару или пакетом до 10 штук.',
    state: 'live',
  },
  {
    id: 'erp-1c',
    name: '1С',
    logo: '1C',
    category: 'erp',
    description: 'Синхронизация номенклатуры и остатков.',
    state: 'planned',
  },
  {
    id: 'erp-moysklad',
    name: 'МойСклад',
    logo: 'МС',
    category: 'erp',
    description: 'Импорт товаров и автообновление карточек.',
    state: 'planned',
  },
  {
    id: 'erp-wb',
    name: 'Wildberries',
    logo: 'WB',
    category: 'erp',
    description: 'Выгрузка готовых карточек на маркетплейс.',
    state: 'planned',
  },
  {
    id: 'erp-ozon',
    name: 'Ozon',
    logo: 'OZ',
    category: 'erp',
    description: 'Автопубликация карточек товаров.',
    state: 'planned',
  },
  {
    id: 'erp-bitrix',
    name: 'Bitrix24',
    logo: 'B24',
    category: 'erp',
    description: 'CRM и каталог товаров.',
    state: 'planned',
  },
  {
    id: 'wa-business',
    name: 'WhatsApp Business',
    logo: 'WA',
    category: 'whatsapp',
    description: 'Приём фото товара и выдача карточек в WhatsApp.',
    state: 'planned',
  },
]

const filter = ref<'all' | Category>('all')

const categories = [
  { key: 'all', label: 'Все', icon: 'grid' },
  { key: 'telegram', label: 'Telegram-бот', icon: 'telegram' },
  { key: 'erp', label: 'ERP и маркетплейсы', icon: 'store' },
  { key: 'whatsapp', label: 'WhatsApp-бот', icon: 'whatsapp' },
] as const

const catLogoCls: Record<Category, string> = {
  erp: 'bg-ink-100 text-ink-600',
  telegram: 'bg-sky-100 text-sky-600',
  whatsapp: 'bg-green-100 text-green-600',
}

const list = computed(() =>
  filter.value === 'all' ? catalog : catalog.filter((i) => i.category === filter.value),
)

function countOf(cat: 'all' | Category) {
  return cat === 'all' ? catalog.length : catalog.filter((i) => i.category === cat).length
}

/*
 * Счётчик активных берётся с сервера, а не считается по списку выше: единственная
 * работающая интеграция — бот, и «активна» она лишь когда действительно подключена.
 */
const botLive = ref(false)

onMounted(async () => {
  const r = await telegramApi.botInfo()
  // botAvailable остаётся true и когда связь с Telegram временно потеряна
  // (ответ из кэша): интеграция от этого работать не перестаёт, а мигающий
  // счётчик «Активно: 0» только сбивал бы с толку.
  if (!isFail(r)) botLive.value = r.botAvailable
})

const activeCount = computed(() => (botLive.value ? 1 : 0))
</script>

<template>
  <div class="page space-y-6 animate-fade-in">
    <PageHeader
      title="Интеграции"
      subtitle="Работайте с каталогом из Telegram, а скоро — напрямую из вашей ERP"
    >
      <template #actions>
        <span class="chip bg-ink-50 text-ink-600">
          <span
            class="w-2 h-2 rounded-full"
            :class="activeCount ? 'bg-green-500' : 'bg-ink-300'"
          />
          Активно: {{ activeCount }}
        </span>
      </template>
    </PageHeader>

    <!-- Highlight -->
    <div class="relative overflow-hidden rounded-2xl bg-ink-900 p-6">
      <div class="absolute -top-12 -right-8 w-56 h-56 rounded-full bg-accent/15 blur-3xl" />
      <div class="relative flex items-start gap-4">
        <div class="grid place-items-center w-12 h-12 rounded-xl bg-accent text-ink-900 shrink-0">
          <Icon name="bolt" :size="24" />
        </div>
        <div>
          <h3 class="text-lg font-extrabold text-white">Карточки без входа на сайт</h3>
          <p class="text-white/50 text-sm mt-1 max-w-xl">
            Сотруднику достаточно телефона в базе: он открывает бота и генерирует карточки прямо
            в Telegram. Прямая работа с ERP и WhatsApp — в разработке.
          </p>
        </div>
      </div>
    </div>

    <!-- Category filter -->
    <div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
      <button
        v-for="c in categories"
        :key="c.key"
        class="btn btn-sm whitespace-nowrap"
        :class="filter === c.key ? 'btn-dark' : 'btn-outline'"
        @click="filter = c.key"
      >
        <Icon :name="c.icon" :size="16" /> {{ c.label }}
        <span
          class="ml-1 inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold"
          :class="filter === c.key ? 'bg-accent text-ink-900' : 'bg-ink-100 text-ink-500'"
        >
          {{ countOf(c.key) }}
        </span>
      </button>
    </div>

    <!-- Telegram-бот: состояние и сотрудники -->
    <TelegramBotPanel v-if="filter === 'telegram'" />

    <!-- Список -->
    <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="it in list" :key="it.id" class="card p-5 flex flex-col">
        <div class="flex items-start gap-4">
          <div
            class="grid place-items-center w-14 h-14 rounded-xl font-extrabold text-lg shrink-0"
            :class="it.state === 'live' ? 'bg-accent text-ink-900' : catLogoCls[it.category]"
          >
            {{ it.logo }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="font-bold text-ink-900">{{ it.name }}</h3>
              <span
                v-if="it.state === 'live'"
                class="chip bg-green-50 text-green-600 text-[10px]"
              >
                <Icon name="check" :size="11" /> Работает
              </span>
              <span v-else class="chip bg-ink-100 text-ink-500 text-[10px]">В разработке</span>
            </div>
            <p class="text-sm text-ink-400 mt-0.5">{{ it.description }}</p>
          </div>
        </div>

        <button
          v-if="it.category === 'telegram'"
          class="btn btn-md w-full mt-4 btn-dark"
          @click="filter = 'telegram'"
        >
          <Icon name="settings" :size="16" /> Открыть настройки бота
        </button>
        <!-- У запланированных интеграций кнопки нет намеренно: кнопка,
             которая ничего не подключает, создаёт ложное впечатление. -->
        <p v-else class="text-xs text-ink-400 mt-4 pt-3 border-t border-ink-50">
          Напишите в поддержку, если эта интеграция нужна вам в первую очередь — так мы
          понимаем, что делать раньше.
        </p>
      </div>
    </div>

    <div v-if="filter !== 'telegram' && !list.length" class="card p-10 text-center text-ink-400">
      В этой категории пока нет интеграций
    </div>
  </div>
</template>
