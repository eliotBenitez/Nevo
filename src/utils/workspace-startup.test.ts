import { describe, expect, it } from 'vitest'
import { resolveStartupTarget, type StartupTargetInput } from './workspace-startup'

function input(overrides: Partial<StartupTargetInput> = {}): StartupTargetInput {
  return {
    defaultStartupView: 'editor',
    startupNoteId: null,
    restoreLastContext: true,
    lastNoteId: 'last-note-id',
    lastFolderId: 'last-folder-id',
    firstBoardId: 'board-1',
    ...overrides,
  }
}

describe('resolveStartupTarget', () => {
  it('opens the graph even when restoring the last context is enabled', () => {
    expect(resolveStartupTarget(input({ defaultStartupView: 'graph' }))).toEqual({ kind: 'graph' })
  })

  it('opens the first kanban board even when restoring the last context is enabled', () => {
    expect(resolveStartupTarget(input({ defaultStartupView: 'kanban' }))).toEqual({ kind: 'board', boardId: 'board-1' })
  })

  it('falls back to the workspace root when kanban is selected but no board exists', () => {
    expect(resolveStartupTarget(input({ defaultStartupView: 'kanban', firstBoardId: null }))).toEqual({ kind: 'workspace' })
  })

  it('opens the configured note even when restoring the last context is enabled', () => {
    const target = resolveStartupTarget(input({ defaultStartupView: 'specific-note', startupNoteId: 'pinned' }))
    expect(target).toEqual({ kind: 'note', noteId: 'pinned' })
  })

  it('falls back to the workspace root when no specific note is configured', () => {
    expect(resolveStartupTarget(input({ defaultStartupView: 'specific-note' }))).toEqual({ kind: 'workspace' })
  })

  it('restores the last note regardless of the toggle when last-note is selected', () => {
    const target = resolveStartupTarget(input({ defaultStartupView: 'last-note', restoreLastContext: false }))
    expect(target).toEqual({ kind: 'note', noteId: 'last-note-id' })
  })

  it('restores the last folder when no last note is stored', () => {
    const target = resolveStartupTarget(input({ defaultStartupView: 'last-note', lastNoteId: null }))
    expect(target).toEqual({ kind: 'folder', folderId: 'last-folder-id' })
  })

  it('restores the last context for the editor view when the toggle is enabled', () => {
    expect(resolveStartupTarget(input())).toEqual({ kind: 'note', noteId: 'last-note-id' })
  })

  it('stays on the workspace root for the editor view when the toggle is disabled', () => {
    expect(resolveStartupTarget(input({ restoreLastContext: false }))).toEqual({ kind: 'workspace' })
  })
})
