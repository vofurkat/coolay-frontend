<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Copy, Info, LoaderCircle, Pencil, Plus, Trash2 } from '@lucide/vue'
import TemplateEditor from '@/components/templates/TemplateEditor.vue'
import { sadminApi, isFail, type Template, type TemplateInput } from '@/data/platformApi'

/**
 * Системные шаблоны — те же данные, что и клиентские (несколько пар
 * «фото-референс + промт»), поэтому используется ТОТ ЖЕ редактор
 * TemplateEditor, что и на клиентском /templates. Отличие одно:
 * сохранение идёт через /api/sadmin/templates и шаблон помечается isSystem.
 */
const templates = ref<Template[]>([])
const loading = ref(true)
const error = ref('')

const editorOpen = ref(false)
const editing = ref<Template | null>(null)
const saving = ref(false)
const editorError = ref('')
const busyId = ref('')

async function loadAll() {
  loading.value = true
  const res = await sadminApi.templates()
  loading.value = false
  if (isFail(res)) {
    error.value = res.error
    return
  }
  templates.value = res.templates
}
onMounted(loadAll)

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
    ? await sadminApi.updateTemplate(editing.value.id, input)
    : await sadminApi.createTemplate(input)
  saving.value = false
  if (isFail(res)) {
    editorError.value = res.error
    return
  }
  editorOpen.value = false
  await loadAll()
}

async function remove(t: Template) {
  if (!window.confirm(`Удалить системный шаблон «${t.name}»? Он пропадёт у всех клиентов.`)) return
  busyId.value = t.id
  const res = await sadminApi.deleteTemplate(t.id)
  busyId.value = ''
  if (isFail(res)) {
    error.value = res.error
    return
  }
  await loadAll()
}
</script>

<template>
  <div class="animate-fade-in">
    <header class="flex flex-wrap items-start gap-4 mb-5">
      <div class="min-w-0">
        <h1 class="text-2xl font-extrabold text-ink-900">Системные шаблоны</h1>
        <p class="text-sm text-ink-500 mt-1">
          Видны всем клиентам в разделе «Шаблоны» — только для чтения, клиент может сделать копию.
        </p>
      </div>
      <button type="button" class="btn btn-accent btn-md ml-auto shrink-0" @click="openCreate">
        <Plus :size="16" :stroke-width="2" /> Новый шаблон
      </button>
    </header>

    <!-- Как работают референсы при генерации -->
    <div class="card p-4 mb-6 flex gap-3 bg-blue-50/60 border-blue-100">
      <Info :size="18" class="text-blue-500 shrink-0 mt-0.5" />
      <div class="text-[13px] text-ink-600 leading-relaxed">
        <b class="text-ink-900">Как шаблон работает при генерации карточки.</b>
        В шаблон можно добавить до 12 пар «фото-референс + промт» — по одной на каждый кадр
        (главное фото, вид сзади, ткань крупно и т.д.). Когда клиент выбирает шаблон в мастере,
        каждый референс подставляется в свой ракурс:
        сначала по явной привязке, затем по названию кадра («спина», «ткань»…), остальные — по порядку.
        Если клиент выбрал <b>меньше ракурсов</b>, чем референсов в шаблоне, лишние референсы не
        используются; если <b>больше</b> — недостающие кадры генерируются стандартно, без референса.
        Кредит-токены списываются по числу выбранных ракурсов, а не по числу референсов.
      </div>
    </div>

    <div v-if="error" class="rounded-xl bg-red-50 text-red-600 text-sm font-medium px-4 py-3 mb-4">
      {{ error }}
    </div>

    <div v-if="loading" class="flex items-center gap-2 text-ink-400 py-10 justify-center">
      <LoaderCircle :size="18" class="animate-spin" /> Загрузка…
    </div>

    <div v-else class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <article v-for="t in templates" :key="t.id" class="card p-4 flex flex-col">
        <!-- Превью референсов: показываем до 3, чтобы было видно, что их несколько -->
        <div class="grid grid-cols-3 gap-1.5 mb-3">
          <div
            v-for="(r, i) in t.references.slice(0, 3)"
            :key="r.id"
            class="relative aspect-square rounded-lg overflow-hidden bg-ink-50"
          >
            <img v-if="r.image" :src="r.image" class="w-full h-full object-cover" loading="lazy" />
            <div v-else class="w-full h-full grid place-items-center text-[10px] text-ink-400 p-1 text-center">
              только промт
            </div>
            <span
              v-if="i === 2 && t.references.length > 3"
              class="absolute inset-0 grid place-items-center bg-ink-900/60 text-white text-sm font-bold"
            >
              +{{ t.references.length - 3 }}
            </span>
          </div>
          <div
            v-for="i in Math.max(0, 3 - t.references.length)"
            :key="'e' + i"
            class="aspect-square rounded-lg bg-ink-50/60"
          />
        </div>

        <div class="font-bold text-ink-900 truncate">{{ t.name }}</div>
        <div class="text-xs text-ink-400 mt-0.5">
          {{ t.categoryPath }}
        </div>
        <div class="flex items-center gap-2 mt-2 text-[11px] text-ink-500">
          <span class="chip bg-ink-50 text-ink-600">{{ t.references.length }} референс(а)</span>
          <span class="chip bg-ink-50 text-ink-600">использован {{ t.usageCount }} раз</span>
        </div>
        <p v-if="t.description" class="text-[13px] text-ink-500 mt-2 line-clamp-2">{{ t.description }}</p>

        <div class="flex gap-2 mt-auto pt-4">
          <button type="button" class="btn btn-outline btn-sm flex-1" @click="openEdit(t)">
            <Pencil :size="14" /> Изменить
          </button>
          <button
            type="button"
            class="btn btn-outline btn-sm !text-red-600 !border-red-200 hover:!bg-red-50"
            :disabled="busyId === t.id"
            @click="remove(t)"
          >
            <LoaderCircle v-if="busyId === t.id" :size="14" class="animate-spin" />
            <Trash2 v-else :size="14" />
          </button>
        </div>
      </article>
    </div>

    <div v-if="!loading && !templates.length" class="card p-10 text-center">
      <Copy :size="32" class="mx-auto text-ink-200 mb-3" />
      <p class="text-ink-500 font-medium">Системных шаблонов пока нет</p>
      <p class="text-sm text-ink-400 mt-1">Создайте первый — он появится у всех клиентов в «Шаблонах»</p>
    </div>

    <TemplateEditor
      :open="editorOpen"
      :template="editing"
      :preset-category="[]"
      :saving="saving"
      :error="editorError"
      @close="editorOpen = false"
      @submit="submitTemplate"
    />
  </div>
</template>
