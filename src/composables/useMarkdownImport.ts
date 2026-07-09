import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTreeStore } from '../stores/tree'
import { useWorkspaceStore } from '../stores/workspace'
import { useNoteStore } from '../stores/note'
import { collabCommands, noteCommands } from '../tauri/commands'
import { parseMarkdownToBlockNode, type ParsedMarkdown } from '../utils/noteImport/markdownParser'
import type { BlockNode } from '../types/note'

interface ImportMarkdownIntoNoteOptions {
  beforePersist?: () => void | Promise<void>
}

export function useMarkdownImport() {
  const { t } = useI18n()
  const treeStore = useTreeStore()
  const workspaceStore = useWorkspaceStore()
  const noteStore = useNoteStore()
  const importing = ref(false)

  async function resetLocalEditorState(workspacePath: string, noteId: string) {
    if (workspaceStore.backendKind !== 'local') return
    await collabCommands.deleteYjsState(workspacePath, noteId)
  }

  async function pickAndParseMarkdown(): Promise<{ basename: string; parsed: ParsedMarkdown } | null> {
    let open: (options: { title: string; filters: { name: string; extensions: string[] }[]; multiple: boolean }) => Promise<unknown>
    try {
      const mod = await import('@tauri-apps/plugin-dialog')
      open = mod.open
    } catch {
      return null
    }
    let selected: unknown
    try {
      selected = await open({
        title: t('import.openDialogTitle'),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        multiple: false,
      })
    } catch {
      return null
    }
    if (!selected || typeof selected !== 'string') return null

    const text = await noteCommands.readTextFile(selected)
    const basename = selected.split(/[/\\]/).pop()?.replace(/\.md$/i, '') ?? 'Untitled'
    return { basename, parsed: parseMarkdownToBlockNode(text, basename, (title) => treeStore.resolveNoteIdByTitle(title)) }
  }

  async function importMarkdownFile(folderId: string | null = null): Promise<string | null> {
    importing.value = true
    try {
      const workspacePath = workspaceStore.activePath
      if (!workspacePath) return null

      const picked = await pickAndParseMarkdown()
      if (!picked) return null
      const { basename, parsed } = picked
      const { title, content } = parsed

      const note = await treeStore.createNote(folderId, title || basename)
      if (!note) return null

      const updatedAt = new Date().toISOString()
      await noteCommands.saveNote(workspacePath, { ...note, title: title || basename, content, updatedAt })
      await resetLocalEditorState(workspacePath, note.id)
      noteStore.invalidateNoteCache(note.id)
      treeStore.syncNoteMeta(note.id, { title: title || basename, icon: note.icon }, updatedAt)
      void workspaceStore.refreshSidebarNotePreviews()
      return note.id
    } finally {
      importing.value = false
    }
  }

  async function importMarkdownIntoNote(noteId: string, options: ImportMarkdownIntoNoteOptions = {}): Promise<boolean> {
    importing.value = true
    try {
      const workspacePath = workspaceStore.activePath
      if (!workspacePath) return false

      const picked = await pickAndParseMarkdown()
      if (!picked) return false
      const { parsed } = picked

      const note = await noteCommands.loadNote(workspacePath, noteId)
      const merged: BlockNode = {
        ...note.content,
        content: [...(note.content.content ?? []), ...(parsed.content.content ?? [])],
      }
      const updatedAt = new Date().toISOString()
      await options.beforePersist?.()
      await noteCommands.saveNote(workspacePath, { ...note, content: merged, updatedAt })
      await resetLocalEditorState(workspacePath, note.id)
      noteStore.invalidateNoteCache(note.id)
      treeStore.syncNoteMeta(note.id, { title: note.title, icon: note.icon }, updatedAt)
      void workspaceStore.refreshSidebarNotePreviews()
      return true
    } finally {
      importing.value = false
    }
  }

  return { importMarkdownFile, importMarkdownIntoNote, importing }
}
