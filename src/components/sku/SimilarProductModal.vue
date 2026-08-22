<script setup lang="ts">
/**
 * Предупреждение «такой товар уже создавали».
 *
 * Сознательно НЕ блокирует работу: у продавца бывают законные причины
 * завести второй такой же товар (другая партия, другой поставщик, другой
 * размерный ряд). Поэтому это выбор из двух равноправных действий —
 * открыть существующую карточку или продолжить создание.
 */
import Icon from '@/components/ui/Icon.vue'
import type { SimilarMatch } from '@/data/skuApi'

const props = defineProps<{
  matches: SimilarMatch[]
  threshold: number
}>()

const emit = defineEmits<{
  open: [id: string]
  dismiss: []
}>()

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

/** Цвет плашки: точное совпадение кадра тревожнее простого сходства. */
function tone(m: SimilarMatch) {
  if (m.similarity >= props.threshold) return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="similar-title"
  >
    <div class="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden">
      <div class="p-5 border-b border-ink-100 flex items-start gap-3">
        <div class="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <Icon name="alert" class="w-5 h-5 text-amber-600" />
        </div>
        <div class="min-w-0">
          <h2 id="similar-title" class="text-base font-semibold text-ink-900">
            Похоже, такой товар уже есть
          </h2>
          <p class="text-sm text-ink-500 mt-0.5">
            Мы нашли карточки со схожестью
            {{ threshold }}% и выше. Проверьте — возможно, создавать новую не нужно.
          </p>
        </div>
      </div>

      <div class="p-5 space-y-3 max-h-80 overflow-y-auto">
        <button
          v-for="m in matches"
          :key="m.id"
          type="button"
          class="w-full flex items-center gap-3 p-3 rounded-xl border border-ink-100 hover:border-ink-300 hover:bg-ink-50 text-left transition"
          @click="emit('open', m.id)"
        >
          <img
            v-if="m.thumbnail"
            :src="m.thumbnail"
            :alt="m.title"
            class="w-14 h-14 rounded-lg object-cover bg-ink-100 shrink-0"
            loading="lazy"
          />
          <div v-else class="w-14 h-14 rounded-lg bg-ink-100 flex items-center justify-center shrink-0">
            <Icon name="image" class="w-5 h-5 text-ink-400" />
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-ink-900 truncate">{{ m.title }}</p>
            <p class="text-xs text-ink-500 mt-0.5 truncate">
              {{ m.sku }} · {{ m.author }} · {{ fmtDate(m.createdAt) }}
            </p>
          </div>

          <div class="shrink-0 text-right">
            <span class="inline-block text-xs font-semibold px-2 py-1 rounded-lg" :class="tone(m)">
              {{ m.similarity }}%
            </span>
            <p v-if="m.exact" class="text-[11px] text-rose-600 mt-1">то же фото</p>
          </div>
        </button>
      </div>

      <div class="p-5 border-t border-ink-100 flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button type="button" class="btn btn-ghost" @click="emit('dismiss')">
          Всё равно создать новую
        </button>
        <button
          v-if="matches.length"
          type="button"
          class="btn btn-primary"
          @click="emit('open', matches[0].id)"
        >
          Открыть существующую
        </button>
      </div>
    </div>
  </div>
</template>
