import { describe, expect, it } from 'vitest'
import { readAudioLayout, resolveAudioLayout } from './audioLayout'

describe('audio layout preference', () => {
  it('normalizes unknown persisted values to auto', () => {
    expect(readAudioLayout('player')).toBe('player')
    expect(readAudioLayout('bookmarks')).toBe('bookmarks')
    expect(readAudioLayout('auto')).toBe('auto')
    expect(readAudioLayout(undefined)).toBe('auto')
    expect(readAudioLayout('list')).toBe('auto')
    expect(readAudioLayout(3)).toBe('auto')
  })

  it('resolves auto by the presence of valid bookmarks', () => {
    expect(resolveAudioLayout('auto', [])).toBe('player')
    expect(resolveAudioLayout('auto', undefined)).toBe('player')
    expect(resolveAudioLayout('auto', [{ id: 'b', time: 3, label: 'x' }])).toBe('bookmarks')
    // Invalid records do not count, so a malformed list stays a plain player.
    expect(resolveAudioLayout('auto', [{ id: '', time: -1, label: 'x' }])).toBe('player')
  })

  it('lets an explicit choice win over the bookmark list', () => {
    expect(resolveAudioLayout('player', [{ id: 'b', time: 3, label: 'x' }])).toBe('player')
    expect(resolveAudioLayout('bookmarks', [])).toBe('bookmarks')
  })
})
