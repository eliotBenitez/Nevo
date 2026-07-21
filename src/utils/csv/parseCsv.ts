export interface ParsedCsv {
  headers: string[]
  rows: string[][]
}

export const CSV_DELIMITERS = [',', ';', '\t', '|'] as const
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number]

/**
 * Auto-detects the column delimiter of a CSV/DSV text by counting how often each
 * candidate ({@link CSV_DELIMITERS}) occurs at the top level (outside quotes) across
 * a sample of the input. Returns the most frequent candidate, preferring comma on ties.
 */
export function detectDelimiter(input: string): CsvDelimiter {
  const text = input.replace(/^\uFEFF/, '').slice(0, 65536)
  const counts = new Map<string, number>(CSV_DELIMITERS.map(d => [d, 0]))
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { i += 1; continue }
        inQuotes = false
      }
      continue
    }
    if (char === '"') { inQuotes = true; continue }
    if (counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1)
  }
  let best: CsvDelimiter = ','
  let bestCount = 0
  for (const delimiter of CSV_DELIMITERS) {
    const count = counts.get(delimiter) ?? 0
    if (count > bestCount) {
      bestCount = count
      best = delimiter
    }
  }
  return best
}

/**
 * Minimal RFC-4180-ish parser for delimiter-separated values: handles quoted fields,
 * escaped quotes (""), embedded delimiters/newlines inside quotes, and both LF and CRLF
 * line endings. The column delimiter defaults to a comma. Returns the first non-empty
 * row as headers and the rest as data rows.
 */
export function parseCsv(input: string, delimiter: string = ','): ParsedCsv {
  const sep = delimiter && delimiter.length > 0 ? delimiter[0] : ','
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let i = 0
  const text = input.replace(/^\uFEFF/, '')
  const len = text.length

  const pushField = () => {
    record.push(field)
    field = ''
  }
  const pushRecord = () => {
    pushField()
    records.push(record)
    record = []
  }

  while (i < len) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === sep) {
      pushField()
      i += 1
      continue
    }
    if (char === '\r') {
      if (text[i + 1] === '\n') i += 1
      pushRecord()
      i += 1
      continue
    }
    if (char === '\n') {
      pushRecord()
      i += 1
      continue
    }
    field += char
    i += 1
  }

  if (field !== '' || record.length > 0) pushRecord()

  const nonEmpty = records.filter(r => !(r.length === 1 && r[0].trim() === ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  const [headers, ...rows] = nonEmpty
  return { headers: headers.map(h => h.trim()), rows }
}

export type InferredCsvType = 'number' | 'date' | 'checkbox' | 'text'

/**
 * Infers a column type from its sampled string values. Empty values are ignored;
 * a column matches a type only if every non-empty sample fits it.
 */
export function inferColumnType(values: string[]): InferredCsvType {
  const samples = values.map(v => v.trim()).filter(v => v !== '')
  if (samples.length === 0) return 'text'

  const isBool = (v: string) => /^(true|false|yes|no)$/i.test(v)
  const isNumber = (v: string) => /^-?\d+(\.\d+)?$/.test(v.replace(/\s/g, ''))
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}([ T].*)?$/.test(v) || (!Number.isNaN(Date.parse(v)) && /[-/.]/.test(v) && /\d{4}/.test(v))

  if (samples.every(isBool)) return 'checkbox'
  if (samples.every(isNumber)) return 'number'
  if (samples.every(isDate)) return 'date'
  return 'text'
}
