import type { BlockNode } from '../../types/note'

export interface OutlineItem {
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  index: number
  sectionWords: number
}

export interface ExternalLink {
  text: string
  url: string
}

function extractText(node: BlockNode): string {
  if (node.text) return node.text
  return node.content?.map(extractText).join('') ?? ''
}

function countNodeWords(node: BlockNode): number {
  let count = 0
  const walk = (n: BlockNode) => {
    if (n.text) {
      const trimmed = n.text.trim()
      if (trimmed) count += trimmed.split(/\s+/).length
    }
    n.content?.forEach(walk)
  }
  walk(node)
  return count
}

/** Flattens column containers so headings nested inside columns are still picked up. */
function flattenBlocks(nodes: BlockNode[]): BlockNode[] {
  const out: BlockNode[] = []
  for (const node of nodes) {
    if (node.type === 'column_list' || node.type === 'column') {
      out.push(...flattenBlocks(node.content ?? []))
    } else {
      out.push(node)
    }
  }
  return out
}

/**
 * Extracts all heading nodes from a note's BlockNode tree.
 * Each item includes the word count of its section (content until the next heading).
 */
export function extractOutline(content: BlockNode): OutlineItem[] {
  const topLevel = flattenBlocks(content.content ?? [])
  const items: OutlineItem[] = []
  let index = 0

  for (const node of topLevel) {
    if (node.type === 'heading') {
      items.push({
        level: ((node.attrs?.level as number) || 1) as OutlineItem['level'],
        text: extractText(node).trim(),
        index: index++,
        sectionWords: 0,
      })
    } else if (items.length > 0) {
      items[items.length - 1].sectionWords += countNodeWords(node)
    }
  }

  return items
}

/** Counts all words across all text leaves in a BlockNode tree. */
export function countWords(content: BlockNode): number {
  return (content.content ?? []).reduce((acc, node) => acc + countNodeWords(node), 0)
}

/** Extracts unique external http/https links from the note content. */
export function extractExternalLinks(content: BlockNode): ExternalLink[] {
  const links: ExternalLink[] = []
  const seen = new Set<string>()

  const walk = (node: BlockNode) => {
    if (node.text && node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'link') {
          const href = mark.attrs?.href as string | undefined
          if (href && (href.startsWith('http://') || href.startsWith('https://')) && !seen.has(href)) {
            seen.add(href)
            links.push({ text: node.text, url: href })
          }
        }
      }
    }
    node.content?.forEach(walk)
  }

  content.content?.forEach(walk)
  return links
}
