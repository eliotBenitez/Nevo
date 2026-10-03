import { describe, expect, it } from 'vitest'
import { slashGridColumns } from './slashMenuLayout'

describe('slashGridColumns', () => {
  it.each([['list', 0], ['grid', 4], ['preview', 3], ['unknown', 0]])('returns %s layout %i columns', (layout, columns) => {
    expect(slashGridColumns(layout as 'list')).toBe(columns)
  })
})
