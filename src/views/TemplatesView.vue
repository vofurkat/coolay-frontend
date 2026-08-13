<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Copy,
  LayoutGrid,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from '@lucide/vue'
import { useRouter } from 'vue-router'
import CategoryTree from '@/components/templates/CategoryTree.vue'
import TemplateEditor from '@/components/templates/TemplateEditor.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import {
  isFail,
  templatesApi,
  type CategoryNode,
  type Template,
  type TemplateInput,
} from '@/data/platformApi'

const router = useRouter()

const templates = ref<Template[]>([])
const categories = ref<CategoryNode[]>([])
const loading = ref(true)
const listError = ref('')

const selected = ref<string[]>([])
const expanded = ref(new Set<string>())
const query = ref('')

const editorOpen = ref(false)
const editing = ref<Template | null>(null)
const saving = ref(false)
const editorError = ref('')

const busyId = ref('')

async function loadAll() {
  loading.value = true
  listError.value = ''
  const [list, cats] = await Promise.all([
    templatesApi.list({ category: selected.value, q: query.value }),
    templatesApi.categories(),
  ])
  loading.value = false
  if (isFail(list)) {
    listError.value = list.error
    return
  }
  templates.value = list.templates
  if (!isFail(cats)) categories.value = cats.categories
}

onMounted(async () => {
  await loadAll()
  // Раскрываем первый уровень: пустое дерево из одних «стрелочек» выглядит
  // так, будто шаблонов нет.
  categories.value.forEach((c) => expanded.value.add(c.path.join('/')))
})

function selectCategory(path: string[]) {
  // Повторный клик по активной категории снимает фильтр — иначе из глубокого
  // уровня нельзя вернуться ко «всем» без поиска кнопки сброса.
  selected.value = selected.value.join('/') === path.join('/') ? [] : path
  // Раскрываем выбранную ветку, чтобы виден был контекст.
  for (let i = 1; i <= path.length; i++) expanded.value.add(path.slice(0, i).join('/'))
  loadAll()
}

function toggleNode(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadAll, 300)
}

function openCreate() {
  editing.value = null
  editorError.value = ''
  editorOpen.value = true
}

function openEdit(t: Template) {
  editing.value = t
  editorError.value = ''
  editorOpen.value = true
}

async function submitTemplate(input: TemplateInput) {
  saving.value = true
  editorError.value = ''
  const res = editing.value
    ? await templatesApi.update(editing.value.id, input)
    : await templatesApi.create(input)
  saving.value = false
  if (isFail(res)) {
    editorError.value = res.error
    return
  }
  editorOpen.value = false
  await loadAll()
}

async function duplicate(t: Template) {
  busyId.value = t.id
  const res = await templatesApi.duplicate(t.id)
  busyId.value = ''
  if (isFail(res)) {
    listError.value = res.error
    return
  }
  await loadAll()
}

async function remove(t: Template) {
  if (!window.confirm(`Удалить шаблон «${t.name}»? Действие необратимо.`)) return
  busyId.value = t.id
  const res = await templatesApi.remove(t.id)
  busyId.value = ''
  if (isFail(res)) {
    listError.value = res.error
    return
  }
  await loadAll()
}

/** Применить шаблон: ведём в мастер генерации с id в query. */
function useTemplate(t: Template) {
  router.push({ path: '/studios/product-cards/new', query: { template: t.id } })
}

const isFiltered = computed(() => selected.value.length > 0 || !!query.value)
</script>

<template>
  <div class="page space-y-6 animate-fade-in">
    <!-- Единый заголовок страницы (как на /tools, /projects и т.д.):
         PageHeader ставит заголовок и кнопку в одну линию. -->
    <PageHeader
      title="Шаблоны"
      subtitle="Референсы и промты по категориям товара. Шаблон подставляется при генерации вместо стандартных фото карточки."
    >
      <template #actions>
        <button type="button" class="btn btn-brand h-10 shrink-0" @click="openCreate">
          <Plus :size="16" :stroke-width="2" />
          Новый шаблон
        </button>
      </template>
    </PageHeader>

    <div class="grid lg:grid-cols-[260px_1fr] gap-5">
      <!-- Категории -->
      <aside class="card p-3 h-fit lg:sticky lg:top-4">
        <div class="flex items-center justify-between px-2 py-1.5 mb-1">
          <h2 class="text-xs font-semibold text-ink-700">Категории</h2>
          <button
            v-if="selected.length"
            type="button"
            class="text-[11px] text-ink-500 hover:text-ink-900"
            @click="selectCategory(selected)"
          >
            сбросить
          </button>
        </div>

        <button
          type="button"
          class="w-full flex items-center gap-2 px-2 py-2 rounded-xl text-sm transition-colors"
          :class="
            selected.length ? 'text-ink-600 hover:bg-ink-50' : 'bg-brand-50 font-semibold text-ink-900'
          "
          @click="selectCategory([])"
        >
          <LayoutGrid :size="14" :stroke-width="1.8" class="text-ink-400" />
          Все шаблоны
          <span class="ml-auto text-[11px] tabular-nums text-ink-400">
            {{ categories.reduce((s, c) => s + c.count, 0) }}
          </span>
        </button>

        <CategoryTree
          v-if="categories.length"
          :nodes="categories"
          :selected="selected"
          :expanded="expanded"
          class="mt-1"
          @select="selectCategory"
          @toggle="toggleNode"
        />
        <p v-else-if="!loading" class="px-2 py-3 text-xs text-ink-400">
          Категории появятся после первого шаблона
        </p>
      </aside>

      <!-- Список -->
      <section class="min-w-0">
        <div class="relative mb-4">
          <Search
            :size="16"
            :stroke-width="1.8"
            class="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
          />
          <input
            v-model="query"
            type="search"
            placeholder="Поиск по названию, категории, описанию"
            class="input pl-10"
            @input="onSearch"
          />
          <button
            v-if="query"
            type="button"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            aria-label="Очистить поиск"
            @click="((query = ''), loadAll())"
          >
            <X :size="15" :stroke-width="2" />
          </button>
        </div>

        <p v-if="selected.length" class="text-xs text-ink-500 mb-3">
          Категория: <span class="font-semibold text-ink-800">{{ selected.join(' / ') }}</span>
          — показаны шаблоны этого уровня и вложенных
        </p>

        <p v-if="listError" class="text-sm text-red-600 mb-3">{{ listError }}</p>

        <div v-if="loading" class="grid sm:grid-cols-2 gap-4">
          <div v-for="i in 4" :key="i" class="card p-4">
            <div class="h-4 w-2/3 rounded bg-ink-100 animate-pulse" />
            <div class="h-3 w-1/2 rounded bg-ink-100 animate-pulse mt-3" />
            <div class="flex gap-2 mt-4">
              <div v-for="j in 3" :key="j" class="w-14 h-16 rounded-lg bg-ink-100 animate-pulse" />
            </div>
          </div>
        </div>

        <!-- Пусто -->
        <div v-else-if="!templates.length" class="card p-10 text-center">
          <div class="mx-auto w-12 h-12 rounded-2xl bg-brand-50 grid place-items-center mb-4">
            <LayoutGrid :size="22" :stroke-width="1.6" class="text-ink-700" />
          </div>
          <h3 class="text-sm font-bold text-ink-900">
            {{ isFiltered ? 'Ничего не найдено' : 'Пока нет шаблонов' }}
          </h3>
          <p class="text-xs text-ink-500 mt-1.5 max-w-sm mx-auto">
            {{
              isFiltered
                ? 'Попробуйте изменить категорию или поисковый запрос.'
                : 'Создайте шаблон: укажите категорию, добавьте фото-референсы и промты — потом выберете его при генерации.'
            }}
          </p>
          <button type="button" class="btn btn-brand h-10 mt-5" @click="openCreate">
            <Plus :size="16" :stroke-width="2" />
            Создать шаблон
          </button>
        </div>

        <div v-else class="grid sm:grid-cols-2 gap-4">
          <article
            v-for="t in templates"
            :key="t.id"
            class="card p-4 flex flex-col"
            :class="busyId === t.id ? 'opacity-60 pointer-events-none' : ''"
          >
            <div class="flex items-start gap-2">
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-bold text-ink-900 truncate">{{ t.name }}</h3>
                <p class="text-[11px] text-ink-500 mt-0.5 truncate" :title="t.categoryPath">
                  {{ t.categoryPath || 'Без категории' }}
                </p>
              </div>
              <LoaderCircle v-if="busyId === t.id" :size="15" class="animate-spin text-ink-400 mt-1" />
            </div>

            <p v-if="t.description" class="text-xs text-ink-600 mt-2 line-clamp-2">
              {{ t.description }}
            </p>

            <!-- Превью референсов -->
            <div class="flex flex-wrap gap-2 mt-3">
              <div
                v-for="r in t.references.slice(0, 4)"
                :key="r.id"
                class="relative w-14 h-16 rounded-lg overflow-hidden bg-ink-100 border border-ink-100"
                :title="r.label || r.prompt"
              >
                <img
                  v-if="r.image"
                  :src="r.image"
                  :alt="r.label"
                  loading="lazy"
                  class="w-full h-full object-cover"
                />
                <span
                  v-else
                  class="absolute inset-0 grid place-items-center text-[9px] text-ink-500 px-1 text-center leading-tight"
                >
                  только промт
                </span>
              </div>
              <div
                v-if="t.references.length > 4"
                class="w-14 h-16 rounded-lg bg-ink-50 border border-ink-100 grid place-items-center text-[11px] font-semibold text-ink-500"
              >
                +{{ t.references.length - 4 }}
              </div>
            </div>

            <div class="flex items-center gap-1.5 mt-4 pt-3 border-t border-ink-100">
              <span class="text-[11px] text-ink-400">
                {{ t.references.length }} реф. · применён {{ t.usageCount }}
              </span>
              <div class="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  class="grid place-items-center w-8 h-8 rounded-lg text-ink-500 hover:bg-ink-50"
                  title="Изменить"
                  @click="openEdit(t)"
                >
                  <Pencil :size="14" :stroke-width="1.8" />
                </button>
                <button
                  type="button"
                  class="grid place-items-center w-8 h-8 rounded-lg text-ink-500 hover:bg-ink-50"
                  title="Дублировать"
                  @click="duplicate(t)"
                >
                  <Copy :size="14" :stroke-width="1.8" />
                </button>
                <button
                  type="button"
                  class="grid place-items-center w-8 h-8 rounded-lg text-ink-500 hover:text-red-600 hover:bg-red-50"
                  title="Удалить"
                  @click="remove(t)"
                >
                  <Trash2 :size="14" :stroke-width="1.8" />
                </button>
                <button type="button" class="btn btn-brand h-8 px-3 text-xs" @click="useTemplate(t)">
                  <Sparkles :size="13" :stroke-width="2" />
                  Применить
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <TemplateEditor
      :open="editorOpen"
      :template="editing"
      :preset-category="selected"
      :saving="saving"
      :error="editorError"
      @close="editorOpen = false"
      @submit="submitTemplate"
    />
  </div>
</template>
