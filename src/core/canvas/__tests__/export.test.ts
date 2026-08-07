import { describe, expect, it } from 'vitest'
import { buildCanvasSvg, CANVAS_DOCUMENT_FRAME_ID, type CanvasSnapshotV1 } from '..'

const snapshot: CanvasSnapshotV1 = {
  version: 1,
  frame: { x: 10, y: 20, width: 300, height: 120, zIndex: 1 },
  elements: {
    shape: {
      id: 'shape',
      kind: 'shape',
      shape: 'rectangle',
      x: 400,
      y: 20,
      width: 100,
      height: 80,
      zIndex: 0,
      text: 'Shape',
    },
  },
  connectors: {},
  order: ['shape'],
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('buildCanvasSvg', () => {
  it('exports native SVG primitives without foreignObject', () => {
    const svg = buildCanvasSvg(snapshot, {
      scope: 'all',
      document: { title: 'Note', lines: ['Note', '<safe>'] },
    })
    expect(svg).toContain('<rect')
    expect(svg).toContain('<text')
    expect(svg).toContain('&lt;safe&gt;')
    expect(svg).not.toContain('foreignObject')
  })

  it('exports P1 rich notes, linked notes, and presentation frames as native SVG', () => {
    const p1Snapshot: CanvasSnapshotV1 = {
      ...snapshot,
      elements: {
        rich: {
          id: 'rich',
          kind: 'note',
          content: {
            blocks: [
              { type: 'heading', level: 2, spans: [{ text: '<Roadmap>', marks: ['bold'] }] },
              { type: 'todo', checked: true, spans: [{ text: 'Ship P1', marks: ['italic'] }] },
            ],
          },
          x: 400,
          y: 20,
          width: 300,
          height: 220,
          zIndex: 1,
        },
        link: {
          id: 'link',
          kind: 'note-link',
          noteId: 'target',
          title: 'Linked note',
          x: 740,
          y: 20,
          width: 280,
          height: 104,
          zIndex: 2,
        },
        slide: {
          id: 'slide',
          kind: 'frame',
          title: 'Opening',
          presentationOrder: 0,
          x: 360,
          y: 0,
          width: 960,
          height: 540,
          zIndex: -10_000,
        },
      },
      order: ['slide', 'rich', 'link'],
    }
    const svg = buildCanvasSvg(p1Snapshot, { scope: 'all' })

    expect(svg).toContain('&lt;Roadmap&gt;')
    expect(svg).toContain('font-weight="700"')
    expect(svg).toContain('☑')
    expect(svg).toContain('Linked note')
    expect(svg).toContain('Opening')
    expect(svg).not.toContain('foreignObject')
  })

  it('draws exactly one document card for the whole note, not one per block', () => {
    const svg = buildCanvasSvg(snapshot, {
      scope: 'all',
      document: { title: 'Note', lines: ['Note'] },
    })
    // The document card rect is the only one styled with the card's border
    // color; element rects carry their own style and never use it.
    expect(countOccurrences(svg, 'stroke="#cbd5e1"')).toBe(1)
  })

  it('supports selection and viewport bounds', () => {
    const selection = buildCanvasSvg(snapshot, { scope: 'selection', selectionIds: ['shape'] })
    expect(selection).toContain('Shape')
    expect(selection).not.toContain('stroke="#cbd5e1"')

    const documentSelection = buildCanvasSvg(snapshot, {
      scope: 'selection',
      selectionIds: [CANVAS_DOCUMENT_FRAME_ID],
      document: { title: 'Note', lines: ['Note only'] },
    })
    expect(documentSelection).toContain('Note only')
    expect(documentSelection).not.toContain('Shape')

    const viewport = buildCanvasSvg(snapshot, {
      scope: 'viewport',
      viewport: { x: 100, y: 200, width: 640, height: 480 },
      padding: 0,
    })
    expect(viewport).toContain('viewBox="100 200 640 480"')
  })

  it('draws only the title, not the body lines, for a collapsed frame', () => {
    const collapsedSnapshot: CanvasSnapshotV1 = {
      ...snapshot,
      frame: { ...snapshot.frame, collapsed: true },
    }
    const svg = buildCanvasSvg(collapsedSnapshot, {
      scope: 'all',
      document: { title: 'My Note', lines: ['My Note', 'body line one', 'body line two'] },
    })
    expect(svg).toContain('My Note')
    expect(svg).not.toContain('body line one')
    expect(svg).not.toContain('body line two')
  })
})
