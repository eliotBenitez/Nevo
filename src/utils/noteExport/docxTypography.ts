export interface DocxTextStyle {
  fontSizePt?: number
  color?: string
  italics?: boolean
}

export const DOCX_TITLE_PAGE_FONT_SIZE_PT = 24
export const DOCX_TITLE_STYLE: DocxTextStyle = {
  fontSizePt: 28,
}

export const DOCX_HEADING_STYLES: readonly DocxTextStyle[] = [
  { fontSizePt: 16, color: '2E74B5' },
  { fontSizePt: 13, color: '2E74B5' },
  { fontSizePt: 12, color: '1F4D78' },
  { color: '2E74B5', italics: true },
  { color: '2E74B5' },
  { color: '1F4D78' },
]

export const DOCX_CODE_FONT_SIZE_PT = 9
export const DOCX_LIST_LEFT_INDENT_TWIPS = 720
export const DOCX_LIST_HANGING_INDENT_TWIPS = 360
export const DOCX_BLOCKQUOTE_LEFT_INDENT_TWIPS = 480

export function pointsToHalfPoints(points: number): number {
  return Math.round(points * 2)
}
