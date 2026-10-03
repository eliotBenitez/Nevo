import type { NoteDocument } from '../../types/note'
import type { TypstAsset } from '../../tauri/commands'
import { DEFAULT_PDF_OPTIONS, type PdfExportOptions } from './pdfOptions'
import { serializeNoteToTypstAsync } from './typstSerializer'
import { renderMermaidToSvgForPdf } from './mermaidToSvg'
import { renderMarkmapToExportSvg } from './markmapToSvg'
import { renderVegaToSvg } from './vegaToSvg'

export interface TypstExportPayload {
  source: string
  assets: TypstAsset[]
}

export interface BuildTypstExportOptions {
  assetPathPrefix?: string
  /** Image bytes by file name, for assets not resolvable from a workspace
   *  path. Anything not listed here is resolved from its path in Rust. */
  assetBytes?: Map<string, Uint8Array>
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function utf8ToBase64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value))
}

/**
 * The drawing preview SVG uses `width="100%"` for fluid in-app layout, but
 * usvg/resvg needs a concrete intrinsic size to rasterise. Replace it with the
 * pixel width/height taken from the viewBox so the PDF gets a deterministic,
 * correctly-proportioned image.
 */
function normalizeDrawSvgForExport(svg: string): string {
  const viewBox = svg.match(/viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*"/)
  if (!viewBox) return svg
  const w = Number(viewBox[3])
  const h = Number(viewBox[4])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return svg
  if (/\swidth="100%"/.test(svg)) {
    return svg.replace(/\swidth="100%"/, ` width="${w}" height="${h}"`)
  }
  if (!/\swidth=/.test(svg)) {
    return svg.replace(/<svg\b/, `<svg width="${w}" height="${h}"`)
  }
  return svg
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
  const { source, images, mermaid, markmap, vega, draw } = await serializeNoteToTypstAsync(note, options, {
    assetPathPrefix: buildOptions.assetPathPrefix,
  })

  // A workspace image is resolved from its path in Rust; anything without a
  // file on disk instead carries its bytes inline, keyed by file name.
  const assets: TypstAsset[] = images.map((img) => {
    const inline = buildOptions.assetBytes?.get(img.src.split('/').pop() ?? '')
    return inline
      ? { name: img.name, bytesBase64: bytesToBase64(inline) }
      : { name: img.name, relPath: img.src }
  })

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

  for (const chart of vega) {
    const svg = await renderVegaToSvg(chart.spec)
    if (svg) assets.push({ name: chart.name, bytesBase64: utf8ToBase64(svg) })
  }

  // Drawings already carry a native-path SVG snapshot (svgPreview); just give
  // usvg a concrete size and inline it.
  for (const drawing of draw) {
    const svg = normalizeDrawSvgForExport(drawing.svg)
    if (svg) assets.push({ name: drawing.name, bytesBase64: utf8ToBase64(svg) })
  }

  return { source, assets }
}
