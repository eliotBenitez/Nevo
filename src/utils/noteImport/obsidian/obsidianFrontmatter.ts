// YAML frontmatter handling for the Obsidian vault importer. Extracts the
// leading `---`-fenced YAML block (if any), maps its known keys onto
// `NoteProperties`, and turns everything else into a leading key/value table
// so no frontmatter data is silently dropped. Framework-agnostic and
// Tauri-free, following the same pattern as `obsidianEmbeds.ts`.
import { parse as parseYaml } from 'yaml'
import type { BlockNode, NoteStatus, NoteType } from '../../../types/note'

export interface FrontmatterResult {
  data: Record<string, unknown> | null
  body: string
}

const NOTE_STATUSES: readonly NoteStatus[] = ['none', 'draft', 'active', 'waiting', 'done']
const NOTE_TYPES: readonly NoteType[] = ['note', 'task', 'idea', 'meeting', 'project', 'research']

function isNoteStatus(value: string): value is NoteStatus {
  return (NOTE_STATUSES as readonly string[]).includes(value)
}

function isNoteType(value: string): value is NoteType {
  return (NOTE_TYPES as readonly string[]).includes(value)
}

/** Extracts a leading `---`-fenced YAML frontmatter block. Only a fence whose
 *  opening `---` is the file's very first line is recognized; the block ends
 *  at the next line that is exactly `---`. Returns `{ data: null, body }`
 *  (with `body` equal to the original markdown) when there is no such fence,
 *  the YAML fails to parse, or it doesn't parse to an object. */
export function extractFrontmatter(markdown: string): FrontmatterResult {
  const lines = markdown.split('\n')
  if (lines[0] !== '---') return { data: null, body: markdown }

  let closingIndex = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      closingIndex = i
      break
    }
  }
  if (closingIndex === -1) return { data: null, body: markdown }

  const yamlText = lines.slice(1, closingIndex).join('\n')
  const body = lines.slice(closingIndex + 1).join('\n')

  let parsed: unknown
  try {
    parsed = parseYaml(yamlText)
  } catch {
    return { data: null, body: markdown }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { data: null, body: markdown }
  }

  return { data: parsed as Record<string, unknown>, body }
}

function splitTagString(value: string): string[] {
  return value.split(/[,\s]+/)
}

function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#/, '').trim()
}

/** Reads `tags`/`tag` frontmatter keys, accepting a YAML array, a single
 *  string, or a comma/whitespace-separated string. Strips a leading `#`,
 *  trims, and drops empties. */
export function collectTags(data: Record<string, unknown> | null): string[] {
  if (!data) return []
  const tags: string[] = []
  for (const key of ['tags', 'tag']) {
    const value = data[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          const tag = normalizeTag(item)
          if (tag) tags.push(tag)
        }
      }
    } else if (typeof value === 'string') {
      for (const part of splitTagString(value)) {
        const tag = normalizeTag(part)
        if (tag) tags.push(tag)
      }
    }
  }
  return tags
}

export interface MappedFrontmatter {
  properties: { type: NoteType | null; date: string | null; status: NoteStatus | null }
  extraEntries: Array<[string, string]>
}

function coerceDate(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return null
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(item => (typeof item === 'string' ? item : stringifyValue(item))).join(', ')
  }
  if (value instanceof Date) return value.toISOString()
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const DATE_KEYS = ['date', 'created', 'published']

/** Maps known frontmatter keys (`date`/`created`/`published`, `status`,
 *  `type`) onto `NoteProperties` fields, and routes every other key (except
 *  `tags`/`tag`, handled by `collectTags`) into `extraEntries` for the
 *  leading table. A `status`/`type` value that isn't a recognized enum member
 *  is left in `extraEntries` rather than silently dropped. */
export function mapFrontmatterToProperties(data: Record<string, unknown> | null): MappedFrontmatter {
  if (!data) return { properties: { type: null, date: null, status: null }, extraEntries: [] }

  const consumed = new Set<string>(['tags', 'tag'])

  let date: string | null = null
  for (const key of DATE_KEYS) {
    if (key in data) {
      const coerced = coerceDate(data[key])
      if (coerced !== null) {
        date = coerced
        consumed.add(key)
        break
      }
    }
  }

  let status: NoteStatus | null = null
  if ('status' in data) {
    const raw = data.status
    if (typeof raw === 'string' && isNoteStatus(raw.toLowerCase())) {
      status = raw.toLowerCase() as NoteStatus
      consumed.add('status')
    }
  }

  let type: NoteType | null = null
  if ('type' in data) {
    const raw = data.type
    if (typeof raw === 'string' && isNoteType(raw.toLowerCase())) {
      type = raw.toLowerCase() as NoteType
      consumed.add('type')
    }
  }

  const extraEntries: Array<[string, string]> = []
  for (const [key, value] of Object.entries(data)) {
    if (consumed.has(key)) continue
    extraEntries.push([key, stringifyValue(value)])
  }

  return { properties: { type, date, status }, extraEntries }
}

function tableCell(type: 'table_header' | 'table_cell', text: string): BlockNode {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}

/** Builds a 2-column ("Property" / "Value") table from leftover frontmatter
 *  entries, in the exact node shape the markdown table parser emits. Returns
 *  `null` when there are no entries. */
export function buildFrontmatterTable(entries: Array<[string, string]>): BlockNode | null {
  if (entries.length === 0) return null

  const headerRow: BlockNode = {
    type: 'table_row',
    content: [tableCell('table_header', 'Property'), tableCell('table_header', 'Value')],
  }
  const dataRows: BlockNode[] = entries.map(([key, value]) => ({
    type: 'table_row',
    content: [tableCell('table_cell', key), tableCell('table_cell', value)],
  }))

  return { type: 'table', content: [headerRow, ...dataRows] }
}
