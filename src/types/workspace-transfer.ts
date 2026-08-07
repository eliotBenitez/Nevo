// Mirrors the serde shapes emitted by `src-tauri/src/commands/workspace_transfer/`
// (mod.rs `TransferProgress`/`ExtractedArchive`, header.rs `ExportHeader`).
// Keep in sync with the Rust `#[serde(rename_all = "camelCase")]` structs.

/** Progress events streamed over the `Channel` while an export/import runs. */
export type TransferProgress =
  | { type: 'started'; total: number }
  | { type: 'file'; done: number; total: number }
  /** Sent once, right after `started`, when the export is password-protected. */
  | { type: 'encrypting' }
  | { type: 'extracting'; done: number; total: number }
  | { type: 'finished' }

export interface ExportWorkspaceMeta {
  id: string
  name: string
  glyph: string
  gradient: string
  schemaVersion: number
}

export interface ExportHeader {
  formatVersion: number
  appVersion: string
  exportedAt: string
  encrypted: boolean
  workspace: ExportWorkspaceMeta
}

/** Result of extracting an archive into a temp directory for a later merge. */
export interface ExtractedArchive {
  tempDir: string
  header: ExportHeader
}

/** Mirrors `workspace_transfer::merge::MergeReport`. Counts of what merging
 * an archive into the currently open workspace actually did — including
 * what it deliberately did not import (standalone kanban boards, note
 * snapshot history), so the frontend can report an honest summary. */
export interface MergeReport {
  importedNotes: number
  importedFolders: number
  importedAssets: number
  importedDatabases: number
  skippedBoards: number
  skippedSnapshots: number
}
