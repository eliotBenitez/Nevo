import { onBeforeUnmount, type Ref } from 'vue'
import type { EditorView } from 'prosemirror-view'
import type { CanvasCamera } from '../../../core/canvas'

interface UseCanvasViewportLifecycleOptions {
  viewport: Ref<HTMLElement | null>
  camera: CanvasCamera
  onCameraFrame: (callback: () => void) => () => void
  getEditorView: () => EditorView | null
  onWheel: (event: WheelEvent) => void
  observeFrameMetrics: () => void
}

const WILL_CHANGE_IDLE_MS = 200

export function useCanvasViewportLifecycle(options: UseCanvasViewportLifecycleOptions) {
  let worldLayer: HTMLElement | null = null
  let editorDom: HTMLElement | null = null
  let willChangeTimer: ReturnType<typeof setTimeout> | null = null

  function applyCamera() {
    if (worldLayer) {
      worldLayer.style.transformOrigin = '0 0'
      worldLayer.style.transform = `translate(${-options.camera.x * options.camera.zoom}px, ${-options.camera.y * options.camera.zoom}px) scale(${options.camera.zoom})`
    }
    const viewport = options.viewport.value
    if (viewport) {
      viewport.style.setProperty('--canvas-grid-size', `${24 * options.camera.zoom}px`)
      viewport.style.setProperty('--canvas-grid-x', `${-options.camera.x * options.camera.zoom}px`)
      viewport.style.setProperty('--canvas-grid-y', `${-options.camera.y * options.camera.zoom}px`)
    }
  }

  const disposeCameraFrame = options.onCameraFrame(() => {
    if (worldLayer) worldLayer.style.willChange = 'transform'
    if (willChangeTimer) clearTimeout(willChangeTimer)
    willChangeTimer = setTimeout(() => {
      willChangeTimer = null
      worldLayer?.style.removeProperty('will-change')
    }, WILL_CHANGE_IDLE_MS)
    applyCamera()
  })

  function attachEditorListeners() {
    const view = options.getEditorView()
    if (!view || editorDom === view.dom) return
    editorDom?.removeEventListener('wheel', options.onWheel)
    editorDom = view.dom
    worldLayer = view.dom.parentElement
    editorDom.addEventListener('wheel', options.onWheel, { passive: false })
    options.observeFrameMetrics()
    applyCamera()
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await options.viewport.value?.requestFullscreen()
  }

  onBeforeUnmount(() => {
    disposeCameraFrame()
    if (willChangeTimer) clearTimeout(willChangeTimer)
    editorDom?.removeEventListener('wheel', options.onWheel)
    if (worldLayer) {
      worldLayer.style.removeProperty('transform')
      worldLayer.style.removeProperty('transform-origin')
      worldLayer.style.removeProperty('will-change')
    }
  })

  return { applyCamera, attachEditorListeners, toggleFullscreen }
}
