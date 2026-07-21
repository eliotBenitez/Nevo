/**
 * docxAssets — webview-зависимые хелперы для экспорта в .docx: загрузка
 * ассетов изображений (локальный диск через convertFileSrc или облако через
 * CloudBackend) и растеризация SVG. Вынесены из сериализатора, чтобы тот
 * оставался чистым и тестируемым.
 */
import { CloudBackend, CLOUD_ASSET_SCHEME } from '../../core/workspace-backend'
import { useWorkspaceStore } from '../../stores/workspace'
import { sniffImageMime } from '../draw/imageAsset'
import { rasterizeSvgToPng, type RasterPng } from './svgRaster'
import type { DocxExportHelpers, DocxImageType, LoadedDocxImage } from './docxSerializer'
import { workspaceAssetUrl } from '../workspaceAssetUrl'

function mimeToDocxType(mime: string): DocxImageType | null {
  switch (mime) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/gif': return 'gif'
    case 'image/bmp': return 'bmp'
    default: return null
  }
}

function htmlImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 })
    img.onerror = () => reject(new Error('image load failed'))
    img.src = url
  })
}

async function rasterizeBitmap(blob: Blob): Promise<LoadedDocxImage | null> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image load failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || 1
    canvas.height = img.naturalHeight || 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!pngBlob) return null
    return {
      data: new Uint8Array(await pngBlob.arrayBuffer()),
      type: 'png',
      width: canvas.width,
      height: canvas.height,
    }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function createDocxExportHelpers(workspacePath: string): DocxExportHelpers {
  const store = useWorkspaceStore()

  async function resolveUrl(src: string): Promise<string | null> {
    if (src.startsWith(CLOUD_ASSET_SCHEME)) {
      const backend = store.backend
      if (!(backend instanceof CloudBackend)) return null
      let url = backend.assetUrl(src)
      if (!url) {
        await backend.prefetchAsset(src)
        url = backend.assetUrl(src)
      }
      return url
    }
    if (!workspacePath) return null
    return workspaceAssetUrl(src)
  }

  async function loadAssetImage(src: string): Promise<LoadedDocxImage | null> {
    try {
      const url = await resolveUrl(src)
      if (!url) return null
      const resp = await fetch(url)
      if (!resp.ok) return null
      const bytes = new Uint8Array(await resp.arrayBuffer())
      const mime = sniffImageMime(bytes)

      // SVG assets: rasterize via the shared SVG pipeline.
      if (mime === 'image/svg+xml') {
        const svg = new TextDecoder().decode(bytes)
        const raster = await rasterizeSvgToPng(svg)
        return raster ? { data: raster.data, type: 'png', width: raster.width, height: raster.height } : null
      }

      const type = mimeToDocxType(mime)
      if (type) {
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }))
        try {
          const { width, height } = await htmlImageSize(blobUrl)
          return { data: bytes, type, width, height }
        } finally {
          URL.revokeObjectURL(blobUrl)
        }
      }

      // Unsupported encodings (e.g. WebP): re-encode to PNG via canvas.
      return await rasterizeBitmap(new Blob([bytes], { type: mime }))
    } catch {
      return null
    }
  }

  function rasterizeSvg(svg: string): Promise<RasterPng | null> {
    return rasterizeSvgToPng(svg)
  }

  return { loadAssetImage, rasterizeSvg }
}
