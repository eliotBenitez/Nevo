import type { MarkSpec } from 'prosemirror-model'

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
      getAttrs: (value) => ({ color: value as string }),
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
