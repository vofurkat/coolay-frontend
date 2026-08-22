// Порог, выше которого товар считается возможным дубликатом.
// Значение согласовано с сервером (backend/cards.js DUPLICATE_THRESHOLD):
// именно сервер авторитетно решает, показывать ли предупреждение о дубликате,
// а фронтенд использует ту же константу для подписей статуса. Разные значения
// давали расхождение: карточка помечалась «Дубликат» в списке, но при загрузке
// фото предупреждение не всплывало.
export const DUPLICATE_THRESHOLD = 90

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
