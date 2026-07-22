import { ref, type Ref } from 'vue'
import { useTreeStore } from '../stores/tree'
import { useWorkspaceStore } from '../stores/workspace'
import { useNoteStore } from '../stores/note'
import {
  collabCommands,
  importNotionAssets,
  noteCommands,
  pickAndScanNotionExport,
  releaseNotionImport,
} from '../tauri/commands'
import { createDatabaseRepository } from '../features/database/databaseRepository'
import { parseMarkdownToBlockNodeAsync } from '../utils/noteImport/markdownParser'
import { buildNotionImportTree, type NotionDocumentPlan } from '../utils/noteImport/notion/tree'
import { createNotionLinkResolver } from '../utils/noteImport/notion/links'
import { preprocessNotionHtml } from '../utils/noteImport/notion/html'
import { normalizeNotionDocument } from '../utils/noteImport/notion/content'
import { resolveNotionAssets } from '../utils/noteImport/notion/assets'
import { createDatabaseMetadata, parseNotionCsv } from '../utils/noteImport/notion/csvDatabase'
import { stripNotionId } from '../utils/noteImport/notion/paths'
import type { BlockNode, NoteDocument } from '../types/note'
import type {
  NotionExportManifest,
  NotionImportIssue,
  NotionImportProgress,
  NotionImportResult,
} from '../types/notion-import'

interface PendingDocument {
  plan: NotionDocumentPlan
  note: NoteDocument
}

function idleProgress(): NotionImportProgress {
  return {
    phase: 'idle',
    totalItems: 0,
    processedItems: 0,
    foldersCreated: 0,
    notesCreated: 0,
    databasesCreated: 0,
    assetsImported: 0,
    warnings: 0,
    errors: 0,
    error: null,
  }
}

function codeFallback(content: string, language: 'markdown' | 'csv'): BlockNode {
  return {
    type: 'doc',
    content: [{ type: 'code_block', attrs: { language }, content: content ? [{ type: 'text', text: content }] : [] }],
  }
}

function uniqueRootName(baseName: string, existingNames: readonly string[]): string {
  const used = new Set(existingNames.map(name => name.trim().toLocaleLowerCase()))
  if (!used.has(baseName.toLocaleLowerCase())) return baseName
  let suffix = 2
  while (used.has(`${baseName} ${suffix}`.toLocaleLowerCase())) suffix += 1
  return `${baseName} ${suffix}`
}

export function useNotionImport(): {
  importing: Ref<boolean>
  progress: Ref<NotionImportProgress>
  importExport: () => Promise<NotionImportResult | null>
} {
  const treeStore = useTreeStore()
  const workspaceStore = useWorkspaceStore()
  const noteStore = useNoteStore()
  const importing = ref(false)
  const progress = ref<NotionImportProgress>(idleProgress())

  function issue(issues: NotionImportIssue[], path: string, reason: unknown, kind: 'warning' | 'error') {
    const message = reason instanceof Error ? reason.message : String(reason)
    issues.push({ path, reason: message })
    if (kind === 'warning') progress.value.warnings += 1
    else progress.value.errors += 1
  }

  async function createFolders(
    manifest: NotionExportManifest,
    rootFolderId: string,
    issues: NotionImportIssue[],
  ) {
    const tree = buildNotionImportTree(manifest.documents)
    const folderIdByPath = new Map<string, string>()
    for (const folderPlan of tree.folders) {
      const parentId = folderPlan.parentPath
        ? folderIdByPath.get(folderPlan.parentPath) ?? rootFolderId
        : rootFolderId
      try {
        const folder = await treeStore.createFolder(parentId, folderPlan.title)
        if (!folder) throw new Error('Folder could not be created')
        folderIdByPath.set(folderPlan.path, folder.id)
        progress.value.foldersCreated += 1
      } catch (error) {
        issue(issues, folderPlan.path, error, 'error')
      }
    }
    return { tree, folderIdByPath }
  }

  async function createNotes(
    plans: NotionDocumentPlan[],
    rootFolderId: string,
    folderIdByPath: ReadonlyMap<string, string>,
    issues: NotionImportIssue[],
  ) {
    const pending: PendingDocument[] = []
    const noteIdByKey = new Map<string, string>()
    for (const plan of plans) {
      const folderId = plan.folderPath ? folderIdByPath.get(plan.folderPath) ?? rootFolderId : rootFolderId
      try {
        const note = await treeStore.createNote(folderId, plan.title, plan.document.kind === 'csv' ? '🗃️' : '📄')
        if (!note) throw new Error('Note could not be created')
        pending.push({ plan, note })
        noteIdByKey.set(plan.key, note.id)
        progress.value.notesCreated += 1
      } catch (error) {
        issue(issues, plan.document.relativePath, error, 'error')
      }
    }
    return { pending, noteIdByKey }
  }

  async function saveImportedNote(note: NoteDocument, content: BlockNode) {
    const workspacePath = workspaceStore.activePath
    if (!workspacePath) throw new Error('Local workspace path is unavailable')
    const updatedAt = new Date().toISOString()
    await noteCommands.saveNote(workspacePath, { ...note, content, updatedAt })
    await collabCommands.deleteYjsState(workspacePath, note.id)
    noteStore.invalidateNoteCache(note.id)
    treeStore.syncNoteMeta(note.id, { title: note.title, icon: note.icon }, updatedAt)
  }

  async function writeMarkdown(
    pending: PendingDocument,
    plans: NotionDocumentPlan[],
    noteIdByKey: ReadonlyMap<string, string>,
    importedByPath: ReadonlyMap<string, import('../types/note').ImportedImageAsset | null>,
    sizeByPath: ReadonlyMap<string, number>,
    issues: NotionImportIssue[],
  ) {
    const { document, title } = pending.plan
    let doc: BlockNode
    try {
      const preprocessed = preprocessNotionHtml(document.content)
      if (preprocessed.warnings) {
        progress.value.warnings += preprocessed.warnings
        issues.push({ path: document.relativePath, reason: `${preprocessed.warnings} unsupported HTML fragment(s) were converted to text` })
      }
      const resolver = createNotionLinkResolver(document.relativePath, plans, noteIdByKey, reference => {
        issue(issues, document.relativePath, `Unresolved link: ${reference}`, 'warning')
      })
      const parsed = await parseMarkdownToBlockNodeAsync(preprocessed.markdown, title, undefined, {
        extractTitle: false,
        markdownLinkResolver: resolver,
      })
      doc = normalizeNotionDocument(parsed.content, title)
      doc = resolveNotionAssets(doc, document.relativePath, importedByPath, sizeByPath, path => {
        issue(issues, path, 'Attachment could not be imported', 'warning')
      })
    } catch (error) {
      issue(issues, document.relativePath, error, 'error')
      doc = codeFallback(document.content, 'markdown')
    }
    await saveImportedNote(pending.note, doc)
  }

  async function writeCsv(pending: PendingDocument, issues: NotionImportIssue[]) {
    const { document, title } = pending.plan
    let doc: BlockNode
    try {
      const { fields, records } = parseNotionCsv(document.content)
      const metadata = createDatabaseMetadata(title, fields, records.length)
      const repository = createDatabaseRepository(workspaceStore.activePath)
      await repository.importRecords(metadata.databaseId, records, 'replace')
      doc = { type: 'doc', content: [{ type: 'database_block', attrs: { data: metadata } }] }
      progress.value.databasesCreated += 1
    } catch (error) {
      issue(issues, document.relativePath, error, 'error')
      doc = codeFallback(document.content, 'csv')
    }
    await saveImportedNote(pending.note, doc)
  }

  async function importExport(): Promise<NotionImportResult | null> {
    if (workspaceStore.backendKind !== 'local' || !workspaceStore.activePath || !workspaceStore.manifest) {
      progress.value = { ...idleProgress(), phase: 'error', error: 'Notion import is available only in local workspaces' }
      return null
    }
    importing.value = true
    progress.value = { ...idleProgress(), phase: 'scanning' }
    let sessionToken: string | null = null
    const issues: NotionImportIssue[] = []
    try {
      const manifest = await pickAndScanNotionExport()
      if (!manifest) {
        progress.value.phase = 'idle'
        return null
      }
      sessionToken = manifest.sessionToken
      progress.value.totalItems = manifest.documents.length + manifest.assets.length
      for (const skipped of manifest.skipped) issue(issues, skipped.relativePath, skipped.reason, 'warning')

      const baseName = `${stripNotionId(manifest.exportName)} (Notion)`
      const rootName = uniqueRootName(baseName, workspaceStore.manifest.tree.map(folder => folder.title))
      const rootFolder = await treeStore.createFolder(null, rootName)
      if (!rootFolder) throw new Error('Import root folder could not be created')
      progress.value.foldersCreated += 1

      progress.value.phase = 'folders'
      const { tree, folderIdByPath } = await createFolders(manifest, rootFolder.id, issues)

      progress.value.phase = 'creating'
      const { pending, noteIdByKey } = await createNotes(tree.documents, rootFolder.id, folderIdByPath, issues)

      progress.value.phase = 'assets'
      let assetResults: Awaited<ReturnType<typeof importNotionAssets>>
      try {
        assetResults = await importNotionAssets(
          workspaceStore.activePath,
          manifest.sessionToken,
          manifest.assets.map(asset => asset.relativePath),
        )
      } catch (error) {
        assetResults = manifest.assets.map(asset => ({
          relativePath: asset.relativePath,
          asset: null,
          error: error instanceof Error ? error.message : String(error),
        }))
      }
      const importedByPath = new Map(assetResults.map(result => [result.relativePath, result.asset]))
      const sizeByPath = new Map(manifest.assets.map(asset => [asset.relativePath, asset.size]))
      for (const result of assetResults) {
        if (result.asset) progress.value.assetsImported += 1
        else issue(issues, result.relativePath, result.error ?? 'Attachment import failed', 'error')
        progress.value.processedItems += 1
      }

      progress.value.phase = 'writing'
      for (const item of pending) {
        try {
          if (item.plan.document.kind === 'csv') await writeCsv(item, issues)
          else await writeMarkdown(item, tree.documents, noteIdByKey, importedByPath, sizeByPath, issues)
        } catch (error) {
          issue(issues, item.plan.document.relativePath, error, 'error')
        }
        progress.value.processedItems += 1
      }

      progress.value.phase = 'done'
      void workspaceStore.refreshSidebarNotePreviews()
      return {
        rootName,
        rootFolderId: rootFolder.id,
        foldersCreated: progress.value.foldersCreated,
        notesCreated: progress.value.notesCreated,
        databasesCreated: progress.value.databasesCreated,
        assetsImported: progress.value.assetsImported,
        warnings: progress.value.warnings,
        errors: progress.value.errors,
        issues,
      }
    } catch (error) {
      progress.value.phase = 'error'
      progress.value.error = error instanceof Error ? error.message : String(error)
      return null
    } finally {
      if (sessionToken) {
        try {
          await releaseNotionImport(sessionToken)
        } catch {
          progress.value.warnings += 1
        }
      }
      importing.value = false
    }
  }

  return { importing, progress, importExport }
}
