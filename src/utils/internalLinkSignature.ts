/** `noteId#anchor` of every `internal_link` mark on text nodes reached
 *  through `content`, in order — the same edges the Rust graph index keeps. */
export function internalLinkSignature(node: unknown): string {
  const parts: string[] = []
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    const current = value as { type?: unknown; marks?: unknown; content?: unknown }
    if (current.type === 'text' && Array.isArray(current.marks)) {
      const mark = current.marks.find(m => (m as { type?: unknown })?.type === 'internal_link') as
        { attrs?: { noteId?: unknown; anchor?: unknown } } | undefined
      if (mark) parts.push(`${String(mark.attrs?.noteId ?? '')}#${String(mark.attrs?.anchor ?? '')}`)
    }
    if (Array.isArray(current.content)) current.content.forEach(walk)
  }
  walk(node)
  return parts.join('|')
}
