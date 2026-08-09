<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import { useProductCardsStore } from '@/stores/productCards'
import type { SkuCard, SkuCardStatus } from '@/types/sku'
import { LANG_LABEL, LANG_LIST } from '@/types/sku'

const store = useProductCardsStore()
const router = useRouter()

const query = ref('')
const status = ref<'all' | SkuCardStatus>('all')
const sort = ref<'new' | 'old' | 'ready'>('new')
const view = ref<'grid' | 'list'>('grid')

onMounted(() => store.restore())

const STATUS_LABEL: Record<SkuCardStatus, string> = {
  active: 'Активная',
  draft: 'Черновик',
  archived: 'В архиве',
}

const STATUS_TONE: Record<SkuCardStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  draft: 'bg-amber-50 text-amber-700',
  archived: 'bg-ink-100 text-ink-500',
}

const counts = computed(() => {
  const c = { all: store.cards.length, active: 0, draft: 0, archived: 0 }
  store.cards.forEach((x) => (c[x.status] += 1))
  return c
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  let list = store.cards.slice()
  if (status.value !== 'all') list = list.filter((c) => c.status === status.value)
  if (q) {
    list = list.filter((c) => {
      const name = c.content.ru?.name || c.analysis?.title || ''
      return (
        name.toLowerCase().includes(q) ||
        c.sku.toLowerCase().includes(q) ||
        c.productId.toLowerCase().includes(q) ||
        (c.analysis?.category || '').toLowerCase().includes(q)
      )
    })
  }
  if (sort.value === 'old') list.reverse()
  if (sort.value === 'ready') list.sort((a, b) => b.readiness.total - a.readiness.total)
  return list
})

function cardName(c: SkuCard) {
  return c.content.ru?.name || c.analysis?.title || 'Без названия'
}

function cardCover(c: SkuCard) {
  return c.images.find((i) => i.state === 'success')?.url || c.sourceImage || ''
}

function langsReady(c: SkuCard) {
  return LANG_LIST.filter((l) => c.content[l]?.name)
}

function fmt(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function open(c: SkuCard) {
  router.push(`/studios/product-cards/${c.id}`)
}

function remove(c: SkuCard) {
  if (confirm(`Удалить карточку ${c.sku}?`)) store.removeCard(c.id)
}

function exportAll() {
  const blob = new Blob([JSON.stringify(store.cards, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `coolay-sku-cards-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <div class="page space-y-6 animate-fade-in">
    <!-- Хлебные крошки -->
    <div class="flex items-center gap-1.5 text-xs text-ink-400">
      <RouterLink to="/" class="hover:text-ink-700">Главная</RouterLink>
      <Icon name="chevronRight" :size="12" />
      <RouterLink to="/studios/product-cards" class="hover:text-ink-700">Карточки товара</RouterLink>
      <Icon name="chevronRight" :size="12" />
      <span class="text-ink-700 font-semibold">История</span>
    </div>

    <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
      <div>
        <h1 class="text-2xl sm:text-[28px] font-extrabold text-ink-900 tracking-tight">
          История карточек товара
        </h1>
        <p class="text-ink-400 mt-1 text-sm">
          Все созданные SKU-карточки хранятся здесь — можно открыть, экспортировать или продолжить
          работу.
        </p>
      </div>
      <div class="flex items-center gap-2.5 shrink-0">
        <button
          class="btn h-10 px-4 border border-ink-200 text-ink-700 hover:bg-ink-50 text-sm font-semibold whitespace-nowrap"
          :disabled="!store.cards.length"
          :class="!store.cards.length && 'opacity-50 cursor-not-allowed'"
          @click="exportAll"
        >
          <Icon name="download" :size="15" />
          Экспортировать все
        </button>
        <RouterLink
          to="/studios/product-cards"
          class="btn btn-brand h-10 px-4 text-sm font-semibold whitespace-nowrap"
        >
          <Icon name="plus" :size="15" />
          Создать карточку
        </RouterLink>
      </div>
    </div>

    <!-- Фильтры -->
    <div class="card p-3 flex flex-col lg:flex-row lg:items-center gap-3">
      <label class="relative flex-1 min-w-[220px]">
        <Icon
          name="search"
          :size="15"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300"
        />
        <input
          v-model="query"
          type="text"
          placeholder="Поиск по названию, SKU, ID или категории…"
          class="w-full h-10 pl-9 pr-3 rounded-xl border border-ink-200 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <div class="flex items-center gap-1 p-1 rounded-xl bg-ink-50 overflow-x-auto">
        <button
          v-for="s in (['all', 'active', 'draft', 'archived'] as const)"
          :key="s"
          class="h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition"
          :class="
            status === s ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-800'
          "
          @click="status = s"
        >
          {{ s === 'all' ? 'Все' : STATUS_LABEL[s] }}
          <span class="text-ink-300">{{ counts[s] }}</span>
        </button>
      </div>

      <select
        v-model="sort"
        class="h-10 px-3 rounded-xl border border-ink-200 text-sm outline-none focus:border-brand-400 bg-white"
      >
        <option value="new">Сначала новые</option>
        <option value="old">Сначала старые</option>
        <option value="ready">По готовности</option>
      </select>

      <div class="flex items-center gap-1 p-1 rounded-xl bg-ink-50">
        <button
          class="h-8 w-8 grid place-items-center rounded-lg transition"
          :class="view === 'grid' ? 'bg-white shadow-soft text-ink-900' : 'text-ink-400'"
          title="Плитка"
          @click="view = 'grid'"
        >
          <Icon name="grid" :size="15" />
        </button>
        <button
          class="h-8 w-8 grid place-items-center rounded-lg transition"
          :class="view === 'list' ? 'bg-white shadow-soft text-ink-900' : 'text-ink-400'"
          title="Список"
          @click="view = 'list'"
        >
          <Icon name="listUl" :size="15" />
        </button>
      </div>
    </div>

    <!-- Пусто -->
    <div v-if="!filtered.length" class="card p-10 text-center">
      <div class="mx-auto h-14 w-14 rounded-2xl bg-brand-50 grid place-items-center">
        <Icon name="history" :size="24" class="text-brand-600" />
      </div>
      <h3 class="mt-4 text-base font-bold text-ink-900">
        {{ store.cards.length ? 'Ничего не найдено' : 'Пока нет созданных карточек' }}
      </h3>
      <p class="mt-1 text-sm text-ink-400 max-w-md mx-auto">
        {{
          store.cards.length
            ? 'Попробуйте изменить поисковый запрос или сбросить фильтры.'
            : 'Загрузите фото товара — AI создаст карточку с описанием, характеристиками, SEO и студийными изображениями.'
        }}
      </p>
      <RouterLink
        v-if="!store.cards.length"
        to="/studios/product-cards"
        class="btn btn-brand h-10 px-5 text-sm font-semibold mt-5 inline-flex"
      >
        <Icon name="upload" :size="15" />
        Загрузить фото
      </RouterLink>
    </div>

    <!-- Плитка -->
    <div
      v-else-if="view === 'grid'"
      class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
    >
      <article
        v-for="c in filtered"
        :key="c.id"
        class="card overflow-hidden group cursor-pointer hover:shadow-card transition"
        @click="open(c)"
      >
        <div class="relative aspect-[4/3] bg-ink-50">
          <img
            v-if="cardCover(c)"
            :src="cardCover(c)"
            :alt="cardName(c)"
            class="w-full h-full object-contain"
          />
          <div v-else class="w-full h-full grid place-items-center">
            <Icon name="image" :size="26" class="text-ink-300" />
          </div>
          <span
            class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold"
            :class="STATUS_TONE[c.status]"
          >
            {{ STATUS_LABEL[c.status] }}
          </span>
          <span
            class="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/90 text-ink-700"
          >
            {{ c.readiness.total }}%
          </span>
          <button
            class="absolute bottom-2 right-2 h-7 w-7 rounded-lg bg-white/90 grid place-items-center text-ink-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition"
            title="Удалить"
            @click.stop="remove(c)"
          >
            <Icon name="trash" :size="13" />
          </button>
        </div>
        <div class="p-3.5 space-y-2">
          <h3 class="text-sm font-bold text-ink-900 leading-snug line-clamp-2">
            {{ cardName(c) }}
          </h3>
          <p class="text-[11px] text-ink-400 font-mono">SKU: {{ c.sku }}</p>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="l in langsReady(c)"
              :key="l"
              class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-brand-50 text-brand-700"
            >
              {{ LANG_LABEL[l] }}
            </span>
            <span
              v-if="c.images.length"
              class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-ink-100 text-ink-600"
            >
              {{ c.images.length }} фото
            </span>
          </div>
          <p class="text-[11px] text-ink-300 pt-0.5">{{ fmt(c.createdAt) }}</p>
        </div>
      </article>
    </div>

    <!-- Список -->
    <div v-else class="card overflow-hidden">
      <div
        class="hidden md:grid grid-cols-[64px_2fr_1fr_1fr_120px_110px_40px] gap-3 px-4 py-2.5 bg-ink-50 text-[11px] font-bold text-ink-400 uppercase tracking-wide"
      >
        <span>Фото</span>
        <span>Название</span>
        <span>SKU / ID</span>
        <span>Категория</span>
        <span>Готовность</span>
        <span>Создано</span>
        <span />
      </div>
      <div class="divide-y divide-ink-100">
        <div
          v-for="c in filtered"
          :key="c.id"
          class="grid grid-cols-[56px_1fr] md:grid-cols-[64px_2fr_1fr_1fr_120px_110px_40px] gap-3 px-4 py-3 items-center hover:bg-ink-50/60 cursor-pointer"
          @click="open(c)"
        >
          <div class="h-12 w-12 rounded-lg bg-ink-50 overflow-hidden grid place-items-center">
            <img
              v-if="cardCover(c)"
              :src="cardCover(c)"
              alt=""
              class="w-full h-full object-contain"
            />
            <Icon v-else name="image" :size="16" class="text-ink-300" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-ink-900 truncate">{{ cardName(c) }}</p>
            <p class="text-[11px] text-ink-400 md:hidden font-mono">{{ c.sku }}</p>
          </div>
          <div class="hidden md:block min-w-0">
            <p class="text-xs font-mono text-ink-700 truncate">{{ c.sku }}</p>
            <p class="text-[11px] font-mono text-ink-300 truncate">{{ c.productId }}</p>
          </div>
          <p class="hidden md:block text-xs text-ink-500 truncate">
            {{ c.analysis?.category || '—' }}
          </p>
          <div class="hidden md:flex items-center gap-2">
            <div class="h-1.5 flex-1 rounded-full bg-ink-100 overflow-hidden">
              <div
                class="h-full rounded-full"
                :class="
                  c.readiness.total >= 85
                    ? 'bg-emerald-500'
                    : c.readiness.total >= 60
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                "
                :style="{ width: c.readiness.total + '%' }"
              />
            </div>
            <span class="text-[11px] font-bold text-ink-600">{{ c.readiness.total }}%</span>
          </div>
          <p class="hidden md:block text-[11px] text-ink-400">{{ fmt(c.createdAt) }}</p>
          <button
            class="hidden md:grid h-8 w-8 place-items-center rounded-lg text-ink-300 hover:text-rose-600 hover:bg-rose-50"
            title="Удалить"
            @click.stop="remove(c)"
          >
            <Icon name="trash" :size="14" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
