import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTreeStore } from '../stores/tree'
import { useWorkspaceStore } from '../stores/workspace'
import { noteCommands } from '../tauri/commands'
import { parseMarkdownToBlockNode, type ParsedMarkdown } from '../utils/noteImport/markdownParser'
import type { BlockNode } from '../types/note'

export function useMarkdownImport() {
  const { t } = useI18n()
  const treeStore = useTreeStore()
  const workspaceStore = useWorkspaceStore()
  const importing = ref(false)

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
    return { basename, parsed: parseMarkdownToBlockNode(text, basename) }
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
      return note.id
    } finally {
      importing.value = false
    }
  }

  async function importMarkdownIntoNote(noteId: string): Promise<boolean> {
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
      await noteCommands.saveNote(workspacePath, { ...note, content: merged, updatedAt })
      return true
    } finally {
      importing.value = false
    }
  }

  return { importMarkdownFile, importMarkdownIntoNote, importing }
}
