import { describe, expect, it } from 'vitest'
import type { FolderMeta, NoteMeta } from '../types/note'
import { folderNoteCount } from './folder-note-count'

function note(): NoteMeta {
  return {} as NoteMeta
}

function folder(partial: Partial<FolderMeta>): FolderMeta {
  return {
    id: 'id',
    title: 'title',
    icon: '',
    parentId: null,
    order: 0,
    children: [],
    notes: [],
    ...partial,
  }
}

describe('folderNoteCount', () => {
  it('counts notes directly in a folder', () => {
    expect(folderNoteCount(folder({ notes: [note(), note()] }))).toBe(2)
  })

  it('counts notes in a folder plus all descendants', () => {
    const grandchild = folder({ notes: [note()] })
    const child = folder({ notes: [note()], children: [grandchild] })
    const root = folder({ notes: [note(), note()], children: [child] })
    expect(folderNoteCount(root)).toBe(4)
  })

  it('returns 0 for an empty folder', () => {
    expect(folderNoteCount(folder({}))).toBe(0)
  })
})
