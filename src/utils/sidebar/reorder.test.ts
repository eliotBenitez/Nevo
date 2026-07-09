import { describe, expect, it } from 'vitest'
import {
  applySidebarNoteOrder,
  moveIdInOrder,
  moveItemInArray,
  resolveDropPosition,
} from './reorder'
import type { SidebarNotePreview } from '../../types/note'

function preview(noteId: string, updatedAt = '2024-01-01T00:00:00Z'): SidebarNotePreview {
  return { noteId, title: noteId, icon: '📄', folderPath: '', updatedAt, tags: [], previewText: '' }
}

describe('moveItemInArray', () => {
  it('moves an item forward to the target index', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    expect(moveItemInArray(items, 'a', 2).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item backward to the target index', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    expect(moveItemInArray(items, 'd', 0).map((x) => x.id)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('returns a copy unchanged when moving to the same position', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    const result = moveItemInArray(items, 'a', 0)
    expect(result).not.toBe(items)
    expect(result.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('returns a copy unchanged when the id is not found', () => {
    const items = [{ id: 'a' }, { id: 'b' }]
    const result = moveItemInArray(items, 'missing', 1)
    expect(result).not.toBe(items)
    expect(result.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('clamps out-of-range target index', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(moveItemInArray(items, 'a', 99).map((x) => x.id)).toEqual(['b', 'c', 'a'])
    expect(moveItemInArray(items, 'c', -5).map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('moveIdInOrder', () => {
  it('reorders a string id array', () => {
    expect(moveIdInOrder(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
  })

  it('does not mutate the source array', () => {
    const order = ['a', 'b', 'c']
    moveIdInOrder(order, 'a', 2)
    expect(order).toEqual(['a', 'b', 'c'])
  })
})

describe('applySidebarNoteOrder', () => {
  it('orders previews according to the saved order, unknown ids at the end', () => {
    const previews = [preview('a'), preview('b'), preview('c'), preview('d')]
    const result = applySidebarNoteOrder(previews, ['c', 'a'])
    expect(result.map((p) => p.noteId)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('returns a copy unchanged when order is empty', () => {
    const previews = [preview('a'), preview('b')]
    const result = applySidebarNoteOrder(previews, [])
    expect(result).not.toBe(previews)
    expect(result.map((p) => p.noteId)).toEqual(['a', 'b'])
  })

  it('returns a copy unchanged when order is undefined', () => {
    const previews = [preview('a'), preview('b')]
    const result = applySidebarNoteOrder(previews, undefined)
    expect(result).not.toBe(previews)
    expect(result.map((p) => p.noteId)).toEqual(['a', 'b'])
  })

  it('preserves relative order of unordered previews', () => {
    const previews = [preview('a'), preview('b'), preview('c')]
    const result = applySidebarNoteOrder(previews, ['c'])
    expect(result.map((p) => p.noteId)).toEqual(['c', 'a', 'b'])
  })
})

describe('resolveDropPosition', () => {
  it('returns before/into/after for a folder target across zones', () => {
    expect(resolveDropPosition(2, 30, true)).toBe('before')
    expect(resolveDropPosition(10, 30, true)).toBe('into')
    expect(resolveDropPosition(28, 30, true)).toBe('after')
  })

  it('splits a non-folder target in half (before/after)', () => {
    expect(resolveDropPosition(5, 30, false)).toBe('before')
    expect(resolveDropPosition(20, 30, false)).toBe('after')
  })

  it('falls back to after when row height is non-positive', () => {
    expect(resolveDropPosition(0, 0, true)).toBe('after')
  })
})
