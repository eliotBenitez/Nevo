import { describe, expect, it } from 'vitest'
import { groupArchiveItems } from './grouping'

describe('groupArchiveItems', () => {
  const fixedNow = new Date('2026-09-24T12:00:00')

  it('groups items into today, thisWeek, and earlier based on boundaries', () => {
    const items = [
      { id: '1', item: { deletedAt: '2026-09-24T09:30:00' } }, // Today
      { id: '2', item: { deletedAt: '2026-09-23T23:59:59' } }, // 1 day ago -> thisWeek
      { id: '3', item: { deletedAt: '2026-09-20T10:00:00' } }, // 4 days ago -> thisWeek
      { id: '4', item: { deletedAt: '2026-09-18T00:00:00' } }, // 6 days ago -> thisWeek
      { id: '5', item: { deletedAt: '2026-09-17T23:59:59' } }, // 7 days ago -> earlier
      { id: '6', item: { deletedAt: '2026-08-01T12:00:00' } }, // 54 days ago -> earlier
    ]

    const groups = groupArchiveItems(items, fixedNow)

    expect(groups).toHaveLength(3)
    expect(groups[0]?.key).toBe('today')
    expect(groups[0]?.items.map(i => i.id)).toEqual(['1'])

    expect(groups[1]?.key).toBe('thisWeek')
    expect(groups[1]?.items.map(i => i.id)).toEqual(['2', '3', '4'])

    expect(groups[2]?.key).toBe('earlier')
    expect(groups[2]?.items.map(i => i.id)).toEqual(['5', '6'])
  })

  it('omits empty groups and preserves item order within groups', () => {
    const items = [
      { id: 'a', item: { deletedAt: '2026-09-22T10:00:00' } }, // 2 days ago -> thisWeek
      { id: 'b', item: { deletedAt: '2026-09-21T08:00:00' } }, // 3 days ago -> thisWeek
      { id: 'c', item: { deletedAt: '2026-09-10T12:00:00' } }, // earlier
    ]

    const groups = groupArchiveItems(items, fixedNow)

    expect(groups).toHaveLength(2)
    expect(groups[0]?.key).toBe('thisWeek')
    expect(groups[0]?.items.map(i => i.id)).toEqual(['a', 'b'])

    expect(groups[1]?.key).toBe('earlier')
    expect(groups[1]?.items.map(i => i.id)).toEqual(['c'])
  })

  it('returns empty array when items list is empty', () => {
    const groups = groupArchiveItems([], fixedNow)
    expect(groups).toEqual([])
  })
})
