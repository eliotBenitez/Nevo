import type { NodeSpec } from 'prosemirror-model'

export const mathInlineNodeSpec: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: {
    latex: { default: '' },
    displayMode: { default: false },
  },
  parseDOM: [
    {
      tag: 'span[data-nevo-math-inline]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return {
          latex: dom.dataset.latex ?? dom.textContent ?? '',
          displayMode: dom.dataset.displayMode === 'true',
        }
      },
    },
  ],
  toDOM(node) {
    const latex = typeof node.attrs.latex === 'string' ? node.attrs.latex : ''
    const displayMode = node.attrs.displayMode === true
    return [
      'span',
      { 'data-nevo-math-inline': 'true', 'data-latex': latex, 'data-display-mode': displayMode ? 'true' : 'false' },
      latex,
    ]
  },
}

export const mathBlockNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  defining: true,
  attrs: {
    latex: { default: '' },
    displayMode: { default: true },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-math-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return {
          latex: dom.dataset.latex ?? dom.textContent ?? '',
          displayMode: dom.dataset.displayMode !== 'false',
        }
      },
    },
  ],
  toDOM(node) {
    const latex = typeof node.attrs.latex === 'string' ? node.attrs.latex : ''
    const displayMode = node.attrs.displayMode !== false
    return [
      'div',
      { 'data-nevo-math-block': 'true', 'data-latex': latex, 'data-display-mode': displayMode ? 'true' : 'false' },
      latex,
    ]
  },
}

export const imageBlockNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    src: { default: '' },
    alt: { default: '' },
    caption: { default: '' },
    sizePreset: { default: 'medium' },
    width: { default: null },
    align: { default: 'center' },
  },
  parseDOM: [
    {
      tag: 'figure[data-nevo-image-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        const image = dom.querySelector('img')
        const captionNode = dom.querySelector('figcaption')
        return {
          src: image?.getAttribute('src') ?? dom.dataset.src ?? '',
          alt: image?.getAttribute('alt') ?? dom.dataset.alt ?? '',
          caption: captionNode?.textContent ?? dom.dataset.caption ?? '',
          sizePreset: dom.dataset.sizePreset ?? 'medium',
          width: dom.dataset.width ?? null,
          align: dom.dataset.align ?? 'center',
        }
      },
    },
  ],
  toDOM(node) {
    const src = typeof node.attrs.src === 'string' ? node.attrs.src : ''
    const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : ''
    const caption = typeof node.attrs.caption === 'string' ? node.attrs.caption : ''
    const sizePreset = typeof node.attrs.sizePreset === 'string' ? node.attrs.sizePreset : 'medium'
    const width = typeof node.attrs.width === 'number' || typeof node.attrs.width === 'string' ? String(node.attrs.width) : ''
    const align = typeof node.attrs.align === 'string' ? node.attrs.align : 'center'
    return [
      'figure',
      {
        'data-nevo-image-block': 'true',
        'data-src': src,
        'data-alt': alt,
        'data-caption': caption,
        'data-size-preset': sizePreset,
        'data-align': align,
        ...(width ? { 'data-width': width } : {}),
      },
      ['img', { src, alt }],
      ['figcaption', {}, caption],
    ]
  },
}

export const fileBlockNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    src: { default: '' },
    filename: { default: '' },
    mime: { default: '' },
    size: { default: 0 },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-file-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return {
          src: dom.dataset.src ?? '',
          filename: dom.dataset.filename ?? '',
          mime: dom.dataset.mime ?? '',
          size: Number(dom.dataset.size ?? 0),
        }
      },
    },
  ],
  toDOM(node) {
    const src = typeof node.attrs.src === 'string' ? node.attrs.src : ''
    const filename = typeof node.attrs.filename === 'string' ? node.attrs.filename : ''
    const mime = typeof node.attrs.mime === 'string' ? node.attrs.mime : ''
    const size = typeof node.attrs.size === 'number' ? String(node.attrs.size) : '0'
    return [
      'div',
      {
        'data-nevo-file-block': 'true',
        'data-src': src,
        'data-filename': filename,
        'data-mime': mime,
        'data-size': size,
      },
      filename || 'File attachment',
    ]
  },
}

export const mermaidBlockNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,
  attrs: {
    code: { default: 'graph TD\n  A --> B' },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-mermaid-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { code: dom.dataset.code ?? '' }
      },
    },
  ],
  toDOM(node) {
    const code = typeof node.attrs.code === 'string' ? node.attrs.code : ''
    return ['div', { 'data-nevo-mermaid-block': 'true', 'data-code': code }, code]
  },
}

export const vegaBlockNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,
  attrs: {
    spec: { default: '{}' },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-vega-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { spec: dom.dataset.spec ?? '{}' }
      },
    },
  ],
  toDOM(node) {
    const spec = typeof node.attrs.spec === 'string' ? node.attrs.spec : '{}'
    return ['div', { 'data-nevo-vega-block': 'true', 'data-spec': spec }, spec]
  },
}

export const markmapBlockNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,
  attrs: {
    markdown: { default: '# Topic\n## Idea A\n## Idea B' },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-markmap-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { markdown: dom.dataset.markdown ?? '' }
      },
    },
  ],
  toDOM(node) {
    const markdown = typeof node.attrs.markdown === 'string' ? node.attrs.markdown : ''
    return ['div', { 'data-nevo-markmap-block': 'true', 'data-markdown': markdown }, markdown]
  },
}

export const codeBlockNodeSpec: NodeSpec = {
  content: 'text*',
  marks: '',
  group: 'block',
  code: true,
  defining: true,
  attrs: {
    language: { default: null },
  },
  parseDOM: [
    {
      tag: 'pre',
      preserveWhitespace: 'full',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        const explicitLanguage = dom.dataset.language ?? dom.getAttribute('data-language')
        const classLanguage = Array.from(dom.classList)
          .map((className) => className.match(/^language-(.+)$/)?.[1] ?? null)
          .find((value): value is string => Boolean(value))
        return { language: explicitLanguage ?? classLanguage ?? null }
      },
    },
  ],
  toDOM(node) {
    const language = typeof node.attrs.language === 'string' && node.attrs.language.trim() ? node.attrs.language : null
    return ['pre', language ? { 'data-language': language, class: `language-${language}` } : {}, ['code', {}, 0]]
  },
}
