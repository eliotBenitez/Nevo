import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror'
import { nevoBaseSchema } from '../../editor-core/schema'
import {
  LEGACY_Y_FRAGMENT_NAME,
  decodeLegacyPersistedNoteYDoc,
} from './decodeLegacyNoteYDoc'

const CONTENT = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
  ],
}

function firstParagraphText(ydoc: Y.Doc): string | undefined {
  const json = yDocToProsemirrorJSON(ydoc, LEGACY_Y_FRAGMENT_NAME) as {
    content?: Array<{ content?: Array<{ text?: string }> }>
  }
  return json.content?.[0]?.content?.[0]?.text
}

function encodeDocWithUnknownNodeType(): Uint8Array {
  const ydoc = new Y.Doc()
  const fragment = ydoc.getXmlFragment(LEGACY_Y_FRAGMENT_NAME)
  fragment.push([new Y.XmlElement('totally_unknown_node_type')])
  const bytes = Y.encodeStateAsUpdate(ydoc)
  ydoc.destroy()
  return bytes
}

describe('decodeLegacyPersistedNoteYDoc', () => {
  it('reports missing for empty bytes', () => {
    const result = decodeLegacyPersistedNoteYDoc(nevoBaseSchema, new Uint8Array())
    expect(result).toEqual({ kind: 'missing' })
  })

  it('restores the persisted Y.Doc when valid bytes are present', () => {
    const source = prosemirrorJSONToYDoc(nevoBaseSchema, CONTENT, LEGACY_Y_FRAGMENT_NAME)
    const bytes = Y.encodeStateAsUpdate(source)
    source.destroy()

    const result = decodeLegacyPersistedNoteYDoc(nevoBaseSchema, bytes)

    expect(result.kind).toBe('restored')
    if (result.kind !== 'restored') throw new Error('unreachable')
    expect(firstParagraphText(result.ydoc)).toBe('Hello world')
    result.ydoc.destroy()
  })

  it('reports corrupt for random bytes that are not a valid Yjs update', () => {
    const corrupt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 200, 255])

    const result = decodeLegacyPersistedNoteYDoc(nevoBaseSchema, corrupt)

    expect(result.kind).toBe('corrupt')
  })

  it('reports corrupt when a validly-encoded doc has no prosemirror content despite non-trivial bytes', () => {
    const empty = new Y.Doc()
    empty.getMap('unrelated').set('k', 'v'.repeat(20))
    const bytes = Y.encodeStateAsUpdate(empty)
    empty.destroy()
    expect(bytes.length).toBeGreaterThan(2)

    const result = decodeLegacyPersistedNoteYDoc(nevoBaseSchema, bytes)

    expect(result.kind).toBe('corrupt')
  })

  it('treats a trivially small (<=2 byte) empty update as missing, not corrupt', () => {
    const untouched = new Y.Doc()
    const bytes = Y.encodeStateAsUpdate(untouched)
    untouched.destroy()
    expect(bytes.length).toBeLessThanOrEqual(2)

    const result = decodeLegacyPersistedNoteYDoc(nevoBaseSchema, bytes)

    expect(result).toEqual({ kind: 'missing' })
  })

  it('reports unsupported (not corrupt) when the content cannot round-trip through the editor schema', () => {
    const bytes = encodeDocWithUnknownNodeType()

    const result = decodeLegacyPersistedNoteYDoc(nevoBaseSchema, bytes)

    expect(result.kind).toBe('unsupported')
  })

  it('skips schema validation when validateSchema is false, as the migration always requests', () => {
    const bytes = encodeDocWithUnknownNodeType()

    const result = decodeLegacyPersistedNoteYDoc(nevoBaseSchema, bytes, { validateSchema: false })

    expect(result.kind).toBe('restored')
    if (result.kind === 'restored') result.ydoc.destroy()
  })
})
