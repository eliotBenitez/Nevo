import type { NevoDocxBlock, NevoDocxFragment, NevoDocxInline } from '../../types/editor-plugin'
import { sanitizeSvg } from '../sanitizeSvg'

const MAX_BLOCKS = 500
const MAX_INLINES = 50_000
const MAX_TABLE_ROWS = 200
const MAX_TABLE_CELLS = 50
const MAX_TEXT_LENGTH = 1024 * 1024
const MAX_CAPTION_LENGTH = 1000
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const BOOLEAN_MARKS = ['bold', 'italic', 'underline', 'strike', 'code'] as const

class InvalidFragment extends Error {}

function fail(): never {
  throw new InvalidFragment()
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  return value as Record<string, unknown>
}

function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail()
  return value
}

function isSafeLink(value: string): boolean {
  try {
    return LINK_PROTOCOLS.has(new URL(value).protocol)
  } catch {
    return false
  }
}

function isSafeAssetPath(value: string): boolean {
  if (!value || /^[/\\]/.test(value) || value.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return false
  return !value.split('/').includes('..')
}

function caption(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > MAX_CAPTION_LENGTH) fail()
  return value
}

/** Strict validation of a plugin-provided DOCX fragment; any violation rejects the whole fragment. */
export function normalizeDocxFragment(value: unknown): NevoDocxFragment | null {
  let textBudget = MAX_TEXT_LENGTH

  const inline = (raw: unknown): NevoDocxInline => {
    const node = record(raw)
    if (node.type === 'break') return { type: 'break' }
    if (node.type !== 'text' || typeof node.text !== 'string') fail()
    textBudget -= node.text.length
    if (textBudget < 0) fail()
    const out: Extract<NevoDocxInline, { type: 'text' }> = { type: 'text', text: node.text }
    for (const key of BOOLEAN_MARKS) {
      if (node[key] === undefined) continue
      if (typeof node[key] !== 'boolean') fail()
      out[key] = node[key]
    }
    if (node.color !== undefined) {
      if (typeof node.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(node.color)) fail()
      out.color = node.color
    }
    if (node.link !== undefined) {
      if (typeof node.link !== 'string' || !isSafeLink(node.link)) fail()
      out.link = node.link
    }
    return out
  }

  const inlines = (raw: unknown) => list(raw, MAX_INLINES).map(inline)

  const block = (raw: unknown): NevoDocxBlock => {
    const node = record(raw)
    switch (node.type) {
      case 'children':
        return { type: 'children' }
      case 'paragraph':
        return { type: 'paragraph', children: inlines(node.children) }
      case 'heading': {
        const level = node.level
        if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 6) fail()
        return { type: 'heading', level: level as 1, children: inlines(node.children) }
      }
      case 'table': {
        if (node.header !== undefined && typeof node.header !== 'boolean') fail()
        const rows = list(node.rows, MAX_TABLE_ROWS).map(row =>
          list(row, MAX_TABLE_CELLS).map(cell => inlines(cell)))
        return { type: 'table', header: node.header, rows }
      }
      case 'image': {
        const cap = caption(node.caption)
        if (typeof node.svg === 'string') {
          const svg = sanitizeSvg(node.svg)
          if (!svg) fail()
          return { type: 'image', svg, caption: cap }
        }
        if (typeof node.src !== 'string' || !isSafeAssetPath(node.src)) fail()
        return { type: 'image', src: node.src, caption: cap }
      }
      default:
        return fail()
    }
  }

  try {
    return { blocks: list(record(value).blocks, MAX_BLOCKS).map(block) }
  } catch (error) {
    if (error instanceof InvalidFragment) return null
    throw error
  }
}
