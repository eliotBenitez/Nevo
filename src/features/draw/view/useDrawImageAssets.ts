import { useWorkspaceStore } from '../../../stores/workspace'
import { loadImageAsset } from '../../../utils/draw/imageAsset'
import type { DrawStroke } from '../../../utils/draw/drawEngine'

export interface DrawImageAssetsOptions {
  getRefreshCommittedSvg: () => () => Promise<void>
  getInsertImageStroke: () => (params: { assetSrc: string; naturalWidth: number; naturalHeight: number }) => void
}

export function useDrawImageAssets(options: DrawImageAssetsOptions) {
  const workspaceStore = useWorkspaceStore()

  const imageFullHref = new Map<string, string>()
  const imagePreviewHref = new Map<string, string>()

  function resolveFullHref(stroke: DrawStroke): string | undefined {
    return stroke.assetSrc ? imageFullHref.get(stroke.assetSrc) : undefined
  }

  function resolvePreviewHref(stroke: DrawStroke): string | undefined {
    return stroke.assetSrc ? imagePreviewHref.get(stroke.assetSrc) : undefined
  }

  async function hydrateImageCaches(strokes: DrawStroke[]) {
    const backend = workspaceStore.backend
    if (!backend) return
    const srcs = new Set<string>()
    for (const s of strokes) {
      if (s.type === 'image' && s.assetSrc && !imageFullHref.has(s.assetSrc)) srcs.add(s.assetSrc)
    }
    if (srcs.size === 0) return
    await Promise.all([...srcs].map(async (src) => {
      try {
        const bytes = await backend.readDrawAsset(src)
        const loaded = await loadImageAsset(bytes)
        imageFullHref.set(src, loaded.full)
        imagePreviewHref.set(src, loaded.preview)
      } catch (error) {
        console.warn('[DrawView] Failed to hydrate image asset', src, error)
      }
    }))
    await options.getRefreshCommittedSvg()()
  }

  function rgbaToPngBytes(rgba: Uint8Array, width: number, height: number): number[] {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0)
    const base64 = canvas.toDataURL('image/png').split(',')[1] ?? ''
    const bin = atob(base64)
    const bytes = new Array<number>(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }

  async function pasteImageFromClipboard() {
    const backend = workspaceStore.backend
    if (!backend) return
    try {
      const { readImage } = await import('@tauri-apps/plugin-clipboard-manager')
      const image = await readImage()
      const rgba = await image.rgba()
      const { width, height } = await image.size()
      if (!width || !height) return
      const bytes = rgbaToPngBytes(rgba, width, height)
      const imported = await backend.importImageAsset('pasted-image.png', bytes)
      const loaded = await loadImageAsset(bytes, 'image/png')
      imageFullHref.set(imported.src, loaded.full)
      imagePreviewHref.set(imported.src, loaded.preview)
      options.getInsertImageStroke()({
        assetSrc: imported.src,
        naturalWidth: loaded.naturalWidth,
        naturalHeight: loaded.naturalHeight,
      })
      await options.getRefreshCommittedSvg()()
    } catch (error) {
      console.warn('[DrawView] No image in clipboard or read failed', error)
    }
  }

  return {
    imageFullHref,
    imagePreviewHref,
    resolveFullHref,
    resolvePreviewHref,
    hydrateImageCaches,
    pasteImageFromClipboard,
    rgbaToPngBytes,
  }
}
