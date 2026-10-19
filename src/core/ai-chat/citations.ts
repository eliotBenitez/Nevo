export type CitationPart = { kind: 'text'; value: string } | { kind: 'cite'; n: number }

const CITE = /\[(\d{1,3})\]/g
// Fenced blocks and inline code spans: `[0]` there is an index, never a citation.
const CODE = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g

/** Splits text into code and prose runs so citation handling never touches code. */
function mapProse(text: string, prose: (run: string) => void, code: (run: string) => void): void {
  let last = 0
  for (const m of text.matchAll(CODE)) {
    if (m.index > last) prose(text.slice(last, m.index))
    code(m[0])
    last = m.index + m[0].length
  }
  if (last < text.length) prose(text.slice(last))
}

export function splitCitations(text: string): CitationPart[] {
  const parts: CitationPart[] = []
  const pushText = (value: string) => {
    const previous = parts.at(-1)
    if (previous?.kind === 'text') previous.value += value
    else parts.push({ kind: 'text', value })
  }
  mapProse(text, (run) => {
    let last = 0
    for (const m of run.matchAll(CITE)) {
      if (m.index > last) pushText(run.slice(last, m.index))
      parts.push({ kind: 'cite', n: Number(m[1]) })
      last = m.index + m[0].length
    }
    if (last < run.length) pushText(run.slice(last))
  }, pushText)
  return parts
}

export function stripCitations(text: string): string {
  let out = ''
  mapProse(text, (run) => { out += run.replace(/[ \t]*(?:\[\d{1,3}\])+/g, '') }, (run) => { out += run })
  return out
}
