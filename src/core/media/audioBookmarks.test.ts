import { describe, expect, it } from 'vitest'
import { formatAudioTime, readAudioBookmarks } from './audioBookmarks'

describe('audio bookmarks', () => {
  it('keeps valid records and unknown fields in a stable time order', () => {
    expect(readAudioBookmarks([
      { id: 'late', time: 120, label: 'later', custom: 1 },
      { id: 'early', time: 3, label: 'first' },
      { id: 'bad', time: -1, label: 'invalid' },
      { id: 'missing-label', time: 2 },
    ])).toEqual([
      { id: 'early', time: 3, label: 'first' },
      { id: 'late', time: 120, label: 'later', custom: 1 },
    ])
  })

  it('keeps the first occurrence of a duplicate id', () => {
    expect(readAudioBookmarks([
      { id: 'same', time: 9, label: 'first' },
      { id: 'same', time: 1, label: 'duplicate' },
    ])).toEqual([{ id: 'same', time: 9, label: 'first' }])
  })

  it('formats times as m:ss or h:mm:ss', () => {
    expect(formatAudioTime(0)).toBe('0:00')
    expect(formatAudioTime(754)).toBe('12:34')
    expect(formatAudioTime(3661)).toBe('1:01:01')
  })
})
