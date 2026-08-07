import type { NodeSpec } from 'prosemirror-model'
import { readBlockIdAttr, withBlockIdAttr } from './blockIdAttr'

export const calloutNodeSpec: NodeSpec = {
  group: 'block',
  content: 'block+',
  attrs: {
    variant: { default: 'info' },
    icon: { default: '💡' },
    // Lazily-assigned stable id, set only once this block becomes a
    // reference target (see plugins/blockIds.ts). Null for most blocks.
    id: { default: null },
  },
  defining: true,
  parseDOM: [
    {
      tag: 'div[data-nevo-callout]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return {
          variant: dom.dataset.variant ?? 'info',
          icon: dom.dataset.icon ?? '💡',
          id: readBlockIdAttr(dom),
        }
      },
    },
  ],
  toDOM(node) {
    const variant = typeof node.attrs.variant === 'string' ? node.attrs.variant : 'info'
    const icon = typeof node.attrs.icon === 'string' ? node.attrs.icon : '💡'
    const attrs = withBlockIdAttr({ 'data-nevo-callout': 'true', 'data-variant': variant, 'data-icon': icon }, node.attrs.id)
    return [
      'div',
      attrs,
      ['span', { 'data-callout-icon': 'true' }, icon],
      ['div', { 'data-callout-content': 'true' }, 0],
    ]
  },
}

export const checklistItemNodeSpec: NodeSpec = {
  group: 'block',
  content: 'inline*',
  attrs: {
    checked: { default: false },
    id: { default: null },
  },
  defining: true,
  parseDOM: [
    {
      tag: 'div[data-nevo-checklist-item]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { checked: dom.dataset.checked === 'true', id: readBlockIdAttr(dom) }
      },
    },
  ],
  toDOM(node) {
    const checked = node.attrs.checked === true
    const attrs = withBlockIdAttr({ 'data-nevo-checklist-item': 'true', 'data-checked': checked ? 'true' : 'false' }, node.attrs.id)
    return [
      'div',
      attrs,
      ['span', { 'data-checklist-indicator': 'true' }, checked ? '☑' : '☐'],
      ['div', { 'data-checklist-content': 'true' }, 0],
    ]
  },
}

export const paragraphNodeSpec: NodeSpec = {
  content: 'inline*',
  group: 'block',
  attrs: {
    id: { default: null },
  },
  parseDOM: [
    {
      tag: 'p',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return null
        return { id: readBlockIdAttr(dom) }
      },
    },
  ],
  toDOM(node) {
    return ['p', withBlockIdAttr({}, node.attrs.id), 0]
  },
}

export const blockquoteNodeSpec: NodeSpec = {
  content: 'block+',
  group: 'block',
  defining: true,
  attrs: {
    id: { default: null },
  },
  parseDOM: [
    {
      tag: 'blockquote',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return null
        return { id: readBlockIdAttr(dom) }
      },
    },
  ],
  toDOM(node) {
    return ['blockquote', withBlockIdAttr({}, node.attrs.id), 0]
  },
}

export const dividerNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  parseDOM: [{ tag: 'hr[data-nevo-divider]' }],
  toDOM() {
    return ['hr', { 'data-nevo-divider': 'true' }]
  },
}

export const toggleNodeSpec: NodeSpec = {
  group: 'block',
  content: 'toggle_title block+',
  defining: true,
  attrs: {
    collapsed: { default: false },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-toggle]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { collapsed: dom.dataset.collapsed === 'true' }
      },
    },
  ],
  toDOM(node) {
    return [
      'div',
      { 'data-nevo-toggle': 'true', 'data-collapsed': node.attrs.collapsed ? 'true' : 'false' },
      0,
    ]
  },
}

export const toggleTitleNodeSpec: NodeSpec = {
  group: 'block',
  content: 'inline*',
  defining: true,
  parseDOM: [{ tag: 'div[data-nevo-toggle-title]' }],
  toDOM() {
    return ['div', { 'data-nevo-toggle-title': 'true' }, 0]
  },
}

export const headingNodeSpec: NodeSpec = {
  attrs: {
    level: { default: 1 },
    collapsed: { default: false },
    id: { default: null },
  },
  content: 'inline*',
  group: 'block',
  defining: true,
  parseDOM: [
    { tag: 'h1', getAttrs: (dom) => ({ level: 1, collapsed: (dom as HTMLElement).dataset.collapsed === 'true', id: readBlockIdAttr(dom as HTMLElement) }) },
    { tag: 'h2', getAttrs: (dom) => ({ level: 2, collapsed: (dom as HTMLElement).dataset.collapsed === 'true', id: readBlockIdAttr(dom as HTMLElement) }) },
    { tag: 'h3', getAttrs: (dom) => ({ level: 3, collapsed: (dom as HTMLElement).dataset.collapsed === 'true', id: readBlockIdAttr(dom as HTMLElement) }) },
    { tag: 'h4', getAttrs: (dom) => ({ level: 4, collapsed: (dom as HTMLElement).dataset.collapsed === 'true', id: readBlockIdAttr(dom as HTMLElement) }) },
    { tag: 'h5', getAttrs: (dom) => ({ level: 5, collapsed: (dom as HTMLElement).dataset.collapsed === 'true', id: readBlockIdAttr(dom as HTMLElement) }) },
    { tag: 'h6', getAttrs: (dom) => ({ level: 6, collapsed: (dom as HTMLElement).dataset.collapsed === 'true', id: readBlockIdAttr(dom as HTMLElement) }) },
  ],
  toDOM(node) {
    const attrs = withBlockIdAttr({ 'data-collapsed': node.attrs.collapsed ? 'true' : 'false' }, node.attrs.id)
    return ['h' + node.attrs.level, attrs, 0]
  },
}
