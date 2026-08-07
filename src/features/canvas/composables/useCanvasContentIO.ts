import type { Ref } from 'vue'
import type { CanvasCamera, CanvasPoint } from '../../../core/canvas'
import type { useCanvasClipboard } from './useCanvasClipboard'
import type { useCanvasImageAssets } from './useCanvasImageAssets'

interface UseCanvasContentIOOptions {
  insertionPoint: Ref<CanvasPoint>
  imageInput: Ref<HTMLInputElement | null>
  camera: CanvasCamera
  viewportSize: { width: number; height: number }
  presentationActive: Ref<boolean>
  viewportPoint: (event: MouseEvent | DragEvent) => CanvasPoint | null
  clipboard: ReturnType<typeof useCanvasClipboard>
  imageAssets: ReturnType<typeof useCanvasImageAssets>
  returnToSelect: () => void
}

/** Getting content (images, canvas clipboard payloads) into the canvas via paste, drop, and the file picker. */
export function useCanvasContentIO(options: UseCanvasContentIOOptions) {
  function requestImage(point: CanvasPoint) {
    options.insertionPoint.value = point
    options.imageInput.value?.click()
  }

  async function onImageInput(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) await options.imageAssets.importFile(file)
    input.value = ''
    options.returnToSelect()
  }

  async function onPaste(event: ClipboardEvent) {
    if (options.presentationActive.value) return
    if (await options.imageAssets.onPaste(event)) return
    await options.clipboard.paste()
  }

  async function onDrop(event: DragEvent) {
    const point = options.viewportPoint(event)
    if (point) options.insertionPoint.value = point
    await options.imageAssets.onDrop(event)
  }

  async function pasteFromClipboard() {
    if (await options.clipboard.paste()) return true
    options.insertionPoint.value = {
      x: options.camera.x + options.viewportSize.width / options.camera.zoom / 2,
      y: options.camera.y + options.viewportSize.height / options.camera.zoom / 2,
    }
    return options.imageAssets.pasteNativeImage()
  }

  return { requestImage, onImageInput, onPaste, onDrop, pasteFromClipboard }
}
