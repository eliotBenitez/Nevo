export type DocxPaperFormat = 'A4' | 'Letter'
export type DocxOrientation = 'portrait' | 'landscape'

export interface DocxExportOptions {
  paperFormat: DocxPaperFormat
  orientation: DocxOrientation
  fontSize: number
  /** System font family name; empty string uses the default Calibri/Arial fallback. */
  fontFamily: string
  // Margins in millimeters (default: top 25, right 20, bottom 25, left 20)
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  // Line spacing multiplier (default: 1.15)
  lineSpacing: number
  // Paragraph spacing after in points (default: 8pt)
  paragraphSpacing: number
  pageNumbers: boolean
  headingNumbers: boolean
  tableOfContents: boolean
  titlePage: boolean
  runningHeader: boolean
  exportNoteTitle: boolean
}

export const DEFAULT_DOCX_OPTIONS: DocxExportOptions = {
  paperFormat: 'A4',
  orientation: 'portrait',
  fontSize: 11,
  fontFamily: '',
  marginTop: 25,
  marginRight: 20,
  marginBottom: 25,
  marginLeft: 20,
  lineSpacing: 1.15,
  paragraphSpacing: 8,
  pageNumbers: false,
  headingNumbers: false,
  tableOfContents: false,
  titlePage: false,
  runningHeader: false,
  exportNoteTitle: true,
}
