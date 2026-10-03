import { describe, expect, it } from 'vitest'
import { groupSpans, resolveSlashGridMove } from '../slash-navigation'

// text: 0..4 (5 items → rows [0,1,2] [3,4]), lists: 5..6, code: 7
const categories = ['text', 'text', 'text', 'text', 'text', 'lists', 'lists', 'code']

describe('groupSpans', () => {
  it('splits consecutive categories into spans', () => {
    expect(groupSpans(categories)).toEqual([
      { start: 0, size: 5 },
      { start: 5, size: 2 },
      { start: 7, size: 1 },
    ])
  })
})

describe('resolveSlashGridMove', () => {
  it('moves left and right through the flat order and wraps', () => {
    expect(resolveSlashGridMove(categories, 0, 'ArrowRight', 3)).toBe(1)
    expect(resolveSlashGridMove(categories, 2, 'ArrowRight', 3)).toBe(3)
    expect(resolveSlashGridMove(categories, 7, 'ArrowRight', 3)).toBe(0)
    expect(resolveSlashGridMove(categories, 0, 'ArrowLeft', 3)).toBe(7)
  })

  it('moves down a row inside a category', () => {
    expect(resolveSlashGridMove(categories, 1, 'ArrowDown', 3)).toBe(4)
  })

  it('clamps to the last tile when the next row is shorter', () => {
    expect(resolveSlashGridMove(categories, 2, 'ArrowDown', 3)).toBe(4)
  })

  it('steps into the next category keeping the column when possible', () => {
    expect(resolveSlashGridMove(categories, 3, 'ArrowDown', 3)).toBe(5)
    expect(resolveSlashGridMove(categories, 4, 'ArrowDown', 3)).toBe(6)
    expect(resolveSlashGridMove(categories, 6, 'ArrowDown', 3)).toBe(7)
  })

  it('wraps from the last category back to the first', () => {
    expect(resolveSlashGridMove(categories, 7, 'ArrowDown', 3)).toBe(0)
    expect(resolveSlashGridMove(categories, 1, 'ArrowUp', 3)).toBe(7)
  })

  it('moves up a row, and into the previous category’s last row', () => {
    expect(resolveSlashGridMove(categories, 4, 'ArrowUp', 3)).toBe(1)
    expect(resolveSlashGridMove(categories, 5, 'ArrowUp', 3)).toBe(3)
    expect(resolveSlashGridMove(categories, 6, 'ArrowUp', 3)).toBe(4)
    expect(resolveSlashGridMove(categories, 7, 'ArrowUp', 3)).toBe(5)
  })

  it('handles an empty list and a single column', () => {
    expect(resolveSlashGridMove([], 0, 'ArrowDown', 3)).toBe(0)
    expect(resolveSlashGridMove(categories, 0, 'ArrowDown', 1)).toBe(1)
  })
})
