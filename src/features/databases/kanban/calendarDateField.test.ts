import { describe, expect, it } from 'vitest'
import { resolveCalendarDateField } from './calendarDateField'

describe('resolveCalendarDateField', () => {
  it('picks the only date field automatically', () => {
    expect(resolveCalendarDateField(['due'], '')).toBe('due')
  })

  it('keeps a valid choice when more date fields exist', () => {
    expect(resolveCalendarDateField(['due', 'start'], 'start')).toBe('start')
  })

  it('leaves the choice open when there are several date fields', () => {
    expect(resolveCalendarDateField(['due', 'start'], '')).toBe('')
  })

  it('drops a choice whose field disappeared, falling back to a lone field', () => {
    expect(resolveCalendarDateField(['due'], 'removed')).toBe('due')
    expect(resolveCalendarDateField([], 'removed')).toBe('')
  })
})
