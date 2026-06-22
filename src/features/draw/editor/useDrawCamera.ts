import type { Ref } from 'vue'
import { DEFAULT_CAMERA, computeBounds } from '../../../utils/draw/drawEngine'
import type { DrawStroke, DrawCamera, DrawCanvasSize } from '../../../utils/draw/drawEngine'

const MIN_SCALE = 0.1
const MAX_SCALE = 8

export interface DrawCamera_ {
  camera: Ref<DrawCamera>
  viewportSize(): { w: number; h: number }
  cameraViewBox(w: number, h: number): string
  panBy(dx: number, dy: number): void
  applyZoom(nextScale: number, sx: number, sy: number): void
  onWheel(event: WheelEvent): void
  zoomBy(factor: number): void
  resetCamera(): void
  fitToContent(padding?: number): void
}

export function createDrawCamera(opts: {
  overlayEl: Ref<SVGSVGElement | null>
  strokes: Ref<DrawStroke[]>
  canvasSize: Ref<DrawCanvasSize>
  camera: Ref<DrawCamera>
}): DrawCamera_ {
  const { overlayEl, strokes, canvasSize, camera } = opts

  function viewportSize(): { w: number; h: number } {
    const rect = overlayEl.value?.getBoundingClientRect()
    return rect ? { w: rect.width, h: rect.height } : { w: canvasSize.value.width, h: canvasSize.value.height }
  }

  function cameraViewBox(w: number, h: number): string {
    const s = camera.value.scale || 1
    return `${-camera.value.x / s} ${-camera.value.y / s} ${Math.max(w / s, 1)} ${Math.max(h / s, 1)}`
  }

  function applyZoom(nextScale: number, sx: number, sy: number) {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale))
    const ratio = clamped / camera.value.scale
    camera.value = {
      x: sx - ratio * (sx - camera.value.x),
      y: sy - ratio * (sy - camera.value.y),
      scale: clamped,
    }
  }

  function panBy(dx: number, dy: number) {
    camera.value = { ...camera.value, x: camera.value.x + dx, y: camera.value.y + dy }
  }

  function onWheel(event: WheelEvent) {
    const rect = overlayEl.value?.getBoundingClientRect()
    if (!rect) return
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    const factor = event.deltaY < 0 ? 1.1 : 0.9
    applyZoom(camera.value.scale * factor, sx, sy)
  }

  function zoomBy(factor: number) {
    const { w, h } = viewportSize()
    applyZoom(camera.value.scale * factor, w / 2, h / 2)
  }

  function resetCamera() {
    camera.value = { ...DEFAULT_CAMERA }
  }

  function fitToContent(padding = 60) {
    if (strokes.value.length === 0) {
      resetCamera()
      return
    }
    const { minX, minY, maxX, maxY } = computeBounds(strokes.value)
    const contentW = Math.max(maxX - minX, 1) + padding * 2
    const contentH = Math.max(maxY - minY, 1) + padding * 2
    const { w, h } = viewportSize()
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(w / contentW, h / contentH)))
    const cx = minX - padding + contentW / 2
    const cy = minY - padding + contentH / 2
    camera.value = {
      x: w / 2 - cx * scale,
      y: h / 2 - cy * scale,
      scale,
    }
  }

  return {
    camera,
    viewportSize,
    cameraViewBox,
    panBy,
    applyZoom,
    onWheel,
    zoomBy,
    resetCamera,
    fitToContent,
  }
}
