import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useWorkspaceStore } from './workspace'
import { useTreeStore } from './tree'
import type { BacklinkRef, GraphEdge } from '../types/graph'
import { appLogger } from '../utils/logger'

export const useGraphStore = defineStore('graph', () => {
  const workspaceStore = useWorkspaceStore()
  const treeStore = useTreeStore()

  const backlinks = ref<BacklinkRef[]>([])
  const outlinks = ref<GraphEdge[]>([])
  const activeNoteId = ref<string | null>(null)
  let loadGeneration = 0

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
    const generation = ++loadGeneration
    activeNoteId.value = noteId
    backlinks.value = []
    outlinks.value = []
    const backend = workspaceStore.backend
    if (!backend) return

    try {
      const [bl, ol] = await Promise.all([
        backend.graphGetBacklinks(noteId),
        backend.graphGetOutlinks(noteId),
      ])
      if (generation !== loadGeneration) return
      activeNoteId.value = noteId
      backlinks.value = enrichBacklinks(bl)
      outlinks.value = ol
    } catch (error) {
      await appLogger.error({
        source: 'frontend.graph',
        event: 'load_note_graph',
        message: 'Failed to load note graph',
        error,
      })
    }
  }

  /** Re-reads the active note's outlinks after a save; the backend's save
   *  path is the only writer of the link index. */
  async function refreshOutlinks(noteId: string) {
    const generation = loadGeneration
    const backend = workspaceStore.backend
    if (!backend || activeNoteId.value !== noteId) return
    try {
      const nextOutlinks = await backend.graphGetOutlinks(noteId)
      if (activeNoteId.value === noteId && generation === loadGeneration) {
        outlinks.value = nextOutlinks
      }
    } catch (error) {
      await appLogger.error({
        source: 'frontend.graph',
        event: 'refresh_outlinks',
        message: 'Failed to refresh note outlinks',
        error,
      })
    }
  }

  async function removeNote(noteId: string) {
    const backend = workspaceStore.backend
    if (!backend) return
    try {
      await backend.graphRemoveNote(noteId)
      if (activeNoteId.value === noteId) {
        backlinks.value = []
        outlinks.value = []
      }
    } catch (error) {
      await appLogger.error({
        source: 'frontend.graph',
        event: 'remove_note',
        message: 'Failed to remove note from graph',
        error,
      })
    }
  }

  function clear() {
    loadGeneration++
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
    removeNote,
    clear,
  }
})
