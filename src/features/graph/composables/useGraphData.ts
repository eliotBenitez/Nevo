import { ref } from 'vue'
import type { FolderMeta, NoteMeta } from '../../../types/note'
import type { WorkspaceManifest } from '../../../types/workspace'
import type { GraphEdge, GraphNode, GraphSnapshot } from '../../../types/graph'
import { useWorkspaceStore } from '../../../stores/workspace'

function collectAllNotes(manifest: WorkspaceManifest): NoteMeta[] {
  const notes: NoteMeta[] = [...manifest.rootNotes]
  const walkFolder = (folder: FolderMeta) => {
    notes.push(...folder.notes)
    folder.children.forEach(walkFolder)
  }
  manifest.tree.forEach(walkFolder)
  return notes
}

export function useGraphData(_workspacePath: string, manifest: WorkspaceManifest) {
  const workspaceStore = useWorkspaceStore()
  const snapshot = ref<GraphSnapshot | null>(null)
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const edges = await workspaceStore.backend?.graphGetAllEdges() ?? []
      const allNotes = collectAllNotes(manifest)

      const degreeMap = new Map<string, number>()
      for (const edge of edges) {
        degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1)
        degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1)
      }

      const nodes: GraphNode[] = allNotes.map(note => ({
        id: note.id,
        title: note.title,
        icon: note.icon,
        folderId: note.folderId,
        degree: degreeMap.get(note.id) ?? 0,
      }))

      snapshot.value = { nodes, edges }
    } finally {
      loading.value = false
    }
  }

  return { snapshot, loading, load }
}

export function buildLocalSnapshot(
  centerId: string,
  centerTitle: string,
  centerIcon: string,
  centerFolderId: string | null,
  backlinks: { sourceId: string; sourceTitle: string; sourceIcon: string }[],
  outlinks: GraphEdge[],
): GraphSnapshot {
  const nodeMap = new Map<string, GraphNode>()

  nodeMap.set(centerId, { id: centerId, title: centerTitle, icon: centerIcon, folderId: centerFolderId, degree: 0 })

  for (const bl of backlinks) {
    if (!nodeMap.has(bl.sourceId)) {
      nodeMap.set(bl.sourceId, { id: bl.sourceId, title: bl.sourceTitle, icon: bl.sourceIcon, folderId: null, degree: 0 })
    }
  }

  const edges: GraphEdge[] = []

  for (const ol of outlinks) {
    if (!nodeMap.has(ol.target)) {
      nodeMap.set(ol.target, { id: ol.target, title: ol.target, icon: '📄', folderId: null, degree: 0 })
    }
    edges.push(ol)
  }

  for (const bl of backlinks) {
    const alreadyHas = edges.some(e => e.source === bl.sourceId && e.target === centerId)
    if (!alreadyHas) {
      edges.push({ source: bl.sourceId, target: centerId, kind: 'link' })
    }
  }

  const nodes = Array.from(nodeMap.values())
  const degreeMap = new Map<string, number>()
  for (const e of edges) {
    degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1)
    degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1)
  }
  for (const n of nodes) {
    n.degree = degreeMap.get(n.id) ?? 0
  }

  return { nodes, edges }
}
