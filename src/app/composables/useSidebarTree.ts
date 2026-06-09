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

/** Recursively filters out empty folders from the tree if showEmpty is false. */
export function filterTree(nodes: TreeNode[], showEmpty: boolean): TreeNode[] {
  if (showEmpty) return nodes

  function hasNotesOrSubnotes(folder: FolderMeta): boolean {
    if (folder.notes.length > 0) return true
    return folder.children.some(hasNotesOrSubnotes)
  }

  function filterFolders(folders: FolderMeta[]): FolderMeta[] {
    return folders
      .filter(hasNotesOrSubnotes)
      .map(folder => ({
        ...folder,
        children: filterFolders(folder.children),
      }))
  }

  const result: TreeNode[] = []
  for (const node of nodes) {
    if (node.kind === 'folder') {
      if (hasNotesOrSubnotes(node.meta)) {
        const clonedFolder = {
          ...node.meta,
          children: filterFolders(node.meta.children),
        }
        result.push({ kind: 'folder', meta: clonedFolder })
      }
    } else {
      result.push(node)
    }
  }
  return result
}
