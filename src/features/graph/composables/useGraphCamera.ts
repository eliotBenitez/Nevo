import { computed, ref } from 'vue'
import type { SimNode } from './useGraphSimulation'

export interface CameraState {
  scale: number
  tx: number
  ty: number
}

export function useGraphCamera(width: () => number, height: () => number) {
  const scale = ref(1)
  const tx = ref(0)
  const ty = ref(0)

  const camera = computed<CameraState>(() => ({ scale: scale.value, tx: tx.value, ty: ty.value }))

  function zoomIn() { applyZoom(scale.value * 1.25, width() / 2, height() / 2) }
  function zoomOut() { applyZoom(scale.value * 0.8, width() / 2, height() / 2) }
  function reset() { scale.value = 1; tx.value = 0; ty.value = 0 }

  function applyZoom(nextScale: number, cx: number, cy: number) {
    const clamped = Math.max(0.1, Math.min(5, nextScale))
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

  function fitToScreen(nodes: SimNode[]) {
    if (!nodes.length) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      if (n.x < minX) minX = n.x
      if (n.y < minY) minY = n.y
      if (n.x > maxX) maxX = n.x
      if (n.y > maxY) maxY = n.y
    }
    const pad = 60
    const gw = maxX - minX + pad * 2
    const gh = maxY - minY + pad * 2
    const s = Math.max(0.1, Math.min(5, Math.min(width() / gw, height() / gh)))
    scale.value = s
    tx.value = width() / 2 - ((minX + maxX) / 2) * s
    ty.value = height() / 2 - ((minY + maxY) / 2) * s
  }

  function screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - tx.value) / scale.value, y: (sy - ty.value) / scale.value }
  }

  return { scale, tx, ty, camera, zoomIn, zoomOut, reset, applyZoom, onWheel, fitToScreen, screenToWorld }
}
