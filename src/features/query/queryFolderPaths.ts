import type { FolderMeta } from '../../types/note'

/**
 * Lists every folder as the path the note index matches `folderPathPrefix`
 * against: titles joined with " / " (see `folder_path_for_id` in
 * src-tauri/src/commands/note_index/index.rs). Depth-first, parents first.
 */
export function collectQueryFolderPaths(tree: readonly FolderMeta[], parents: string[] = []): string[] {
  return tree.flatMap((folder) => {
    const path = [...parents, folder.title]
    return [path.join(' / '), ...collectQueryFolderPaths(folder.children, path)]
  })
}
