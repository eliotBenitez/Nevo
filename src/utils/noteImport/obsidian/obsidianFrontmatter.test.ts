import { describe, expect, it } from 'vitest'
import {
  buildFrontmatterTable,
  collectTags,
  extractFrontmatter,
  mapFrontmatterToProperties,
} from './obsidianFrontmatter'

describe('extractFrontmatter', () => {
  it('extracts a leading YAML fence and returns the remainder as body', () => {
    const markdown = ['---', 'title: Hello', 'status: active', '---', '', 'Body text.'].join('\n')
    const result = extractFrontmatter(markdown)
    expect(result.data).toEqual({ title: 'Hello', status: 'active' })
    expect(result.body).toBe('\nBody text.')
  })

  it('returns null data and the original markdown when there is no frontmatter fence', () => {
    const markdown = 'Just a note.\n\nNo frontmatter here.'
    const result = extractFrontmatter(markdown)
    expect(result.data).toBeNull()
    expect(result.body).toBe(markdown)
  })

  it('does not treat a --- fence as frontmatter unless it is the very first line', () => {
    const markdown = ['Some text', '---', 'title: Hello', '---'].join('\n')
    const result = extractFrontmatter(markdown)
    expect(result.data).toBeNull()
    expect(result.body).toBe(markdown)
  })

  it('returns null data and the original markdown when the fence is never closed', () => {
    const markdown = ['---', 'title: Hello', '', 'Body without a closing fence.'].join('\n')
    const result = extractFrontmatter(markdown)
    expect(result.data).toBeNull()
    expect(result.body).toBe(markdown)
  })

  it('returns null data and the original markdown when the YAML fails to parse', () => {
    const markdown = ['---', 'title: [unclosed', '---', 'Body.'].join('\n')
    const result = extractFrontmatter(markdown)
    expect(result.data).toBeNull()
    expect(result.body).toBe(markdown)
  })

  it('returns null data when the parsed YAML is not an object (e.g. a scalar)', () => {
    const markdown = ['---', 'just a string', '---', 'Body.'].join('\n')
    const result = extractFrontmatter(markdown)
    expect(result.data).toBeNull()
    expect(result.body).toBe(markdown)
  })

  it('returns null data when the parsed YAML is an array', () => {
    const markdown = ['---', '- one', '- two', '---', 'Body.'].join('\n')
    const result = extractFrontmatter(markdown)
    expect(result.data).toBeNull()
    expect(result.body).toBe(markdown)
  })
})

describe('collectTags', () => {
  it('returns an empty array for null data', () => {
    expect(collectTags(null)).toEqual([])
  })

  it('reads a YAML array under "tags"', () => {
    expect(collectTags({ tags: ['alpha', 'beta'] })).toEqual(['alpha', 'beta'])
  })

  it('reads a YAML array under "tag" (singular key)', () => {
    expect(collectTags({ tag: ['solo'] })).toEqual(['solo'])
  })

  it('reads a single string value', () => {
    expect(collectTags({ tags: 'alpha' })).toEqual(['alpha'])
  })

  it('splits a comma-separated string', () => {
    expect(collectTags({ tags: 'alpha, beta,gamma' })).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('splits a whitespace-separated string', () => {
    expect(collectTags({ tags: 'alpha beta   gamma' })).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('strips a leading # from tag values', () => {
    expect(collectTags({ tags: ['#alpha', '#beta'] })).toEqual(['alpha', 'beta'])
  })

  it('drops empty entries', () => {
    expect(collectTags({ tags: 'alpha,,  ,beta' })).toEqual(['alpha', 'beta'])
  })

  it('merges both "tags" and "tag" keys when both are present', () => {
    expect(collectTags({ tags: ['alpha'], tag: 'beta' })).toEqual(['alpha', 'beta'])
  })
})

describe('mapFrontmatterToProperties', () => {
  it('returns nulls and no extra entries for null data', () => {
    const result = mapFrontmatterToProperties(null)
    expect(result).toEqual({ properties: { type: null, date: null, status: null }, extraEntries: [] })
  })

  it('maps "date" to properties.date', () => {
    const result = mapFrontmatterToProperties({ date: '2026-01-01' })
    expect(result.properties.date).toBe('2026-01-01')
    expect(result.extraEntries).toEqual([])
  })

  it('falls back to "created" when "date" is absent', () => {
    const result = mapFrontmatterToProperties({ created: '2026-02-02' })
    expect(result.properties.date).toBe('2026-02-02')
  })

  it('falls back to "published" when neither "date" nor "created" is present', () => {
    const result = mapFrontmatterToProperties({ published: '2026-03-03' })
    expect(result.properties.date).toBe('2026-03-03')
  })

  it('coerces a YAML Date value to an ISO string', () => {
    const result = mapFrontmatterToProperties({ date: new Date('2026-04-04T00:00:00.000Z') })
    expect(result.properties.date).toBe('2026-04-04T00:00:00.000Z')
  })

  it('maps a valid status (case-insensitively) and consumes the key', () => {
    const result = mapFrontmatterToProperties({ status: 'Active' })
    expect(result.properties.status).toBe('active')
    expect(result.extraEntries).toEqual([])
  })

  it('routes an invalid status value to extraEntries instead of dropping it', () => {
    const result = mapFrontmatterToProperties({ status: 'bogus' })
    expect(result.properties.status).toBeNull()
    expect(result.extraEntries).toEqual([['status', 'bogus']])
  })

  it('maps a valid type (case-insensitively) and consumes the key', () => {
    const result = mapFrontmatterToProperties({ type: 'Meeting' })
    expect(result.properties.type).toBe('meeting')
    expect(result.extraEntries).toEqual([])
  })

  it('routes an invalid type value to extraEntries instead of dropping it', () => {
    const result = mapFrontmatterToProperties({ type: 'bogus' })
    expect(result.properties.type).toBeNull()
    expect(result.extraEntries).toEqual([['type', 'bogus']])
  })

  it('consumes "tags"/"tag" keys without emitting them as extra entries', () => {
    const result = mapFrontmatterToProperties({ tags: ['a', 'b'], tag: 'c', title: 'Hi' })
    expect(result.extraEntries).toEqual([['title', 'Hi']])
  })

  it('routes unknown keys to extraEntries, stringifying an array value', () => {
    const result = mapFrontmatterToProperties({ aliases: ['Foo', 'Bar'] })
    expect(result.extraEntries).toEqual([['aliases', 'Foo, Bar']])
  })

  it('routes unknown keys to extraEntries, stringifying an object value as compact JSON', () => {
    const result = mapFrontmatterToProperties({ meta: { a: 1, b: 2 } })
    expect(result.extraEntries).toEqual([['meta', '{"a":1,"b":2}']])
  })

  it('stringifies a plain scalar unknown value', () => {
    const result = mapFrontmatterToProperties({ priority: 5 })
    expect(result.extraEntries).toEqual([['priority', '5']])
  })
})

describe('buildFrontmatterTable', () => {
  it('returns null for an empty entries array', () => {
    expect(buildFrontmatterTable([])).toBeNull()
  })

  it('builds a 2-column table with a header row and one row per entry', () => {
    const table = buildFrontmatterTable([['aliases', 'Foo, Bar'], ['priority', '5']])
    expect(table).toEqual({
      type: 'table',
      content: [
        {
          type: 'table_row',
          content: [
            {
              type: 'table_header',
              attrs: { colspan: 1, rowspan: 1, colwidth: null },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Property' }] }],
            },
            {
              type: 'table_header',
              attrs: { colspan: 1, rowspan: 1, colwidth: null },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Value' }] }],
            },
          ],
        },
        {
          type: 'table_row',
          content: [
            {
              type: 'table_cell',
              attrs: { colspan: 1, rowspan: 1, colwidth: null },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'aliases' }] }],
            },
            {
              type: 'table_cell',
              attrs: { colspan: 1, rowspan: 1, colwidth: null },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Foo, Bar' }] }],
            },
          ],
        },
        {
          type: 'table_row',
          content: [
            {
              type: 'table_cell',
              attrs: { colspan: 1, rowspan: 1, colwidth: null },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'priority' }] }],
            },
            {
              type: 'table_cell',
              attrs: { colspan: 1, rowspan: 1, colwidth: null },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '5' }] }],
            },
          ],
        },
      ],
    })
  })
})
