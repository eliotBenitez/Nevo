import type { NodeSpec } from 'prosemirror-model'

export const noteEmbedNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    noteId: { default: '' },
    title: { default: '' },
    previewText: { default: '' },
    icon: { default: '' },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-note-embed]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return {
          noteId: dom.dataset.noteId ?? '',
          title: dom.dataset.title ?? '',
          previewText: dom.dataset.previewText ?? '',
          icon: dom.dataset.icon ?? '',
        }
      },
    },
  ],
  toDOM(node) {
    const noteId = typeof node.attrs.noteId === 'string' ? node.attrs.noteId : ''
    const title = typeof node.attrs.title === 'string' ? node.attrs.title : ''
    const previewText = typeof node.attrs.previewText === 'string' ? node.attrs.previewText : ''
    const icon = typeof node.attrs.icon === 'string' ? node.attrs.icon : ''
    return [
      'div',
      {
        'data-nevo-note-embed': 'true',
        'data-note-id': noteId,
        'data-title': title,
        'data-preview-text': previewText,
        'data-icon': icon,
      },
      title || 'Note embed',
    ]
  },
}

export const embedBlockNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    url: { default: '' },
    embedType: { default: '' },
    embedHtml: { default: '' },
    title: { default: '' },
    thumbnailUrl: { default: '' },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-embed]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return {
          url: dom.dataset.url ?? '',
          embedType: dom.dataset.embedType ?? '',
          embedHtml: dom.dataset.embedHtml ?? '',
          title: dom.dataset.title ?? '',
          thumbnailUrl: dom.dataset.thumbnailUrl ?? '',
        }
      },
    },
  ],
  toDOM(node) {
    const url = typeof node.attrs.url === 'string' ? node.attrs.url : ''
    const embedType = typeof node.attrs.embedType === 'string' ? node.attrs.embedType : ''
    const embedHtml = typeof node.attrs.embedHtml === 'string' ? node.attrs.embedHtml : ''
    const title = typeof node.attrs.title === 'string' ? node.attrs.title : ''
    const thumbnailUrl = typeof node.attrs.thumbnailUrl === 'string' ? node.attrs.thumbnailUrl : ''
    return [
      'div',
      {
        'data-nevo-embed': 'true',
        'data-url': url,
        'data-embed-type': embedType,
        'data-embed-html': embedHtml,
        'data-title': title,
        'data-thumbnail-url': thumbnailUrl,
      },
      title || 'Embed',
    ]
  },
}

export const mediaBlockNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    kind: { default: 'audio' },
    src: { default: '' },
    name: { default: '' },
    mime: { default: '' },
    size: { default: 0 },
    duration: { default: null },
    poster: { default: '' },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-media-block]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return {
          kind: dom.dataset.kind ?? 'audio',
          src: dom.dataset.src ?? '',
          name: dom.dataset.name ?? '',
          mime: dom.dataset.mime ?? '',
          size: Number(dom.dataset.size ?? 0),
          duration: dom.dataset.duration ? Number(dom.dataset.duration) : null,
          poster: dom.dataset.poster ?? '',
        }
      },
    },
  ],
  toDOM(node) {
    const kind = typeof node.attrs.kind === 'string' ? node.attrs.kind : 'audio'
    const src = typeof node.attrs.src === 'string' ? node.attrs.src : ''
    const name = typeof node.attrs.name === 'string' ? node.attrs.name : ''
    const mime = typeof node.attrs.mime === 'string' ? node.attrs.mime : ''
    const size = typeof node.attrs.size === 'number' ? String(node.attrs.size) : '0'
    const duration = typeof node.attrs.duration === 'number' ? String(node.attrs.duration) : ''
    const poster = typeof node.attrs.poster === 'string' ? node.attrs.poster : ''
    return [
      'div',
      {
        'data-nevo-media-block': 'true',
        'data-kind': kind,
        'data-src': src,
        'data-name': name,
        'data-mime': mime,
        'data-size': size,
        ...(duration ? { 'data-duration': duration } : {}),
        ...(poster ? { 'data-poster': poster } : {}),
      },
      name || (kind === 'video' ? 'Video' : 'Audio'),
    ]
  },
}
