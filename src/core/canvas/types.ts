import type { CanvasFontFamily } from './fonts'

export const CANVAS_SNAPSHOT_VERSION = 1 as const

export interface CanvasPoint {
  x: number
  y: number
  /** Normalized pointer pressure. Omitted for legacy strokes and mouse input. */
  pressure?: number
}

export interface CanvasBounds extends CanvasPoint {
  width: number
  height: number
}

/** `'block'` now means "bound to the single document frame" — the only valid
 *  `targetId` for it is `CANVAS_DOCUMENT_FRAME_ID`. `'element'` is unchanged. */
export type CanvasBindingTarget = 'block' | 'element'
export type CanvasConnectorSide = 'top' | 'right' | 'bottom' | 'left'

export const CANVAS_DOCUMENT_FRAME_ID = 'canvas:document'

/** A note's canvas is one document frame (like AFFiNE edgeless), not one card
 *  per top-level block. Shapes/text/images/connectors remain independent. */
export interface CanvasDocumentFrame extends CanvasBounds {
  zIndex: number
  locked?: boolean
  /** `!== false` — height follows content; `false` — frozen by a manual resize. */
  autoHeight?: boolean
  /** `true` — the note renders as a small placeholder card and its ProseMirror
   *  subtree is taken out of layout/paint entirely. `width`/`height` keep the
   *  expanded geometry so expanding restores it exactly. */
  collapsed?: boolean
}

export interface CanvasElementStyle {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  fontSize?: number
  textColor?: string
  textAlign?: 'left' | 'center' | 'right'
  fontFamily?: CanvasFontFamily
}

export type CanvasRichTextBlockType = 'paragraph' | 'heading' | 'bullet' | 'number' | 'todo' | 'quote'
export type CanvasRichTextMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code'

export interface CanvasRichTextSpan {
  text: string
  marks?: CanvasRichTextMark[]
}

export interface CanvasRichTextBlock {
  type: CanvasRichTextBlockType
  spans: CanvasRichTextSpan[]
  level?: 1 | 2 | 3
  checked?: boolean
}

export interface CanvasRichTextDocument {
  blocks: CanvasRichTextBlock[]
}

export interface CanvasMindMapNode {
  mapId: string
  parentId?: string
  rank: number
}

export interface CanvasElementBase extends CanvasBounds {
  id: string
  zIndex: number
  rotation?: number
  locked?: boolean
  groupId?: string
  style?: CanvasElementStyle
}

export interface CanvasShapeElement extends CanvasElementBase {
  kind: 'shape'
  shape: 'rectangle' | 'ellipse' | 'diamond'
  text?: string
  mindMap?: CanvasMindMapNode
}

export interface CanvasTextElement extends CanvasElementBase {
  kind: 'text'
  text: string
}

export interface CanvasImageElement extends CanvasElementBase {
  kind: 'image'
  src: string
  alt?: string
}

export interface CanvasRichNoteElement extends CanvasElementBase {
  kind: 'note'
  content: CanvasRichTextDocument
}

export interface CanvasNoteLinkElement extends CanvasElementBase {
  kind: 'note-link'
  noteId: string
  title: string
  icon?: string
}

export interface CanvasFrameElement extends CanvasElementBase {
  kind: 'frame'
  title: string
  presentationOrder: number
}

export interface CanvasStrokeElement extends CanvasElementBase {
  kind: 'freehand' | 'highlighter'
  points: CanvasPoint[]
}

export type CanvasElement =
  | CanvasShapeElement
  | CanvasTextElement
  | CanvasImageElement
  | CanvasRichNoteElement
  | CanvasNoteLinkElement
  | CanvasFrameElement
  | CanvasStrokeElement

export interface CanvasConnectorBinding {
  target: CanvasBindingTarget
  targetId: string
  side?: CanvasConnectorSide
}

export interface CanvasConnectorEndpoint extends CanvasPoint {
  binding?: CanvasConnectorBinding
}

export interface CanvasConnector {
  id: string
  from: CanvasConnectorEndpoint
  to: CanvasConnectorEndpoint
  routing: 'straight' | 'orthogonal' | 'bezier'
  zIndex: number
  color?: string
  width?: number
  label?: string
  startCap?: 'none' | 'arrow' | 'dot'
  endCap?: 'none' | 'arrow' | 'dot'
}

export interface CanvasSnapshotV1 {
  version: typeof CANVAS_SNAPSHOT_VERSION
  frame: CanvasDocumentFrame
  elements: Record<string, CanvasElement>
  connectors: Record<string, CanvasConnector>
  order: string[]
}

export interface CanvasCamera {
  x: number
  y: number
  zoom: number
}
