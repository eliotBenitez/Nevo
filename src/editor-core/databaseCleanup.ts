import type { Node as PMNode } from 'prosemirror-model'
import type { Transaction } from 'prosemirror-state'
import { normalizeDatabaseData } from '../types/database-block'

function databaseIdOf(node: PMNode): string | null {
  if (node.type.name !== 'database_block') return null
  const data = normalizeDatabaseData(node.attrs.data)
  return data.version === 2 ? data.databaseId : null
}

/** Every v2 database store id currently referenced anywhere in `doc`. */
export function collectDatabaseIds(doc: PMNode): Set<string> {
  const ids = new Set<string>()
  doc.descendants(node => {
    const id = databaseIdOf(node)
    if (id) ids.add(id)
  })
  return ids
}

/**
 * Finds v2 database stores whose nodes were removed by a transaction and are
 * no longer referenced anywhere in its resulting document. This deliberately
 * ignores move/replace transactions which temporarily remove a node.
 */
export function collectRemovedDatabaseIds(previousDoc: PMNode, transaction: Transaction): string[] {
  const candidates = new Set<string>()
  let doc = previousDoc

  for (const step of transaction.steps) {
    const map = step.getMap()
    map.forEach((oldStart, oldEnd) => {
      if (oldEnd <= oldStart) return
      doc.nodesBetween(oldStart, oldEnd, node => {
        const id = databaseIdOf(node)
        if (id) candidates.add(id)
      })
    })
    const result = step.apply(doc)
    if (result.doc) doc = result.doc
  }

  const retained = collectDatabaseIds(transaction.doc)
  return [...candidates].filter(id => !retained.has(id))
}
