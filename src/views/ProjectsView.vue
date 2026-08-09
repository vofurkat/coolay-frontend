<script setup lang="ts">
/**
 * Мои проекты — рабочее пространство, где хранятся сгенерированные SKU-карточки.
 * Источник данных тот же, что у мастера и истории: стор productCards
 * (localStorage-ключ coolay_sku_cards), поэтому созданная карточка появляется
 * здесь сразу после шага 5, без отдельной синхронизации.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import { useProductCardsStore } from '@/stores/productCards'
import type { SkuCard, SkuCardStatus } from '@/types/sku'
import { LANG_LABEL, LANG_LIST } from '@/types/sku'

const store = useProductCardsStore()
const router = useRouter()

const query = ref('')
const status = ref<'all' | SkuCardStatus>('all')
const sort = ref<'new' | 'old' | 'ready' | 'name'>('new')
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

function cardName(c: SkuCard) {
  return c.content.ru?.name || c.analysis?.title || 'Без названия'
}

function cardCover(c: SkuCard) {
  return c.images.find((i) => i.state === 'success')?.url || c.sourceImage || ''
}

function langsReady(c: SkuCard) {
  return LANG_LIST.filter((l) => c.content[l]?.name)
}

/* ─────────── Сводка ─────────── */
const stats = computed(() => {
  const list = store.cards
  const photos = list.reduce((sum, c) => sum + c.images.length, 0)
  const credits = list.reduce((sum, c) => sum + (c.credits || 0), 0)
  const avg = list.length
    ? Math.round(list.reduce((sum, c) => sum + c.readiness.total, 0) / list.length)
    : 0
  return {
    total: list.length,
    photos,
    credits: Math.round(credits * 10) / 10,
    avg,
  }
})

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
    list = list.filter(
      (c) =>
        cardName(c).toLowerCase().includes(q) ||
        c.sku.toLowerCase().includes(q) ||
        c.productId.toLowerCase().includes(q) ||
        (c.analysis?.category || '').toLowerCase().includes(q),
    )
  }
  // store.cards уже отсортирован от новых к старым
  if (sort.value === 'old') list.reverse()
  else if (sort.value === 'ready') list.sort((a, b) => b.readiness.total - a.readiness.total)
  else if (sort.value === 'name') list.sort((a, b) => cardName(a).localeCompare(cardName(b), 'ru'))
  return list
})

function fmt(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function open(c: SkuCard) {
  router.push(`/studios/product-cards/${c.id}`)
}

function remove(c: SkuCard) {
  if (confirm(`Удалить карточку ${c.sku}? Действие необратимо.`)) store.removeCard(c.id)
}

function archive(c: SkuCard) {
  const next: SkuCardStatus = c.status === 'archived' ? 'active' : 'archived'
  store.updateCard(
    c.id,
    { status: next },
    next === 'archived' ? 'Карточка перемещена в архив' : 'Карточка возвращена из архива',
  )
}

function exportAll() {
  const blob = new Blob([JSON.stringify(store.cards, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `coolay-projects-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function resetFilters() {
  query.value = ''
  status.value = 'all'
}

function readyTone(v: number) {
  return v >= 85 ? 'bg-emerald-500' : v >= 60 ? 'bg-amber-500' : 'bg-rose-500'
}
</script>

<template>
  <div class="page space-y-6 animate-fade-in">
    <!-- ───────── Заголовок ───────── -->
    <header class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-[28px] font-extrabold text-ink-900 tracking-tight">
          Мои проекты
        </h1>
        <p class="text-ink-500 mt-1.5 text-sm leading-relaxed max-w-2xl">
          Здесь хранятся все сгенерированные SKU-карточки. Откройте карточку, чтобы отредактировать
          контент, изображения и статус публикации.
        </p>
      </div>
      <div class="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          class="btn btn-sm btn-outline"
          :disabled="!store.cards.length"
          @click="exportAll"
        >
          <Icon name="download" :size="15" />
          Экспорт
        </button>
        <RouterLink to="/studios/product-cards" class="btn btn-sm btn-violet">
          <Icon name="plus" :size="15" />
          Новая карточка
        </RouterLink>
      </div>
    </header>

    <!-- ───────── Сводка ───────── -->
    <div v-if="stats.total" class="grid gap-3 grid-cols-2 xl:grid-cols-4">
      <div class="card p-4 flex items-center gap-3">
        <span class="grid place-items-center w-10 h-10 rounded-xl bg-violet-50 text-violet-600 shrink-0">
          <Icon name="card" :size="19" />
        </span>
        <div class="min-w-0">
          <p class="text-[11px] text-ink-400 font-semibold">Карточек</p>
          <p class="text-xl font-extrabold text-ink-900 leading-tight">{{ stats.total }}</p>
        </div>
      </div>
      <div class="card p-4 flex items-center gap-3">
        <span class="grid place-items-center w-10 h-10 rounded-xl bg-sky-50 text-sky-600 shrink-0">
          <Icon name="image" :size="19" />
        </span>
        <div class="min-w-0">
          <p class="text-[11px] text-ink-400 font-semibold">Изображений</p>
          <p class="text-xl font-extrabold text-ink-900 leading-tight">{{ stats.photos }}</p>
        </div>
      </div>
      <div class="card p-4 flex items-center gap-3">
        <span class="grid place-items-center w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 shrink-0">
          <Icon name="target" :size="19" />
        </span>
        <div class="min-w-0">
          <p class="text-[11px] text-ink-400 font-semibold">Средняя готовность</p>
          <p class="text-xl font-extrabold text-ink-900 leading-tight">{{ stats.avg }}%</p>
        </div>
      </div>
      <div class="card p-4 flex items-center gap-3">
        <span class="grid place-items-center w-10 h-10 rounded-xl bg-amber-50 text-amber-600 shrink-0">
          <Icon name="bolt" :size="19" />
        </span>
        <div class="min-w-0">
          <p class="text-[11px] text-ink-400 font-semibold">Затрачено кредитов</p>
          <p class="text-xl font-extrabold text-ink-900 leading-tight">{{ stats.credits }}</p>
        </div>
      </div>
    </div>

    <!-- ───────── Фильтры ───────── -->
    <div v-if="store.cards.length" class="card p-3 flex flex-col lg:flex-row lg:items-center gap-3">
      <label class="relative flex-1 min-w-0">
        <Icon
          name="search"
          :size="15"
          class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none"
        />
        <input
          v-model="query"
          type="text"
          placeholder="Поиск по названию, SKU, ID или категории…"
          class="w-full h-10 pl-9 pr-3 rounded-xl border border-ink-200 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </label>

      <div class="flex items-center gap-1 p-1 rounded-xl bg-ink-50 overflow-x-auto no-scrollbar">
        <button
          v-for="s in (['all', 'active', 'draft', 'archived'] as const)"
          :key="s"
          type="button"
          class="h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition"
          :class="status === s ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-800'"
          @click="status = s"
        >
          {{ s === 'all' ? 'Все' : STATUS_LABEL[s] }}
          <span class="text-ink-300">{{ counts[s] }}</span>
        </button>
      </div>

      <select
        v-model="sort"
        class="h-10 px-3 rounded-xl border border-ink-200 text-sm outline-none focus:border-violet-400 bg-white shrink-0"
        aria-label="Сортировка"
      >
        <option value="new">Сначала новые</option>
        <option value="old">Сначала старые</option>
        <option value="ready">По готовности</option>
        <option value="name">По названию</option>
      </select>

      <div class="flex items-center gap-1 p-1 rounded-xl bg-ink-50 shrink-0">
        <button
          type="button"
          class="h-8 w-8 grid place-items-center rounded-lg transition"
          :class="view === 'grid' ? 'bg-white shadow-soft text-ink-900' : 'text-ink-400'"
          title="Плитка"
          @click="view = 'grid'"
        >
          <Icon name="grid" :size="15" />
        </button>
        <button
          type="button"
          class="h-8 w-8 grid place-items-center rounded-lg transition"
          :class="view === 'list' ? 'bg-white shadow-soft text-ink-900' : 'text-ink-400'"
          title="Список"
          @click="view = 'list'"
        >
          <Icon name="listUl" :size="15" />
        </button>
      </div>
    </div>

    <!-- ───────── Пусто ───────── -->
    <div v-if="!filtered.length" class="card p-10 text-center">
      <div class="mx-auto h-14 w-14 rounded-2xl bg-violet-50 grid place-items-center">
        <Icon name="folder" :size="24" class="text-violet-600" />
      </div>
      <h2 class="mt-4 text-base font-bold text-ink-900">
        {{ store.cards.length ? 'Ничего не найдено' : 'Проектов пока нет' }}
      </h2>
      <p class="mt-1.5 text-sm text-ink-500 max-w-md mx-auto leading-relaxed">
        {{
          store.cards.length
            ? 'Попробуйте изменить запрос или выбрать другой статус.'
            : 'Создайте первую карточку товара — она автоматически появится в этом разделе.'
        }}
      </p>
      <RouterLink
        v-if="!store.cards.length"
        to="/studios/product-cards"
        class="btn btn-md btn-violet mt-5 inline-flex"
      >
        <Icon name="sparkles" :size="16" />
        Создать карточку
      </RouterLink>
      <button v-else type="button" class="btn btn-sm btn-outline mt-5" @click="resetFilters">
        <Icon name="refresh" :size="15" />
        Сбросить фильтры
      </button>
    </div>

    <!-- ───────── Плитка ───────── -->
    <div v-else-if="view === 'grid'" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <article
        v-for="c in filtered"
        :key="c.id"
        class="card overflow-hidden group cursor-pointer hover:shadow-card hover:-translate-y-0.5 transition flex flex-col"
        @click="open(c)"
      >
        <div class="relative aspect-[4/3] bg-ink-50 shrink-0">
          <img
            v-if="cardCover(c)"
            :src="cardCover(c)"
            :alt="cardName(c)"
            class="w-full h-full object-contain"
            loading="lazy"
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
          <div
            class="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition"
          >
            <button
              type="button"
              class="h-7 w-7 rounded-lg bg-white/95 grid place-items-center text-ink-400 hover:text-violet-600"
              :title="c.status === 'archived' ? 'Вернуть из архива' : 'В архив'"
              @click.stop="archive(c)"
            >
              <Icon name="box" :size="13" />
            </button>
            <button
              type="button"
              class="h-7 w-7 rounded-lg bg-white/95 grid place-items-center text-ink-400 hover:text-rose-600"
              title="Удалить"
              @click.stop="remove(c)"
            >
              <Icon name="trash" :size="13" />
            </button>
          </div>
        </div>
        <div class="p-3.5 flex flex-col flex-1 min-w-0">
          <h3 class="text-sm font-bold text-ink-900 leading-snug line-clamp-2">
            {{ cardName(c) }}
          </h3>
          <p class="text-[11px] text-ink-400 font-mono mt-1.5">{{ c.sku }}</p>
          <div class="flex flex-wrap gap-1 mt-2">
            <span
              v-for="l in langsReady(c)"
              :key="l"
              class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-50 text-violet-700"
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
          <div class="mt-auto pt-3">
            <div class="h-1.5 rounded-full bg-ink-100 overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="readyTone(c.readiness.total)"
                :style="{ width: c.readiness.total + '%' }"
              />
            </div>
            <p class="text-[11px] text-ink-300 mt-2">{{ fmt(c.createdAt) }}</p>
          </div>
        </div>
      </article>
    </div>

    <!-- ───────── Список ───────── -->
    <div v-else class="card overflow-hidden">
      <div
        class="hidden md:grid grid-cols-[64px_2fr_1fr_1fr_130px_110px_76px] gap-3 px-4 py-2.5 bg-ink-50 text-[11px] font-bold text-ink-400 uppercase tracking-wide"
      >
        <span>Фото</span>
        <span>Название</span>
        <span>SKU / ID</span>
        <span>Категория</span>
        <span>Готовность</span>
        <span>Создано</span>
        <span class="text-right">Действия</span>
      </div>
      <div class="divide-y divide-ink-100">
        <div
          v-for="c in filtered"
          :key="c.id"
          class="grid grid-cols-[56px_1fr] md:grid-cols-[64px_2fr_1fr_1fr_130px_110px_76px] gap-3 px-4 py-3 items-center hover:bg-ink-50/60 cursor-pointer transition"
          @click="open(c)"
        >
          <div class="h-12 w-12 rounded-lg bg-ink-50 overflow-hidden grid place-items-center">
            <img
              v-if="cardCover(c)"
              :src="cardCover(c)"
              alt=""
              class="w-full h-full object-contain"
              loading="lazy"
            />
            <Icon v-else name="image" :size="16" class="text-ink-300" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-ink-900 truncate">{{ cardName(c) }}</p>
            <p class="text-[11px] text-ink-400 font-mono md:hidden">
              {{ c.sku }} · {{ c.readiness.total }}%
            </p>
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
                :class="readyTone(c.readiness.total)"
                :style="{ width: c.readiness.total + '%' }"
              />
            </div>
            <span class="text-[11px] font-bold text-ink-600 tabular-nums">
              {{ c.readiness.total }}%
            </span>
          </div>
          <p class="hidden md:block text-[11px] text-ink-400">{{ fmt(c.createdAt) }}</p>
          <div class="hidden md:flex items-center justify-end gap-1">
            <button
              type="button"
              class="h-8 w-8 grid place-items-center rounded-lg text-ink-300 hover:text-violet-600 hover:bg-violet-50"
              :title="c.status === 'archived' ? 'Вернуть из архива' : 'В архив'"
              @click.stop="archive(c)"
            >
              <Icon name="box" :size="14" />
            </button>
            <button
              type="button"
              class="h-8 w-8 grid place-items-center rounded-lg text-ink-300 hover:text-rose-600 hover:bg-rose-50"
              title="Удалить"
              @click.stop="remove(c)"
            >
              <Icon name="trash" :size="14" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
