import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { yDocToProsemirrorJSON } from 'y-prosemirror'
import { nevoBaseSchema } from '../schema'
import {
  Y_FRAGMENT_NAME,
  createYDocFromContent,
  encodeYDocState,
  loadOrCreateYDoc,
} from './index'

const CONTENT = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
  ],
}

const OTHER_CONTENT = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Seed only' }] },
  ],
}

function firstParagraphText(ydoc: Y.Doc): string | undefined {
  const json = yDocToProsemirrorJSON(ydoc, Y_FRAGMENT_NAME) as {
    content?: Array<{ content?: Array<{ text?: string }> }>
  }
  return json.content?.[0]?.content?.[0]?.text
}

describe('loadOrCreateYDoc', () => {
  it('seeds a fresh Y.Doc from content when there are no persisted bytes', () => {
    const ydoc = loadOrCreateYDoc(nevoBaseSchema, CONTENT, new Uint8Array())
    expect(ydoc).not.toBeNull()
    expect(firstParagraphText(ydoc!)).toBe('Hello world')
  })

  it('restores the persisted Y.Doc when valid bytes are present', () => {
    const source = createYDocFromContent(nevoBaseSchema, CONTENT)
    const bytes = encodeYDocState(source)

    // The persisted state must win over the seed content — that is the whole
    // point of the disk-backed Y.Doc being authoritative on reload.
    const ydoc = loadOrCreateYDoc(nevoBaseSchema, OTHER_CONTENT, bytes)
    expect(ydoc).not.toBeNull()
    expect(firstParagraphText(ydoc!)).toBe('Hello world')
  })

  it('falls back to seeding from content when the persisted bytes are corrupt', () => {
    // Random bytes are not a valid Yjs update; recovery must not throw and must
    // never leave the note unopenable.
    const corrupt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 200, 255])
    const ydoc = loadOrCreateYDoc(nevoBaseSchema, OTHER_CONTENT, corrupt)
    expect(ydoc).not.toBeNull()
    expect(firstParagraphText(ydoc!)).toBe('Seed only')
  })
})
