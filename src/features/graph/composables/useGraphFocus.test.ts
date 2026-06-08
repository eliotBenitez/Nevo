import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { resolveFocusedSubgraph, useGraphFocus } from './useGraphFocus'
import type { GraphSnapshot } from '../../../types/graph'

function createGraph(): GraphSnapshot {
  return {
    nodes: [
      { id: 'note-1', title: 'Alpha', icon: '📄', folderId: null, degree: 2 },
      { id: 'note-2', title: 'Beta', icon: '📄', folderId: null, degree: 2 },
      { id: 'note-3', title: 'Gamma', icon: '📄', folderId: null, degree: 1 },
      { id: 'note-4', title: 'Delta', icon: '📄', folderId: null, degree: 1 },
    ],
    edges: [
      { source: 'note-1', target: 'note-2', kind: 'link' },
      { source: 'note-1', target: 'note-3', kind: 'mention' },
      { source: 'note-2', target: 'note-4', kind: 'embed' },
    ],
  }
}

describe('useGraphFocus', () => {
  it('returns the correct 1-hop nodes and edges for a focused node', () => {
    const graph = createGraph()
    const focused = resolveFocusedSubgraph(graph, 'note-1')

    expect(Array.from(focused.neighborIds).sort()).toEqual(['note-2', 'note-3'])
    expect(Array.from(focused.edgeKeys).sort()).toEqual([
      'note-1::note-2::link',
      'note-1::note-3::mention',
    ])
  })

  it('clears focus mode when the same node is selected again', () => {
    const graph = ref(createGraph())
    const focus = useGraphFocus(graph)

    focus.toggleFocusedNode('note-2')
    expect(focus.focusedNodeId.value).toBe('note-2')
    expect(Array.from(focus.focusedNeighborIds.value).sort()).toEqual(['note-1', 'note-4'])

    focus.toggleFocusedNode('note-2')
    expect(focus.focusedNodeId.value).toBeNull()
    expect(Array.from(focus.focusedNeighborIds.value)).toEqual([])
  })
})
