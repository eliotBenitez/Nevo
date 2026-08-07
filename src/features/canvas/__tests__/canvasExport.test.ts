import { ref } from 'vue'
import type { EditorView } from 'prosemirror-view'
import { describe, expect, it, vi } from 'vitest'
import { CANVAS_DOCUMENT_FRAME_ID, type CanvasSnapshotV1 } from '../../../core/canvas'
import { useCanvasExport } from '../composables/useCanvasExport'

function snapshot(): CanvasSnapshotV1 {
  return {
    version: 1,
    frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0, autoHeight: true },
    elements: {},
    connectors: {},
    order: [CANVAS_DOCUMENT_FRAME_ID],
  }
}

function editorView(): EditorView {
  return {
    state: {
      doc: {
        forEach(callback: (node: unknown) => void) {
          callback({
            attrs: { id: 'block-1' },
            textContent: 'Canvas heading\nCanvas body',
            type: { name: 'paragraph' },
          })
        },
      },
    },
  } as unknown as EditorView
}

describe('useCanvasExport', () => {
  it('exports the document frame as native SVG', async () => {
    const download = vi.fn()
    const canvasExport = useCanvasExport({
      noteId: 'note-1',
      snapshot: ref(snapshot()),
      camera: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 800, height: 600 },
      selectionIds: ref([]),
      effectiveFrame: ref({ x: 0, y: 0, width: 900, height: 2400 }),
      getEditorView: editorView,
      downloadBlob: download,
    })
    canvasExport.format.value = 'svg'

    await canvasExport.performExport()

    expect(download).toHaveBeenCalledOnce()
    const [blob, filename] = download.mock.calls[0] as [Blob, string]
    const svg = await blob.text()
    expect(filename).toBe('canvas-note-1.svg')
    expect(svg).toContain('Canvas heading')
    expect(svg).not.toContain('foreignObject')
    // The auto-height frame's stored height (1200) is stale; the card must be
    // drawn at the measured content height supplied via `effectiveFrame`.
    expect(svg).toContain('height="2400"')
    expect(svg).not.toContain('height="1200"')
  })

  it('exports a collapsed frame at the collapsed width/height with only the title, not the body lines', async () => {
    const download = vi.fn()
    const collapsedSnapshot: CanvasSnapshotV1 = {
      ...snapshot(),
      frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0, autoHeight: true, collapsed: true },
    }
    const canvasExport = useCanvasExport({
      noteId: 'note-1',
      snapshot: ref(collapsedSnapshot),
      camera: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 800, height: 600 },
      selectionIds: ref([]),
      // A collapsed frame's effective bounds are the fixed mini-card size,
      // independent of the stored (expanded) frame geometry above.
      effectiveFrame: ref({ x: 0, y: 0, width: 320, height: 104 }),
      getEditorView: editorView,
      downloadBlob: download,
    })
    canvasExport.format.value = 'svg'

    await canvasExport.performExport()

    expect(download).toHaveBeenCalledOnce()
    const [blob] = download.mock.calls[0] as [Blob, string]
    const svg = await blob.text()
    expect(svg).toContain('width="320"')
    expect(svg).toContain('height="104"')
    expect(svg).not.toContain('Canvas heading')
    expect(svg).not.toContain('Canvas body')
  })

  it('rejects an empty selection without downloading', async () => {
    const download = vi.fn()
    const canvasExport = useCanvasExport({
      noteId: 'note-1',
      snapshot: ref(snapshot()),
      camera: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 800, height: 600 },
      selectionIds: ref([]),
      effectiveFrame: ref({ x: 0, y: 0, width: 900, height: 2400 }),
      getEditorView: editorView,
      downloadBlob: download,
    })
    canvasExport.scope.value = 'selection'

    await canvasExport.performExport()

    expect(canvasExport.errorMessage.value).toBe('selectionEmpty')
    expect(download).not.toHaveBeenCalled()
  })
})
