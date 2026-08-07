import type {
  CanvasAlignment,
  CanvasConnector,
  CanvasDistribution,
  CanvasElementStyle,
} from '../../../core/canvas'
import type { useCanvasP1Features } from './useCanvasP1Features'
import type { useCanvasSelectionActions } from './useCanvasSelectionActions'
import type { CanvasTool } from './useCanvasToolState'

/**
 * Handlers for every event `CanvasControls` emits, keyed by event name.
 *
 * Declared explicitly rather than inferred: bound through `v-on="..."` the
 * template can no longer type-check the payloads, so this interface is what
 * keeps a mismatch between an emit and its handler a compile error.
 */
export interface CanvasControlHandlers {
  tool: (tool: CanvasTool) => void
  'zoom-in': () => void
  'zoom-out': () => void
  fit: () => void
  undo: () => void
  redo: () => void
  fullscreen: () => void
  present: () => void
  export: () => void
  style: (patch: CanvasElementStyle) => void
  connector: (patch: Partial<CanvasConnector>) => void
  rotation: (value: number) => void
  alt: (value: string) => void
  lock: (locked: boolean) => void
  group: (grouped: boolean) => void
  arrange: (direction: 'front' | 'back' | 'forward' | 'backward') => void
  align: (alignment: CanvasAlignment) => void
  distribute: (direction: CanvasDistribution) => void
  duplicate: () => void
  element: (patch: Record<string, unknown>) => void
  'mindmap-child': () => void
  'mindmap-layout': () => void
  'open-note-link': () => void
}

interface UseCanvasControlHandlersOptions {
  activateTool: (tool: CanvasTool) => void
  zoomBy: (factor: number) => void
  fitAll: () => void
  undo: () => void
  redo: () => void
  toggleFullscreen: () => void
  startPresentation: () => void
  openExport: () => void
  duplicate: () => void
  selectionActions: ReturnType<typeof useCanvasSelectionActions>
  p1: ReturnType<typeof useCanvasP1Features>
}

const ZOOM_STEP = 1.15

/**
 * Adapts the canvas action composables to the events `CanvasControls` emits.
 * Renaming the fan-out lives here rather than in the view's template so the
 * composition root is not two dozen lines of one-to-one forwarding.
 */
export function useCanvasControlHandlers(options: UseCanvasControlHandlersOptions): CanvasControlHandlers {
  const { selectionActions, p1 } = options
  return {
    tool: options.activateTool,
    'zoom-in': () => options.zoomBy(ZOOM_STEP),
    'zoom-out': () => options.zoomBy(1 / ZOOM_STEP),
    fit: options.fitAll,
    undo: options.undo,
    redo: options.redo,
    fullscreen: options.toggleFullscreen,
    present: options.startPresentation,
    export: options.openExport,
    duplicate: options.duplicate,
    style: selectionActions.patchStyle,
    connector: selectionActions.updateConnector,
    rotation: selectionActions.setRotation,
    alt: selectionActions.setImageAlt,
    lock: selectionActions.setLocked,
    group: selectionActions.setGroup,
    arrange: selectionActions.arrange,
    align: selectionActions.align,
    distribute: selectionActions.distribute,
    element: p1.patchSelectedElement,
    'mindmap-child': p1.addMindMapChild,
    'mindmap-layout': p1.layoutSelectedMindMap,
    'open-note-link': p1.openSelectedNoteLink,
  }
}
