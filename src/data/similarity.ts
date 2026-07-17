// Порог, выше которого товар считается возможным дубликатом
export const DUPLICATE_THRESHOLD = 80

export function isDuplicate(similarity: number): boolean {
  return similarity >= DUPLICATE_THRESHOLD
}

// Метаданные статуса уникальности по проценту схожести
export function uniquenessMeta(similarity: number): {
  label: string
  cls: string
  dotCls: string
} {
  if (similarity >= DUPLICATE_THRESHOLD) {
    return { label: 'Дубликат', cls: 'bg-red-50 text-red-600', dotCls: 'bg-red-500' }
  }
  if (similarity >= 50) {
    return { label: 'Похожий', cls: 'bg-amber-50 text-amber-600', dotCls: 'bg-amber-500' }
  }
  return { label: 'Уникальный', cls: 'bg-green-50 text-green-600', dotCls: 'bg-green-500' }
}
