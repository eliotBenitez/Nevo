import { reactive, toRaw } from 'vue'
import type { NoteDocument } from '../types/note'
import { noteCommands } from '../tauri/commands'
import { loadHyperformula } from '../editor-core/tableFormula'
import type { DocxExportOptions } from '../utils/noteExport/docxOptions'
import { normalizeDatabaseData, type DatabaseBlockDataV1 } from '../types/database-block'
import { createDatabaseRepository } from '../features/database/databaseRepository'

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

/** Export serializers are synchronous, so hydrate v2 database references into
 * a disposable v1-shaped clone before passing the note to them. */
async function hydrateDatabasesForExport(note: NoteDocument, workspacePath: string): Promise<NoteDocument> {
  const hydrated = cloneNote(note)
  const repository = createDatabaseRepository(workspacePath)
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
  })

  const docxPreview = reactive({
    open: false,
    note: null as NoteDocument | null,
    workspacePath: '',
  })

  async function exportAsMarkdown(note: NoteDocument, workspacePath: string): Promise<void> {
    const exportNote = await hydrateDatabasesForExport(note, workspacePath)
    const safeName = sanitizeFilename(note.title, `note-${note.id}`)
    const assetsSubfolderName = `${safeName}_assets`
    await loadHyperformula()
    const { serializeNoteToMarkdownAsync } = await import('../utils/noteExport/markdownSerializer')
    const { markdown, assetSrcs } = await serializeNoteToMarkdownAsync(exportNote, assetsSubfolderName)

    await noteCommands.exportNoteMarkdown(
      workspacePath,
      `${safeName}.md`,
      markdown,
      assetSrcs,
      assetsSubfolderName,
    )
  }

  async function exportAsDocx(note: NoteDocument, workspacePath: string): Promise<void> {
    docxPreview.note = await hydrateDatabasesForExport(note, workspacePath)
    docxPreview.workspacePath = workspacePath
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

  async function exportAsHtml(note: NoteDocument, workspacePath: string): Promise<void> {
    const exportNote = await hydrateDatabasesForExport(note, workspacePath)
    const safeName = sanitizeFilename(note.title, `note-${note.id}`)

    const assetsSubfolderName = `${safeName}_assets`
    await loadHyperformula()
    const { serializeNoteToHtml } = await import('../utils/noteExport/htmlSerializer')
    const { html, assetSrcs } = await serializeNoteToHtml(exportNote, assetsSubfolderName)
    await noteCommands.exportNoteHtml(
      workspacePath,
      `${safeName}.html`,
      html,
      assetSrcs,
      assetsSubfolderName,
    )
  }

  async function exportAsTypst(note: NoteDocument, workspacePath: string): Promise<void> {
    const exportNote = await hydrateDatabasesForExport(note, workspacePath)
    const safeName = sanitizeFilename(note.title, `note-${note.id}`)

    const stem = `${safeName}-typst`
    await loadHyperformula()
    const { buildTypstExport } = await import('../utils/noteExport/buildTypstExport')
    const { source, assets } = await buildTypstExport(exportNote, undefined, {
      assetPathPrefix: `${stem}_assets/`,
    })
    await noteCommands.exportNoteTypstArchive(
      workspacePath,
      `${safeName}-typst.zip`,
      source,
      assets,
    )
  }

  async function exportAsPdf(note: NoteDocument, workspacePath: string): Promise<void> {
    pdfPreview.note = await hydrateDatabasesForExport(note, workspacePath)
    pdfPreview.workspacePath = workspacePath
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
