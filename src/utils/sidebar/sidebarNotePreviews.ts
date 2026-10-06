import type { BlockNode, SidebarNotePreview } from '../../types/note'
import { applySidebarNoteOrder } from './reorder'

export type SidebarPreviewSortMode = 'manual' | 'name-asc' | 'name-desc' | 'updated'

const SKIPPED_BLOCK_TYPES = new Set([
  'doc',
  'image',
  'video',
  'audio',
  'file',
  'draw_block',
  'mermaid_block',
  'markmap_block',
  'vega_block',
  'math_display',
])

function appendBlockText(node: BlockNode, chunks: string[]) {
  if (typeof node.text === 'string') chunks.push(node.text)
  for (const child of node.content ?? []) appendBlockText(child, chunks)
}

function collectPreviewLines(node: BlockNode, lines: string[]) {
  if (node.type === 'text') return
  if (node.type !== 'doc' && !SKIPPED_BLOCK_TYPES.has(node.type)) {
    const chunks: string[] = []
    appendBlockText(node, chunks)
    const text = chunks.join(' ').replace(/\s+/g, ' ').trim()
    if (text) lines.push(text)
  }

  for (const child of node.content ?? []) collectPreviewLines(child, lines)
}

export function buildSidebarPreviewText(content: BlockNode | null | undefined, maxLength = 180): string {
  if (!content) return ''
  const lines: string[] = []
  collectPreviewLines(content, lines)
  const text = lines.join(' · ').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function normalizeSidebarTags(tags: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const tag of tags ?? []) {
    const trimmed = tag.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) continue
    seen.add(key)
    normalized.push(trimmed)
  }
  return normalized
}

function comparePreviewTitle(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export function sortSidebarPreviews(
  previews: readonly SidebarNotePreview[],
  mode: SidebarPreviewSortMode,
  order?: readonly string[],
): SidebarNotePreview[] {
  const cloned = previews.slice()
  if (mode === 'name-asc') return cloned.sort((a, b) => comparePreviewTitle(a.title, b.title))
  if (mode === 'name-desc') return cloned.sort((a, b) => comparePreviewTitle(b.title, a.title))
  if (mode === 'updated') return cloned.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  return applySidebarNoteOrder(cloned, order)
}

export function filterSidebarPreviewsByTags(
  previews: readonly SidebarNotePreview[],
  selectedTags: ReadonlySet<string>,
): SidebarNotePreview[] {
  const selected = new Set(Array.from(selectedTags, tag => tag.toLowerCase()))
  return previews
    .filter((preview) => {
      if (!selected.size) return true
      return preview.tags.some(tag => selected.has(tag.toLowerCase()))
    })
}

type PluralTranslate = (key: string, plural: number, options: { named: Record<string, unknown> }) => string

/**
 * Summary line for a notebook preview, whose ink has no text to show
 * ("Notebook · 3 pages"). Returns null for ordinary notes. The caller passes
 * vue-i18n's `t` and the plural choice resolver for its locale.
 */
export function notebookPreviewSummary(
  preview: Pick<SidebarNotePreview, 'documentKind' | 'notebookPageCount'>,
  t: PluralTranslate,
  pluralChoice: (count: number) => number,
): string | null {
  if (preview.documentKind !== 'notebook') return null
  const pages = preview.notebookPageCount ?? 0
  return t('workspace.sidebarPreview.notebookSummary', pluralChoice(pages), { named: { total: pages } })
}
