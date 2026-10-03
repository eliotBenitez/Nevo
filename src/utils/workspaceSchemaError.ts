/** Machine-readable error prefix `open_workspace` and the workspace-archive
 *  `validate_header` gate both return when a manifest's `schemaVersion` is
 *  newer than this build supports — see
 *  `src-tauri/src/commands/workspace/manifest.rs` and
 *  `src-tauri/src/commands/workspace_transfer/header.rs`. Shared here so
 *  every frontend surface that opens or imports a workspace recognizes the
 *  same error the same way instead of showing a generic failure message. */
const SCHEMA_TOO_NEW_PREFIX = 'workspace-schema-too-new:'

export function isWorkspaceSchemaTooNewError(error: unknown): boolean {
  return String(error).startsWith(SCHEMA_TOO_NEW_PREFIX)
}
