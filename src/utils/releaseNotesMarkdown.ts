// Tiny, dependency-free Markdown renderer for release notes shown in the
// updater dialog. The input comes from the network (GitHub release body), so
// everything is HTML-escaped first and only a safe subset of Markdown is then
// re-introduced as our own generated markup. The output is intended for
// `v-html` and never contains attributes or tags we did not emit ourselves.

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Inline formatting is applied to text that is already HTML-escaped, so the
// only `<`/`>` present are the ones we add here.
function renderInline(escaped: string): string {
  let out = escaped

  // Inline code first so its contents are not touched by other rules.
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`)

  // Links [text](http(s)://…) — only http/https targets are allowed.
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text, href) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`,
  )

  // Bold then italic. `**` handled before single `*`/`_`.
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, t) => `<strong>${t}</strong>`)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, (_m, pre, t) => `${pre}<em>${t}</em>`)
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, (_m, pre, t) => `${pre}<em>${t}</em>`)

  return out
}

/**
 * Render a Markdown release-notes string to a safe HTML fragment.
 * Supported: headings (#..###), bullet lists (-, *), ordered lists (1.),
 * bold/italic, inline code, http(s) links, paragraphs.
 */
export function renderReleaseNotesHtml(md: string): string {
  const lines = escapeHtml(md.replace(/\r\n/g, '\n')).split('\n')
  const html: string[] = []

  type ListKind = 'ul' | 'ol'
  let listKind: ListKind | null = null
  let paragraph: string[] = []

  function flushParagraph() {
    if (!paragraph.length) return
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  function closeList() {
    if (!listKind) return
    html.push(`</${listKind}>`)
    listKind = null
  }

  function openList(kind: ListKind) {
    if (listKind === kind) return
    closeList()
    html.push(`<${kind}>`)
    listKind = kind
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    // Blank line: paragraph / list break.
    if (!line.trim()) {
      flushParagraph()
      closeList()
      continue
    }

    // Heading: #, ##, ### → compact h4/h5 for the modal.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim())
    if (heading) {
      flushParagraph()
      closeList()
      const tag = heading[1].length <= 1 ? 'h4' : 'h5'
      html.push(`<${tag}>${renderInline(heading[2])}</${tag}>`)
      continue
    }

    // Bullet list item: "- " or "* ".
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      flushParagraph()
      openList('ul')
      html.push(`<li>${renderInline(bullet[1])}</li>`)
      continue
    }

    // Ordered list item: "1. ", "2) " etc.
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (ordered) {
      flushParagraph()
      openList('ol')
      html.push(`<li>${renderInline(ordered[1])}</li>`)
      continue
    }

    // Plain text → accumulate into the current paragraph.
    closeList()
    paragraph.push(line.trim())
  }

  flushParagraph()
  closeList()

  return html.join('')
}
