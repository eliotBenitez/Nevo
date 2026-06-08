import type { WorkspaceBackend, WorkspaceHandle } from './types'
import { LocalBackend } from './localBackend'

export type { WorkspaceBackend, WorkspaceHandle } from './types'
export { CloudBackend, CLOUD_ASSET_SCHEME } from './cloud/cloudBackend'
export type { CloudBackendDeps } from './cloud/cloudBackend'

/**
 * Build the backend for a local workspace handle. Cloud backends need async
 * setup (fetching the storage DEK), so they are constructed directly by the
 * workspace store via `new CloudBackend(...)`, not here.
 */
export function resolveBackend(handle: WorkspaceHandle): WorkspaceBackend {
  if (handle.kind === 'local') return new LocalBackend(handle.path)
  throw new Error('Cloud backends are constructed by the workspace store')
}
