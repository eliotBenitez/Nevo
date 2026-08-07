import { shallowRef, type Ref } from 'vue'
import type { CanvasBounds, CanvasPoint } from '../../../core/canvas'
import type { WorkspaceBackend } from '../../../core/workspace-backend'

interface CanvasImageActions {
  addImageElement: (src: string, alt: string, bounds: CanvasBounds) => string
}

interface UseCanvasImageAssetsOptions {
  insertionPoint: Ref<CanvasPoint>
  actions: CanvasImageActions
  select: (id: string) => void
  getBackend: () => WorkspaceBackend | null
}

interface ImageDimensions {
  width: number
  height: number
}

function fitImage(point: CanvasPoint, dimensions: ImageDimensions): CanvasBounds {
  const maximum = 480
  const scale = Math.min(1, maximum / Math.max(dimensions.width, dimensions.height))
  const width = Math.max(48, dimensions.width * scale)
  const height = Math.max(48, dimensions.height * scale)
  return { x: point.x - width / 2, y: point.y - height / 2, width, height }
}

function fileBytes(file: File): Promise<number[]> {
  return file.arrayBuffer().then(buffer => Array.from(new Uint8Array(buffer)))
}

async function imageDimensions(file: Blob): Promise<ImageDimensions> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { width: image.naturalWidth || 320, height: image.naturalHeight || 240 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function rgbaToPngBytes(rgba: Uint8Array, width: number, height: number): number[] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable')
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
  const encoded = canvas.toDataURL('image/png').split(',')[1] ?? ''
  const binary = atob(encoded)
  return Array.from(binary, character => character.charCodeAt(0))
}

export function useCanvasImageAssets(options: UseCanvasImageAssetsOptions) {
  const importing = shallowRef(false)
  const errorMessage = shallowRef('')

  async function insertImported(src: string, alt: string, dimensions: ImageDimensions) {
    const id = options.actions.addImageElement(src, alt, fitImage(options.insertionPoint.value, dimensions))
    if (id) options.select(id)
  }

  async function importFile(file: File) {
    if (!file.type.startsWith('image/')) return
    const backend = options.getBackend()
    if (!backend) return
    importing.value = true
    errorMessage.value = ''
    try {
      const [bytes, dimensions] = await Promise.all([fileBytes(file), imageDimensions(file)])
      const imported = await backend.importImageAsset(file.name || 'canvas-image.png', bytes)
      await insertImported(imported.src, file.name, dimensions)
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      importing.value = false
    }
  }

  async function importUrl(url: string) {
    const backend = options.getBackend()
    if (!backend || !/^https?:\/\//i.test(url)) return
    importing.value = true
    errorMessage.value = ''
    try {
      const imported = await backend.importImageFromUrl(url)
      await insertImported(imported.src, '', { width: 480, height: 320 })
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      importing.value = false
    }
  }

  async function pasteNativeImage(): Promise<boolean> {
    const backend = options.getBackend()
    if (!backend) return false
    try {
      const { readImage } = await import('@tauri-apps/plugin-clipboard-manager')
      const image = await readImage()
      const { width, height } = await image.size()
      if (!width || !height) return false
      const bytes = rgbaToPngBytes(await image.rgba(), width, height)
      const imported = await backend.importImageAsset('pasted-canvas-image.png', bytes)
      await insertImported(imported.src, '', { width, height })
      return true
    } catch {
      return false
    }
  }

  async function onPaste(event: ClipboardEvent): Promise<boolean> {
    const file = Array.from(event.clipboardData?.files ?? []).find(candidate => candidate.type.startsWith('image/'))
    if (file) {
      event.preventDefault()
      await importFile(file)
      return true
    }
    return pasteNativeImage()
  }

  async function onDrop(event: DragEvent): Promise<boolean> {
    const file = Array.from(event.dataTransfer?.files ?? []).find(candidate => candidate.type.startsWith('image/'))
    const uri = event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain') || ''
    if (!file && !/^https?:\/\//i.test(uri)) return false
    event.preventDefault()
    if (file) await importFile(file)
    else await importUrl(uri.trim())
    return true
  }

  return { importing, errorMessage, importFile, importUrl, onPaste, onDrop, pasteNativeImage }
}
