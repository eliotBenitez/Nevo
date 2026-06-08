import { reactive, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoteDocument } from '../types/note'
import { noteCommands } from '../tauri/commands'
import { serializeNoteToMarkdown } from '../utils/noteExport/markdownSerializer'
import { serializeNoteToHtml } from '../utils/noteExport/htmlSerializer'
import { buildTypstExport } from '../utils/noteExport/buildTypstExport'

function sanitizeFilename(title: string, fallback: string): string {
  const safe = title.replace(/[/\\?%*:|"<>]/g, '-').trim()
  return safe || fallback
}

function exportStem(exportPath: string, fallback: string): string {
  const filename = exportPath.split(/[\\/]/).pop() ?? ''
  const dot = filename.lastIndexOf('.')
  const stem = dot > 0 ? filename.slice(0, dot) : filename
  return stem || fallback
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

export function useNoteExport() {
  const { t } = useI18n()

  const pdfPreview = reactive({
    open: false,
    note: null as NoteDocument | null,
    workspacePath: '',
  })

  async function exportAsMarkdown(note: NoteDocument, workspacePath: string): Promise<void> {
    const safeName = sanitizeFilename(note.title, `note-${note.id}`)
    const assetsSubfolderName = `${safeName}_assets`
    const { markdown, assetSrcs } = serializeNoteToMarkdown(note, assetsSubfolderName)

    let savePath: string | null | undefined
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      savePath = await save({
        title: t('export.saveDialogTitle'),
        defaultPath: `${safeName}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
    } catch {
      return
    }
    if (!savePath) return

    await noteCommands.exportNoteMarkdown(workspacePath, savePath, markdown, assetSrcs)
  }

  async function exportAsHtml(note: NoteDocument, workspacePath: string): Promise<void> {
    const safeName = sanitizeFilename(note.title, `note-${note.id}`)

    let savePath: string | null | undefined
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      savePath = await save({
        title: t('export.saveHtmlDialogTitle'),
        defaultPath: `${safeName}.html`,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      })
    } catch {
      return
    }
    if (!savePath) return

    const assetsSubfolderName = `${exportStem(savePath, safeName)}_assets`
    const { html, assetSrcs } = await serializeNoteToHtml(note, assetsSubfolderName)
    await noteCommands.exportNoteHtml(workspacePath, savePath, html, assetSrcs)
  }

  async function exportAsTypst(note: NoteDocument, workspacePath: string): Promise<void> {
    const safeName = sanitizeFilename(note.title, `note-${note.id}`)

    let savePath: string | null | undefined
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      savePath = await save({
        title: t('export.saveTypstDialogTitle'),
        defaultPath: `${safeName}-typst.zip`,
        filters: [{ name: 'Typst archive', extensions: ['zip'] }],
      })
    } catch {
      return
    }
    if (!savePath) return

    const stem = exportStem(savePath, `${safeName}-typst`)
    const { source, assets } = await buildTypstExport(note, undefined, {
      assetPathPrefix: `${stem}_assets/`,
    })
    await noteCommands.exportNoteTypstArchive(workspacePath, savePath, source, assets)
  }

  function exportAsPdf(note: NoteDocument, workspacePath: string): void {
    pdfPreview.note = cloneNote(note)
    pdfPreview.workspacePath = workspacePath
    pdfPreview.open = true
  }

  function closePdfPreview(): void {
    pdfPreview.open = false
    pdfPreview.note = null
  }

  return { exportAsMarkdown, exportAsHtml, exportAsTypst, exportAsPdf, pdfPreview, closePdfPreview }
}
