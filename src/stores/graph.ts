import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useWorkspaceStore } from './workspace'
import type { BacklinkRef, GraphEdge, ExtractedEdge } from '../types/graph'
import { appLogger } from '../utils/logger'

export const useGraphStore = defineStore('graph', () => {
  const workspaceStore = useWorkspaceStore()

  const backlinks = ref<BacklinkRef[]>([])
  const outlinks = ref<GraphEdge[]>([])
  const activeNoteId = ref<string | null>(null)

  async function loadNoteGraph(noteId: string) {
    const backend = workspaceStore.backend
    if (!backend) return

    try {
      const [bl, ol] = await Promise.all([
        backend.graphGetBacklinks(noteId),
        backend.graphGetOutlinks(noteId),
      ])
      activeNoteId.value = noteId
      backlinks.value = bl
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

  async function updateNoteEdges(noteId: string, edges: ExtractedEdge[]) {
    const backend = workspaceStore.backend
    if (!backend) return
    try {
      await backend.graphUpdateNoteEdges(noteId, edges)
      if (activeNoteId.value === noteId) {
        outlinks.value = await backend.graphGetOutlinks(noteId)
      }
    } catch (error) {
      await appLogger.error({
        source: 'frontend.graph',
        event: 'update_note_edges',
        message: 'Failed to update note edges',
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
    backlinks.value = []
    outlinks.value = []
    activeNoteId.value = null
  }

  return {
    backlinks,
    outlinks,
    activeNoteId,
    loadNoteGraph,
    updateNoteEdges,
    removeNote,
    clear,
  }
})
