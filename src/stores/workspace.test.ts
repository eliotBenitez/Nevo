import { describe, expect, it } from 'vitest'
import type { RecentWorkspace } from '../types/workspace'
import { getRestoreCandidates } from './workspace'

function recentWorkspace(overrides: Partial<RecentWorkspace>): RecentWorkspace {
  return {
    id: overrides.id ?? 'workspace-id',
    name: overrides.name ?? 'Workspace',
    glyph: overrides.glyph ?? 'N',
    gradient: overrides.gradient ?? 'linear-gradient(red, blue)',
    path: overrides.path ?? '/tmp/workspace',
    lastOpened: overrides.lastOpened ?? '2026-05-13T10:00:00.000Z',
    pageCount: overrides.pageCount ?? 0,
    pinned: overrides.pinned,
    unreadCount: overrides.unreadCount,
  }
}

describe('getRestoreCandidates', () => {
  it('sorts workspaces by most recent lastOpened first', () => {
    const candidates = getRestoreCandidates([
      recentWorkspace({ id: 'older', path: '/tmp/older', lastOpened: '2026-05-12T10:00:00.000Z' }),
      recentWorkspace({ id: 'newer', path: '/tmp/newer', lastOpened: '2026-05-13T10:00:00.000Z' }),
    ])

    expect(candidates.map(candidate => candidate.id)).toEqual(['newer', 'older'])
  })

  it('keeps invalid timestamps after valid ones and preserves their relative order', () => {
    const candidates = getRestoreCandidates([
      recentWorkspace({ id: 'invalid-a', path: '/tmp/invalid-a', lastOpened: 'not-a-date' }),
      recentWorkspace({ id: 'valid', path: '/tmp/valid', lastOpened: '2026-05-13T10:00:00.000Z' }),
      recentWorkspace({ id: 'invalid-b', path: '/tmp/invalid-b', lastOpened: 'still-not-a-date' }),
    ])

    expect(candidates.map(candidate => candidate.id)).toEqual(['valid', 'invalid-a', 'invalid-b'])
  })
})
