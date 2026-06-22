import { ref, shallowRef, computed } from 'vue'
import {
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_SIZE,
  DEFAULT_ROUGHNESS,
  DEFAULT_CANVAS_SIZE,
  DEFAULT_CAMERA,
  parseDrawData,
  type DrawStroke,
  type DrawCanvasSize,
  type DrawCamera,
  type DrawFillStyle,
  type DrawStrokeStyle,
  type DrawRenderOptions,
  type DrawArrowShape,
  type DrawArrowCap,
} from '../../utils/draw/drawEngine'
import { constrainGeometryPoint } from './editor/drawGeometry'
import { createDrawHistory } from './editor/useDrawHistory'
import { createDrawCamera } from './editor/useDrawCamera'
import { createDrawPersistence } from './editor/useDrawPersistence'
import { createDrawSelection } from './editor/useDrawSelection'
import { createDrawSelectionTransforms } from './editor/useDrawSelectionTransforms'
import { createDrawTextEditor } from './editor/useDrawTextEditor'
import { createDrawStrokeInput } from './editor/useDrawStrokeInput'

export { constrainGeometryPoint }

export type DrawEditorTool = import('../../utils/draw/drawEngine').DrawTool | 'eraser' | 'hand' | 'select'

export type { ResizeHandle } from './editor/useDrawSelection'

export interface DrawSavePayload {
  drawId: string
  svgPreview: string
  src: string
}

export interface UseDrawEditorOptions {
  drawId: string
  /** Persist the serialized payload; returns the relative asset `src`. */
  onSave: (bytes: number[]) => Promise<string>
  /** Notify the parent that preview/src changed (updates the note node). */
  onPersisted: (payload: DrawSavePayload) => void
  /** Called when a save fails so the UI can surface it (not swallow it). */
  onSaveError?: (error: unknown) => void
  /** Initial raw bytes (from read_draw_asset). Empty for a new drawing. */
  initialBytes?: number[] | null
  resolveImageHref?: DrawRenderOptions['resolveImageHref']
}

export type DrawColor = string

const PALETTE: DrawColor[] = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#868e96']

export function useDrawEditor(options: UseDrawEditorOptions) {
  const strokes = ref<DrawStroke[]>([])
  const bgColor = ref<string>('transparent')
  const gridType = ref<string>('square')
  const autoDetectShapes = ref<boolean>(false)
  const canvasSize = ref<DrawCanvasSize>({ ...DEFAULT_CANVAS_SIZE })
  const camera = ref<DrawCamera>({ ...DEFAULT_CAMERA })
  const tool = ref<DrawEditorTool>('freehand')
  const color = ref<DrawColor>(DEFAULT_STROKE_COLOR)
  const size = ref<number>(DEFAULT_STROKE_SIZE)
  const fillColor = ref<string>('transparent')
  const fillStyle = ref<DrawFillStyle>('hachure')
  const strokeStyle = ref<DrawStrokeStyle>('solid')
  const opacity = ref<number>(1)
  const roughness = ref<number>(DEFAULT_ROUGHNESS)
  const arrowShape = ref<DrawArrowShape>('straight')
  const startCap = ref<DrawArrowCap>('none')
  const endCap = ref<DrawArrowCap>('arrow')
  const fontFamily = ref<string>('sans-serif')
  const fontSize = ref<number>(18)

  const bindCandidateId = ref<string | null>(null)

  const overlayEl = shallowRef<SVGSVGElement | null>(null)

  const isEmpty = computed(() => strokes.value.length === 0)

  function loadFromBytes(bytes: number[] | null | undefined) {
    const json = bytes && bytes.length ? new TextDecoder().decode(new Uint8Array(bytes)) : ''
    const data = parseDrawData(json)
    strokes.value = data.strokes
    bgColor.value = data.bgColor
    gridType.value = data.gridType || 'square'
    autoDetectShapes.value = data.autoDetectShapes === true
    canvasSize.value = { ...data.canvas }
    camera.value = { ...data.camera }
    history.undoStack.value = []
    history.redoStack.value = []
  }

  const history = createDrawHistory(strokes)

  loadFromBytes(options.initialBytes)

  const cameraModule = createDrawCamera({ overlayEl, strokes, canvasSize, camera })

  const persistence = createDrawPersistence({ options, strokes, bgColor, gridType, autoDetectShapes, canvasSize, camera })

  const style = { color, size, fillColor, fillStyle, strokeStyle, opacity, roughness, arrowShape, startCap, endCap, fontFamily, fontSize }

  const selectionModule = createDrawSelection({ strokes, history, style })

  const transforms = createDrawSelectionTransforms({ strokes, selection: selectionModule, history })

  const textEditorModule = createDrawTextEditor({ strokes, history, style: { color, size, opacity, fontFamily, fontSize } })

  const strokeInput = createDrawStrokeInput({
    strokes,
    tool,
    style,
    overlayEl,
    bindCandidateId,
    history,
    camera: {
      camera,
      viewportSize: cameraModule.viewportSize,
    },
    selection: { selectOnly: selectionModule.selectOnly },
    scheduleSave: persistence.scheduleSave,
    beginText: textEditorModule.beginText,
    canvasSize,
    autoDetectShapes,
  })

  function setOverlay(el: SVGSVGElement | null) {
    overlayEl.value = el
  }

  function clear() {
    if (strokes.value.length === 0) return
    history.pushHistory()
    strokes.value = []
  }

  function setBgColor(colorVal: string) {
    bgColor.value = colorVal
    persistence.scheduleSave()
  }

  function setGridType(typeVal: string) {
    gridType.value = typeVal
    persistence.scheduleSave()
  }

  function setAutoDetectShapes(val: boolean) {
    autoDetectShapes.value = val
    persistence.scheduleSave()
  }

  return {
    strokes,
    activeStroke: strokeInput.activeStroke,
    bgColor,
    gridType,
    autoDetectShapes,
    canvasSize,
    camera,
    tool,
    color,
    size,
    fillColor,
    fillStyle,
    strokeStyle,
    opacity,
    roughness,
    arrowShape,
    startCap,
    endCap,
    activeStyle: selectionModule.activeStyle,
    isDrawing: strokeInput.isDrawing,
    isEmpty,
    isMovingStroke: strokeInput.isMovingStroke,
    textEditor: textEditorModule.textEditor,
    fontFamily,
    fontSize,
    palette: PALETTE,
    bindCandidateId,
    selection: selectionModule.selection,
    selectionBox: selectionModule.selectionBox,
    isMovingSelection: transforms.isMovingSelection,
    isResizingSelection: transforms.isResizingSelection,
    isRotatingSelection: transforms.isRotatingSelection,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    canPaste: history.canPaste,
    setOverlay,
    beginStroke: strokeInput.beginStroke,
    moveStroke: strokeInput.moveStroke,
    endStroke: strokeInput.endStroke,
    beginText: textEditorModule.beginText,
    setTextValue: textEditorModule.setTextValue,
    commitText: textEditorModule.commitText,
    cancelText: textEditorModule.cancelText,
    tryBeginMove: strokeInput.tryBeginMove,
    moveStrokeAt: strokeInput.moveStrokeAt,
    endMove: strokeInput.endMove,
    setStrokeColor: selectionModule.setStrokeColor,
    setStrokeSize: selectionModule.setStrokeSize,
    setFillColor: selectionModule.setFillColor,
    setFillStyle: selectionModule.setFillStyle,
    setStrokeStyle: selectionModule.setStrokeStyle,
    setOpacity: selectionModule.setOpacity,
    setRoughness: selectionModule.setRoughness,
    setArrowShape: selectionModule.setArrowShape,
    setStartCap: selectionModule.setStartCap,
    setEndCap: selectionModule.setEndCap,
    setFontFamily: selectionModule.setFontFamily,
    setFontSize: selectionModule.setFontSize,
    applyStyleToSelection: selectionModule.applyStyleToSelection,
    isSelected: selectionModule.isSelected,
    selectOnly: selectionModule.selectOnly,
    toggleSelection: selectionModule.toggleSelection,
    clearSelection: selectionModule.clearSelection,
    selectInRect: selectionModule.selectInRect,
    hitTestStrokeId: selectionModule.hitTestStrokeId,
    selectAll: selectionModule.selectAll,
    deleteSelection: selectionModule.deleteSelection,
    duplicateSelection: selectionModule.duplicateSelection,
    copySelection: selectionModule.copySelection,
    cutSelection: selectionModule.cutSelection,
    paste: selectionModule.paste,
    insertImageStroke: strokeInput.insertImageStroke,
    insertTemplate: strokeInput.insertTemplate,
    beginMoveSelection: transforms.beginMoveSelection,
    moveSelectionTo: transforms.moveSelectionTo,
    endMoveSelection: transforms.endMoveSelection,
    beginResizeSelection: transforms.beginResizeSelection,
    resizeSelectionTo: transforms.resizeSelectionTo,
    endResizeSelection: transforms.endResizeSelection,
    beginRotateSelection: transforms.beginRotateSelection,
    rotateSelectionTo: transforms.rotateSelectionTo,
    endRotateSelection: transforms.endRotateSelection,
    beginBendArrow: transforms.beginBendArrow,
    bendArrowTo: transforms.bendArrowTo,
    endBendArrow: transforms.endBendArrow,
    bringToFront: selectionModule.bringToFront,
    bringForward: selectionModule.bringForward,
    sendBackward: selectionModule.sendBackward,
    sendToBack: selectionModule.sendToBack,
    group: selectionModule.group,
    ungroup: selectionModule.ungroup,
    canGroup: selectionModule.canGroup,
    canUngroup: selectionModule.canUngroup,
    lockSelection: selectionModule.lockSelection,
    unlockSelection: selectionModule.unlockSelection,
    hasLockedSelection: selectionModule.hasLockedSelection,
    hasUnlockedSelection: selectionModule.hasUnlockedSelection,
    alignSelection: selectionModule.alignSelection,
    distributeSelection: selectionModule.distributeSelection,
    flipSelection: selectionModule.flipSelection,
    canAlign: selectionModule.canAlign,
    canDistribute: selectionModule.canDistribute,
    beginEditText: textEditorModule.beginEditText,
    eventToWorld: strokeInput.eventToWorld,
    undo: history.undo,
    redo: history.redo,
    clear,
    setBgColor,
    setGridType,
    setAutoDetectShapes,
    save: persistence.save,
    scheduleSave: persistence.scheduleSave,
    flushSave: persistence.flushSave,
    panBy: cameraModule.panBy,
    applyZoom: cameraModule.applyZoom,
    onWheel: cameraModule.onWheel,
    zoomBy: cameraModule.zoomBy,
    resetCamera: cameraModule.resetCamera,
    fitToContent: cameraModule.fitToContent,
    cameraViewBox: cameraModule.cameraViewBox,
  }
}
