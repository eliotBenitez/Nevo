import type { WorkspaceView } from '../types/workspace'

export type StartupTarget =
  | { kind: 'note'; noteId: string }
  | { kind: 'folder'; folderId: string }
  | { kind: 'graph' }
  | { kind: 'board'; boardId: string }
  | { kind: 'workspace' }

export interface StartupTargetInput {
  defaultStartupView: WorkspaceView
  startupNoteId: string | null
  restoreLastContext: boolean
  lastNoteId: string | null
  lastFolderId: string | null
  firstBoardId: string | null
}

function lastContextTarget(noteId: string | null, folderId: string | null): StartupTarget | null {
  if (noteId) return { kind: 'note', noteId }
  if (folderId) return { kind: 'folder', folderId }
  return null
}

/**
 * `defaultStartupView` always wins: an explicit view (graph, kanban, a specific
 * note) must not be overridden by the restore-last-context toggle, which is
 * enabled by default. The toggle only decides what the neutral `editor` view
 * falls back to.
 */
export function resolveStartupTarget(input: StartupTargetInput): StartupTarget {
  const { defaultStartupView, startupNoteId, restoreLastContext, lastNoteId, lastFolderId, firstBoardId } = input

  switch (defaultStartupView) {
    case 'graph':
      return { kind: 'graph' }
    case 'kanban':
      return firstBoardId ? { kind: 'board', boardId: firstBoardId } : { kind: 'workspace' }
    case 'specific-note':
      return startupNoteId ? { kind: 'note', noteId: startupNoteId } : { kind: 'workspace' }
    case 'last-note':
      return lastContextTarget(lastNoteId, lastFolderId) ?? { kind: 'workspace' }
    default:
      return (restoreLastContext ? lastContextTarget(lastNoteId, lastFolderId) : null) ?? { kind: 'workspace' }
  }
}
