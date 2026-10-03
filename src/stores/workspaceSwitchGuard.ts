import { useNoteStore } from './note'
import { useWorkspaceStore } from './workspace'

/** Flushes the active editor session before changing the backend identity. */
export async function flushBeforeWorkspaceSwitch(): Promise<void> {
  const noteStore = useNoteStore()
  const workspaceStore = useWorkspaceStore()
  const noteId = noteStore.activeNote?.id
  const backend = workspaceStore.backend
  if (!noteId || !backend) return

  const result = await noteStore.flushDurably()
  if (!result.ok) throw result.error
  if (workspaceStore.backend !== backend || noteStore.activeNote?.id !== noteId) {
    throw new Error('Active note changed during workspace switch')
  }
  if (noteStore.isDirty || noteStore.saveStatus === 'error') {
    throw new Error('The latest note revision is not durable')
  }
}
