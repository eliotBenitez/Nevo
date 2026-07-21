// Two-pass Obsidian vault import: (1) mirror the vault's folder hierarchy and
// create an empty note per Markdown file so every note has a stable id, then
// (2) parse each note's Markdown body with a whole-vault wiki-link resolver,
// resolve Obsidian embeds (`![[...]]`) and relative attachment images, and
// persist it. Frontmatter/tags/callouts and the picker UI are out of scope
// here — later phases build on this.
import { ref, type Ref } from 'vue'
import { useTreeStore } from '../stores/tree'
import { useWorkspaceStore } from '../stores/workspace'
import { useNoteStore } from '../stores/note'
import { collabCommands, noteCommands, systemCommands } from '../tauri/commands'
import { parseMarkdownToBlockNodeAsync } from '../utils/noteImport/markdownParser'
import {
  stripNoteExtension,
  dirnamePosix,
  collectFolderPaths,
  createVaultLinkResolver,
  type VaultNoteEntry,
} from '../utils/noteImport/obsidian/vaultGraph'
import {
  preprocessObsidianEmbeds,
  resolveObsidianEmbeds,
  createVaultAssetResolver,
} from '../utils/noteImport/obsidian/obsidianEmbeds'
import {
  extractFrontmatter,
  collectTags,
  mapFrontmatterToProperties,
  buildFrontmatterTable,
} from '../utils/noteImport/obsidian/obsidianFrontmatter'
import {
  stripObsidianComments,
  transformCallouts,
  applyHighlights,
  extractInlineTags,
} from '../utils/noteImport/obsidian/obsidianSyntax'
import type { BlockNode, ImportedImageAsset, NoteDocument, NoteProperties, VaultNote } from '../types/note'

export interface ObsidianImportProgress {
  phase: 'idle' | 'reading' | 'folders' | 'creating' | 'writing' | 'done' | 'error'
  totalNotes: number
  processedNotes: number
  foldersCreated: number
  notesCreated: number
  unresolvedLinks: number
  skippedFiles: number
  attachmentsImported: number
  unresolvedEmbeds: number
  notesWithFrontmatter: number
  tagsCollected: number
  error: string | null
}

export interface ObsidianImportResult {
  rootName: string
  notesCreated: number
  foldersCreated: number
  unresolvedLinks: number
  skippedFiles: number
  attachmentsImported: number
  unresolvedEmbeds: number
  notesWithFrontmatter: number
  tagsCollected: number
}

interface PendingNote {
  note: NoteDocument
  content: string
  basename: string
  relativePath: string
}

function createIdleProgress(): ObsidianImportProgress {
  return {
    phase: 'idle',
    totalNotes: 0,
    processedNotes: 0,
    foldersCreated: 0,
    notesCreated: 0,
    unresolvedLinks: 0,
    skippedFiles: 0,
    attachmentsImported: 0,
    unresolvedEmbeds: 0,
    notesWithFrontmatter: 0,
    tagsCollected: 0,
    error: null,
  }
}

/** Builds a cached asset importer over a single vault import session: the
 *  same attachment (e.g. shared across multiple notes) is only fetched via
 *  IPC once. Import failures are cached as `null` so a broken reference
 *  doesn't retry on every note that references it. */
function createAssetImporter(
  workspacePath: string,
  vaultPath: string,
): (relativePath: string) => Promise<ImportedImageAsset | null> {
  const cache = new Map<string, ImportedImageAsset | null>()
  return async (relativePath: string): Promise<ImportedImageAsset | null> => {
    if (cache.has(relativePath)) return cache.get(relativePath) ?? null
    try {
      const imported = await noteCommands.importVaultAsset(workspacePath, vaultPath, relativePath)
      cache.set(relativePath, imported)
      return imported
    } catch {
      cache.set(relativePath, null)
      return null
    }
  }
}

function lastSegment(relativePath: string): string {
  const idx = relativePath.lastIndexOf('/')
  return idx === -1 ? relativePath : relativePath.slice(idx + 1)
}

export function useObsidianImport(): {
  importing: Ref<boolean>
  progress: Ref<ObsidianImportProgress>
  importVault: (targetFolderId?: string | null) => Promise<ObsidianImportResult | null>
} {
  const treeStore = useTreeStore()
  const workspaceStore = useWorkspaceStore()
  const noteStore = useNoteStore()
  const importing = ref(false)
  const progress = ref<ObsidianImportProgress>(createIdleProgress())

  // Mirrors useMarkdownImport's persistence pattern: after a local-backend
  // save, the disk-backed Y.Doc for the note must be dropped so the editor
  // re-derives it from the freshly saved `note.content` on next open.
  async function resetLocalEditorState(workspacePath: string, noteId: string) {
    if (workspaceStore.backendKind !== 'local') return
    await collabCommands.deleteYjsState(workspacePath, noteId)
  }

  // Pass 0: mirror the vault's folder hierarchy top-down so every note has a
  // parent folder id before any note is created.
  async function createFoldersTopDown(
    folderPaths: string[],
    targetFolderId: string | null,
  ): Promise<Map<string, string>> {
    const folderIdByPath = new Map<string, string>()
    for (const dirPath of folderPaths) {
      const parentPath = dirnamePosix(dirPath)
      const parentId = parentPath === '' ? targetFolderId : (folderIdByPath.get(parentPath) ?? null)
      const title = lastSegment(dirPath)
      const folder = await treeStore.createFolder(parentId, title)
      if (!folder) continue
      folderIdByPath.set(dirPath, folder.id)
      progress.value.foldersCreated++
    }
    return folderIdByPath
  }

  // Pass 1: create an empty note per vault note (title = filename basename)
  // so every note gets a stable id before any wiki-link is resolved.
  async function createNotesPass(
    notes: VaultNote[],
    folderIdByPath: Map<string, string>,
    targetFolderId: string | null,
  ): Promise<{ pending: PendingNote[]; entries: VaultNoteEntry[] }> {
    const pending: PendingNote[] = []
    const entries: VaultNoteEntry[] = []
    for (const vaultNote of notes) {
      const basename = stripNoteExtension(lastSegment(vaultNote.relativePath))
      const dir = dirnamePosix(vaultNote.relativePath)
      const folderId = dir === '' ? targetFolderId : (folderIdByPath.get(dir) ?? null)
      const note = await treeStore.createNote(folderId, basename)
      if (!note) continue
      pending.push({ note, content: vaultNote.content, basename, relativePath: vaultNote.relativePath })
      entries.push({ relativePath: vaultNote.relativePath, noteId: note.id })
      progress.value.notesCreated++
    }
    return { pending, entries }
  }

  // Parses a single note's raw Markdown into its final `{ doc, properties }`:
  // frontmatter is pulled off the top first (its non-note-property keys land
  // in a leading table), then `%%comments%%` are stripped, then the shared
  // parser + embed resolver run (unchanged from Phase 3), then Obsidian-only
  // block syntax (callouts, highlights) and inline `#tags` are layered on.
  async function resolveNoteContent(
    rawContent: string,
    basename: string,
    relativePath: string,
    resolver: (target: string) => string | null,
    resolveAsset: (ref: string, fromDir: string) => string | null,
    importAsset: (relativePath: string) => Promise<ImportedImageAsset | null>,
  ): Promise<{ doc: BlockNode; properties: NoteProperties; hasFrontmatter: boolean }> {
    const { data, body } = extractFrontmatter(rawContent)
    const noComments = stripObsidianComments(body)
    const pre = preprocessObsidianEmbeds(noComments)
    const parsed = await parseMarkdownToBlockNodeAsync(pre, basename, resolver, { extractTitle: false })
    let doc = await resolveObsidianEmbeds(parsed.content, {
      noteDir: dirnamePosix(relativePath),
      resolveAsset,
      resolveNote: resolver,
      importAsset,
      onUnresolvedEmbed: () => { progress.value.unresolvedEmbeds++ },
      onAttachmentImported: () => { progress.value.attachmentsImported++ },
    })

    doc = transformCallouts(doc)
    doc = applyHighlights(doc)
    const inlineTags = extractInlineTags(doc)

    const { properties: mappedProps, extraEntries } = mapFrontmatterToProperties(data)
    const fmTags = collectTags(data)
    const tags = [...new Set([...fmTags, ...inlineTags])]

    const table = buildFrontmatterTable(extraEntries)
    if (table) doc = { ...doc, content: [table, ...(doc.content ?? [])] }

    const properties: NoteProperties = { type: mappedProps.type, tags, date: mappedProps.date, status: mappedProps.status }
    return { doc, properties, hasFrontmatter: data !== null }
  }

  // Pass 2: parse each note's body (title stays the filename; the H1 is kept
  // in the content) with a resolver that knows every note in the vault, resolve
  // Obsidian embeds and relative attachment images, apply Obsidian-only
  // syntax (frontmatter/tags/callouts/highlights/comments), then persist.
  async function writeNotesPass(
    workspacePath: string,
    pending: PendingNote[],
    resolver: (target: string) => string | null,
    resolveAsset: (ref: string, fromDir: string) => string | null,
    importAsset: (relativePath: string) => Promise<ImportedImageAsset | null>,
  ) {
    for (const { note, content, basename, relativePath } of pending) {
      const { doc, properties, hasFrontmatter } = await resolveNoteContent(
        content, basename, relativePath, resolver, resolveAsset, importAsset,
      )
      const updatedAt = new Date().toISOString()
      await noteCommands.saveNote(workspacePath, { ...note, title: basename, content: doc, properties, updatedAt })
      await resetLocalEditorState(workspacePath, note.id)
      noteStore.invalidateNoteCache(note.id)
      treeStore.syncNoteMeta(note.id, { title: basename, icon: note.icon }, updatedAt)
      progress.value.processedNotes++
      if (hasFrontmatter) progress.value.notesWithFrontmatter++
      progress.value.tagsCollected += properties.tags.length
    }
  }

  async function importVault(targetFolderId: string | null = null): Promise<ObsidianImportResult | null> {
    const workspacePath = workspaceStore.activePath
    if (!workspacePath) return null

    importing.value = true
    progress.value = createIdleProgress()
    try {
      progress.value.phase = 'reading'
      const vaultPath = await systemCommands.pickWorkspaceDirectory()
      if (!vaultPath) {
        progress.value.phase = 'idle'
        return null
      }
      const manifest = await noteCommands.readObsidianVault(vaultPath)
      progress.value.totalNotes = manifest.notes.length
      progress.value.skippedFiles = manifest.skipped.length

      progress.value.phase = 'folders'
      const folderPaths = collectFolderPaths(manifest.notes.map(n => n.relativePath))
      const folderIdByPath = await createFoldersTopDown(folderPaths, targetFolderId)

      progress.value.phase = 'creating'
      const { pending, entries } = await createNotesPass(manifest.notes, folderIdByPath, targetFolderId)

      const resolver = createVaultLinkResolver(entries, () => { progress.value.unresolvedLinks++ })
      const resolveAsset = createVaultAssetResolver(manifest.assets)
      const importAsset = createAssetImporter(workspacePath, vaultPath)

      progress.value.phase = 'writing'
      await writeNotesPass(workspacePath, pending, resolver, resolveAsset, importAsset)

      progress.value.phase = 'done'
      void workspaceStore.refreshSidebarNotePreviews()

      return {
        rootName: manifest.rootName,
        notesCreated: progress.value.notesCreated,
        foldersCreated: progress.value.foldersCreated,
        unresolvedLinks: progress.value.unresolvedLinks,
        skippedFiles: progress.value.skippedFiles,
        attachmentsImported: progress.value.attachmentsImported,
        unresolvedEmbeds: progress.value.unresolvedEmbeds,
        notesWithFrontmatter: progress.value.notesWithFrontmatter,
        tagsCollected: progress.value.tagsCollected,
      }
    } catch (err) {
      progress.value.phase = 'error'
      progress.value.error = err instanceof Error ? err.message : String(err)
      return null
    } finally {
      importing.value = false
    }
  }

  return { importing, progress, importVault }
}
