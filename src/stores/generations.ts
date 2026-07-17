import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Generation, DeviceSource } from '@/types'

/**
 * Store генераций.
 * Пока данные пустые (фронт без бэкенда) — вся статистика считается
 * из этого массива. После подключения API сюда будут приходить реальные записи,
 * и весь дашборд/история заработают без изменений в компонентах.
 */
const STORAGE_KEY = 'coolay_generations'

function loadItems(): Generation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Generation[]
  } catch {
    /* ignore */
  }
  return []
}

export const useGenerationsStore = defineStore('generations', () => {
  // Источник правды. Восстанавливаем из localStorage (пока нет бэкенда истории).
  const items = ref<Generation[]>(loadItems())

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value))
    } catch {
      /* ignore */
    }
  }

  // Признак загрузки (для будущего API)
  const loading = ref(false)

  // --- Базовые выборки ---
  const total = computed(() => items.value.length)
  const hasData = computed(() => items.value.length > 0)

  const completed = computed(() => items.value.filter((g) => g.status === 'completed'))
  const processing = computed(() => items.value.filter((g) => g.status === 'processing'))
  const failed = computed(() => items.value.filter((g) => g.status === 'failed'))

  // --- Метрики ---
  const successRate = computed(() => {
    const finished = completed.value.length + failed.value.length
    if (finished === 0) return 0
    return Math.round((completed.value.length / finished) * 1000) / 10
  })

  const creditsSpent = computed(() => items.value.reduce((s, g) => s + g.credits, 0))

  const thisMonthCount = computed(() => {
    const now = new Date()
    return items.value.filter((g) => {
      const d = new Date(g.createdAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
  })

  const duplicatesCount = computed(() => items.value.filter((g) => g.similarity >= 80).length)

  // --- Распределение по инструментам ---
  const byTool = computed(() => {
    const map = new Map<string, number>()
    for (const g of items.value) map.set(g.toolTitle, (map.get(g.toolTitle) || 0) + 1)
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  })

  // --- Распределение по устройствам ---
  const bySource = computed(() => {
    const map = new Map<DeviceSource, number>()
    for (const g of items.value) map.set(g.source, (map.get(g.source) || 0) + 1)
    return map
  })

  // --- Активность по дням (последние 14 дней) из реальных дат ---
  const activityByDay = computed(() => {
    const days: { label: string; value: number; date: string }[] = []
    const today = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const count = items.value.filter((g) => g.createdAt.slice(0, 10) === key).length
      days.push({
        label: d.toLocaleDateString('ru', { day: 'numeric', month: 'short' }),
        value: count,
        date: key,
      })
    }
    return days
  })

  const recent = computed(() =>
    [...items.value].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
  )

  // --- Действия (заглушки под API) ---
  function setItems(list: Generation[]) {
    items.value = list
    persist()
  }
  function addGeneration(g: Generation) {
    items.value.unshift(g)
    persist()
  }
  function clearAll() {
    items.value = []
    persist()
  }
  async function fetchAll() {
    // TODO: заменить на реальный запрос к API.
    // Пока берём из localStorage (что сгенерировали в этой сессии).
    loading.value = true
    await new Promise((r) => setTimeout(r, 150))
    items.value = loadItems()
    loading.value = false
  }

  return {
    items,
    loading,
    total,
    hasData,
    completed,
    processing,
    failed,
    successRate,
    creditsSpent,
    thisMonthCount,
    duplicatesCount,
    byTool,
    bySource,
    activityByDay,
    recent,
    setItems,
    addGeneration,
    clearAll,
    fetchAll,
  }
})
