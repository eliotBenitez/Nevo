import type { NodeSpec } from 'prosemirror-model'
import { normalizeQueryBlockData, readQueryBlockDataAttr, serializeQueryBlockData } from '../../features/query/queryBlockData'
import { readBlockIdAttr, withBlockIdAttr } from './blockIdAttr'

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
    id: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-math-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return {
          latex: dom.dataset.latex ?? dom.textContent ?? '',
          displayMode: dom.dataset.displayMode !== 'false',
          id: readBlockIdAttr(dom),
        }
      },
    },
  ],
  toDOM(node) {
    const latex = typeof node.attrs.latex === 'string' ? node.attrs.latex : ''
    const displayMode = node.attrs.displayMode !== false
    const attrs = withBlockIdAttr({ 'data-nevo-math-block': 'true', 'data-latex': latex, 'data-display-mode': displayMode ? 'true' : 'false' }, node.attrs.id)
    return ['div', attrs, latex]
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
    id: { default: null },
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
          id: readBlockIdAttr(dom),
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
    const attrs = withBlockIdAttr(
      {
        'data-nevo-image-block': 'true',
        'data-src': src,
        'data-alt': alt,
        'data-caption': caption,
        'data-size-preset': sizePreset,
        'data-align': align,
        ...(width ? { 'data-width': width } : {}),
      },
      node.attrs.id,
    )
    return [
      'figure',
      attrs,
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
    id: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-mermaid-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { code: dom.dataset.code ?? '', id: readBlockIdAttr(dom) }
      },
    },
  ],
  toDOM(node) {
    const code = typeof node.attrs.code === 'string' ? node.attrs.code : ''
    const attrs = withBlockIdAttr({ 'data-nevo-mermaid-block': 'true', 'data-code': code }, node.attrs.id)
    return ['div', attrs, code]
  },
}

export const drawBlockNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,
  attrs: {
    // Stable drawing id (uuid). Lets the canvas find and update the right
    // node after saving, and seeds the asset filename.
    drawId: { default: '' },
    // Relative path to the `.draw.json` asset (".nevo/assets/draw-<id>-<hash>.draw.json").
    // Empty until the first save on the canvas.
    src: { default: '' },
    // Inline SVG snapshot for the document preview — cheap to render in the
    // note without loading the (potentially large) stroke payload.
    svgPreview: { default: '' },
    // Optional caption shown under the drawing.
    title: { default: '' },
    id: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-draw-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return {
          drawId: dom.dataset.drawId ?? '',
          src: dom.dataset.src ?? '',
          svgPreview: dom.dataset.svgPreview ?? '',
          title: dom.dataset.title ?? '',
          id: readBlockIdAttr(dom),
        }
      },
    },
  ],
  toDOM(node) {
    const attrs: Record<string, string> = { 'data-nevo-draw-block': 'true' }
    if (node.attrs.drawId) attrs['data-draw-id'] = node.attrs.drawId
    if (node.attrs.src) attrs['data-src'] = node.attrs.src
    if (node.attrs.title) attrs['data-title'] = node.attrs.title
    // svgPreview can be large; keep it out of the DOM data-attrs to avoid
    // bloating the serialized HTML. The node-view renders it from the node.
    return ['div', withBlockIdAttr(attrs, node.attrs.id)]
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
    id: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-vega-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { spec: dom.dataset.spec ?? '{}', id: readBlockIdAttr(dom) }
      },
    },
  ],
  toDOM(node) {
    const spec = typeof node.attrs.spec === 'string' ? node.attrs.spec : '{}'
    const attrs = withBlockIdAttr({ 'data-nevo-vega-block': 'true', 'data-spec': spec }, node.attrs.id)
    return ['div', attrs, spec]
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
    id: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-markmap-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { markdown: dom.dataset.markdown ?? '', id: readBlockIdAttr(dom) }
      },
    },
  ],
  toDOM(node) {
    const markdown = typeof node.attrs.markdown === 'string' ? node.attrs.markdown : ''
    const attrs = withBlockIdAttr({ 'data-nevo-markmap-block': 'true', 'data-markdown': markdown }, node.attrs.id)
    return ['div', attrs, markdown]
  },
}

export const queryBlockNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  defining: true,
  attrs: {
    data: { default: null },
    id: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-query-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { data: readQueryBlockDataAttr(dom.dataset.query), id: readBlockIdAttr(dom) }
      },
    },
  ],
  toDOM(node) {
    const data = normalizeQueryBlockData(node.attrs.data)
    const attrs = withBlockIdAttr({ 'data-nevo-query-block': 'true', 'data-query': serializeQueryBlockData(data) }, node.attrs.id)
    return ['div', attrs, 'Query']
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
    id: { default: null },
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
        return { language: explicitLanguage ?? classLanguage ?? null, id: readBlockIdAttr(dom) }
      },
    },
  ],
  toDOM(node) {
    const language = typeof node.attrs.language === 'string' && node.attrs.language.trim() ? node.attrs.language : null
    const attrs = withBlockIdAttr(language ? { 'data-language': language, class: `language-${language}` } : {}, node.attrs.id)
    return ['pre', attrs, ['code', {}, 0]]
  },
}
