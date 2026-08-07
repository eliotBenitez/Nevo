import { ref, type Ref } from 'vue'
import type { EditorView } from 'prosemirror-view'
import {
  buildCanvasSvg,
  type CanvasBounds,
  type CanvasCamera,
  type CanvasExportDocument,
  type CanvasExportScope,
  type CanvasSnapshotV1,
} from '../../../core/canvas'
import { svgToPngBlob } from '../../../utils/noteExport/svgRaster'

export type CanvasExportFormat = 'svg' | 'png'

export interface UseCanvasExportOptions {
  noteId: string
  snapshot: Ref<CanvasSnapshotV1>
  camera: CanvasCamera
  viewport: { width: number; height: number }
  selectionIds: Ref<string[]>
  /** Frame bounds with the measured content height applied (see `useCanvasFrameMetrics`).
   *  The stored `snapshot.frame.height` is stale for auto-height frames, so exporting
   *  from it alone clips the document card. */
  effectiveFrame: Ref<CanvasBounds>
  getEditorView: () => EditorView | null
  resolveAssetSrc?: (src: string) => string | null
  downloadBlob?: (blob: Blob, filename: string) => Promise<void> | void
}

/** The rendered card shows at most this many lines, so collecting the whole
 *  document (200k+ characters) would allocate thousands of dead strings. */
const MAX_DOCUMENT_LINES = 40

// The note is now a single document frame rather than one card per block, so
// the exported "document card" is one title plus the document's leading text
// lines instead of per-block entries.
function collectDocument(view: EditorView | null): CanvasExportDocument | undefined {
  if (!view) return undefined
  const lines: string[] = []
  view.state.doc.forEach((node) => {
    if (lines.length >= MAX_DOCUMENT_LINES) return
    for (const line of node.textContent.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed) lines.push(trimmed)
      if (lines.length >= MAX_DOCUMENT_LINES) return
    }
  })
  return { title: 'Document', lines }
}

function svgDimensions(svg: string): { width: number; height: number } {
  const width = Number(svg.match(/\bwidth="([^"]+)"/)?.[1])
  const height = Number(svg.match(/\bheight="([^"]+)"/)?.[1])
  return {
    width: Number.isFinite(width) && width > 0 ? width : 1,
    height: Number.isFinite(height) && height > 0 ? height : 1,
  }
}

async function defaultDownload(blob: Blob, filename: string) {
  const isTauri = typeof window !== 'undefined'
    && (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined

  if (isTauri) {
    try {
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
      const { noteCommands } = await import('../../../tauri/commands')
      await noteCommands.exportDrawFile(filename, bytes)
      return
    } catch (error) {
      console.error('[CanvasExport] Native save failed, falling back to browser download', error)
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function useCanvasExport(options: UseCanvasExportOptions) {
  const open = ref(false)
  const format = ref<CanvasExportFormat>('png')
  const scope = ref<CanvasExportScope>('all')
  const exporting = ref(false)
  const errorMessage = ref('')

  function viewportBounds(): CanvasBounds {
    return {
      x: options.camera.x,
      y: options.camera.y,
      width: options.viewport.width / options.camera.zoom,
      height: options.viewport.height / options.camera.zoom,
    }
  }

  async function performExport() {
    exporting.value = true
    errorMessage.value = ''
    try {
      if (scope.value === 'selection' && options.selectionIds.value.length === 0) {
        throw new Error('selectionEmpty')
      }

      const snapshot = options.snapshot.value
      // Spread the full effective bounds (not just height) so a collapsed
      // frame — which has fixed width/height independent of the stored frame
      // geometry — exports at its actual on-screen size instead of the
      // expanded width. Export is WYSIWYG.
      const svg = buildCanvasSvg({
        ...snapshot,
        frame: { ...snapshot.frame, ...options.effectiveFrame.value },
      }, {
        scope: scope.value,
        selectionIds: options.selectionIds.value,
        viewport: viewportBounds(),
        document: collectDocument(options.getEditorView()),
        resolveAssetSrc: options.resolveAssetSrc,
      })
      const filename = `canvas-${options.noteId}.${format.value}`
      const download = options.downloadBlob ?? defaultDownload

      if (format.value === 'svg') {
        await download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename)
      } else {
        const dimensions = svgDimensions(svg)
        const png = await svgToPngBlob(svg, dimensions.width, dimensions.height)
        await download(png, filename)
      }
      open.value = false
    } catch (error) {
      console.error('[CanvasExport] Export failed', error)
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      exporting.value = false
    }
  }

  return {
    open,
    format,
    scope,
    exporting,
    errorMessage,
    performExport,
  }
}
