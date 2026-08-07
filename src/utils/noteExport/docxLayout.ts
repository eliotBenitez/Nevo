import type { DocxExportOptions, DocxOrientation, DocxPaperFormat } from './docxOptions'

export const CSS_DPI = 96
export const MM_PER_INCH = 25.4
export const POINTS_PER_INCH = 72
export const TWIPS_PER_INCH = 1440
export const DOCX_HEADER_DISTANCE_MM = 12.7
export const DOCX_FOOTER_DISTANCE_MM = 12.7

const PAPER_SIZE_MM: Record<DocxPaperFormat, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
}

export interface DocxPageMargins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface DocxPageGeometry {
  paperFormat: DocxPaperFormat
  orientation: DocxOrientation
  portraitWidthMm: number
  portraitHeightMm: number
  pageWidthMm: number
  pageHeightMm: number
  pageWidthPx: number
  pageHeightPx: number
  marginsMm: DocxPageMargins
  contentWidthMm: number
  contentHeightMm: number
  contentWidthPx: number
  contentHeightPx: number
  headerDistanceMm: number
  footerDistanceMm: number
  headerAreaHeightMm: number
  footerAreaHeightMm: number
}

export function mmToPx(mm: number): number {
  return (mm / MM_PER_INCH) * CSS_DPI
}

export function pxToMm(px: number): number {
  return (px / CSS_DPI) * MM_PER_INCH
}

export function ptToPx(points: number): number {
  return (points / POINTS_PER_INCH) * CSS_DPI
}

export function pxToPt(px: number): number {
  return (px / CSS_DPI) * POINTS_PER_INCH
}

export function twipToPx(twips: number): number {
  return (twips / TWIPS_PER_INCH) * CSS_DPI
}

export function mmToTwip(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * TWIPS_PER_INCH)
}

export function createDocxPageGeometry(
  options: Pick<
    DocxExportOptions,
    'paperFormat' | 'orientation' | 'marginTop' | 'marginRight' | 'marginBottom' | 'marginLeft'
  >,
): DocxPageGeometry {
  const portrait = PAPER_SIZE_MM[options.paperFormat]
  const landscape = options.orientation === 'landscape'
  const pageWidthMm = landscape ? portrait.height : portrait.width
  const pageHeightMm = landscape ? portrait.width : portrait.height
  const marginsMm = {
    top: options.marginTop,
    right: options.marginRight,
    bottom: options.marginBottom,
    left: options.marginLeft,
  }
  const contentWidthMm = Math.max(0, pageWidthMm - marginsMm.left - marginsMm.right)
  const contentHeightMm = Math.max(0, pageHeightMm - marginsMm.top - marginsMm.bottom)

  return {
    paperFormat: options.paperFormat,
    orientation: options.orientation,
    portraitWidthMm: portrait.width,
    portraitHeightMm: portrait.height,
    pageWidthMm,
    pageHeightMm,
    pageWidthPx: mmToPx(pageWidthMm),
    pageHeightPx: mmToPx(pageHeightMm),
    marginsMm,
    contentWidthMm,
    contentHeightMm,
    contentWidthPx: mmToPx(contentWidthMm),
    contentHeightPx: mmToPx(contentHeightMm),
    headerDistanceMm: DOCX_HEADER_DISTANCE_MM,
    footerDistanceMm: DOCX_FOOTER_DISTANCE_MM,
    headerAreaHeightMm: Math.max(0, marginsMm.top - DOCX_HEADER_DISTANCE_MM),
    footerAreaHeightMm: Math.max(0, marginsMm.bottom - DOCX_FOOTER_DISTANCE_MM),
  }
}
