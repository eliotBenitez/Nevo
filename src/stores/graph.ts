import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useWorkspaceStore } from './workspace'
import type { BacklinkRef, GraphEdge, ExtractedEdge } from '../types/graph'

export const useGraphStore = defineStore('graph', () => {
  const workspaceStore = useWorkspaceStore()

  const backlinks = ref<BacklinkRef[]>([])
  const outlinks = ref<GraphEdge[]>([])
  const activeNoteId = ref<string | null>(null)

  async function loadNoteGraph(noteId: string) {
    const backend = workspaceStore.backend
    if (!backend) return

    activeNoteId.value = noteId
    const [bl, ol] = await Promise.all([
      backend.graphGetBacklinks(noteId),
      backend.graphGetOutlinks(noteId),
    ])
    backlinks.value = bl
    outlinks.value = ol
  }

  async function updateNoteEdges(noteId: string, edges: ExtractedEdge[]) {
    const backend = workspaceStore.backend
    if (!backend) return
    await backend.graphUpdateNoteEdges(noteId, edges)
    if (activeNoteId.value === noteId) {
      outlinks.value = await backend.graphGetOutlinks(noteId)
    }
  }

  async function removeNote(noteId: string) {
    const backend = workspaceStore.backend
    if (!backend) return
    await backend.graphRemoveNote(noteId)
    if (activeNoteId.value === noteId) {
      backlinks.value = []
      outlinks.value = []
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
