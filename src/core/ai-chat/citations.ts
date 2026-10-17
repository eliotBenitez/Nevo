export type CitationPart = { kind: 'text'; value: string } | { kind: 'cite'; n: number }

const CITE = /\[(\d{1,3})\]/g

export function splitCitations(text: string): CitationPart[] {
  const parts: CitationPart[] = []
  let last = 0
  for (const m of text.matchAll(CITE)) {
    if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) })
    parts.push({ kind: 'cite', n: Number(m[1]) })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) })
  return parts
}

export function stripCitations(text: string): string {
  return text.replace(/[ \t]*(?:\[\d{1,3}\])+/g, '')
}
