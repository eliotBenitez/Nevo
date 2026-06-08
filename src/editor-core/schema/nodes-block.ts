import type { NodeSpec } from 'prosemirror-model'

export const calloutNodeSpec: NodeSpec = {
  group: 'block',
  content: 'block+',
  attrs: {
    variant: { default: 'info' },
    icon: { default: '💡' },
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
        }
      },
    },
  ],
  toDOM(node) {
    const variant = typeof node.attrs.variant === 'string' ? node.attrs.variant : 'info'
    const icon = typeof node.attrs.icon === 'string' ? node.attrs.icon : '💡'
    return [
      'div',
      { 'data-nevo-callout': 'true', 'data-variant': variant, 'data-icon': icon },
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
  },
  defining: true,
  parseDOM: [
    {
      tag: 'div[data-nevo-checklist-item]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { checked: dom.dataset.checked === 'true' }
      },
    },
  ],
  toDOM(node) {
    const checked = node.attrs.checked === true
    return [
      'div',
      { 'data-nevo-checklist-item': 'true', 'data-checked': checked ? 'true' : 'false' },
      ['span', { 'data-checklist-indicator': 'true' }, checked ? '☑' : '☐'],
      ['div', { 'data-checklist-content': 'true' }, 0],
    ]
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
  },
  content: 'inline*',
  group: 'block',
  defining: true,
  parseDOM: [
    { tag: 'h1', getAttrs: (dom) => ({ level: 1, collapsed: (dom as HTMLElement).dataset.collapsed === 'true' }) },
    { tag: 'h2', getAttrs: (dom) => ({ level: 2, collapsed: (dom as HTMLElement).dataset.collapsed === 'true' }) },
    { tag: 'h3', getAttrs: (dom) => ({ level: 3, collapsed: (dom as HTMLElement).dataset.collapsed === 'true' }) },
    { tag: 'h4', getAttrs: (dom) => ({ level: 4, collapsed: (dom as HTMLElement).dataset.collapsed === 'true' }) },
    { tag: 'h5', getAttrs: (dom) => ({ level: 5, collapsed: (dom as HTMLElement).dataset.collapsed === 'true' }) },
    { tag: 'h6', getAttrs: (dom) => ({ level: 6, collapsed: (dom as HTMLElement).dataset.collapsed === 'true' }) },
  ],
  toDOM(node) {
    return ['h' + node.attrs.level, { 'data-collapsed': node.attrs.collapsed ? 'true' : 'false' }, 0]
  },
}
