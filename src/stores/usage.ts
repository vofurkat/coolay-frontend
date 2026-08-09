import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { isFail, teamApi, type UsageState } from '@/data/platformApi'

/**
 * Остаток генераций и текущий план.
 *
 * Стор, а не локальное состояние компонента: те же цифры показывает сайдбар,
 * главная и биллинг в настройках. Если бы каждый экран грузил их сам, после
 * генерации они разъехались бы между собой.
 */
export const useUsageStore = defineStore('usage', () => {
  const usage = ref<UsageState | null>(null)
  const loading = ref(false)
  const error = ref('')

  /**
   * Доля ОСТАТКА, а не расхода: полоса заполнена, пока квота есть, и пустеет
   * к концу периода. Так задумано в макете («Осталось генераций 658 / 1000»
   * при заполнении 66%), поэтому берём left/limit, а не usage.percent.
   */
  const leftPercent = computed(() => {
    if (!usage.value || !usage.value.limit) return 0
    return Math.min(100, Math.round((usage.value.left / usage.value.limit) * 100))
  })

  /** Меньше 15% остатка — повод показать предупреждение. */
  const isLow = computed(() => !!usage.value && leftPercent.value <= 15)

  async function load(force = false) {
    if (loading.value) return
    if (usage.value && !force) return
    loading.value = true
    error.value = ''
    const res = await teamApi.usage()
    loading.value = false
    if (isFail(res)) {
      error.value = res.error
      return
    }
    usage.value = res.usage
  }

  async function setPlan(plan: string) {
    const res = await teamApi.setPlan(plan)
    if (isFail(res)) {
      error.value = res.error
      return false
    }
    usage.value = res.usage
    return true
  }

  return { usage, loading, error, leftPercent, isLow, load, setPlan }
})
