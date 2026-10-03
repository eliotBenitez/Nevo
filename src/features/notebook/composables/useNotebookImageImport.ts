import { shallowRef } from 'vue'
import { MAX_ASSET_MB, isWithinAssetLimit } from '../../../core/assets/assetLimits'
import type { WorkspaceBackend } from '../../../core/workspace-backend'
import { i18n } from '../../../i18n'
import { rgbaToPngBytes } from '../../../utils/rgbaToPng'

const EXTENSION_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
const ALLOWED_TYPES = new Set(Object.keys(EXTENSION_BY_TYPE))

/**
 * The backend names assets after the file extension (falling back to `.bin`),
 * while notebook images require a raster extension, so derive it from the MIME
 * type: `photo` or `scan.jfif` would otherwise produce an unsaveable src.
 */
export function notebookImageFileName(name: string, type: string): string {
  const extension = EXTENSION_BY_TYPE[type] ?? 'png'
  const stem = name.replace(/\.[^./\\]*$/, '') || 'notebook-image'
  return `${stem}.${extension}`
}
const PASTED_NAME = 'pasted-notebook-image.png'

interface ImageSize { width: number; height: number }

/** Paste into text fields (such as the title) keeps its normal behavior. */
export function isNotebookPasteTargetIgnored(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
}

async function decodeImageSize(blob: Blob): Promise<ImageSize> {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Image has no dimensions')
    return { width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function useNotebookImageImport(options: {
  getBackend: () => WorkspaceBackend | null
  insertImage: (src: string, naturalWidth: number, naturalHeight: number) => string | null
  canImport: () => boolean
}) {
  const importing = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {}) as string

  async function importFile(file: File): Promise<string | null> {
    if (importing.value || !options.canImport()) return null
    if (!ALLOWED_TYPES.has(file.type)) {
      error.value = t('notebook.errors.imageType')
      return null
    }
    if (!isWithinAssetLimit(file.size)) {
      error.value = t('editor.assets.tooLarge', { fileName: file.name, limit: `${MAX_ASSET_MB} MB` })
      return null
    }
    const backend = options.getBackend()
    if (!backend) return null
    importing.value = true
    error.value = null
    try {
      const [size, buffer] = await Promise.all([decodeImageSize(file), file.arrayBuffer()])
      const imported = await backend.importImageAsset(notebookImageFileName(file.name, file.type), new Uint8Array(buffer))
      return options.insertImage(imported.src, size.width, size.height)
    } catch {
      error.value = t('notebook.errors.imageImport')
      return null
    } finally {
      importing.value = false
    }
  }

  async function importNativeClipboardImage(): Promise<boolean> {
    const backend = options.getBackend()
    if (!backend) return false
    let png: Uint8Array
    let size: ImageSize
    try {
      const { readImage } = await import('@tauri-apps/plugin-clipboard-manager')
      const image = await readImage()
      const { width, height } = await image.size()
      if (!width || !height) return false
      png = Uint8Array.from(rgbaToPngBytes(await image.rgba(), width, height))
      size = { width, height }
    } catch {
      return false
    }
    if (!isWithinAssetLimit(png.length)) {
      error.value = t('editor.assets.tooLarge', { fileName: PASTED_NAME, limit: `${MAX_ASSET_MB} MB` })
      return false
    }
    importing.value = true
    error.value = null
    try {
      const imported = await backend.importImageAsset(PASTED_NAME, png)
      return options.insertImage(imported.src, size.width, size.height) !== null
    } catch {
      error.value = t('notebook.errors.imageImport')
      return false
    } finally {
      importing.value = false
    }
  }

  async function onPaste(event: ClipboardEvent): Promise<boolean> {
    if (importing.value || !options.canImport()) return false
    const file = Array.from(event.clipboardData?.files ?? []).find(candidate => ALLOWED_TYPES.has(candidate.type))
    if (file) {
      event.preventDefault()
      return (await importFile(file)) !== null
    }
    return importNativeClipboardImage()
  }

  return { importing, error, importFile, onPaste }
}
