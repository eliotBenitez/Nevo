import { reactive, toRaw } from 'vue'
import type { NoteDocument } from '../types/note'
import { noteCommands } from '../tauri/commands'
import { loadHyperformula } from '../editor-core/tableFormula'
import type { DocxExportOptions } from '../utils/noteExport/docxOptions'
import { normalizeDatabaseData, type DatabaseBlockDataV1 } from '../types/database-block'
import { createDatabaseRepository } from '../features/database/databaseRepository'
import { useWorkspaceStore } from '../stores/workspace'
import { CloudBackend } from '../core/workspace-backend'
import { prepareCloudExportAssets, type PreparedCloudAssets } from '../utils/noteExport/cloudExportAssets'

function sanitizeFilename(title: string, fallback: string): string {
  const safe = title.replace(/[/\\?%*:|"<>]/g, '-').trim()
  return safe || fallback
}

function cloneNote(note: NoteDocument): NoteDocument {
  const raw = toRaw(note)
  try {
    if (typeof structuredClone === 'function') return structuredClone(raw)
  } catch {
    // Vue/Tauri can attach non-cloneable values to nested reactive objects.
  }
  return JSON.parse(JSON.stringify(raw)) as NoteDocument
}

/**
 * Everything the serializers need that they cannot do themselves, on a
 * disposable clone: v2 database references hydrated into v1 shape (the
 * serializers are synchronous), and — for cloud workspaces — asset references
 * rewritten to local-shaped paths with their bytes pulled off the relay.
 */
async function prepareNoteForExport(note: NoteDocument, workspacePath: string | null): Promise<PreparedCloudAssets> {
  const store = useWorkspaceStore()
  const hydrated = await hydrateDatabasesForExport(note, workspacePath)
  const backend = store.backend
  if (!(backend instanceof CloudBackend)) {
    return { note: hydrated, inlineAssets: [], bytesByName: new Map() }
  }
  return prepareCloudExportAssets(hydrated, src => backend.readAssetBytes(src))
}

/** Export serializers are synchronous, so hydrate v2 database references into
 * a disposable v1-shaped clone before passing the note to them. */
async function hydrateDatabasesForExport(note: NoteDocument, workspacePath: string | null): Promise<NoteDocument> {
  const hydrated = cloneNote(note)
  // The row store is backend-owned: SQLite locally, the manifest doc on cloud.
  const repository = useWorkspaceStore().backend?.databaseRepository()
    ?? createDatabaseRepository(workspacePath)
  const visit = async (node: NoteDocument['content']): Promise<void> => {
    if (node.type === 'database_block') {
      const data = normalizeDatabaseData(node.attrs?.data)
      if (data.version === 2) {
        const legacy: DatabaseBlockDataV1 = {
          version: 1,
          title: data.title,
          fields: data.fields,
          records: await repository.readAllRecords(data.databaseId),
          activeView: data.activeView,
          views: data.views,
        }
        node.attrs = { ...node.attrs, data: legacy }
      }
    }
    for (const child of node.content ?? []) await visit(child)
  }
  await visit(hydrated.content)
  return hydrated
}

export function useNoteExport() {
  const pdfPreview = reactive({
    open: false,
    note: null as NoteDocument | null,
    workspacePath: '',
    /** Cloud asset bytes by generated file name; empty for local workspaces. */
    assetBytes: new Map<string, Uint8Array>(),
  })

  const docxPreview = reactive({
    open: false,
    note: null as NoteDocument | null,
    workspacePath: '',
  })

  async function exportAsMarkdown(note: NoteDocument, workspacePath: string | null): Promise<void> {
    const { note: exportNote, inlineAssets } = await prepareNoteForExport(note, workspacePath)
    const safeName = sanitizeFilename(note.title, `note-${note.id}`)
    const assetsSubfolderName = `${safeName}_assets`
    await loadHyperformula()
    const { serializeNoteToMarkdownAsync } = await import('../utils/noteExport/markdownSerializer')
    const { markdown, assetSrcs } = await serializeNoteToMarkdownAsync(exportNote, assetsSubfolderName)

    await noteCommands.exportNoteMarkdown(
      workspacePath,
      `${safeName}.md`,
      markdown,
      // Cloud assets are written from the bytes below; only a real workspace
      // has files on disk to copy.
      workspacePath ? assetSrcs : [],
      assetsSubfolderName,
      inlineAssets,
    )
  }

  async function exportAsDocx(note: NoteDocument, workspacePath: string | null): Promise<void> {
    docxPreview.note = await hydrateDatabasesForExport(note, workspacePath)
    docxPreview.workspacePath = workspacePath ?? ''
    docxPreview.open = true
  }

  function closeDocxPreview(): void {
    docxPreview.open = false
    docxPreview.note = null
  }

  async function saveDocxWithOptions(note: NoteDocument, workspacePath: string, options: DocxExportOptions): Promise<void> {
    const safeName = sanitizeFilename(note.title, `note-${note.id}`)

    await loadHyperformula()
    const [{ serializeNoteToDocx }, { createDocxExportHelpers }, { Packer }] = await Promise.all([
      import('../utils/noteExport/docxSerializer'),
      import('../utils/noteExport/docxAssets'),
      import('docx'),
    ])
    const helpers = createDocxExportHelpers(workspacePath)
    const doc = await serializeNoteToDocx(note, helpers, options)
    const blob = await Packer.toBlob(doc)
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
    await noteCommands.exportNoteDocx(`${safeName}.docx`, bytes)
  }

  async function exportAsHtml(note: NoteDocument, workspacePath: string | null): Promise<void> {
    const { note: exportNote, inlineAssets } = await prepareNoteForExport(note, workspacePath)
    const safeName = sanitizeFilename(note.title, `note-${note.id}`)

    const assetsSubfolderName = `${safeName}_assets`
    await loadHyperformula()
    const { serializeNoteToHtml } = await import('../utils/noteExport/htmlSerializer')
    const { html, assetSrcs } = await serializeNoteToHtml(exportNote, assetsSubfolderName)
    await noteCommands.exportNoteHtml(
      workspacePath,
      `${safeName}.html`,
      html,
      workspacePath ? assetSrcs : [],
      assetsSubfolderName,
      inlineAssets,
    )
  }

  async function exportAsTypst(note: NoteDocument, workspacePath: string | null): Promise<void> {
    const { note: exportNote, bytesByName } = await prepareNoteForExport(note, workspacePath)
    const safeName = sanitizeFilename(note.title, `note-${note.id}`)

    const stem = `${safeName}-typst`
    await loadHyperformula()
    const { buildTypstExport } = await import('../utils/noteExport/buildTypstExport')
    const { source, assets } = await buildTypstExport(exportNote, undefined, {
      assetPathPrefix: `${stem}_assets/`,
      assetBytes: bytesByName,
    })
    await noteCommands.exportNoteTypstArchive(
      workspacePath ?? '',
      `${safeName}-typst.zip`,
      source,
      assets,
    )
  }

  async function exportAsPdf(note: NoteDocument, workspacePath: string | null): Promise<void> {
    // The preview modal builds the Typst source itself, so it needs the cloud
    // asset bytes alongside the note.
    const prepared = await prepareNoteForExport(note, workspacePath)
    pdfPreview.note = prepared.note
    pdfPreview.assetBytes = prepared.bytesByName
    pdfPreview.workspacePath = workspacePath ?? ''
    pdfPreview.open = true
  }

  function closePdfPreview(): void {
    pdfPreview.open = false
    pdfPreview.note = null
  }

  return {
    exportAsMarkdown,
    exportAsHtml,
    exportAsDocx,
    exportAsTypst,
    exportAsPdf,
    pdfPreview,
    closePdfPreview,
    docxPreview,
    closeDocxPreview,
    saveDocxWithOptions,
  }
}
