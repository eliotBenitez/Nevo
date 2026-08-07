import { describe, expect, it } from 'vitest'
import { yDocToProsemirrorJSON } from 'y-prosemirror'
import { nevoBaseSchema } from '../schema'
import {
  createYDocFromContent,
  hardRestoreKnownNoteTypes,
  Y_FRAGMENT_NAME,
} from '.'
import { readCanvasSnapshot, replaceCanvasSnapshot } from '../../core/canvas'

describe('hardRestoreKnownNoteTypes', () => {
  it('replaces ProseMirror and Canvas state instead of additively merging it', () => {
    const live = createYDocFromContent(nevoBaseSchema, {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: 'current' }, content: [{ type: 'text', text: 'Current' }] }],
    })
    replaceCanvasSnapshot(live, {
      version: 1,
      frame: { x: 900, y: 900, width: 900, height: 1200, zIndex: 0, autoHeight: true },
      elements: {},
      connectors: {},
      order: [],
    })

    const snapshot = createYDocFromContent(nevoBaseSchema, {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { id: 'saved' }, content: [{ type: 'text', text: 'Saved' }] }],
    })
    replaceCanvasSnapshot(snapshot, {
      version: 1,
      frame: { x: 10, y: 20, width: 400, height: 1200, zIndex: 0, autoHeight: true },
      elements: {},
      connectors: {},
      order: [],
    })

    hardRestoreKnownNoteTypes(live, snapshot, nevoBaseSchema, 'restore')

    expect(yDocToProsemirrorJSON(live, Y_FRAGMENT_NAME)).toMatchObject({
      content: [{ attrs: { id: 'saved' }, content: [{ text: 'Saved' }] }],
    })
    expect(readCanvasSnapshot(live).frame).toEqual({
      x: 10, y: 20, width: 400, height: 1200, zIndex: 0, autoHeight: true,
    })

    live.destroy()
    snapshot.destroy()
  })
})
