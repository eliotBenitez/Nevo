import { ref, type Ref } from 'vue'
import {
  computeBounds,
  renderStrokesToSvgInner,
  type DrawStroke,
} from '../../../utils/draw/drawEngine'
import { svgToPngBlob } from '../../../utils/noteExport/svgRaster'

export interface UseDrawExportOptions {
  strokes: Ref<DrawStroke[]>
  bgColor: Ref<string>
  camera: Ref<{ x: number; y: number; scale: number }>
  viewport: Ref<{ w: number; h: number }>
  selection: Ref<Set<string>>
  drawId: string
  resolveHref?: (stroke: DrawStroke) => string | undefined
  downloadBlob?: (blob: Blob, filename: string) => void
}

export type ExportFormat = 'svg' | 'png'
export type ExportScope = 'all' | 'viewport' | 'selection'

export function useDrawExport(options: UseDrawExportOptions) {
  const { strokes, bgColor, camera, viewport, selection, drawId, resolveHref, downloadBlob: customDownload } = options

  const format = ref<ExportFormat>('png')
  const scope = ref<ExportScope>('all')
  const transparent = ref<boolean>(false)
  const exporting = ref<boolean>(false)
  const errorMessage = ref<string>('')

  async function downloadBlob(blob: Blob, filename: string) {
    if (customDownload) {
      customDownload(blob, filename)
      return
    }

    const isTauri = typeof window !== 'undefined'
      && (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined

    if (isTauri) {
      try {
        const arrayBuffer = await blob.arrayBuffer()
        const bytes = Array.from(new Uint8Array(arrayBuffer))

        const { noteCommands } = await import('../../../tauri/commands')
        await noteCommands.exportDrawFile(filename, bytes)
        return
      } catch (err) {
        console.error('[DrawExport] Tauri native save failed, falling back to browser download', err)
      }
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function performExport() {
    exporting.value = true
    errorMessage.value = ''
    try {
      let filteredStrokes = strokes.value

      if (scope.value === 'selection') {
        filteredStrokes = strokes.value.filter((s) => s.id && selection.value.has(s.id))
        if (filteredStrokes.length === 0) {
          throw new Error('selectionEmpty')
        }
      }

      const bounds = computeBounds(filteredStrokes)

      let viewBox = ''
      let w = 0
      let h = 0
      let ox = 0
      let oy = 0

      if (scope.value === 'viewport') {
        const cam = camera.value
        const vp = viewport.value
        w = vp.w / cam.scale
        h = vp.h / cam.scale
        ox = cam.x
        oy = cam.y
        viewBox = `${ox} ${oy} ${w} ${h}`
      } else {
        const padding = 16
        const hasContent = filteredStrokes.length > 0 && (bounds.maxX > bounds.minX || bounds.maxY > bounds.minY)
        if (hasContent) {
          w = bounds.maxX - bounds.minX + padding * 2
          h = bounds.maxY - bounds.minY + padding * 2
          ox = bounds.minX - padding
          oy = bounds.minY - padding
        } else {
          w = 800
          h = 600
          ox = 0
          oy = 0
        }
        viewBox = `${ox} ${oy} ${w} ${h}`
      }

      const innerSvg = await renderStrokesToSvgInner(filteredStrokes, {
        resolveImageHref: resolveHref,
      })

      let bgRect = ''
      if (!transparent.value) {
        const paper = bgColor.value && bgColor.value !== 'transparent' ? bgColor.value : '#ffffff'
        bgRect = `<rect x="${ox}" y="${oy}" width="${w}" height="${h}" fill="${paper}"/>`
      }

      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">${bgRect}${innerSvg}</svg>`

      const filename = `drawing-${drawId}`

      if (format.value === 'svg') {
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
        await downloadBlob(blob, `${filename}.svg`)
      } else {
        const blob = await svgToPngBlob(svgString, w, h)
        await downloadBlob(blob, `${filename}.png`)
      }
    } catch (err) {
      console.error('[DrawExport] Export failed', err)
      errorMessage.value = err instanceof Error ? err.message : String(err)
    } finally {
      exporting.value = false
    }
  }

  return {
    format,
    scope,
    transparent,
    exporting,
    errorMessage,
    performExport,
  }
}
