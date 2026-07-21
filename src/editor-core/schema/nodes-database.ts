import type { NodeSpec } from 'prosemirror-model'
import { normalizeDatabaseData, serializeDatabaseData, type DatabaseBlockData } from '../../types/database-block'

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
  },
  parseDOM: [
    {
      tag: 'div[data-nevo-database]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return false
        return { data: readData(dom.dataset.db) }
      },
    },
  ],
  toDOM(node) {
    const data = readData(node.attrs.data)
    return [
      'div',
      {
        'data-nevo-database': 'true',
        'data-db': data ? serializeDatabaseData(data) : '',
      },
      data?.title || 'Database',
    ]
  },
}
