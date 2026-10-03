import type { FolderMeta } from '../types/note'

// Notes in a folder plus all descendants.
export function folderNoteCount(folder: FolderMeta): number {
  return folder.notes.length + folder.children.reduce((total, child) => total + folderNoteCount(child), 0)
}
