export const NOTEBOOK_SNAPSHOT_VERSION = 1 as const
export const NOTEBOOK_PAGE_LIMIT = 1_000
export const NOTEBOOK_OBJECT_LIMIT = 100_000
export const NOTEBOOK_POINT_LIMIT = 2_000_000
export const NOTEBOOK_SEGMENT_POINT_LIMIT = 4_096
export const NOTEBOOK_SERIALIZED_LIMIT_BYTES = 100 * 1024 * 1024
export const NOTEBOOK_COORDINATE_LIMIT = Number.MAX_SAFE_INTEGER
export const NOTEBOOK_A4_WIDTH = 595.28
export const NOTEBOOK_A4_HEIGHT = 841.89

export type NotebookPaperKind = 'plain' | 'grid' | 'ruled'
export type NotebookStrokeKind = 'stroke' | 'highlighter'
/** Line dash pattern for the straight-line tool. Absent means `solid`. */
export type NotebookLineStyle = 'solid' | 'dashed' | 'dotted'

export interface NotebookPointV1 {
  [key: string]: unknown
  x: number
  y: number
  pressure?: number
}

export interface NotebookPaperV1 {
  [key: string]: unknown
  kind: NotebookPaperKind
}

export interface NotebookStrokeV1 {
  [key: string]: unknown
  id: string
  kind: NotebookStrokeKind
  actionId: string
  color: string
  width: number
  opacity: number
  /** Present only for the straight-line tool. Kept optional for backward compatibility. */
  dash?: NotebookLineStyle
  /**
   * How the stored points were produced. `'modeled'` means they are the
   * output of the stroke modeler and are drawn without lagging smoothing;
   * absent or any other string renders like a legacy stroke.
   */
  path?: string
  points: NotebookPointV1[]
}

/**
 * Raster image placed on a page. `points` are exactly four corners
 * (top-left, top-right, bottom-right, bottom-left) of the displayed,
 * possibly rotated rectangle.
 */
export interface NotebookImageV1 {
  [key: string]: unknown
  id: string
  actionId: string
  kind: 'image'
  /** `.nevo/assets/<name>` as returned by the asset import command. */
  src: string
  opacity: number
  points: NotebookPointV1[]
}

export type NotebookObjectV1 = NotebookStrokeV1 | NotebookImageV1

export function isNotebookStroke(object: NotebookObjectV1): object is NotebookStrokeV1 {
  return object.kind === 'stroke' || object.kind === 'highlighter'
}

export function isNotebookImage(object: NotebookObjectV1): object is NotebookImageV1 {
  return object.kind === 'image'
}

export interface NotebookPageV1 {
  [key: string]: unknown
  id: string
  width: number
  height: number
  paper: NotebookPaperV1
  objects: NotebookObjectV1[]
}

export interface NotebookSnapshotV1 {
  [key: string]: unknown
  version: typeof NOTEBOOK_SNAPSHOT_VERSION
  pages: NotebookPageV1[]
}

export interface NotebookDiagnostic {
  code: string
  path: string
  message: string
}

export type NotebookDecodeResult =
  | { status: 'valid'; snapshot: NotebookSnapshotV1; diagnostics: [] }
  | { status: 'invalid' | 'unsupported-version' | 'unsupported-kind' | 'limit-exceeded'; rawValue: unknown; diagnostics: NotebookDiagnostic[] }

export type NoteFormatResult =
  | { status: 'document'; editable: true }
  | { status: 'notebook'; editable: true; snapshot: NotebookSnapshotV1; diagnostics: [] }
  | { status: 'invalid' | 'unsupported'; editable: false; diagnostics: NotebookDiagnostic[] }

export type NotebookPathCommand =
  | { type: 'M'; x: number; y: number }
  | { type: 'Q'; cx: number; cy: number; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'Z' }

export interface NotebookPaperLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface NotebookExportPath {
  id: string
  actionId: string
  kind: NotebookStrokeKind
  color: string
  opacity: number
  commands: NotebookPathCommand[]
}

export interface NotebookExportImage {
  id: string
  src: string
  opacity: number
  /** SVG `matrix(a b c d e f)` mapping the unit square onto the image quad. */
  matrix: [number, number, number, number, number, number]
  /** Index in `paths` before which the image is drawn; `paths.length` means on top. */
  pathIndex: number
}

export interface NotebookExportPage {
  id: string
  width: number
  height: number
  paper: { kind: NotebookPaperKind; lines: NotebookPaperLine[] }
  paths: NotebookExportPath[]
  images: NotebookExportImage[]
}

export interface NotebookExportV1 {
  version: typeof NOTEBOOK_SNAPSHOT_VERSION
  pages: NotebookExportPage[]
}

export type NotebookIdFactory = () => string
