import type { WorkspaceManifest } from '../types/workspace'
import { folderNoteCount } from './folder-note-count'

export function workspaceNoteCount(manifest: WorkspaceManifest): number {
  return manifest.rootNotes.length + manifest.tree.reduce((total, folder) => total + folderNoteCount(folder), 0)
}
