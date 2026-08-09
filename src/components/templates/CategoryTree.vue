<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, Folder } from '@lucide/vue'
import type { CategoryNode } from '@/data/platformApi'

/**
 * Дерево категорий с рекурсией через собственное имя компонента.
 *
 * Уровни не ограничены тремя: заказчик привёл пример «Мужское — Рубашки —
 * Классические», но шаблон можно прикрепить к ЛЮБОМУ уровню, поэтому и дерево
 * должно работать на произвольной глубине.
 */
const props = defineProps<{
  nodes: CategoryNode[]
  selected: string[]
  /** Набор раскрытых путей, ключ — path.join('/'). */
  expanded: Set<string>
  depth?: number
}>()

const emit = defineEmits<{
  select: [path: string[]]
  toggle: [key: string]
}>()

const level = computed(() => props.depth ?? 0)

const keyOf = (n: CategoryNode) => n.path.join('/')

/** Выделен ровно этот узел (а не родитель выбранного). */
function isActive(n: CategoryNode) {
  return props.selected.join('/') === keyOf(n)
}
</script>

<template>
  <ul class="space-y-0.5">
    <li v-for="node in nodes" :key="keyOf(node)">
      <div
        class="group flex items-center gap-1 rounded-xl transition-colors"
        :class="
          isActive(node) ? 'bg-brand-50 text-ink-900' : 'text-ink-600 hover:bg-ink-50'
        "
        :style="{ paddingLeft: 6 + level * 14 + 'px' }"
      >
        <!-- Раскрывашка отдельной кнопкой: клик по названию должен
             фильтровать, а не сворачивать — иначе нельзя выбрать родителя. -->
        <button
          v-if="node.children.length"
          type="button"
          class="shrink-0 grid place-items-center w-5 h-5 rounded-md hover:bg-ink-100"
          :aria-label="expanded.has(keyOf(node)) ? 'Свернуть' : 'Развернуть'"
          @click.stop="emit('toggle', keyOf(node))"
        >
          <ChevronRight
            :size="13"
            :stroke-width="2.2"
            class="transition-transform"
            :class="expanded.has(keyOf(node)) ? 'rotate-90' : ''"
          />
        </button>
        <span v-else class="shrink-0 w-5" />

        <button
          type="button"
          class="flex-1 flex items-center gap-2 py-2 pr-2 text-left min-w-0"
          @click="emit('select', node.path)"
        >
          <Folder
            :size="14"
            :stroke-width="1.8"
            class="shrink-0"
            :class="isActive(node) ? 'text-ink-900' : 'text-ink-400'"
          />
          <span class="text-sm truncate" :class="isActive(node) ? 'font-semibold' : ''">
            {{ node.name }}
          </span>
          <span class="ml-auto shrink-0 text-[11px] tabular-nums text-ink-400">
            {{ node.count }}
          </span>
        </button>
      </div>

      <CategoryTree
        v-if="node.children.length && expanded.has(keyOf(node))"
        :nodes="node.children"
        :selected="selected"
        :expanded="expanded"
        :depth="level + 1"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </li>
  </ul>
</template>
