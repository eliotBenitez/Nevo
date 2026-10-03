import { describe, expect, it } from 'vitest'
import { daysUntilPurge, retentionTone } from './retention'

describe('daysUntilPurge', () => {
  it('calculates remaining days accurately across fixed ISO dates', () => {
    const deletedAt = '2026-09-01T12:00:00.000Z'
    const retentionDays = 30

    // Same day
    expect(daysUntilPurge(deletedAt, retentionDays, new Date('2026-09-01T15:00:00.000Z'))).toBe(30)
    // 2 days later
    expect(daysUntilPurge(deletedAt, retentionDays, new Date('2026-09-03T12:00:00.000Z'))).toBe(28)
    // 29 days later
    expect(daysUntilPurge(deletedAt, retentionDays, new Date('2026-09-30T12:00:00.000Z'))).toBe(1)
    // 30 days later
    expect(daysUntilPurge(deletedAt, retentionDays, new Date('2026-10-01T12:00:00.000Z'))).toBe(0)
  })

  it('clamps at 0 when overdue', () => {
    const deletedAt = '2026-09-01T12:00:00.000Z'
    const retentionDays = 30

    expect(daysUntilPurge(deletedAt, retentionDays, new Date('2026-10-05T12:00:00.000Z'))).toBe(0)
    expect(daysUntilPurge(deletedAt, retentionDays, new Date('2027-01-01T00:00:00.000Z'))).toBe(0)
  })

  it('returns null when retentionDays is 0 (keep forever)', () => {
    const deletedAt = '2026-09-01T12:00:00.000Z'
    expect(daysUntilPurge(deletedAt, 0, new Date('2026-09-10T12:00:00.000Z'))).toBeNull()
  })

  it('handles invalid date strings gracefully', () => {
    expect(daysUntilPurge('invalid-date', 30)).toBeNull()
  })

  it('is DST/timezone-safe with UTC timestamps', () => {
    // Spans DST transition dates (e.g. late March or late October)
    const deletedAt = '2026-03-25T00:00:00.000Z'
    const retentionDays = 10
    const now = new Date('2026-03-31T00:00:00.000Z') // 6 days elapsed
    expect(daysUntilPurge(deletedAt, retentionDays, now)).toBe(4)
  })
})

describe('retentionTone', () => {
  it('maps day thresholds correctly', () => {
    expect(retentionTone(null)).toBe('none')
    expect(retentionTone(30)).toBe('normal')
    expect(retentionTone(8)).toBe('normal')
    expect(retentionTone(7)).toBe('soon')
    expect(retentionTone(2)).toBe('soon')
    expect(retentionTone(1)).toBe('last')
    expect(retentionTone(0)).toBe('last')
  })
})
