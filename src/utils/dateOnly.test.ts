import { describe, expect, it, vi } from 'vitest'
import { formatDateOnly, parseDateOnly } from './dateOnly'

describe('dateOnly', () => {
  it('formats local calendar components without converting through UTC', () => {
    const date = new Date()
    vi.spyOn(date, 'getFullYear').mockReturnValue(2026)
    vi.spyOn(date, 'getMonth').mockReturnValue(7)
    vi.spyOn(date, 'getDate').mockReturnValue(6)
    vi.spyOn(date, 'toISOString').mockReturnValue('2026-08-05T21:00:00.000Z')

    expect(formatDateOnly(date)).toBe('2026-08-06')
  })

  it('parses valid date-only values as local dates', () => {
    const date = parseDateOnly('2026-08-06')

    expect(date?.getFullYear()).toBe(2026)
    expect(date?.getMonth()).toBe(7)
    expect(date?.getDate()).toBe(6)
  })

  it('rejects invalid and overflowing values', () => {
    expect(parseDateOnly('2026-02-30')).toBeNull()
    expect(parseDateOnly('06.08.2026')).toBeNull()
  })
})
