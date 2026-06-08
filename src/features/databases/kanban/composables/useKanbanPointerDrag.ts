import { computed, ref, type CSSProperties } from 'vue'
import type { KanbanCard } from '../../../../types/kanban'

interface PointerDragRuntime {
  pointerId: number
  cardId: string
  fromColumnId: string
  startX: number
  startY: number
  pointerX: number
  pointerY: number
  renderX: number
  renderY: number
  lastDeltaX: number
  lastDeltaY: number
  grabOffsetX: number
  grabOffsetY: number
  cardWidth: number
  cardEl: HTMLElement | null
  rafId: number | null
}

interface KanbanPointerDragOptions {
  /** Cards currently shown in a column (search-filtered), for index resolution. */
  cardsForColumn: (columnId: string) => KanbanCard[]
  /** Resolved reduced-motion preference ('reduce' | 'no-preference' | 'system'). */
  getReducedMotion: () => string
  /** Commit a finished drag (also used by the native HTML5 drop path). */
  onCommitMove: (cardId: string, toColumnId: string, targetIndex: number) => void
}

const pointerDragThreshold = 4
const floatingCardCursorOffsetX = 14
const floatingCardCursorOffsetY = 10
const pointerDragFollowFactor = 0.82
const pointerDragSettleEpsilon = 0.35
const pointerDragTiltLimit = 1.1

/** RAF-smoothed pointer drag-and-drop engine for the Kanban board, extracted
 *  from KanbanView. Owns the shared drag state so the native HTML5 drag path in
 *  the view can reuse the same refs and `clearDragState`. */
export function useKanbanPointerDrag(options: KanbanPointerDragOptions) {
  const pointerDragStarted = ref(false)
  const dragCardId = ref<string | null>(null)
  const dragFromColumnId = ref<string | null>(null)
  const dragFromIndex = ref<number | null>(null)
  const dropTargetColumnId = ref<string | null>(null)
  const dropTargetIndex = ref<number | null>(null)
  const pointerFloatingCardStyle = ref<CSSProperties | null>(null)

  let pointerDragRuntime: PointerDragRuntime | null = null

  function resolveCardElement(event: PointerEvent) {
    const target = event.target as HTMLElement | null
    const currentTarget = event.currentTarget as HTMLElement | null
    return target?.closest<HTMLElement>('.kb-card')
      ?? currentTarget?.closest<HTMLElement>('.kb-card')
      ?? null
  }

  function resolveCardIndex(columnId: string, cardId: string) {
    return options.cardsForColumn(columnId).findIndex(card => card.id === cardId)
  }

  function attachPointerListeners() {
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerCancel)
  }

  function detachPointerListeners() {
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', onWindowPointerUp)
    window.removeEventListener('pointercancel', onWindowPointerCancel)
  }

  function prefersReducedMotion() {
    const reducedMotion = options.getReducedMotion()
    if (reducedMotion === 'reduce') return true
    if (reducedMotion !== 'system') return false
    return typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  }

  function resolveFloatingTransform(x: number, y: number, tiltDeg: number) {
    return `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) rotate(${tiltDeg.toFixed(2)}deg) scale(1.018)`
  }

  function resolveFloatingPosition(runtime: PointerDragRuntime) {
    return {
      x: runtime.pointerX - runtime.grabOffsetX + floatingCardCursorOffsetX,
      y: runtime.pointerY - runtime.grabOffsetY + floatingCardCursorOffsetY,
    }
  }

  function applyPointerDragFrame(runtime: PointerDragRuntime, reducedMotion: boolean) {
    if (!runtime.cardEl) return

    const tilt = reducedMotion
      ? 0
      : Math.max(-pointerDragTiltLimit, Math.min(pointerDragTiltLimit, runtime.lastDeltaX / 28))

    runtime.cardEl.style.transform = resolveFloatingTransform(runtime.renderX, runtime.renderY, tilt)
  }

  function renderPointerDragFrame() {
    const runtime = pointerDragRuntime
    if (!runtime || !pointerDragStarted.value) return

    runtime.rafId = null

    const reducedMotion = prefersReducedMotion()
    const { x: targetX, y: targetY } = resolveFloatingPosition(runtime)
    const deltaX = targetX - runtime.renderX
    const deltaY = targetY - runtime.renderY

    if (reducedMotion) {
      runtime.renderX = targetX
      runtime.renderY = targetY
    } else {
      runtime.renderX += deltaX * pointerDragFollowFactor
      runtime.renderY += deltaY * pointerDragFollowFactor

      if (Math.abs(targetX - runtime.renderX) <= pointerDragSettleEpsilon) runtime.renderX = targetX
      if (Math.abs(targetY - runtime.renderY) <= pointerDragSettleEpsilon) runtime.renderY = targetY
    }

    applyPointerDragFrame(runtime, reducedMotion)
    resolvePointerDropTarget(runtime.pointerX, runtime.pointerY)

    if (
      !reducedMotion &&
      (Math.abs(targetX - runtime.renderX) > pointerDragSettleEpsilon
        || Math.abs(targetY - runtime.renderY) > pointerDragSettleEpsilon)
    ) {
      schedulePointerDragFrame()
    }
  }

  function schedulePointerDragFrame() {
    if (!pointerDragRuntime || pointerDragRuntime.rafId !== null || !pointerDragStarted.value) return
    pointerDragRuntime.rafId = window.requestAnimationFrame(renderPointerDragFrame)
  }

  function cancelPointerDragFrame() {
    if (!pointerDragRuntime || pointerDragRuntime.rafId === null) return
    window.cancelAnimationFrame(pointerDragRuntime.rafId)
    pointerDragRuntime.rafId = null
  }

  function startPointerDrag(runtime: PointerDragRuntime, event: PointerEvent) {
    const cardRect = runtime.cardEl?.getBoundingClientRect()
    runtime.pointerX = event.clientX
    runtime.pointerY = event.clientY
    runtime.lastDeltaX = event.clientX - runtime.startX
    runtime.lastDeltaY = event.clientY - runtime.startY
    runtime.cardWidth = cardRect?.width ?? runtime.cardWidth

    const { x, y } = resolveFloatingPosition(runtime)
    runtime.renderX = x
    runtime.renderY = y

    pointerDragStarted.value = true
    dragCardId.value = runtime.cardId
    dragFromColumnId.value = runtime.fromColumnId
    pointerFloatingCardStyle.value = {}

    if (runtime.cardWidth > 0) pointerFloatingCardStyle.value.width = `${Math.round(runtime.cardWidth)}px`

    document.body.classList.add('kb-kanban-dragging')
    applyPointerDragFrame(runtime, prefersReducedMotion())
  }

  function resolvePointerDropTarget(clientX: number, clientY: number) {
    const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null
    const zoneEl = hit?.closest<HTMLElement>('.kb-drop-zone')

    if (zoneEl) {
      const columnId = zoneEl.dataset.columnId ?? null
      const targetIndex = Number.parseInt(zoneEl.dataset.dropZoneIndex ?? '', 10)
      if (columnId && Number.isFinite(targetIndex)) {
        dropTargetColumnId.value = columnId
        dropTargetIndex.value = targetIndex
        return
      }
    }

    const columnEl = hit?.closest<HTMLElement>('.kb-column')
    const columnId = columnEl?.dataset.columnId ?? null
    const cardCount = Number.parseInt(columnEl?.dataset.cardCount ?? '', 10)

    if (columnId && Number.isFinite(cardCount)) {
      dropTargetColumnId.value = columnId
      dropTargetIndex.value = cardCount
      return
    }

    dropTargetColumnId.value = null
    dropTargetIndex.value = null
  }

  function onCardHandlePointerDown(event: PointerEvent, cardId: string, columnId: string) {
    if (event.button !== 0) return

    const cardEl = resolveCardElement(event)
    const cardRect = cardEl?.getBoundingClientRect()

    pointerDragRuntime = {
      pointerId: event.pointerId,
      cardId,
      fromColumnId: columnId,
      startX: event.clientX,
      startY: event.clientY,
      pointerX: event.clientX,
      pointerY: event.clientY,
      renderX: cardRect?.left ?? event.clientX,
      renderY: cardRect?.top ?? event.clientY,
      lastDeltaX: 0,
      lastDeltaY: 0,
      grabOffsetX: cardRect ? event.clientX - cardRect.left : 18,
      grabOffsetY: cardRect ? event.clientY - cardRect.top : 18,
      cardWidth: cardRect?.width ?? 0,
      cardEl,
      rafId: null,
    }

    dragFromIndex.value = resolveCardIndex(columnId, cardId)

    attachPointerListeners()
  }

  function onWindowPointerMove(event: PointerEvent) {
    const runtime = pointerDragRuntime
    if (!runtime || event.pointerId !== runtime.pointerId) return

    if (!pointerDragStarted.value) {
      const dx = event.clientX - runtime.startX
      const dy = event.clientY - runtime.startY
      if (Math.hypot(dx, dy) < pointerDragThreshold) return
      startPointerDrag(runtime, event)
    } else {
      runtime.lastDeltaX = event.clientX - runtime.pointerX
      runtime.lastDeltaY = event.clientY - runtime.pointerY
      runtime.pointerX = event.clientX
      runtime.pointerY = event.clientY
    }

    event.preventDefault()
    if (pointerDragStarted.value) schedulePointerDragFrame()
  }

  function onWindowPointerCancel(event: PointerEvent) {
    const runtime = pointerDragRuntime
    if (!runtime || event.pointerId !== runtime.pointerId) return
    clearDragState()
  }

  function onWindowPointerUp(event: PointerEvent) {
    const runtime = pointerDragRuntime
    if (!runtime || event.pointerId !== runtime.pointerId) return

    if (pointerDragStarted.value) {
      runtime.lastDeltaX = event.clientX - runtime.pointerX
      runtime.lastDeltaY = event.clientY - runtime.pointerY
      runtime.pointerX = event.clientX
      runtime.pointerY = event.clientY
      resolvePointerDropTarget(event.clientX, event.clientY)
    }

    const cardId = dragCardId.value
    const toColumnId = dropTargetColumnId.value
    const targetIndex = dropTargetIndex.value
    const shouldMove = pointerDragStarted.value && !!cardId && !!toColumnId && targetIndex !== null

    clearDragState()

    if (!shouldMove || !cardId || !toColumnId || targetIndex === null) return
    options.onCommitMove(cardId, toColumnId, targetIndex)
  }

  function clearDragState() {
    cancelPointerDragFrame()
    pointerDragStarted.value = false
    dragCardId.value = null
    dragFromColumnId.value = null
    dragFromIndex.value = null
    dropTargetColumnId.value = null
    dropTargetIndex.value = null
    pointerFloatingCardStyle.value = null
    pointerDragRuntime = null
    detachPointerListeners()
    document.body.classList.remove('kb-kanban-dragging')
  }

  const pointerFloatingCardId = computed(() => (
    pointerDragStarted.value ? dragCardId.value : null
  ))

  function floatingPlaceholderIndex(columnId: string) {
    if (!pointerDragStarted.value || dragFromColumnId.value !== columnId || dragFromIndex.value === null || dragFromIndex.value < 0) {
      return null
    }

    return dragFromIndex.value
  }

  return {
    pointerDragStarted,
    dragCardId,
    dragFromColumnId,
    dragFromIndex,
    dropTargetColumnId,
    dropTargetIndex,
    pointerFloatingCardStyle,
    pointerFloatingCardId,
    onCardHandlePointerDown,
    clearDragState,
    floatingPlaceholderIndex,
  }
}
