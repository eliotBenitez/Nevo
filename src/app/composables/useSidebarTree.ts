import type { FolderMeta, NoteMeta, TreeNode } from '../../types/note'

export type SortMode = 'manual' | 'name-asc' | 'name-desc' | 'updated'

function compareTitle(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function sortFolders(folders: FolderMeta[], mode: SortMode): FolderMeta[] {
  const cloned = folders.map((folder) => ({
    ...folder,
    children: sortFolders(folder.children, mode),
    notes: sortNotes(folder.notes, mode),
  }))
  if (mode === 'name-asc') return cloned.sort((a, b) => compareTitle(a.title, b.title))
  if (mode === 'name-desc') return cloned.sort((a, b) => compareTitle(b.title, a.title))
  // 'manual' / 'updated': folders keep their natural order (no timestamp on folders)
  return cloned
}

function sortNotes(notes: NoteMeta[], mode: SortMode): NoteMeta[] {
  const cloned = notes.slice()
  if (mode === 'name-asc') return cloned.sort((a, b) => compareTitle(a.title, b.title))
  if (mode === 'name-desc') return cloned.sort((a, b) => compareTitle(b.title, a.title))
  if (mode === 'updated') return cloned.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return cloned
}

/**
 * Returns a new tree with folders/notes sorted recursively. Folder rows always
 * precede note rows within a level (matching WorkspaceTreeNode's render order).
 * Source data is never mutated — folder metas are shallow-cloned when reordered.
 */
export function sortTree(nodes: TreeNode[], mode: SortMode): TreeNode[] {
  if (mode === 'manual') return nodes
  const folders: FolderMeta[] = []
  const notes: NoteMeta[] = []
  for (const node of nodes) {
    if (node.kind === 'folder') folders.push(node.meta)
    else notes.push(node.meta)
  }
  return [
    ...sortFolders(folders, mode).map((meta): TreeNode => ({ kind: 'folder', meta })),
    ...sortNotes(notes, mode).map((meta): TreeNode => ({ kind: 'note', meta })),
  ]
}

/** Recursively collects every folder id in the tree (for collapse-all). */
export function collectFolderIds(nodes: TreeNode[]): string[] {
  const ids: string[] = []
  const walk = (folders: FolderMeta[]) => {
    for (const folder of folders) {
      ids.push(folder.id)
      walk(folder.children)
    }
  }
  walk(nodes.filter((n): n is Extract<TreeNode, { kind: 'folder' }> => n.kind === 'folder').map((n) => n.meta))
  return ids
}
