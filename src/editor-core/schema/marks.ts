import type { MarkSpec } from 'prosemirror-model'

/**
 * Returns true when the CSS color value represents a default/near-black
 * foreground that external apps embed in clipboard HTML.  Treating these
 * as "no explicit colour" prevents pasted text from receiving an inline
 * `color` that overrides the editor's dark-theme text colour.
 */
function isDefaultBlackColor(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  if (['black', 'initial', 'inherit', 'unset', 'currentcolor', 'windowtext'].includes(v)) return true
  // #000, #000000, #00000000 (with optional alpha)
  if (/^#0{3,8}$/.test(v)) return true
  // rgb(0, 0, 0) / rgba(0, 0, 0, …)
  const rgbMatch = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbMatch && rgbMatch[1] === '0' && rgbMatch[2] === '0' && rgbMatch[3] === '0') return true
  // Very dark greys — r,g,b all ≤ 25 (~10% lightness)
  if (rgbMatch) {
    const r = Number(rgbMatch[1])
    const g = Number(rgbMatch[2])
    const b = Number(rgbMatch[3])
    if (r <= 25 && g <= 25 && b <= 25) return true
  }
  return false
}

export const strikeMarkSpec: MarkSpec = {
  parseDOM: [
    { tag: 's' },
    { tag: 'strike' },
    { style: 'text-decoration=line-through' },
  ],
  toDOM: () => ['s', 0],
}

export const underlineMarkSpec: MarkSpec = {
  parseDOM: [
    { tag: 'u' },
    { style: 'text-decoration=underline' },
  ],
  toDOM: () => ['u', 0],
}

export const highlightMarkSpec: MarkSpec = {
  attrs: { color: { default: '#fef08a' } },
  excludes: 'highlight',
  parseDOM: [
    {
      tag: 'mark',
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return { color: el.style.backgroundColor || '#fef08a' }
      },
    },
  ],
  toDOM: (mark) => ['mark', { style: `background-color: ${mark.attrs.color}` }, 0],
}

export const textColorMarkSpec: MarkSpec = {
  attrs: { color: {} },
  excludes: 'text_color',
  parseDOM: [
    {
      style: 'color',
      getAttrs: (value) => {
        const color = value as string
        if (isDefaultBlackColor(color)) return false
        return { color }
      },
    },
  ],
  toDOM: (mark) => ['span', { style: `color: ${mark.attrs.color}` }, 0],
}

export const superscriptMarkSpec: MarkSpec = {
  excludes: 'subscript',
  parseDOM: [{ tag: 'sup' }],
  toDOM: () => ['sup', 0],
}

export const subscriptMarkSpec: MarkSpec = {
  excludes: 'superscript',
  parseDOM: [{ tag: 'sub' }],
  toDOM: () => ['sub', 0],
}

export const internalLinkMarkSpec: MarkSpec = {
  attrs: {
    noteId: { default: '' },
    anchor: { default: null },
    // Target note title — preserved for wiki-style `[[Title]]` round-trip
    // (import/export) and for resolving the link when noteId is unknown.
    title: { default: null },
    // Optional alias: visible text differs from the target title
    // (i.e. `[[Title|Alias]]` in Markdown). Null means "use title as text".
    alias: { default: null },
  },
  inclusive: false,
  parseDOM: [
    {
      tag: 'a[data-note-id]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return {
          noteId: el.getAttribute('data-note-id') ?? '',
          anchor: el.getAttribute('data-anchor') || null,
          title: el.getAttribute('data-title') || null,
          alias: el.getAttribute('data-alias') || null,
        }
      },
    },
  ],
  toDOM: (mark) => [
    'a',
    {
      'data-note-id': mark.attrs.noteId,
      ...(mark.attrs.anchor ? { 'data-anchor': mark.attrs.anchor } : {}),
      ...(mark.attrs.title ? { 'data-title': mark.attrs.title } : {}),
      ...(mark.attrs.alias ? { 'data-alias': mark.attrs.alias } : {}),
      class: 'nv-internal-link',
    },
    0,
  ],
}

export const kbdMarkSpec: MarkSpec = {
  parseDOM: [{ tag: 'kbd' }],
  toDOM: () => ['kbd', { class: 'nv-kbd' }, 0],
}

export const tagMarkSpec: MarkSpec = {
  parseDOM: [{ tag: 'span.nv-tag' }],
  toDOM: () => ['span', { class: 'nv-tag' }, 0],
}
