import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { GraphEdge, GraphNode } from '../../../types/graph'

interface FocusableGraph {
  nodes: Pick<GraphNode, 'id' | 'title'>[]
  edges: Pick<GraphEdge, 'source' | 'target' | 'kind'>[]
}

export function getGraphFocusEdgeKey(edge: Pick<GraphEdge, 'source' | 'target' | 'kind'>): string {
  return `${edge.source}::${edge.target}::${edge.kind}`
}

export function resolveFocusedSubgraph(
  graph: FocusableGraph | null,
  focusedNodeId: string | null,
): { neighborIds: Set<string>; edgeKeys: Set<string> } {
  const neighborIds = new Set<string>()
  const edgeKeys = new Set<string>()

  if (!graph || !focusedNodeId) return { neighborIds, edgeKeys }

  const nodeIds = new Set(graph.nodes.map(node => node.id))
  if (!nodeIds.has(focusedNodeId)) return { neighborIds, edgeKeys }

  for (const edge of graph.edges) {
    if (edge.source === focusedNodeId && nodeIds.has(edge.target)) {
      neighborIds.add(edge.target)
      edgeKeys.add(getGraphFocusEdgeKey(edge))
      continue
    }

    if (edge.target === focusedNodeId && nodeIds.has(edge.source)) {
      neighborIds.add(edge.source)
      edgeKeys.add(getGraphFocusEdgeKey(edge))
    }
  }

  return { neighborIds, edgeKeys }
}

export function useGraphFocus(graph: Ref<FocusableGraph | null>) {
  const focusedNodeId = ref<string | null>(null)

  const focusedSubgraph = computed(() => resolveFocusedSubgraph(graph.value, focusedNodeId.value))
  const focusedNeighborIds = computed(() => focusedSubgraph.value.neighborIds)
  const focusedEdgeKeys = computed(() => focusedSubgraph.value.edgeKeys)
  const focusedNode = computed(() => {
    if (!focusedNodeId.value) return null
    return graph.value?.nodes.find(node => node.id === focusedNodeId.value) ?? null
  })

  function toggleFocusedNode(nodeId: string) {
    focusedNodeId.value = focusedNodeId.value === nodeId ? null : nodeId
  }

  function clearFocusedNode() {
    focusedNodeId.value = null
  }

  watch(graph, (nextGraph) => {
    if (!focusedNodeId.value) return
    const hasFocusedNode = nextGraph?.nodes.some(node => node.id === focusedNodeId.value) ?? false
    if (!hasFocusedNode) {
      focusedNodeId.value = null
    }
  })

  return {
    focusedNodeId,
    focusedNode,
    focusedNeighborIds,
    focusedEdgeKeys,
    toggleFocusedNode,
    clearFocusedNode,
  }
}
