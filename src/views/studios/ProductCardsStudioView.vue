<script setup lang="ts">
/**
 * Карточки товара — лендинг студии (скрин 1).
 * Точка входа в мастер создания SKU.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import { useProductCardsStore } from '@/stores/productCards'
import { LANG_LABEL, LANG_LIST } from '@/types/sku'

const router = useRouter()
const store = useProductCardsStore()

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const error = ref('')

onMounted(() => store.restore())

/* ─────────── Быстрые сценарии ─────────── */
const scenarios = [
  {
    id: 'photo',
    title: 'Создать с фото',
    text: 'Загрузите фото товара, и AI распознает товар и создаст полную карточку.',
    icon: 'image',
    tone: 'bg-emerald-50 text-emerald-600',
    action: 'upload' as const,
  },
  {
    id: 'history',
    title: 'История карточек',
    text: 'Найдите ранее созданную карточку по SKU, названию или категории и откройте её.',
    icon: 'history',
    tone: 'bg-sky-50 text-sky-600',
    action: 'history' as const,
  },
  {
    id: 'projects',
    title: 'Мои проекты',
    text: 'Все сгенерированные SKU-карточки собраны в одном рабочем пространстве.',
    icon: 'folder',
    tone: 'bg-brand-50 text-brand-600',
    action: 'projects' as const,
  },
]

const assistantChips = [
  'Создать карточку из фото',
  'Перевести карточку на 4 языка',
  'Подготовить фото без фона',
  'Улучшить описание товара',
]

/* Как это работает — шаги мастера, показываем в раскрывающемся блоке */
const howSteps = [
  { n: 1, title: 'Загрузка фото', text: 'Добавьте одно фото товара — JPG, PNG или WebP.' },
  { n: 2, title: 'AI-анализ', text: 'AI определяет категорию, цвет, материал и другие атрибуты.' },
  { n: 3, title: 'Контент', text: 'Название, описания, характеристики и SEO на RU, EN, UZ и TR.' },
  { n: 4, title: 'Изображения', text: 'Студийные фото: ракурсы, детали ткани и вариант без фона.' },
  { n: 5, title: 'Готовая карточка', text: 'Проверьте готовность и выгрузите карточку в каталог.' },
]
const howOpen = ref(false)

/* ─────────── Недавние карточки ─────────── */
const recent = computed(() => store.recentCards.slice(0, 3))
const totalCards = computed(() => store.cards.length)

function cardTitle(id: string) {
  const c = store.getCard(id)
  return c?.content.ru?.name || c?.analysis?.title || 'Карточка товара'
}

function cardThumb(id: string) {
  const c = store.getCard(id)
  return c?.images.find((i) => i.state === 'success')?.url || c?.sourceImage || ''
}

function fmtWhen(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return `Сегодня, ${time}`
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `Вчера, ${time}`
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }) + `, ${time}`
}

/* ─────────── Загрузка фото ─────────── */
function pickFile() {
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) readFile(f)
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) readFile(f)
}

function readFile(file: File) {
  error.value = ''
  if (!file.type.startsWith('image/')) {
    error.value = 'Нужен файл изображения (JPG, PNG или WebP)'
    return
  }
  if (file.size > 25 * 1024 * 1024) {
    error.value = 'Файл слишком большой — максимум 25 МБ'
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = String(reader.result)
    const img = new Image()
    img.onload = () => startWizard(file, dataUrl, `${img.naturalWidth} × ${img.naturalHeight} px`)
    img.onerror = () => startWizard(file, dataUrl, '')
    img.src = dataUrl
  }
  reader.onerror = () => (error.value = 'Не удалось прочитать файл')
  reader.readAsDataURL(file)
}

function startWizard(file: File, dataUrl: string, dims: string) {
  store.resetDraft()
  store.draft.fileName = file.name
  store.draft.fileSize = file.size
  store.draft.fileDimensions = dims
  store.draft.localPreview = dataUrl
  store.draft.step = 2
  store.persistDraft()
  router.push('/studios/product-cards/new')
}

function runScenario(action: string) {
  if (action === 'upload') pickFile()
  else if (action === 'history') router.push('/studios/product-cards/history')
  else if (action === 'projects') router.push('/projects')
}

function continueDraft() {
  router.push('/studios/product-cards/new')
}
</script>

<template>
  <div class="page animate-fade-in">
    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileChange" />

    <!-- ───────── Заголовок страницы ───────── -->
    <header class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-[28px] font-extrabold text-ink-900 tracking-tight">
          Карточки товара
        </h1>
        <p class="text-ink-500 mt-1.5 text-sm leading-relaxed max-w-2xl">
          Загрузите фото — AI создаст карточку с описанием, характеристиками, SEO и студийными
          изображениями на четырёх языках.
        </p>
      </div>
      <button
        type="button"
        class="btn btn-sm btn-outline shrink-0"
        :aria-expanded="howOpen"
        @click="howOpen = !howOpen"
      >
        <Icon name="playCircle" :size="16" />
        Как это работает?
      </button>
    </header>

    <!-- Как это работает -->
    <transition name="how">
      <section v-if="howOpen" class="card p-4 sm:p-5 mt-4 overflow-hidden">
        <ol class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <li v-for="s in howSteps" :key="s.n" class="flex gap-3 lg:flex-col lg:gap-2">
            <span
              class="grid place-items-center w-7 h-7 rounded-lg bg-brand-100 text-brand-700 text-xs font-extrabold shrink-0"
            >
              {{ s.n }}
            </span>
            <div class="min-w-0">
              <p class="text-sm font-bold text-ink-900 leading-snug">{{ s.title }}</p>
              <p class="text-xs text-ink-500 mt-1 leading-relaxed">{{ s.text }}</p>
            </div>
          </li>
        </ol>
      </section>
    </transition>

    <!-- Ошибка загрузки файла -->
    <p
      v-if="error"
      class="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-700"
      role="alert"
    >
      <Icon name="alert" :size="16" class="shrink-0" />
      {{ error }}
    </p>

    <!-- Незавершённый мастер -->
    <section
      v-if="store.hasDraft"
      class="card mt-4 border-brand-200 bg-brand-50/60 p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <span
        class="grid place-items-center w-10 h-10 rounded-xl bg-brand-100 text-brand-600 shrink-0"
      >
        <Icon name="history" :size="20" />
      </span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-bold text-ink-900">Есть незавершённая карточка</p>
        <p class="text-xs text-ink-500 mt-0.5 truncate">
          Шаг {{ store.draft.step }} из 5 · {{ store.draft.fileName || 'фото товара' }}
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button type="button" class="btn btn-sm btn-ghost" @click="store.resetDraft()">
          Начать заново
        </button>
        <button type="button" class="btn btn-sm btn-brand" @click="continueDraft">
          Продолжить
          <Icon name="arrowRight" :size="15" />
        </button>
      </div>
    </section>

    <!-- ───────── Главный CTA ───────── -->
    <section
      class="card mt-5 p-5 sm:p-6 lg:p-7 grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center transition"
      :class="dragOver ? 'border-brand-400 ring-4 ring-brand-100' : ''"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <div class="min-w-0">
        <div class="flex items-start gap-4">
          <span
            class="grid place-items-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-brand-100 text-brand-600 shrink-0"
          >
            <Icon name="shoppingBag" :size="26" />
          </span>
          <div class="min-w-0">
            <h2 class="text-xl sm:text-2xl font-extrabold text-ink-900 leading-tight">
              Создать карточку товара
            </h2>
            <p class="text-sm text-ink-500 mt-2 leading-relaxed max-w-xl">
              Загрузите фото товара или выберите его из каталога — остальное AI сделает сам.
            </p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2.5 mt-5">
          <button type="button" class="btn btn-md btn-brand" @click="pickFile">
            <Icon name="upload" :size="17" />
            Загрузить фото
          </button>
          <button type="button" class="btn btn-md btn-outline" disabled title="Скоро">
            <Icon name="store" :size="17" />
            Из 1С / МойСклад
          </button>
          <button type="button" class="btn btn-md btn-outline" disabled title="Скоро">
            <Icon name="edit" :size="17" />
            Вручную
          </button>
        </div>
        <p class="text-[11px] text-ink-400 mt-3">
          JPG, PNG или WebP до 25 МБ — можно перетащить файл в эту область.
        </p>
      </div>

      <!-- Иллюстрация карточки -->
      <div class="rounded-2xl bg-ink-50 border border-ink-100 overflow-hidden select-none">
        <div class="h-7 bg-brand-600 flex items-center gap-1.5 px-3">
          <span class="w-2 h-2 rounded-full bg-white/50" />
          <span class="w-2 h-2 rounded-full bg-white/50" />
          <span class="w-2 h-2 rounded-full bg-white/50" />
        </div>
        <div class="p-4 flex gap-3">
          <div
            class="w-20 h-24 rounded-lg bg-white border border-ink-100 grid place-items-center text-ink-300 shrink-0"
          >
            <Icon name="shirt" :size="28" />
          </div>
          <div class="flex-1 space-y-2 pt-1 min-w-0">
            <div class="h-2.5 rounded-full bg-brand-200 w-4/5" />
            <div class="h-2 rounded-full bg-ink-200 w-full" />
            <div class="h-2 rounded-full bg-ink-200 w-11/12" />
            <div class="h-2 rounded-full bg-ink-200 w-3/5" />
            <div class="flex gap-1.5 pt-1.5">
              <span class="h-4 w-10 rounded bg-emerald-100" />
              <span class="h-4 w-10 rounded bg-brand-100" />
            </div>
          </div>
        </div>
        <div class="px-4 pb-4 flex gap-2">
          <span
            v-for="ic in ['edit', 'listUl', 'image']"
            :key="ic"
            class="grid place-items-center w-8 h-8 rounded-lg bg-white border border-ink-100 text-ink-400"
          >
            <Icon :name="ic" :size="14" />
          </span>
        </div>
      </div>
    </section>

    <!-- ───────── Быстрые сценарии ───────── -->
    <section class="mt-7">
      <h2 class="section-title mb-3">Быстрые сценарии</h2>
      <!--
        Ровно три сценария, поэтому переход сразу с 1 на 3 колонки: на промежуточных
        ширинах сетка 2×2 оставляла третью карточку одну в ряду.
      -->
      <div class="grid gap-3 lg:grid-cols-3">
        <button
          v-for="s in scenarios"
          :key="s.id"
          type="button"
          class="card p-4 text-left flex flex-col hover:shadow-card hover:-translate-y-0.5 transition group"
          @click="runScenario(s.action)"
        >
          <span class="grid place-items-center w-10 h-10 rounded-xl mb-3" :class="s.tone">
            <Icon :name="s.icon" :size="19" />
          </span>
          <span class="text-sm font-bold text-ink-900 leading-snug">{{ s.title }}</span>
          <span class="text-xs text-ink-500 mt-1.5 leading-relaxed flex-1">{{ s.text }}</span>
          <span
            class="self-end mt-3 grid place-items-center w-7 h-7 rounded-full bg-ink-50 text-ink-400 group-hover:bg-brand-600 group-hover:text-white transition"
          >
            <Icon name="arrowRight" :size="14" />
          </span>
        </button>
      </div>
    </section>

    <!-- ───────── Недавние карточки + ассистент ───────── -->
    <div class="mt-7 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
      <section class="min-w-0">
        <div class="flex items-center justify-between gap-3 mb-3">
          <h2 class="section-title">
            Недавние карточки
            <span v-if="totalCards" class="text-ink-300 font-bold">· {{ totalCards }}</span>
          </h2>
          <RouterLink
            to="/studios/product-cards/history"
            class="text-xs font-bold text-brand-600 hover:text-brand-700 shrink-0"
          >
            Смотреть все
          </RouterLink>
        </div>

        <div v-if="recent.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink
            v-for="c in recent"
            :key="c.id"
            :to="`/studios/product-cards/${c.id}`"
            class="card p-3 flex gap-3 items-center hover:shadow-card hover:-translate-y-0.5 transition min-w-0"
          >
            <span
              class="w-12 h-14 rounded-lg bg-ink-50 overflow-hidden shrink-0 grid place-items-center"
            >
              <img
                v-if="cardThumb(c.id)"
                :src="cardThumb(c.id)"
                alt=""
                class="w-full h-full object-cover"
              />
              <Icon v-else name="image" :size="18" class="text-ink-300" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-xs font-bold text-ink-900 leading-snug line-clamp-2">
                {{ cardTitle(c.id) }}
              </span>
              <span class="block text-[10px] text-ink-400 font-mono mt-1">{{ c.sku }}</span>
              <span class="flex items-center gap-1 text-[10px] text-ink-400 mt-1">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                {{ fmtWhen(c.createdAt) }}
              </span>
            </span>
          </RouterLink>
        </div>

        <div v-else class="card p-8 text-center">
          <span
            class="grid place-items-center w-12 h-12 rounded-2xl bg-ink-50 text-ink-300 mx-auto"
          >
            <Icon name="card" :size="22" />
          </span>
          <p class="text-sm font-bold text-ink-900 mt-3">Пока нет карточек</p>
          <p class="text-xs text-ink-500 mt-1">
            Загрузите первое фото товара — карточка появится здесь.
          </p>
          <button type="button" class="btn btn-sm btn-brand mt-4" @click="pickFile">
            <Icon name="upload" :size="15" />
            Загрузить фото
          </button>
        </div>
      </section>

      <!-- AI-ассистент -->
      <section class="card p-4 flex flex-col min-w-0">
        <div class="flex items-center gap-2 mb-3">
          <h2 class="section-title">AI-ассистент</h2>
          <span class="chip bg-brand-100 text-brand-700 !text-[10px] !px-2 !py-0.5">BETA</span>
        </div>
        <div class="flex gap-2.5">
          <span
            class="grid place-items-center w-9 h-9 rounded-xl bg-brand-50 text-brand-600 shrink-0"
          >
            <Icon name="robot" :size="18" />
          </span>
          <p class="text-xs text-ink-500 leading-relaxed">
            Опишите задачу — подберу сценарий и нужные инструменты.
          </p>
        </div>
        <button
          type="button"
          class="btn btn-sm w-full mt-4 bg-brand-50 text-brand-700 hover:bg-brand-100"
        >
          <Icon name="sparkles" :size="15" />
          Открыть ассистента
        </button>
        <div class="flex flex-wrap gap-1.5 mt-3">
          <button
            v-for="chip in assistantChips"
            :key="chip"
            type="button"
            class="chip bg-ink-50 text-ink-600 border border-ink-100 !rounded-lg !text-[11px] hover:border-brand-300 hover:text-brand-700 transition"
            @click="chip.includes('фото') ? pickFile() : null"
          >
            {{ chip }}
          </button>
        </div>
        <div class="mt-4 pt-4 border-t border-ink-100">
          <p class="text-[11px] font-bold text-ink-500 uppercase tracking-wide mb-2">
            Языки карточки
          </p>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="l in LANG_LIST"
              :key="l"
              class="chip bg-emerald-50 text-emerald-700 !rounded-lg !text-[11px]"
            >
              {{ LANG_LABEL[l] }}
            </span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Раскрытие блока «Как это работает» */
.how-enter-active,
.how-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.how-enter-from,
.how-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
