import { describe, expect, it } from 'vitest'
import { decodeBlockRef, encodeBlockRef, findBlockById, resolveBlockRef } from './resolveBlockRef'
import type { WorkspaceBackend } from '../workspace-backend/types'
import type { NoteDocument } from '../../types/note'

function stubBackend(loadNote: WorkspaceBackend['loadNote']): WorkspaceBackend {
  return { loadNote } as unknown as WorkspaceBackend
}

describe('encodeBlockRef / decodeBlockRef', () => {
  it('round-trips a target through encode/decode', () => {
    const target = { noteId: 'note-1', blockId: 'block-1' }
    expect(decodeBlockRef(encodeBlockRef(target))).toEqual(target)
  })

  it('round-trips ids containing characters that need escaping', () => {
    const target = { noteId: 'note/with slashes', blockId: 'block#1?x=y' }
    expect(decodeBlockRef(encodeBlockRef(target))).toEqual(target)
  })

  it('tolerates surrounding whitespace from clipboard text', () => {
    const token = encodeBlockRef({ noteId: 'n1', blockId: 'b1' })
    expect(decodeBlockRef(`  ${token}\n`)).toEqual({ noteId: 'n1', blockId: 'b1' })
  })

  it('rejects text without the nevo://block/ scheme', () => {
    expect(decodeBlockRef('https://example.com')).toBeNull()
    expect(decodeBlockRef('nevo://note/abc')).toBeNull()
    expect(decodeBlockRef('plain text')).toBeNull()
    expect(decodeBlockRef('')).toBeNull()
  })

  it('rejects a malformed token missing a segment', () => {
    expect(decodeBlockRef('nevo://block/only-note-id')).toBeNull()
    expect(decodeBlockRef('nevo://block/a/b/c')).toBeNull()
    expect(decodeBlockRef('nevo://block//')).toBeNull()
  })
})

describe('findBlockById', () => {
  it('finds a top-level match', () => {
    const content = { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'hi' }] }
    expect(findBlockById(content, 'p1')).toBe(content)
  })

  it('finds a deeply nested match', () => {
    const target = { type: 'paragraph', attrs: { id: 'deep' }, content: [{ type: 'text', text: 'deep' }] }
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: null } },
        {
          type: 'callout',
          attrs: { id: null },
          content: [target],
        },
      ],
    }
    expect(findBlockById(content, 'deep')).toBe(target)
  })

  it('returns null when no block has that id', () => {
    const content = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'other' } }] }
    expect(findBlockById(content, 'missing')).toBeNull()
  })

  it('returns null for non-object content', () => {
    expect(findBlockById(null, 'x')).toBeNull()
    expect(findBlockById('a string', 'x')).toBeNull()
    expect(findBlockById(42, 'x')).toBeNull()
  })
})

describe('resolveBlockRef', () => {
  const target = { noteId: 'note-1', blockId: 'block-1' }

  it('returns ok with the resolved subtree and source title', async () => {
    const blockNode = { type: 'paragraph', attrs: { id: 'block-1' }, content: [{ type: 'text', text: 'hello' }] }
    const note: NoteDocument = {
      id: 'note-1',
      title: 'Source Note',
      icon: '',
      folderId: null,
      createdAt: '',
      updatedAt: '',
      content: { type: 'doc', content: [blockNode] },
    }
    const backend = stubBackend(async () => note)

    const result = await resolveBlockRef(backend, target)
    expect(result).toEqual({ status: 'ok', node: blockNode, sourceTitle: 'Source Note' })
  })

  it('returns note-missing when loadNote rejects', async () => {
    const backend = stubBackend(async () => {
      throw new Error('not found')
    })

    const result = await resolveBlockRef(backend, target)
    expect(result).toEqual({ status: 'note-missing' })
  })

  it('returns block-missing with the source title when the block id is gone', async () => {
    const note: NoteDocument = {
      id: 'note-1',
      title: 'Source Note',
      icon: '',
      folderId: null,
      createdAt: '',
      updatedAt: '',
      content: { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'other-block' } }] },
    }
    const backend = stubBackend(async () => note)

    const result = await resolveBlockRef(backend, target)
    expect(result).toEqual({ status: 'block-missing', sourceTitle: 'Source Note' })
  })
})
