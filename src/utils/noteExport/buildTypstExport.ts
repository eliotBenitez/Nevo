import type { NoteDocument } from '../../types/note'
import type { TypstAsset } from '../../tauri/commands'
import { DEFAULT_PDF_OPTIONS, type PdfExportOptions } from './pdfOptions'
import { serializeNoteToTypst } from './typstSerializer'
import { renderMermaidToSvgForPdf } from './mermaidToSvg'
import { renderMarkmapToExportSvg } from './markmapToSvg'

export interface TypstExportPayload {
  source: string
  assets: TypstAsset[]
}

export interface BuildTypstExportOptions {
  assetPathPrefix?: string
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/**
 * Serialize a note to Typst source and collect every asset the compiler needs.
 * Mermaid diagrams are rendered to SVG with font declarations rewritten so that
 * usvg/resvg can resolve them (system fonts, no CSS custom properties).
 * Images are passed by workspace-relative path and resolved to bytes in Rust.
 */
export async function buildTypstExport(
  note: NoteDocument,
  options: PdfExportOptions = DEFAULT_PDF_OPTIONS,
  buildOptions: BuildTypstExportOptions = {},
): Promise<TypstExportPayload> {
  const { source, images, mermaid, markmap } = serializeNoteToTypst(note, options, {
    assetPathPrefix: buildOptions.assetPathPrefix,
  })

  const assets: TypstAsset[] = images.map(img => ({ name: img.name, relPath: img.src }))

  for (const diagram of mermaid) {
    const svg = await renderMermaidToSvgForPdf(diagram.code)
    if (svg) assets.push({ name: diagram.name, bytesBase64: utf8ToBase64(svg) })
  }

  // Mind maps render labels in HTML <foreignObject>, which Typst's usvg rasteriser
  // ignores — so the export variant rewrites those labels as native SVG text/math
  // before serialising.
  for (const mindmap of markmap) {
    const svg = await renderMarkmapToExportSvg(mindmap.markdown)
    if (svg) assets.push({ name: mindmap.name, bytesBase64: utf8ToBase64(svg) })
  }

  return { source, assets }
}
