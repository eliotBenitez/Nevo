import { onBeforeUnmount, ref } from 'vue'
import { trackPointerDrag } from '../../utils/pointerDrag'
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
 * Состояние перетаскивания сайдбара. Дерево двигается pointer-событиями
 * (`onRowPointerDown`); HTML5-часть (`onDragStart`/`onDragOverRow`/...) осталась
 * только для tag-preview.
 */
export function useSidebarDrag(options: { onTreeDrop?: (result: SidebarDropResult) => unknown } = {}) {
  const draggedSource = ref<SidebarDragSource | null>(null)
  const dragOver = ref<SidebarDragOver | null>(null)
  const rootDropActive = ref(false)
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

  /** Разрешает итоговое действие сброса для tree-режима. */
  function resolveTreeDrop(source: SidebarDragSource, target: SidebarDragTarget, position: DropPosition): SidebarDropResult | null {
    if (source.id === target.id) return null

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

  function canDropToRoot(source: SidebarDragSource | null): boolean {
    return !!source && source.kind === 'note' && source.parentId !== null
  }

  function hitTest(x: number, y: number) {
    const el = document.elementFromPoint?.(x, y)
    const row = el?.closest<HTMLElement>('[data-tree-row-id]')
    if (row) {
      const target: SidebarDragTarget = {
        id: row.dataset.treeRowId ?? '',
        kind: row.dataset.treeRowKind === 'folder' ? 'folder' : 'note',
        parentId: row.dataset.treeRowParent || null,
      }
      const rect = row.getBoundingClientRect()
      const position = resolveDropPosition(y - rect.top, rect.height || ROW_HEIGHT_FALLBACK, target.kind === 'folder')
      return { target, position, root: false }
    }
    return { target: null, position: null, root: !!el?.closest('[data-tree-root-drop]') }
  }

  function updateHover(x: number, y: number) {
    const hit = hitTest(x, y)
    const source = draggedSource.value
    rootDropActive.value = hit.root && canDropToRoot(source)
    if (!hit.target || !source || source.id === hit.target.id) {
      dragOver.value = null
      return hit
    }
    const current = dragOver.value
    if (!current || current.id !== hit.target.id || current.position !== hit.position) {
      dragOver.value = { id: hit.target.id, position: hit.position }
    }
    return hit
  }

  let cancelPointerDrag: (() => void) | null = null

  function finishPointerDrag(result: SidebarDropResult | null) {
    if (!result) {
      resetDragState(false)
      return
    }
    return Promise.resolve(options.onTreeDrop?.(result)).finally(() => resetDragState(false))
  }

  /** pointerdown на строке дерева: взводит перетаскивание, оно стартует после порога движения. */
  function onRowPointerDown(event: PointerEvent, source: SidebarDragSource) {
    if (event.button !== 0 || event.isPrimary === false || cancelPointerDrag) return
    cancelPointerDrag = trackPointerDrag(event, {
      onStart: () => { draggedSource.value = source },
      onMove: (e) => { updateHover(e.clientX, e.clientY) },
      onEnd: (e) => {
        const hit = updateHover(e.clientX, e.clientY)
        let result: SidebarDropResult | null = null
        if (hit.target) result = resolveTreeDrop(source, hit.target, hit.position)
        else if (hit.root && canDropToRoot(source)) result = { kind: 'move-root', sourceId: source.id }
        void finishPointerDrag(result)
      },
      onAbort: () => resetDragState(false),
      onFinish: () => { cancelPointerDrag = null },
    })
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
    rootDropActive.value = false
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
    cancelPointerDrag?.()
    if (suppressTimer) clearTimeout(suppressTimer)
  })

  return {
    draggedSource,
    dragOver,
    onDragStart,
    onDragOverRow,
    onDragEnterRow,
    onDragLeaveRow,
    rootDropActive,
    onRowPointerDown,
    resolveFlatDrop,
    resetDragState,
    shouldSuppressClick,
  }
}
