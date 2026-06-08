import type { NodeSpec } from 'prosemirror-model'

/** A horizontal row of `column` nodes. Lives at the block level like any other block. */
export const columnListNodeSpec: NodeSpec = {
  group: 'block',
  content: 'column+',
  defining: true,
  isolating: true,
  parseDOM: [{ tag: 'div[data-nevo-column-list]' }],
  toDOM() {
    return ['div', { 'data-nevo-column-list': 'true' }, 0]
  },
}

/**
 * A single cell inside a `column_list`. Has no group, so it is only ever valid as a child
 * of `column_list` (never at the top level). `width` is a flex-grow factor — equal columns
 * when all widths match.
 */
export const columnNodeSpec: NodeSpec = {
  content: 'block+',
  defining: true,
  isolating: true,
  attrs: {
    width: { default: 1 },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-column]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        const width = Number(dom.dataset.width)
        return { width: Number.isFinite(width) && width > 0 ? width : 1 }
      },
    },
  ],
  toDOM(node) {
    const width = typeof node.attrs.width === 'number' && node.attrs.width > 0 ? node.attrs.width : 1
    return [
      'div',
      { 'data-nevo-column': 'true', 'data-width': String(width), style: `flex: ${width} 1 0` },
      0,
    ]
  },
}
