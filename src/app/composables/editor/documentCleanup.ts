import type { Node } from 'prosemirror-model'
import type { Transaction } from 'prosemirror-state'
import { collectRemovedDatabaseIds, collectDatabaseIds } from '../../../editor-core/databaseCleanup'
import type { DatabaseRepository } from '../../../features/database/databaseRepository'
import { appLogger } from '../../../utils/logger'

const ASSET_SRC_PREFIX = '.nevo/assets/'

function assetSrcOf(node: Node): string | null {
  const src = node.attrs?.src
  return typeof src === 'string' && src.startsWith(ASSET_SRC_PREFIX) ? src : null
}

function collectAssetSrcs(doc: Node): Set<string> {
  const srcs = new Set<string>()
  doc.descendants((node) => {
    const src = assetSrcOf(node)
    if (src) srcs.add(src)
  })
  return srcs
}

/**
 * Asset srcs that disappeared in this transaction. Instead of walking the whole
 * document twice (before + after), we scan only the ranges the transaction
 * actually touched in the previous doc to gather candidate srcs; the full
 * after-doc scan runs only when at least one asset node was in a changed range.
 * For ordinary text edits there are no candidates, so neither walk happens.
 */
export function collectRemovedAssetSrcs(prevDoc: Node, transaction: Transaction): string[] {
  const candidates = new Set<string>()
  let doc = prevDoc
  for (const step of transaction.steps) {
    const map = step.getMap()
    map.forEach((oldStart, oldEnd) => {
      if (oldEnd <= oldStart) return
      doc.nodesBetween(oldStart, oldEnd, (node) => {
        const src = assetSrcOf(node)
        if (src) candidates.add(src)
      })
    })
    const result = step.apply(doc)
    if (result.doc) doc = result.doc
  }
  if (candidates.size === 0) return []
  // The same asset may still be referenced elsewhere or have been re-inserted,
  // so confirm against the resulting document before reporting it as removed.
  const stillPresent = collectAssetSrcs(transaction.doc)
  return [...candidates].filter((src) => !stillPresent.has(src))
}

export interface DatabaseCleanup {
  setRepository(repository: DatabaseRepository | null): void
  /**
   * Queue database blocks removed by a transaction for deferred deletion, then
   * cancel any pending deletion whose id is still (or again) present in the live
   * doc — so an undo or cut/paste that restores a database block never wipes its
   * records.
   */
  recordRemoved(prevDoc: Node, transaction: Transaction, nextDoc: Node): void
  /**
   * Delete records for database blocks that were removed and not restored. Run on
   * disk save. Blocks still present in `liveDoc` are kept.
   */
  flush(liveDoc: Node | null, workspacePath: string | null): void
}

/**
 * Tracks database blocks removed from the document so their backing records can
 * be deleted on save, deferring the delete so undo/paste that restores a block
 * cancels it. Extracted from `useEditorCore` to keep the transaction side effects
 * (asset + database reference cleanup) in one framework-agnostic place.
 */
export function createDatabaseCleanup(): DatabaseCleanup {
  const pendingDeletions = new Set<string>()
  let repository: DatabaseRepository | null = null

  function setRepository(next: DatabaseRepository | null): void {
    repository = next
  }

  function recordRemoved(prevDoc: Node, transaction: Transaction, nextDoc: Node): void {
    for (const databaseId of collectRemovedDatabaseIds(prevDoc, transaction)) {
      pendingDeletions.add(databaseId)
    }
    if (pendingDeletions.size > 0) {
      for (const liveId of collectDatabaseIds(nextDoc)) pendingDeletions.delete(liveId)
    }
  }

  function flush(liveDoc: Node | null, workspacePath: string | null): void {
    if (pendingDeletions.size === 0 || !repository) return
    const activeRepository = repository
    const liveIds = liveDoc ? collectDatabaseIds(liveDoc) : new Set<string>()
    for (const databaseId of [...pendingDeletions]) {
      pendingDeletions.delete(databaseId)
      if (liveIds.has(databaseId)) continue
      void activeRepository.deleteDatabase(databaseId).catch((error) => {
        void appLogger.warn({
          source: 'frontend.editor',
          event: 'database_cleanup_failed',
          message: `Failed to remove database records for ${databaseId}`,
          workspacePath,
          error,
        })
      })
    }
  }

  return { setRepository, recordRemoved, flush }
}
