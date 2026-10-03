import type { WorkspaceBackend, WorkspaceHandle } from './types'
import { LocalBackend } from './localBackend'

export type { WorkspaceBackend, WorkspaceHandle } from './types'
export { workspaceHandleKey } from './types'

/** Build the backend for a workspace handle. */
export function resolveBackend(handle: WorkspaceHandle): WorkspaceBackend {
  return new LocalBackend(handle.path)
}
