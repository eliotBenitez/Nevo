import { computed, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useTreeStore } from '../../../stores/tree'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { FolderMeta, TreeNode } from '../../../types/note'

// Contents shown by the editor host when a folder (or the workspace root)
// is open instead of a note.
export function useWorkspaceContainerOverview(
  activeNoteId: Readonly<Ref<string | null>>,
  activeFolderId: Readonly<Ref<string | null>>,
) {
  const { manifest } = storeToRefs(useWorkspaceStore())
  const { folderById } = storeToRefs(useTreeStore())

  function buildRootOverviewItems(): TreeNode[] {
    const workspace = manifest.value; if (!workspace) return []
    const items: TreeNode[] = []
    for (const id of workspace.rootOrder) {
      const folder = workspace.tree.find(e => e.id === id)
      if (folder) { items.push({ kind: 'folder', meta: folder }); continue }
      const note = workspace.rootNotes.find(e => e.id === id)
      if (note) items.push({ kind: 'note', meta: note })
    }
    return items
  }

  return computed(() => {
    if (activeNoteId.value || !manifest.value) return { title: null as string | null, kind: null as 'root' | 'folder' | null, items: [] as TreeNode[] }
    if (activeFolderId.value) {
      const folder = folderById.value.get(activeFolderId.value) ?? null
      if (!folder) return { title: null, kind: null, items: [] }
      const items: TreeNode[] = [...folder.children.map((c: FolderMeta) => ({ kind: 'folder' as const, meta: c })), ...folder.notes.map(n => ({ kind: 'note' as const, meta: n }))]
      return { title: folder.title, kind: 'folder' as const, items }
    }
    return { title: manifest.value.name, kind: 'root' as const, items: buildRootOverviewItems() }
  })
}
