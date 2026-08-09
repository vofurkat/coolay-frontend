<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ImagePlus, LoaderCircle, Plus, Trash2, X } from '@lucide/vue'
import type { Template, TemplateInput } from '@/data/platformApi'

/**
 * Создание и правка шаблона.
 *
 * Шаблон = имя + категория + НЕСКОЛЬКО пар «референсное фото + промт».
 * Именно множественность здесь главное: заказчик просил «и так может
 * добавить несколько», потому что одна карточка товара состоит из разных
 * кадров (главный, спина, ткань), и у каждого свой промт.
 */
const props = defineProps<{
  open: boolean
  /** null — создание нового шаблона. */
  template: Template | null
  /** Категория, выбранная в дереве: подставляем в новый шаблон. */
  presetCategory: string[]
  saving: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  submit: [input: TemplateInput]
}>()

interface RefRow {
  id?: string
  /** Либо data:-URL (новое фото), либо /api/files/... (уже сохранённое). */
  image: string
  prompt: string
  label: string
}

const form = reactive({
  name: '',
  /** Категория вводится строкой «Мужское / Рубашки / Классические». */
  categoryText: '',
  description: '',
})
const rows = ref<RefRow[]>([])
const localError = ref('')

/** Максимум согласован с бэкендом (MAX_REFS), иначе лишнее молча отбросится. */
const MAX_REFS = 12
const MAX_IMAGE_MB = 12

function blankRow(): RefRow {
  return { image: '', prompt: '', label: '' }
}

/** Заполняем форму при каждом открытии — иначе видны данные прошлого шаблона. */
watch(
  () => [props.open, props.template?.id] as const,
  () => {
    if (!props.open) return
    localError.value = ''
    if (props.template) {
      form.name = props.template.name
      form.categoryText = props.template.category.join(' / ')
      form.description = props.template.description
      rows.value = props.template.references.map((r) => ({
        id: r.id,
        image: r.image,
        prompt: r.prompt,
        label: r.label,
      }))
    } else {
      form.name = ''
      form.categoryText = props.presetCategory.join(' / ')
      form.description = ''
      rows.value = [blankRow()]
    }
    if (!rows.value.length) rows.value = [blankRow()]
  },
  { immediate: true },
)

const categoryLevels = computed(() =>
  form.categoryText
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean),
)

function addRow() {
  if (rows.value.length >= MAX_REFS) return
  rows.value.push(blankRow())
}

function removeRow(i: number) {
  rows.value.splice(i, 1)
  if (!rows.value.length) rows.value.push(blankRow())
}

async function pickImage(i: number, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Сбрасываем value, иначе выбор того же файла второй раз не вызовет change.
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    localError.value = 'Нужен файл изображения'
    return
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    localError.value = `Файл больше ${MAX_IMAGE_MB} МБ`
    return
  }
  localError.value = ''
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('read'))
    fr.readAsDataURL(file)
  }).catch(() => '')
  if (dataUrl) rows.value[i].image = dataUrl
}

function submit() {
  if (!form.name.trim()) {
    localError.value = 'Введите название шаблона'
    return
  }
  if (!categoryLevels.value.length) {
    localError.value = 'Укажите категорию, например: Мужское / Рубашки'
    return
  }
  // Пустая пара «нет фото и нет промта» бэкендом отбрасывается — отсеиваем
  // здесь, чтобы честно посчитать, осталось ли хоть что-то.
  const useful = rows.value.filter((r) => r.image || r.prompt.trim())
  if (!useful.length) {
    localError.value = 'Добавьте хотя бы одно фото или промт'
    return
  }
  localError.value = ''
  emit('submit', {
    name: form.name.trim(),
    category: categoryLevels.value,
    description: form.description.trim(),
    references: useful.map((r) => ({
      id: r.id,
      image: r.image,
      prompt: r.prompt.trim(),
      label: r.label.trim(),
    })),
  })
}

const shownError = computed(() => localError.value || props.error)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
    >
      <div class="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" @click="emit('close')" />

      <div
        class="relative w-full sm:max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        <header class="flex items-center gap-3 px-5 sm:px-6 py-4 border-b border-ink-100">
          <div class="min-w-0">
            <h2 class="text-base font-bold text-ink-900 truncate">
              {{ template ? 'Изменить шаблон' : 'Новый шаблон' }}
            </h2>
            <p class="text-xs text-ink-500 mt-0.5">
              Фото-референс и промт — можно добавить несколько
            </p>
          </div>
          <button
            type="button"
            class="ml-auto shrink-0 grid place-items-center w-9 h-9 rounded-xl text-ink-500 hover:bg-ink-50"
            aria-label="Закрыть"
            @click="emit('close')"
          >
            <X :size="18" :stroke-width="1.8" />
          </button>
        </header>

        <div class="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          <div class="grid sm:grid-cols-2 gap-4">
            <label class="block">
              <span class="block text-xs font-semibold text-ink-700 mb-1.5">Название</span>
              <input
                v-model="form.name"
                type="text"
                maxlength="80"
                placeholder="Классическая рубашка"
                class="input"
              />
            </label>
            <label class="block">
              <span class="block text-xs font-semibold text-ink-700 mb-1.5">
                Категория
              </span>
              <input
                v-model="form.categoryText"
                type="text"
                placeholder="Мужское / Рубашки / Классические"
                class="input"
              />
            </label>
          </div>

          <p class="text-[11px] text-ink-500 -mt-2">
            Уровни через «/». Шаблон можно прикрепить к любому уровню — хоть к
            «Мужское», хоть к «Мужское / Рубашки / Классические».
          </p>

          <label class="block">
            <span class="block text-xs font-semibold text-ink-700 mb-1.5">
              Описание <span class="font-normal text-ink-400">— необязательно</span>
            </span>
            <textarea
              v-model="form.description"
              rows="2"
              maxlength="400"
              placeholder="Когда применять этот шаблон"
              class="input resize-none"
            />
          </label>

          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-xs font-semibold text-ink-700">
                Референсы
                <span class="text-ink-400 font-normal">
                  {{ rows.length }} из {{ MAX_REFS }}
                </span>
              </h3>
              <button
                type="button"
                class="btn btn-ghost h-8 px-2.5 text-xs"
                :disabled="rows.length >= MAX_REFS"
                @click="addRow"
              >
                <Plus :size="14" :stroke-width="2" />
                Добавить
              </button>
            </div>

            <div class="space-y-3">
              <div
                v-for="(row, i) in rows"
                :key="row.id || i"
                class="flex gap-3 p-3 rounded-2xl border border-ink-100 bg-ink-50/50"
              >
                <label
                  class="relative shrink-0 w-20 h-24 rounded-xl overflow-hidden cursor-pointer border border-dashed border-ink-200 bg-white grid place-items-center hover:border-brand-400 transition-colors"
                >
                  <img
                    v-if="row.image"
                    :src="row.image"
                    alt=""
                    class="absolute inset-0 w-full h-full object-cover"
                  />
                  <span v-else class="flex flex-col items-center gap-1 text-ink-400">
                    <ImagePlus :size="18" :stroke-width="1.8" />
                    <span class="text-[10px]">Фото</span>
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    class="sr-only"
                    @change="pickImage(i, $event)"
                  />
                </label>

                <div class="flex-1 min-w-0 space-y-2">
                  <input
                    v-model="row.label"
                    type="text"
                    maxlength="80"
                    placeholder="Название кадра — например «Главное фото»"
                    class="input h-9 text-xs"
                  />
                  <textarea
                    v-model="row.prompt"
                    rows="3"
                    maxlength="2000"
                    placeholder="Промт: как должно выглядеть фото"
                    class="input text-xs resize-none"
                  />
                </div>

                <button
                  type="button"
                  class="shrink-0 self-start grid place-items-center w-8 h-8 rounded-lg text-ink-400 hover:text-red-600 hover:bg-red-50"
                  aria-label="Удалить референс"
                  @click="removeRow(i)"
                >
                  <Trash2 :size="15" :stroke-width="1.8" />
                </button>
              </div>
            </div>
          </div>

          <p v-if="shownError" class="text-xs text-red-600">{{ shownError }}</p>
        </div>

        <footer
          class="shrink-0 flex items-center gap-3 px-5 sm:px-6 py-4 border-t border-ink-100 bg-white"
        >
          <button type="button" class="btn btn-ghost h-10" @click="emit('close')">
            Отмена
          </button>
          <button
            type="button"
            class="btn btn-brand h-10 ml-auto min-w-[130px]"
            :disabled="saving"
            @click="submit"
          >
            <LoaderCircle v-if="saving" :size="16" class="animate-spin" />
            <span>{{ template ? 'Сохранить' : 'Создать' }}</span>
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
