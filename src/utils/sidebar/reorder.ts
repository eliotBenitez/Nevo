import type { SidebarNotePreview } from '../../types/note'

export type DropPosition = 'before' | 'into' | 'after'

/**
 * Перемещает элемент с заданным id на новую позицию в массиве.
 * Контракт: `targetIndex` — желаемая финальная позиция элемента в массиве после
 * вставки (с clamp в [0, length-1]). Перемещение «в конец» (target >= length-1)
 * ставит элемент последним. Возвращает новый массив; если элемент не найден или
 * позиция не изменилась — возвращает копию исходного.
 */
export function moveItemInArray<T extends { id: string }>(
  items: readonly T[],
  itemId: string,
  targetIndex: number,
): T[] {
  const fromIndex = items.findIndex((item) => item.id === itemId)
  if (fromIndex === -1) return items.slice()
  const clamped = Math.max(0, Math.min(targetIndex, items.length - 1))
  if (fromIndex === clamped) return items.slice()
  const next = items.slice()
  const [moved] = next.splice(fromIndex, 1)
  // После удаления массив стал короче на 1. Вставляем на clamped, чтобы элемент
  // оказался ровно на финальном индексе clamped в массиве после вставки.
  next.splice(clamped, 0, moved)
  return next
}

/**
 * Перемещает id в массиве строк (например, rootOrder или sidebarNoteOrder).
 * Чистая функция: возвращает новый массив.
 */
export function moveIdInOrder(order: readonly string[], itemId: string, targetIndex: number): string[] {
  return moveItemInArray(
    order.map((id) => ({ id })),
    itemId,
    targetIndex,
  ).map((entry) => entry.id)
}

/**
 * Сортирует превью заметок в соответствии с сохранённым пользовательским порядком.
 * Заметки, отсутствующие в `order`, остаются в конце, сохраняя исходный относительный порядок.
 * Если `order` пуст или отсутствует — возвращает копию исходного массива как есть.
 */
export function applySidebarNoteOrder(
  previews: readonly SidebarNotePreview[],
  order: readonly string[] | undefined,
): SidebarNotePreview[] {
  if (!order || !order.length) return previews.slice()
  const indexById = new Map<string, number>()
  order.forEach((id, idx) => indexById.set(id, idx))
  const ordered: SidebarNotePreview[] = []
  const rest: SidebarNotePreview[] = []
  for (const preview of previews) {
    if (indexById.has(preview.noteId)) ordered.push(preview)
    else rest.push(preview)
  }
  ordered.sort((a, b) => (indexById.get(a.noteId) ?? 0) - (indexById.get(b.noteId) ?? 0))
  return [...ordered, ...rest]
}

/**
 * Вычисляет позицию сброса (before/into/after) по вертикальной координате
 * внутри строки. `isFolderTarget` управляет шириной центральной «into»-зоны:
 * для папок она шире (чтобы было удобно попасть внутрь), для заметок центр
 * трактуется как переупорядочивание (before/after).
 */
export function resolveDropPosition(offsetY: number, rowHeight: number, isFolderTarget: boolean): DropPosition {
  if (rowHeight <= 0) return 'after'
  const ratio = offsetY / rowHeight
  if (isFolderTarget) {
    if (ratio < 0.28) return 'before'
    if (ratio > 0.72) return 'after'
    return 'into'
  }
  if (ratio < 0.5) return 'before'
  return 'after'
}
