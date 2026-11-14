import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useWorkspaceStore } from './workspace'
import { useTreeStore } from './tree'
import type { BacklinkRef, GraphEdge } from '../types/graph'
import { appLogger } from '../utils/logger'
import { internalLinkSignature } from '../utils/internalLinkSignature'

export const useGraphStore = defineStore('graph', () => {
  const workspaceStore = useWorkspaceStore()
  const treeStore = useTreeStore()

  const backlinks = ref<BacklinkRef[]>([])
  const outlinks = ref<GraphEdge[]>([])
  const activeNoteId = ref<string | null>(null)
  let loadGeneration = 0
  // Per-list request counters: an older response for the same note must not
  // overwrite a newer one that resolved first.
  let backlinksRequest = 0
  let outlinksRequest = 0
  // Internal-link signature of the content each note last refreshed for.
  const lastLinkSignature = new Map<string, string>()

  // The local Rust graph index stores empty title/icon for backlink sources
  // (only the cloud backend enriches them). Fill missing metadata from the
  // workspace manifest so the panel shows real titles/icons on every backend.
  function enrichBacklinks(refs: BacklinkRef[]): BacklinkRef[] {
    return refs.map((entry) => {
      if (entry.sourceTitle && entry.sourceIcon) return entry
      const meta = treeStore.noteById.get(entry.sourceId)
      if (!meta) return entry
      return {
        ...entry,
        sourceTitle: entry.sourceTitle || meta.title,
        sourceIcon: entry.sourceIcon || meta.icon,
      }
    })
  }

  async function loadNoteGraph(noteId: string) {
    ++loadGeneration
    activeNoteId.value = noteId
    backlinks.value = []
    outlinks.value = []
    // A fresh load may show links a later save's content matches; never skip after it.
    lastLinkSignature.delete(noteId)
    await refreshActiveNote()
  }

  /** Re-reads the active note's links in place, keeping the current lists
   *  until the new ones arrive (no empty flash). The single fetch path for
   *  opening a note, refreshing after a delete, and re-reading after a save. */
  async function refreshActiveNote(options: { backlinks?: boolean } = {}): Promise<boolean> {
    const noteId = activeNoteId.value
    const generation = loadGeneration
    const backend = workspaceStore.backend
    if (!backend || !noteId) return false
    const backlinksTicket = options.backlinks === false ? null : ++backlinksRequest
    const outlinksTicket = ++outlinksRequest
    try {
      const [bl, ol] = await Promise.all([
        backlinksTicket === null ? null : backend.graphGetBacklinks(noteId),
        backend.graphGetOutlinks(noteId),
      ])
      if (activeNoteId.value !== noteId || generation !== loadGeneration) return false
      if (bl && backlinksTicket === backlinksRequest) backlinks.value = enrichBacklinks(bl)
      if (outlinksTicket !== outlinksRequest) return false
      outlinks.value = ol
      return true
    } catch (error) {
      await appLogger.error({
        source: 'frontend.graph',
        event: 'load_note_graph',
        message: 'Failed to load note graph',
        error,
      })
      return false
    }
  }

  /** Re-reads the active note's outlinks after a save; the backend's save
   *  path is the only writer of the link index. With the saved `content`,
   *  a save whose internal links match the last refresh skips the IPC. */
  async function refreshOutlinks(noteId: string, content?: unknown) {
    if (activeNoteId.value !== noteId) return
    const signature = content === undefined ? null : internalLinkSignature(content)
    if (signature !== null && lastLinkSignature.get(noteId) === signature) return
    // Recorded only once the panel actually shows this save's links.
    lastLinkSignature.delete(noteId)
    if (await refreshActiveNote({ backlinks: false }) && signature !== null) lastLinkSignature.set(noteId, signature)
  }

  function clear() {
    loadGeneration++
    lastLinkSignature.clear()
    backlinks.value = []
    outlinks.value = []
    activeNoteId.value = null
  }

  return {
    backlinks,
    outlinks,
    activeNoteId,
    loadNoteGraph,
    refreshOutlinks,
    refreshActiveNote,
    clear,
  }
})
