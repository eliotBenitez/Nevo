export type PdfPaperFormat = 'A4' | 'Letter'
export type PdfOrientation = 'portrait' | 'landscape'
export type PdfMarginPreset = 'narrow' | 'normal' | 'wide'
export type PdfLineSpacing = 'compact' | 'normal' | 'relaxed'

export interface PdfExportOptions {
  paperFormat: PdfPaperFormat
  orientation: PdfOrientation
  fontSize: number
  /** System font family name; empty string uses the default embedded serif. */
  fontFamily: string
  marginPreset: PdfMarginPreset
  lineSpacing: PdfLineSpacing
  pageNumbers: boolean
  headingNumbers: boolean
  tableOfContents: boolean
  titlePage: boolean
  runningHeader: boolean
}

/** Embedded Typst font used as the default and as a fallback for any chosen font. */
export const FALLBACK_FONT = 'Libertinus Serif'

/** Margins in millimetres: [top, right, bottom, left]. */
export const MARGIN_PRESETS_MM: Record<PdfMarginPreset, [number, number, number, number]> = {
  narrow: [16, 16, 16, 16],
  normal: [25, 20, 25, 20],
  wide: [32, 26, 32, 26],
}

/** `par` leading (line spacing) and block spacing (paragraph spacing) per preset. */
export const LINE_SPACING_EXPR: Record<PdfLineSpacing, { leading: string; spacing: string }> = {
  compact: { leading: '0.5em', spacing: '0.65em' },
  normal: { leading: '0.65em', spacing: '1em' },
  relaxed: { leading: '0.9em', spacing: '1.4em' },
}

export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  paperFormat: 'A4',
  orientation: 'portrait',
  fontSize: 11,
  fontFamily: '',
  marginPreset: 'normal',
  lineSpacing: 'normal',
  pageNumbers: false,
  headingNumbers: false,
  tableOfContents: false,
  titlePage: false,
  runningHeader: false,
}
