import { onBeforeUnmount, ref } from 'vue'
import { resolveDropPosition, type DropPosition } from '../../utils/sidebar/reorder'

export type SidebarDragKind = 'note' | 'folder'

export interface SidebarDragSource {
  id: string
  kind: SidebarDragKind
  parentId: string | null
}

export interface SidebarDragTarget {
  id: string
  kind: SidebarDragKind
  parentId: string | null
}

export interface SidebarDragOver {
  id: string
  position: DropPosition
}

export type SidebarDropResult =
  | { kind: 'move'; sourceId: string; targetFolderId: string }
  | { kind: 'move-root'; sourceId: string }
  | { kind: 'move-position'; sourceId: string; targetId: string; position: 'before' | 'after'; parentId: string | null }
  | { kind: 'reorder'; sourceId: string; targetId: string; position: 'before' | 'after'; parentId: string | null }

// Кастомные MIME-типы для надёжной передачи источника через dataTransfer.
export const DATA_SOURCE_ID = 'nevo/sourceId'
export const DATA_SOURCE_KIND = 'nevo/sourceKind'
export const DATA_SOURCE_PARENT = 'nevo/sourceParent'

const ROW_HEIGHT_FALLBACK = 30

function resolveRowOffset(event: DragEvent): { offsetY: number; rowHeight: number } {
  const row = event.currentTarget as HTMLElement | null
  const rect = row?.getBoundingClientRect()
  const measuredHeight = row?.offsetHeight || rect?.height || ROW_HEIGHT_FALLBACK
  let offsetY = event.offsetY

  if (rect && rect.height > 0 && Number.isFinite(event.clientY)) {
    offsetY = event.clientY - rect.top
  }

  return {
    offsetY: Math.max(0, Math.min(offsetY, measuredHeight)),
    rowHeight: measuredHeight,
  }
}

/**
 * Надёжное состояние HTML5 drag-and-drop для сайдбара.
 *
 * Источник хранится в двух местах: реактивный `draggedSource` (для визуальной
 * обратной связи) и в `dataTransfer` (переживает гонки dragleave/drop, работает
 * между разными экземплярами рекурсивного компонента). Счётчик enter/leave пар
 * защищает от ложных dragleave при проходе курсора по дочерним элементам строки.
 */
export function useSidebarDrag() {
  const draggedSource = ref<SidebarDragSource | null>(null)
  const dragOver = ref<SidebarDragOver | null>(null)
  const suppressNextClick = ref(false)
  let suppressTimer: ReturnType<typeof setTimeout> | null = null
  // Счётчик пар dragenter/dragleave для каждой строки — HTML5 DnD порождает
  // шумные enter/leave при движении по дочерним узлам; очищаем индикатор только
  // когда счётчик обнуляется (курсор действительно покинул строку).
  const enterCounters = new Map<string, number>()

  function readSourceFromTransfer(event: DragEvent): SidebarDragSource | null {
    const dt = event.dataTransfer
    if (!dt) return null
    const id = dt.getData(DATA_SOURCE_ID)
    if (!id) return null
    const kind = (dt.getData(DATA_SOURCE_KIND) || 'note') as SidebarDragKind
    const parent = dt.getData(DATA_SOURCE_PARENT)
    return { id, kind, parentId: parent || null }
  }

  function onDragStart(event: DragEvent, source: SidebarDragSource) {
    draggedSource.value = source
    const dt = event.dataTransfer
    if (dt) {
      dt.effectAllowed = 'move'
      dt.setData('text/plain', source.id)
      dt.setData(DATA_SOURCE_ID, source.id)
      dt.setData(DATA_SOURCE_KIND, source.kind)
      dt.setData(DATA_SOURCE_PARENT, source.parentId ?? '')
    }
  }

  /** dragover на строке/карточке: preventDefault обязателен, иначе drop не сработает. */
  function onDragOverRow(event: DragEvent, target: SidebarDragTarget, isFolderTarget: boolean) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    // Если источник неизвестен реактивно — восстановим из dataTransfer.
    if (!draggedSource.value) {
      draggedSource.value = readSourceFromTransfer(event)
    }
    const source = draggedSource.value
    if (!source || source.id === target.id) {
      dragOver.value = null
      return
    }
    const { offsetY, rowHeight } = resolveRowOffset(event)
    const position = resolveDropPosition(offsetY, rowHeight, isFolderTarget)
    const current = dragOver.value
    if (current && current.id === target.id && current.position === position) return
    dragOver.value = { id: target.id, position }
  }

  /** dragenter на строке — увеличивает счётчик, чтобы подавить ложный leave. */
  function onDragEnterRow(targetId: string) {
    enterCounters.set(targetId, (enterCounters.get(targetId) ?? 0) + 1)
  }

  /** dragleave на строке — очищает индикатор только когда курсор реально покинул строку. */
  function onDragLeaveRow(targetId: string) {
    const next = (enterCounters.get(targetId) ?? 0) - 1
    if (next <= 0) {
      enterCounters.delete(targetId)
      if (dragOver.value?.id === targetId) dragOver.value = null
    } else {
      enterCounters.set(targetId, next)
    }
  }

  /** Разрешает итоговое действие сброса для tree-режима (читает источник из ref и dataTransfer). */
  function resolveTreeDrop(event: DragEvent, target: SidebarDragTarget): SidebarDropResult | null {
    const source = draggedSource.value ?? readSourceFromTransfer(event)
    if (!source || source.id === target.id) return null
    const position = dragOver.value?.position ?? (target.kind === 'folder' ? 'into' : 'after')

    // Переупорядочивание соседей одного родителя (before/after).
    if (source.parentId === target.parentId && (position === 'before' || position === 'after')) {
      return { kind: 'reorder', sourceId: source.id, targetId: target.id, position, parentId: target.parentId }
    }
    // Перемещение заметки между родителями с сохранением позиции рядом с заметкой-целью.
    if (source.kind === 'note' && target.kind === 'note' && (position === 'before' || position === 'after')) {
      return { kind: 'move-position', sourceId: source.id, targetId: target.id, position, parentId: target.parentId }
    }
    // Корневой уровень поддерживает смешанный порядок папок и заметок через
    // rootOrder, поэтому вложенную заметку можно вытащить рядом с корневой папкой.
    if (source.kind === 'note' && target.kind === 'folder' && target.parentId === null && (position === 'before' || position === 'after')) {
      return { kind: 'move-position', sourceId: source.id, targetId: target.id, position, parentId: null }
    }
    // Перемещение заметки в папку-цель.
    if (target.kind === 'folder' && source.kind === 'note') {
      return { kind: 'move', sourceId: source.id, targetFolderId: target.id }
    }
    return null
  }

  function onDragOverRoot(event: DragEvent): boolean {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    if (!draggedSource.value) {
      draggedSource.value = readSourceFromTransfer(event)
    }
    const source = draggedSource.value
    if (!source || source.kind !== 'note' || source.parentId === null) return false
    dragOver.value = null
    return true
  }

  function resolveRootDrop(event: DragEvent): SidebarDropResult | null {
    const source = draggedSource.value ?? readSourceFromTransfer(event)
    if (!source || source.kind !== 'note' || source.parentId === null) return null
    return { kind: 'move-root', sourceId: source.id }
  }

  /** Разрешает итоговое действие сброса для tag-preview (только переупорядочивание). */
  function resolveFlatDrop(event: DragEvent, targetId: string): { sourceId: string; targetId: string } | null {
    const source = draggedSource.value ?? readSourceFromTransfer(event)
    if (!source || source.id === targetId) return null
    return { sourceId: source.id, targetId }
  }

  function resetDragState(suppressClick = false) {
    draggedSource.value = null
    dragOver.value = null
    enterCounters.clear()
    if (suppressClick) {
      suppressNextClick.value = true
      if (suppressTimer) clearTimeout(suppressTimer)
      suppressTimer = setTimeout(() => {
        suppressNextClick.value = false
        suppressTimer = null
      }, 120)
    }
  }

  function shouldSuppressClick(): boolean {
    if (suppressNextClick.value) {
      suppressNextClick.value = false
      if (suppressTimer) {
        clearTimeout(suppressTimer)
        suppressTimer = null
      }
      return true
    }
    return false
  }

  onBeforeUnmount(() => {
    if (suppressTimer) clearTimeout(suppressTimer)
  })

  return {
    draggedSource,
    dragOver,
    onDragStart,
    onDragOverRow,
    onDragOverRoot,
    onDragEnterRow,
    onDragLeaveRow,
    resolveTreeDrop,
    resolveRootDrop,
    resolveFlatDrop,
    resetDragState,
    shouldSuppressClick,
  }
}
