import { computed, ref } from 'vue'
import type { SimNode } from './useGraphSimulation'
import { computeFitCamera, FIT_MAX_SCALE, FIT_MIN_SCALE } from './graphFit'

export interface CameraState {
  scale: number
  tx: number
  ty: number
}

export function useGraphCamera(width: () => number, height: () => number, getNodes?: () => SimNode[]) {
  const scale = ref(1)
  const tx = ref(0)
  const ty = ref(0)

  const camera = computed<CameraState>(() => ({ scale: scale.value, tx: tx.value, ty: ty.value }))

  function zoomIn() { applyZoom(scale.value * 1.25, width() / 2, height() / 2) }
  function zoomOut() { applyZoom(scale.value * 0.8, width() / 2, height() / 2) }
  function reset() {
    const nodes = getNodes?.()
    if (nodes?.length && fitToScreen(nodes)) return
    scale.value = 1; tx.value = 0; ty.value = 0
  }

  function applyZoom(nextScale: number, cx: number, cy: number) {
    const clamped = Math.max(FIT_MIN_SCALE, Math.min(FIT_MAX_SCALE, nextScale))
    const ratio = clamped / scale.value
    tx.value = cx - ratio * (cx - tx.value)
    ty.value = cy - ratio * (cy - ty.value)
    scale.value = clamped
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 1.1 : 0.9
    applyZoom(scale.value * delta, e.offsetX, e.offsetY)
  }

  function fitToScreen(nodes: SimNode[]): boolean {
    const fit = computeFitCamera(nodes, width(), height())
    if (!fit) return false
    scale.value = fit.scale
    tx.value = fit.tx
    ty.value = fit.ty
    return true
  }

  function screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - tx.value) / scale.value, y: (sy - ty.value) / scale.value }
  }

  return { scale, tx, ty, camera, zoomIn, zoomOut, reset, applyZoom, onWheel, fitToScreen, screenToWorld }
}
