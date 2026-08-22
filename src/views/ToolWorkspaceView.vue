<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '@/components/ui/Icon.vue'
import SelectField from '@/components/ui/SelectField.vue'
import PickerModal from '@/components/tool/PickerModal.vue'
import { tools } from '@/data/tools'
import { models, poses } from '@/data/mock'
import { isDuplicate } from '@/data/similarity'
import { findSimilar, imageHash } from '@/data/skuApi'
import { isFail } from '@/data/platformApi'
import Avatar from '@/components/ui/Avatar.vue'
import type { SimilarMatch } from '@/types'
import { generateSmart, mapResolution, mapAspect } from '@/data/generateApi'
import { useAuthStore } from '@/stores/auth'
import { useGenerationsStore } from '@/stores/generations'
import type { Generation } from '@/types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const gens = useGenerationsStore()

const tool = computed(() => tools.find((t) => t.slug === route.params.slug) || tools[0])
const isVirtualModel = computed(() => tool.value.slug === 'virtual-model')

// upload state
const uploadedImage = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

function pickFile() {
  fileInput.value?.click()
}
function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) readFile(file)
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) readFile(file)
}
function readFile(file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    uploadedImage.value = reader.result as string
    scanDuplicates()
  }
  reader.readAsDataURL(file)
}

// === Проверка дубликатов товара ===
const scanning = ref(false)
const scanResult = ref<{ similarity: number; matches: SimilarMatch[] } | null>(null)
const dismissedDup = ref(false)

const scanError = ref('')

/**
 * Поиск похожего товара по загруженному фото.
 *
 * Раньше здесь была имитация: Math.random() решал, «нашёлся» ли дубликат, и
 * подставлял случайную запись из демо-набора. Это хуже отсутствия функции —
 * можно было отменить генерацию из-за выдуманного совпадения или, наоборот,
 * получить «чисто» при реальном дубле.
 *
 * Теперь сравнение настоящее: dHash считается в браузере (у бэкенда без
 * зависимостей нет декодера JPEG), а сервер сопоставляет его с хешами
 * карточек компании по расстоянию Хэмминга.
 *
 * Анализ товара здесь не передаётся: этот инструмент работает с одним фото
 * без AI-разбора, поэтому сравнение идёт только по изображению. Тот же товар,
 * переснятый другим кадром, так не находится — для этого есть мастер карточек.
 */
async function scanDuplicates() {
  if (!uploadedImage.value) return
  scanResult.value = null
  scanError.value = ''
  dismissedDup.value = false
  scanning.value = true
  try {
    const hash = await imageHash(uploadedImage.value)
    if (!hash) {
      scanError.value = 'Не удалось обработать изображение — попробуйте другой файл'
      return
    }
    // Клиент API не бросает исключения, а возвращает Fail — проверяем isFail.
    const r = await findSimilar({ imageHash: hash })
    if (isFail(r)) {
      scanError.value = r.error || 'Не удалось проверить по базе товаров'
      return
    }
    scanResult.value = {
      similarity: r.matches[0]?.similarity ?? 0,
      matches: r.matches,
    }
  } finally {
    scanning.value = false
  }
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

// virtual model settings
const selectedModel = ref('m1')
const selectedPose = ref('p1')
const quality = ref('Стандартный · 1K')
const background = ref('Случайный')
const aspect = ref('Портрет · 2:3')
const prompt_ = ref('')
const brandStyle = ref(false)

const showModelPicker = ref(false)
const showPosePicker = ref(false)

const currentModel = computed(() => models.find((m) => m.id === selectedModel.value)!)
const currentPose = computed(() => poses.find((p) => p.id === selectedPose.value)!)

// generation
const generating = ref(false)
const genStage = ref<'analyze' | 'render'>('analyze')
const result = ref<string | null>(null)
const genError = ref<string | null>(null)
const lastCredits = ref<number | null>(null)
const showResultLightbox = ref(false)

const canGenerate = computed(() => !!uploadedImage.value)

// Доп. настройки для подсказки анализатора (фон, модель, поза)
const extras = computed(() => {
  const parts: string[] = []
  if (isVirtualModel.value) {
    if (currentModel.value?.name) parts.push(`model: ${currentModel.value.name}`)
    if (currentPose.value && currentPose.value.name !== 'Случайный')
      parts.push(`pose: ${currentPose.value.name}`)
  }
  if (background.value && background.value !== 'Случайный') parts.push(`background: ${background.value}`)
  if (brandStyle.value) parts.push('apply consistent premium brand style')
  return parts.join(', ')
})

async function generate() {
  if (!canGenerate.value || generating.value) return
  generating.value = true
  genStage.value = 'analyze'
  result.value = null
  genError.value = null

  // Этап 1 (анализ фото) обычно ~3-8с; переключаем индикатор
  const stageTimer = setTimeout(() => {
    if (generating.value) genStage.value = 'render'
  }, 6000)

  const res = await generateSmart({
    image: uploadedImage.value!,
    toolSlug: tool.value.slug,
    toolTitle: tool.value.title,
    userPrompt: prompt_.value,
    extras: extras.value,
    resolution: mapResolution(quality.value),
    aspect_ratio: mapAspect(aspect.value),
    output_format: 'jpg',
  })

  clearTimeout(stageTimer)
  generating.value = false

  if (res.ok && res.url) {
    result.value = res.url
    lastCredits.value = res.creditsConsumed ?? null
    recordHistory(res.url, res.creditsConsumed ?? 0)
  } else {
    genError.value = res.error || 'Не удалось сгенерировать изображение'
  }
}

// Записываем генерацию в историю (кто и каким инструментом / способом)
function recordHistory(url: string, credits: number) {
  const g: Generation = {
    id: 'g' + Date.now(),
    toolSlug: tool.value.slug,
    toolTitle: tool.value.title,
    status: 'completed',
    thumbnail: url,
    createdAt: new Date().toISOString(),
    credits: credits || 1,
    author: auth.user?.name || 'Вы',
    source: 'web',
    similarity: scanResult.value?.similarity ?? 0,
    similarMatches: scanResult.value?.matches?.length ? scanResult.value.matches : undefined,
  }
  gens.addGeneration(g)
}

function reset() {
  uploadedImage.value = null
  result.value = null
  genError.value = null
  scanResult.value = null
  scanning.value = false
  clearDraft()
}

// === Черновик: сохраняем состояние, чтобы при обновлении страницы ничего не пропадало ===
const draftKey = computed(() => `coolay_draft_${tool.value.slug}`)

function saveDraft() {
  try {
    if (!uploadedImage.value && !result.value && !prompt_.value) {
      localStorage.removeItem(draftKey.value)
      return
    }
    const data = {
      uploadedImage: uploadedImage.value,
      result: result.value,
      prompt_: prompt_.value,
      quality: quality.value,
      background: background.value,
      aspect: aspect.value,
      brandStyle: brandStyle.value,
      selectedModel: selectedModel.value,
      selectedPose: selectedPose.value,
      lastCredits: lastCredits.value,
      scanResult: scanResult.value,
      savedAt: Date.now(),
    }
    localStorage.setItem(draftKey.value, JSON.stringify(data))
  } catch {
    /* ignore quota */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(draftKey.value)
  } catch {
    /* ignore */
  }
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(draftKey.value)
    if (!raw) return
    const d = JSON.parse(raw)
    uploadedImage.value = d.uploadedImage ?? null
    result.value = d.result ?? null
    prompt_.value = d.prompt_ ?? ''
    quality.value = d.quality ?? quality.value
    background.value = d.background ?? background.value
    aspect.value = d.aspect ?? aspect.value
    brandStyle.value = d.brandStyle ?? false
    selectedModel.value = d.selectedModel ?? selectedModel.value
    selectedPose.value = d.selectedPose ?? selectedPose.value
    lastCredits.value = d.lastCredits ?? null
    scanResult.value = d.scanResult ?? null
  } catch {
    /* ignore */
  }
}

onMounted(restoreDraft)

// Автосохранение при любых изменениях ключевых полей
watch(
  [uploadedImage, result, prompt_, quality, background, aspect, brandStyle, selectedModel, selectedPose, lastCredits, scanResult],
  saveDraft,
  { deep: true },
)

// При смене инструмента восстанавливаем его черновик
watch(
  () => tool.value.slug,
  () => {
    uploadedImage.value = null
    result.value = null
    prompt_.value = ''
    scanResult.value = null
    restoreDraft()
  },
)
</script>

<template>
  <div class="h-full flex flex-col bg-ink-50">
    <!-- Toolbar header -->
    <div class="shrink-0 bg-white border-b border-ink-100 px-4 sm:px-6 h-[60px] flex items-center gap-3">
      <button class="grid place-items-center w-9 h-9 rounded-xl text-ink-500 hover:bg-ink-100" @click="router.push('/tools')">
        <Icon name="chevronLeft" :size="20" />
      </button>
      <div class="grid place-items-center w-9 h-9 rounded-lg bg-ink-900 text-accent">
        <Icon :name="tool.icon" :size="18" />
      </div>
      <div class="min-w-0">
        <h1 class="font-extrabold text-ink-900 leading-tight truncate">{{ tool.title }}</h1>
        <p class="text-xs text-ink-400 truncate">{{ tool.description }}</p>
      </div>
      <div class="flex-1" />
      <span class="hidden sm:inline-flex chip bg-ink-50 text-ink-500"><Icon name="bolt" :size="13" /> ~4 кредита</span>
    </div>

    <!-- Body: settings + canvas -->
    <div class="flex-1 flex min-h-0 flex-col lg:flex-row">
      <!-- Settings panel -->
      <aside class="w-full lg:w-[360px] shrink-0 bg-white lg:border-r border-ink-100 overflow-y-auto">
        <div class="p-5 space-y-5">
          <!-- Upload -->
          <div>
            <label class="label">Изображение товара</label>
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFile" />
            <div
              v-if="!uploadedImage"
              @click="pickFile"
              @dragover.prevent="dragOver = true"
              @dragleave.prevent="dragOver = false"
              @drop.prevent="onDrop"
              class="rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition"
              :class="dragOver ? 'border-accent bg-accent/5' : 'border-ink-200 hover:border-ink-900 hover:bg-ink-50'"
            >
              <div class="grid place-items-center w-12 h-12 rounded-xl bg-ink-900 text-accent mx-auto mb-3">
                <Icon name="upload" :size="22" />
              </div>
              <p class="text-sm font-semibold text-ink-900">
                Перетащите файл или <span class="text-accent-600 underline">выберите</span>
              </p>
              <p class="text-xs text-ink-400 mt-1">PNG, JPG до 20 МБ</p>
            </div>
            <div v-else class="relative rounded-xl overflow-hidden border border-ink-200 group">
              <img :src="uploadedImage" class="w-full h-40 object-cover" />
              <button
                class="absolute top-2 right-2 grid place-items-center w-8 h-8 rounded-lg bg-black/60 text-white hover:bg-black/80"
                @click="reset"
              >
                <Icon name="trash" :size="16" />
              </button>
            </div>
            <!-- Проверка дубликатов товара -->
            <div v-if="uploadedImage" class="mt-2">
              <!-- сканирование -->
              <div v-if="scanning" class="flex items-center gap-2.5 rounded-xl bg-ink-50 border border-ink-100 px-3 py-2.5">
                <svg class="animate-spin text-ink-900" width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
                </svg>
                <span class="text-sm font-medium text-ink-600">Проверяем, не загружали ли товар ранее…</span>
              </div>

              <!-- Ошибка проверки: показываем явно, иначе пользователь решит,
                   что дублей нет, хотя проверка вообще не прошла. -->
              <div
                v-else-if="scanError"
                class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
              >
                {{ scanError }}
              </div>

              <!-- результат -->
              <div v-else-if="scanResult && !dismissedDup">
                <!-- дубликат / похожий -->
                <div
                  v-if="scanResult.matches.length"
                  class="rounded-xl border p-3"
                  :class="isDuplicate(scanResult.similarity) ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'"
                >
                  <div class="flex items-start gap-2.5">
                    <span
                      class="grid place-items-center w-8 h-8 rounded-lg shrink-0"
                      :class="isDuplicate(scanResult.similarity) ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'"
                    >
                      <Icon name="layers" :size="16" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-bold text-ink-900">
                        {{ isDuplicate(scanResult.similarity) ? 'Товар уже загружали' : 'Найден похожий товар' }}
                        <span :class="isDuplicate(scanResult.similarity) ? 'text-red-600' : 'text-amber-600'">· {{ scanResult.similarity }}%</span>
                      </p>
                      <p class="text-xs text-ink-500 mt-0.5">Совпадения с базой товаров:</p>
                    </div>
                  </div>
                  <ul class="mt-2 space-y-1.5">
                    <li
                      v-for="m in scanResult.matches"
                      :key="m.id"
                      class="flex items-center gap-2 rounded-lg bg-white/70 p-1.5"
                    >
                      <img :src="m.thumbnail" class="w-8 h-9 rounded object-cover shrink-0" />
                      <div class="min-w-0 flex-1">
                        <p class="text-xs font-semibold text-ink-900 truncate">{{ m.title }}</p>
                        <div class="flex items-center gap-1 text-[10px] text-ink-400">
                          <Avatar :name="m.author" :size="13" /> {{ m.author }} · {{ fmtShort(m.createdAt) }}
                        </div>
                      </div>
                      <span class="text-xs font-bold shrink-0" :class="m.similarity >= 80 ? 'text-red-600' : 'text-amber-600'">{{ m.similarity }}%</span>
                    </li>
                  </ul>
                  <div class="flex gap-2 mt-2.5">
                    <button class="btn btn-outline btn-sm flex-1 h-8 text-xs" @click="reset"><Icon name="x" :size="13" /> Отменить</button>
                    <button class="btn btn-dark btn-sm flex-1 h-8 text-xs" @click="dismissedDup = true">Всё равно продолжить</button>
                  </div>
                </div>

                <!-- уникальный -->
                <div v-else class="flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
                  <span class="grid place-items-center w-8 h-8 rounded-lg bg-green-100 text-green-600 shrink-0">
                    <Icon name="check" :size="16" />
                  </span>
                  <div>
                    <p class="text-sm font-bold text-ink-900">Уникальный товар · {{ scanResult.similarity }}%</p>
                    <p class="text-xs text-ink-500">Похожих товаров в базе не найдено</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- ERP shortcut -->
            <button class="mt-2 w-full btn btn-outline btn-sm">
              <Icon name="store" :size="16" /> Выбрать товар из 1С / МойСклад
            </button>
          </div>

          <!-- Virtual model specific -->
          <template v-if="isVirtualModel">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Модель</label>
                <button
                  @click="showModelPicker = true"
                  class="w-full rounded-xl border border-ink-200 p-2 flex items-center gap-2.5 hover:border-ink-900 transition text-left"
                >
                  <img :src="currentModel.image" class="w-10 h-12 rounded-lg object-cover shrink-0" />
                  <div class="min-w-0">
                    <div class="text-xs text-ink-400">Модель</div>
                    <div class="text-sm font-bold text-ink-900 truncate">{{ currentModel.name }}</div>
                  </div>
                </button>
              </div>
              <div>
                <label class="label">Поза</label>
                <button
                  @click="showPosePicker = true"
                  class="w-full rounded-xl border border-ink-200 p-2 flex items-center gap-2.5 hover:border-ink-900 transition text-left"
                >
                  <img :src="currentPose.image" class="w-10 h-12 rounded-lg object-cover shrink-0" />
                  <div class="min-w-0">
                    <div class="text-xs text-ink-400">Поза</div>
                    <div class="text-sm font-bold text-ink-900 truncate">{{ currentPose.name }}</div>
                  </div>
                </button>
              </div>
            </div>
          </template>

          <!-- Common settings -->
          <SelectField label="Качество" v-model="quality" :options="['Черновик · 0.5K', 'Стандартный · 1K', 'Высокое · 2K', 'Ультра · 4K']" />
          <SelectField label="Фон" v-model="background" :options="['Случайный', 'Белый студийный', 'Градиент', 'Интерьер', 'Природа', 'Прозрачный']" />
          <SelectField label="Соотношение сторон" v-model="aspect" :options="['Квадрат · 1:1', 'Портрет · 2:3', 'Портрет · 3:4', 'Альбом · 4:3', 'Сторис · 9:16']" />

          <!-- Prompt -->
          <div>
            <label class="label">Описание (необязательно)</label>
            <textarea
              v-model="prompt_"
              rows="3"
              placeholder="Опишите желаемый результат: освещение, стиль, настроение…"
              class="input !h-auto py-3 resize-none"
            />
          </div>

          <!-- Brand style toggle -->
          <label class="flex items-center justify-between cursor-pointer select-none">
            <span class="text-sm font-semibold text-ink-700">Применить стиль бренда</span>
            <span class="relative inline-block">
              <input v-model="brandStyle" type="checkbox" class="peer sr-only" />
              <span class="block w-11 h-6 rounded-full bg-ink-200 peer-checked:bg-accent transition" />
              <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow peer-checked:translate-x-5 transition" />
            </span>
          </label>
        </div>

        <!-- Generate button (sticky) -->
        <div class="sticky bottom-0 p-4 bg-white border-t border-ink-100">
          <button class="btn btn-accent btn-lg w-full" :disabled="!canGenerate || generating" @click="generate">
            <svg v-if="generating" class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            </svg>
            <Icon v-else name="sparkles" :size="18" />
            {{ generating ? 'Генерация…' : 'Сгенерировать' }}
          </button>
          <p v-if="!canGenerate" class="text-xs text-ink-400 text-center mt-2">Загрузите изображение товара</p>
        </div>
      </aside>

      <!-- Canvas -->
      <section class="flex-1 min-h-0 grid place-items-center p-6 overflow-y-auto">
        <!-- empty / instructions -->
        <div v-if="!uploadedImage && !result" class="max-w-md text-center">
          <div class="relative mx-auto w-64 h-44 mb-6">
            <div class="absolute left-0 top-4 w-32 h-36 rounded-xl bg-white border border-ink-200 shadow-card grid place-items-center -rotate-6">
              <Icon name="image" :size="36" class="text-ink-300" />
            </div>
            <div class="absolute right-0 top-0 w-32 h-40 rounded-xl bg-ink-900 shadow-card grid place-items-center rotate-6">
              <Icon name="sparkles" :size="36" class="text-accent" />
            </div>
          </div>
          <h2 class="text-xl font-extrabold text-ink-900">{{ tool.title }}</h2>
          <p class="text-ink-400 mt-2">
            Загрузите фото товара слева, настройте параметры и нажмите «Сгенерировать», чтобы получить готовую карточку.
          </p>
        </div>

        <!-- processing (2 этапа: анализ → генерация) -->
        <div v-else-if="generating" class="text-center">
          <div class="skeleton w-72 h-96 rounded-2xl mx-auto" />
          <p class="mt-5 font-semibold text-ink-900 flex items-center justify-center gap-2">
            <Icon name="sparkles" :size="18" class="text-accent-600 animate-pulse" />
            {{ genStage === 'analyze' ? 'Анализируем фото товара…' : 'Создаём изображение…' }}
          </p>
          <!-- индикатор шагов -->
          <div class="flex items-center justify-center gap-2 mt-4">
            <div class="flex items-center gap-1.5">
              <span
                class="grid place-items-center w-6 h-6 rounded-full text-[11px] font-bold"
                :class="genStage === 'analyze' ? 'bg-ink-900 text-accent' : 'bg-green-500 text-white'"
              >
                <Icon v-if="genStage !== 'analyze'" name="check" :size="13" />
                <template v-else>1</template>
              </span>
              <span class="text-xs font-medium" :class="genStage === 'analyze' ? 'text-ink-900' : 'text-ink-400'">Анализ</span>
            </div>
            <span class="w-8 h-px bg-ink-200" />
            <div class="flex items-center gap-1.5">
              <span
                class="grid place-items-center w-6 h-6 rounded-full text-[11px] font-bold"
                :class="genStage === 'render' ? 'bg-ink-900 text-accent' : 'bg-ink-100 text-ink-400'"
              >2</span>
              <span class="text-xs font-medium" :class="genStage === 'render' ? 'text-ink-900' : 'text-ink-400'">Генерация</span>
            </div>
          </div>
          <p class="text-sm text-ink-400 mt-4">Обычно занимает 20–60 секунд</p>
        </div>

        <!-- result / preview -->
        <div v-else class="w-full max-w-3xl">
          <div class="grid sm:grid-cols-2 gap-5">
            <div>
              <p class="label text-center">Оригинал</p>
              <div class="rounded-2xl overflow-hidden border border-ink-200 bg-white aspect-[3/4]">
                <img :src="uploadedImage!" class="w-full h-full object-cover" />
              </div>
            </div>
            <div>
              <p class="label text-center">{{ result ? 'Результат' : 'Предпросмотр' }}</p>
              <div
                class="rounded-2xl overflow-hidden border-2 aspect-[3/4] grid place-items-center"
                :class="result ? 'border-accent bg-white' : genError ? 'border-red-200 bg-red-50' : 'border-dashed border-ink-200 bg-ink-50'"
              >
                <img v-if="result" :src="result" class="w-full h-full object-contain bg-ink-50 cursor-zoom-in" @click="showResultLightbox = true" />
                <div v-else-if="genError" class="text-center px-4">
                  <span class="grid place-items-center w-12 h-12 rounded-xl bg-red-100 text-red-600 mx-auto mb-2">
                    <Icon name="x" :size="22" />
                  </span>
                  <p class="text-sm font-bold text-ink-900">Не удалось сгенерировать</p>
                  <p class="text-xs text-ink-500 mt-1">{{ genError }}</p>
                </div>
                <span v-else class="text-ink-300 text-sm font-medium">Нажмите «Сгенерировать»</span>
              </div>
            </div>
          </div>
          <div v-if="result" class="flex flex-wrap items-center justify-center gap-3 mt-5">
            <a :href="result" target="_blank" rel="noopener" download class="btn btn-accent btn-md"><Icon name="download" :size="18" /> Скачать</a>
            <button class="btn btn-outline btn-md" @click="generate"><Icon name="refresh" :size="18" /> Перегенерировать</button>
            <button class="btn btn-outline btn-md"><Icon name="store" :size="18" /> Выгрузить в ERP</button>
            <span v-if="lastCredits !== null" class="chip bg-ink-50 text-ink-500"><Icon name="bolt" :size="13" /> {{ lastCredits }} кр.</span>
          </div>
          <div v-else-if="genError" class="flex justify-center mt-5">
            <button class="btn btn-dark btn-md" @click="generate"><Icon name="refresh" :size="18" /> Повторить</button>
          </div>
        </div>
      </section>
    </div>

    <!-- Pickers -->
    <PickerModal
      v-if="showModelPicker"
      title="Выберите модель"
      :items="models"
      :selected="selectedModel"
      allow-upload
      @select="selectedModel = $event"
      @close="showModelPicker = false"
    />
    <PickerModal
      v-if="showPosePicker"
      title="Выберите позу"
      :items="poses"
      :selected="selectedPose"
      @select="selectedPose = $event"
      @close="showPosePicker = false"
    />

    <!-- Лайтбокс результата -->
    <Teleport to="body">
      <div
        v-if="showResultLightbox && result"
        class="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
        @click.self="showResultLightbox = false"
      >
        <button
          class="absolute top-4 right-4 grid place-items-center w-11 h-11 rounded-xl bg-white/10 text-white hover:bg-white/20 transition"
          @click="showResultLightbox = false"
        >
          <Icon name="x" :size="22" />
        </button>
        <div class="max-w-4xl w-full" @click.stop>
          <img :src="result" class="w-full max-h-[80vh] object-contain rounded-2xl" />
          <div class="mt-4 flex items-center justify-center gap-3">
            <a :href="result" target="_blank" rel="noopener" download class="btn btn-accent btn-sm">
              <Icon name="download" :size="16" /> Скачать
            </a>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
