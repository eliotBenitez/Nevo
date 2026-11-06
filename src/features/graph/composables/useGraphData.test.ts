import { describe, expect, it } from 'vitest'
import type { NoteMeta } from '../../../types/note'
import type { GraphEdge } from '../../../types/graph'
import { buildLocalSnapshot } from './useGraphData'

function meta(id: string, title: string, icon: string): NoteMeta {
  return { id, title, icon, folderId: 'folder-1', updatedAt: '2026-01-01T00:00:00.000Z' }
}

describe('buildLocalSnapshot', () => {
  it('includes only direct neighbors and uses manifest metadata for them', () => {
    const outlinks: GraphEdge[] = [
      { source: 'center', target: 'outgoing', kind: 'embed' },
      { source: 'unrelated', target: 'far-away', kind: 'link' },
    ]
    const snapshot = buildLocalSnapshot(
      'center', 'Center', '⭐', null,
      [{ sourceId: 'incoming', sourceTitle: '', sourceIcon: '' }],
      outlinks,
      new Map([
        ['incoming', meta('incoming', 'Incoming title', '⬅️')],
        ['outgoing', meta('outgoing', 'Outgoing title', '➡️')],
      ]),
    )

    expect(snapshot.nodes.map(node => node.id)).toEqual(['center', 'incoming', 'outgoing'])
    expect(snapshot.nodes.find(node => node.id === 'incoming')).toMatchObject({ title: 'Incoming title', icon: '⬅️', folderId: 'folder-1' })
    expect(snapshot.nodes.find(node => node.id === 'outgoing')).toMatchObject({ title: 'Outgoing title', icon: '➡️', folderId: 'folder-1' })
    expect(snapshot.edges.map(edge => [edge.source, edge.target])).toEqual([
      ['center', 'outgoing'],
      ['incoming', 'center'],
    ])
  })
})
