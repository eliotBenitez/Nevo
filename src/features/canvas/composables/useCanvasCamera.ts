import { onBeforeUnmount, reactive } from 'vue'
import { screenToWorld, unionBounds, type CanvasBounds, type CanvasCamera, type CanvasPoint } from '../../../core/canvas'
import { readCanvasCamera, rememberCanvasCamera } from '../canvasPreferences'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4

/**
 * Splits the camera into a live value and a render value so pointer/wheel
 * input (which arrives faster than 60Hz on high-poll-rate mice/trackpads)
 * never triggers more than one Vue re-render pass per frame.
 *
 * `camera` is a plain, non-reactive object — the source of truth for pointer
 * math (`screenToWorld`, drag deltas) and imperative DOM writes. `cameraView`
 * is a reactive copy synced from `camera` at most once per animation frame;
 * everything that renders (SVG layer, frame chrome, minimap, toolbar) reads
 * `cameraView` instead.
 */
export function useCanvasCamera(workspaceId: string, noteId: string) {
  const camera: CanvasCamera = readCanvasCamera(workspaceId, noteId)
  const cameraView = reactive<CanvasCamera>({ ...camera })
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let frameHandle: number | null = null
  const frameCallbacks = new Set<(camera: CanvasCamera) => void>()

  function persistSoon() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      rememberCanvasCamera(workspaceId, noteId, camera)
    }, 120)
  }

  // Single rAF loop for the whole camera: syncs the reactive render copy and
  // then runs every registered frame callback (e.g. the world-layer transform
  // and grid CSS variables in EdgelessCanvasView). Coalesces bursts of
  // panBy/zoomAt calls within one frame into a single commit.
  function scheduleFrame() {
    if (frameHandle !== null) return
    frameHandle = requestAnimationFrame(() => {
      frameHandle = null
      cameraView.x = camera.x
      cameraView.y = camera.y
      cameraView.zoom = camera.zoom
      for (const callback of frameCallbacks) callback(camera)
    })
  }

  function onCameraFrame(fn: (camera: CanvasCamera) => void): () => void {
    frameCallbacks.add(fn)
    return () => frameCallbacks.delete(fn)
  }

  function panBy(screenDelta: CanvasPoint) {
    camera.x -= screenDelta.x / camera.zoom
    camera.y -= screenDelta.y / camera.zoom
    persistSoon()
    scheduleFrame()
  }

  function zoomAt(screenPoint: CanvasPoint, nextZoom: number) {
    const before = screenToWorld(screenPoint, camera)
    camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom))
    const after = screenToWorld(screenPoint, camera)
    camera.x += before.x - after.x
    camera.y += before.y - after.y
    persistSoon()
    scheduleFrame()
  }

  function fit(items: readonly CanvasBounds[], viewport: CanvasBounds) {
    const bounds = unionBounds(items)
    if (!bounds || viewport.width <= 0 || viewport.height <= 0) return
    const padding = 72
    const zoom = Math.max(MIN_ZOOM, Math.min(1.5,
      Math.min(
        (viewport.width - padding * 2) / Math.max(1, bounds.width),
        (viewport.height - padding * 2) / Math.max(1, bounds.height),
      ),
    ))
    camera.zoom = zoom
    camera.x = bounds.x + bounds.width / 2 - viewport.width / zoom / 2
    camera.y = bounds.y + bounds.height / 2 - viewport.height / zoom / 2
    persistSoon()
    scheduleFrame()
  }

  onBeforeUnmount(() => {
    if (saveTimer) clearTimeout(saveTimer)
    rememberCanvasCamera(workspaceId, noteId, camera)
    if (frameHandle !== null) cancelAnimationFrame(frameHandle)
    frameHandle = null
    frameCallbacks.clear()
  })

  return { camera, cameraView, panBy, zoomAt, fit, onCameraFrame }
}
