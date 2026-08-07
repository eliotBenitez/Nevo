import type { NodeSpec } from 'prosemirror-model'
import { normalizeDatabaseData, serializeDatabaseData, type DatabaseBlockData } from '../../types/database-block'
import { readBlockIdAttr, withBlockIdAttr } from './blockIdAttr'

function readData(value: unknown): DatabaseBlockData | null {
  if (value == null) return null
  if (typeof value === 'string') {
    if (!value.trim()) return null
    try {
      return normalizeDatabaseData(JSON.parse(value))
    } catch {
      return null
    }
  }
  if (typeof value === 'object') return normalizeDatabaseData(value)
  return null
}

export const databaseNodeSpec: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    data: { default: null },
    id: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-database]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { data: readData(dom.dataset.db), id: readBlockIdAttr(dom) }
      },
    },
  ],
  toDOM(node) {
    const data = readData(node.attrs.data)
    const attrs = withBlockIdAttr(
      {
        'data-nevo-database': 'true',
        'data-db': data ? serializeDatabaseData(data) : '',
      },
      node.attrs.id,
    )
    return ['div', attrs, data?.title || 'Database']
  },
}
