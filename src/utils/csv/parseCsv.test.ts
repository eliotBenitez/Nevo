import { describe, expect, it } from 'vitest'
import { parseCsv, inferColumnType, detectDelimiter } from './parseCsv'

describe('parseCsv', () => {
  it('parses simple rows', () => {
    const { headers, rows } = parseCsv('name,age\nAlice,30\nBob,25')
    expect(headers).toEqual(['name', 'age'])
    expect(rows).toEqual([['Alice', '30'], ['Bob', '25']])
  })

  it('handles quoted fields containing commas', () => {
    const { headers, rows } = parseCsv('name,address\n"Doe, John","123 Main St, Apt 4"')
    expect(headers).toEqual(['name', 'address'])
    expect(rows).toEqual([['Doe, John', '123 Main St, Apt 4']])
  })

  it('unescapes doubled quotes inside quoted fields', () => {
    const { rows } = parseCsv('name,quote\n"Alice","She said ""hi"" today"')
    expect(rows).toEqual([['Alice', 'She said "hi" today']])
  })

  it('handles embedded newlines inside quoted fields', () => {
    const { rows } = parseCsv('name,bio\n"Alice","Line one\nLine two"')
    expect(rows).toEqual([['Alice', 'Line one\nLine two']])
  })

  it('handles CRLF line endings', () => {
    const { headers, rows } = parseCsv('name,age\r\nAlice,30\r\nBob,25')
    expect(headers).toEqual(['name', 'age'])
    expect(rows).toEqual([['Alice', '30'], ['Bob', '25']])
  })

  it('ignores a trailing newline at end of input', () => {
    const { headers, rows } = parseCsv('name,age\nAlice,30\n')
    expect(headers).toEqual(['name', 'age'])
    expect(rows).toEqual([['Alice', '30']])
  })

  it('strips a leading BOM', () => {
    const { headers, rows } = parseCsv('﻿name,age\nAlice,30')
    expect(headers).toEqual(['name', 'age'])
    expect(rows).toEqual([['Alice', '30']])
  })

  it('returns empty headers and rows for empty input', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] })
    expect(parseCsv('   \n  ')).toEqual({ headers: [], rows: [] })
  })

  it('parses with a custom delimiter', () => {
    const semi = parseCsv('name;age\nAlice;30', ';')
    expect(semi.headers).toEqual(['name', 'age'])
    expect(semi.rows).toEqual([['Alice', '30']])

    const tab = parseCsv('name\tage\nAlice\t30', '\t')
    expect(tab.headers).toEqual(['name', 'age'])
    expect(tab.rows).toEqual([['Alice', '30']])
  })

  it('keeps quoted custom delimiters inside fields intact', () => {
    const { rows } = parseCsv('name;note\n"Alice";"a;b;c"', ';')
    expect(rows).toEqual([['Alice', 'a;b;c']])
  })
})

describe('detectDelimiter', () => {
  it('detects comma', () => {
    expect(detectDelimiter('name,age,city\nAlice,30,NY')).toBe(',')
  })

  it('detects semicolon', () => {
    expect(detectDelimiter('name;age;city\nAlice;30;NY')).toBe(';')
  })

  it('detects tab', () => {
    expect(detectDelimiter('name\tage\tcity\nAlice\t30\tNY')).toBe('\t')
  })

  it('detects pipe', () => {
    expect(detectDelimiter('name|age|city\nAlice|30|NY')).toBe('|')
  })

  it('ignores delimiters inside quoted fields', () => {
    expect(detectDelimiter('name;note\n"Alice";"a,b,c,d,e,f"')).toBe(';')
  })

  it('defaults to comma when no candidate is present', () => {
    expect(detectDelimiter('singlecolumn\nvalue')).toBe(',')
  })
})

describe('inferColumnType', () => {
  it('infers number when every sample is numeric', () => {
    expect(inferColumnType(['1', '2.5', '-3'])).toBe('number')
  })

  it('infers date for ISO-formatted samples', () => {
    expect(inferColumnType(['2024-01-01', '2024-12-31'])).toBe('date')
  })

  it('infers checkbox for true/false/yes/no samples', () => {
    expect(inferColumnType(['true', 'false', 'yes', 'no', 'TRUE'])).toBe('checkbox')
  })

  it('falls back to text for mixed samples', () => {
    expect(inferColumnType(['1', 'apple', '2024-01-01'])).toBe('text')
  })

  it('ignores empty values when inferring', () => {
    expect(inferColumnType(['1', '', '  ', '2'])).toBe('number')
  })

  it('returns text when all samples are empty', () => {
    expect(inferColumnType(['', '  ', ''])).toBe('text')
  })
})
