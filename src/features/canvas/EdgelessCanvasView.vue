<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import type { EditorView } from 'prosemirror-view'
import { useI18n } from 'vue-i18n'
import type { WorkspaceBackend } from '../../core/workspace-backend'
import { CANVAS_DOCUMENT_FRAME_ID, type CanvasElement, type CanvasSnapshotV1 } from '../../core/canvas'
import CanvasConnectAnchors from './components/CanvasConnectAnchors.vue'
import CanvasDocumentFrameChrome from './components/CanvasDocumentFrameChrome.vue'
import CanvasExportDialog from './components/CanvasExportDialog.vue'
import CanvasInteractionOverlays from './components/CanvasInteractionOverlays.vue'
import CanvasNoteLinkPicker from './components/CanvasNoteLinkPicker.vue'
import CanvasPresentationControls from './components/CanvasPresentationControls.vue'
import CanvasControls from './components/CanvasControls.vue'
import CanvasSvgLayer from './components/CanvasSvgLayer.vue'
import { useCanvasCamera } from './composables/useCanvasCamera'
import { useCanvasClipboard } from './composables/useCanvasClipboard'
import { useCanvasConnectorGestures } from './composables/useCanvasConnectorGestures'
import { useCanvasContentIO } from './composables/useCanvasContentIO'
import { useCanvasControlHandlers } from './composables/useCanvasControlHandlers'
import { useCanvasCreationGestures } from './composables/useCanvasCreationGestures'
import { useCanvasDocument } from './composables/useCanvasDocument'
import { useCanvasExport } from './composables/useCanvasExport'
import { useCanvasFrameMetrics } from './composables/useCanvasFrameMetrics'
import { useCanvasFrameEditing } from './composables/useCanvasFrameEditing'
import { useCanvasFrameView } from './composables/useCanvasFrameView'
import { useCanvasImageAssets } from './composables/useCanvasImageAssets'
import { useCanvasInlineEditing } from './composables/useCanvasInlineEditing'
import { useCanvasInteractionRouting } from './composables/useCanvasInteractionRouting'
import { useCanvasKeyboard } from './composables/useCanvasKeyboard'
import { useCanvasLabels } from './composables/useCanvasLabels'
import { useCanvasPointerInteraction } from './composables/useCanvasPointerInteraction'
import { useCanvasP1Features, type CanvasNoteOption } from './composables/useCanvasP1Features'
import { useCanvasQuickConnect } from './composables/useCanvasQuickConnect'
import { useCanvasRotationGesture } from './composables/useCanvasRotationGesture'
import { useCanvasSelectionActions } from './composables/useCanvasSelectionActions'
import { useFirstUseHint } from '../onboarding/hints/useFirstUseHint'
import { useCanvasSessionActions } from './composables/useCanvasSessionActions'
import { useCanvasToolState } from './composables/useCanvasToolState'
import { useCanvasViewState } from './composables/useCanvasViewState'
import { useCanvasViewportLifecycle } from './composables/useCanvasViewportLifecycle'
import { usePinchZoom } from '../../composables/usePinchZoom'
import '../../styles/canvas.css'

const props = defineProps<{
  noteId: string
  workspaceId: string
  title?: string
  mirror?: CanvasSnapshotV1
  assetRefreshToken?: number
  resolveAssetSrc?: (src: string) => string | null
  getWorkspaceBackend?: () => WorkspaceBackend | null
  getEditorView: () => EditorView | null
  notes?: readonly CanvasNoteOption[]
}>()

const emit = defineEmits<{
  'update:mirror': [snapshot: CanvasSnapshotV1]
  'open-note': [noteId: string]
}>()
const { t } = useI18n()

useFirstUseHint('canvasPresent')
const canvasLabels = useCanvasLabels(t)

const { camera, cameraView, panBy, zoomAt, fit, onCameraFrame } = useCanvasCamera(props.workspaceId, props.noteId)
const {
  viewport,
  imageInput,
  viewportSize,
  selectedIds,
  editingFrame,
  spacePressed,
  marquee,
  elementDrafts,
  insertionPoint,
  viewportVersion,
  viewportPoint,
  updateViewportSize,
} = useCanvasViewState(camera)

const { activeTool, style: toolStyle, activate, returnToSelect } = useCanvasToolState()
const panMode = computed(() => spacePressed.value || activeTool.value === 'hand')
const canvas = useCanvasDocument({
  getEditorView: props.getEditorView,
  getMirror: () => props.mirror,
  onMirrorChange: snapshot => emit('update:mirror', snapshot),
})
const frameMetrics = useCanvasFrameMetrics({ getEditorView: props.getEditorView })

const { effectiveFrame, frameCollapsed, frameTitle, frameSelected } = useCanvasFrameView({
  snapshot: canvas.snapshot,
  framePreview: canvas.framePreview,
  contentHeight: frameMetrics.contentHeight,
  selectedIds,
  getTitle: () => props.title,
  t,
})
const canvasExport = useCanvasExport({
  noteId: props.noteId,
  snapshot: canvas.snapshot,
  camera,
  viewport: viewportSize,
  selectionIds: selectedIds,
  effectiveFrame,
  getEditorView: props.getEditorView,
  resolveAssetSrc: props.resolveAssetSrc,
})

const {
  selectedItem,
  selectionChromeStyle,
  marqueeStyle,
  alignmentGuides,
  select,
  onBackgroundPointerDown,
  onFrameHeaderPointerDown,
  onElementPointerDown,
  onResizePointerDown,
  onWheel,
  cancelGesture: cancelPointerGesture,
  refreshViewportRect,
} = useCanvasPointerInteraction({
  snapshot: canvas.snapshot,
  camera,
  cameraView,
  effectiveFrame,
  viewport,
  selectedIds,
  spacePressed: panMode,
  marquee,
  elementDrafts,
  actions: canvas,
  getEditorView: props.getEditorView,
  panBy,
  zoomAt,
})
// The pointer composable caches the viewport rect; the view state owns the
// ResizeObserver that invalidates it.
watch(viewportVersion, refreshViewportRect)

const inlineEditing = useCanvasInlineEditing({
  snapshot: canvas.snapshot,
  camera: cameraView,
  setText: canvas.setText,
})
const selectionActions = useCanvasSelectionActions(canvas.snapshot, selectedIds, canvas)
const p1 = useCanvasP1Features({
  snapshot: canvas.snapshot,
  camera: cameraView,
  actions: {
    ...canvas,
    updateElement: (id, patch) => canvas.updateElement(id, patch as Partial<CanvasElement>),
  },
  selectedElement: selectionActions.selectedElement,
  select,
  editText: inlineEditing.start,
  returnToSelect,
  focusFrame: frame => fit([frame], { x: 0, y: 0, width: viewportSize.width, height: viewportSize.height }),
  openNote: noteId => emit('open-note', noteId),
})
const clipboard = useCanvasClipboard({ snapshot: canvas.snapshot, selectedIds, actions: canvas })
const imageAssets = useCanvasImageAssets({
  insertionPoint,
  actions: canvas,
  select,
  getBackend: () => props.getWorkspaceBackend?.() ?? null,
})
const { requestImage, onImageInput, onPaste, onDrop, pasteFromClipboard } = useCanvasContentIO({
  insertionPoint,
  imageInput,
  camera,
  viewportSize,
  presentationActive: p1.presentation.active,
  viewportPoint,
  clipboard,
  imageAssets,
  returnToSelect,
})

const creation = useCanvasCreationGestures({
  activeTool,
  toolStyle,
  snapshot: canvas.snapshot,
  effectiveFrame,
  camera,
  viewport,
  actions: canvas,
  select,
  onEditText: inlineEditing.start,
  onEditRichText: p1.richEditing.start,
  onRequestImage: requestImage,
  onRequestNoteLink: p1.requestNoteLink,
  returnToSelect,
  frameTitle: t('workspace.canvas.frame'),
})
const connectorGestures = useCanvasConnectorGestures({
  snapshot: canvas.snapshot,
  effectiveFrame,
  camera,
  viewport,
  updateConnector: canvas.updateConnector,
})
const quickConnect = useCanvasQuickConnect({
  snapshot: canvas.snapshot,
  camera,
  effectiveFrame,
  viewport,
  activeTool,
  selectedIds,
  enabled: computed(() =>
    !p1.presentation.active.value
    && !inlineEditing.editingId.value
    && !p1.richEditing.editingId.value
    && !panMode.value
    && activeTool.value === 'select',
  ),
  toolStyle,
  addConnector: canvas.addConnector,
  select,
})
const rotationGesture = useCanvasRotationGesture({
  camera,
  viewport,
  elements: computed(() => canvas.snapshot.value.elements),
  drafts: elementDrafts,
  updateElement: canvas.updateElement,
})

const {
  handleViewportPointerDown,
  handleObjectInteraction,
  editCanvasItem,
  moveSelectedConnectorEndpoint,
  selectedConnectorDisplay,
} = useCanvasInteractionRouting({
  presentationActive: p1.presentation.active,
  activeTool,
  onCreationPointerDown: creation.onPointerDown,
  onBackgroundPointerDown,
  onElementPointerDown,
  editItem: p1.editItem,
  startInlineEdit: inlineEditing.start,
  selectedConnector: selectionActions.selectedConnector,
  connectorDrafts: connectorGestures.drafts,
  onEndpointPointerDown: connectorGestures.onEndpointPointerDown,
})
const {
  startEditingFrame,
  finishEditing,
  enterFrameEditFromHeader,
  toggleFrameCollapsed,
  onEditorDoubleClick,
} = useCanvasFrameEditing({
  effectiveFrame,
  frameCollapsed,
  editingFrame,
  activeTool,
  presentationActive: p1.presentation.active,
  viewportPoint,
  select,
  setFrameEditing: canvas.setFrameEditing,
  setFrameCollapsed: canvas.setFrameCollapsed,
  getEditorView: props.getEditorView,
})

const hasPresentationFrames = computed(() => Object.values(canvas.snapshot.value.elements).some(element => element.kind === 'frame'))
const frameChromeLabels = computed(() => canvasLabels.frame(frameCollapsed.value))

const { fitAll, activateTool, startPresentation } = useCanvasSessionActions({
  snapshot: canvas.snapshot,
  effectiveFrame,
  fit,
  viewportSize,
  viewport,
  activate,
  cancelInlineEdit: inlineEditing.cancel,
  cancelRichEdit: p1.richEditing.cancel,
  selectedElement: selectionActions.selectedElement,
  selectedIds,
  presentationStart: p1.presentation.start,
})

const viewportLifecycle = useCanvasViewportLifecycle({
  viewport,
  camera,
  onCameraFrame,
  getEditorView: props.getEditorView,
  onWheel,
  observeFrameMetrics: frameMetrics.observe,
})

usePinchZoom({
  target: viewport,
  onStart: () => {
    creation.cancel()
    cancelPointerGesture()
    connectorGestures.cancel()
    quickConnect.cancel()
    rotationGesture.cancel()
  },
  onUpdate: ({ center, panDelta, scaleFactor }) => {
    panBy(panDelta)
    zoomAt(center, camera.zoom * scaleFactor)
  },
})

const controlHandlers = useCanvasControlHandlers({
  activateTool,
  zoomBy: factor => zoomAt({ x: viewportSize.width / 2, y: viewportSize.height / 2 }, camera.zoom * factor),
  fitAll,
  undo: canvas.undo,
  redo: canvas.redo,
  toggleFullscreen: viewportLifecycle.toggleFullscreen,
  startPresentation,
  openExport: () => { canvasExport.open.value = true },
  duplicate: clipboard.duplicate,
  selectionActions,
  p1,
})

useCanvasKeyboard({
  spacePressed,
  camera,
  viewportSize: { get x() { return viewportSize.width }, get y() { return viewportSize.height } },
  selectedIds,
  selectedItem,
  editingFrame,
  editingCanvasText: computed(() => inlineEditing.editingId.value || p1.richEditing.editingId.value || ''),
  frameCollapsed,
  actions: canvas,
  getEditorView: props.getEditorView,
  startEditingFrame,
  finishEditing,
  cancelCanvasText: () => {
    inlineEditing.cancel()
    p1.richEditing.cancel()
  },
  editSelected: () => {
    const id = selectedIds.value[0]
    if (id && !p1.editItem(id)) inlineEditing.start(id)
  },
  cancelGesture: () => {
    creation.cancel()
    returnToSelect()
  },
  toggleFrameCollapsed,
  fitAll,
  zoomAt,
  activateTool,
  copy: clipboard.copy,
  cut: clipboard.cut,
  paste: pasteFromClipboard,
  duplicate: clipboard.duplicate,
})

watch(canvas.ready, (ready) => {
  if (!ready) return
  viewportLifecycle.attachEditorListeners()
})

// The editor can be recreated underneath a mounted canvas (note reload, editor
// remount). Reading it inside the getter registers the dependency, so both
// the wheel/world-layer bindings and the frame-style binding follow the new
// view instead of styling a detached node.
watch(() => props.getEditorView(), () => {
  canvas.syncEditorView()
  viewportLifecycle.attachEditorListeners()
})
watch(selectedIds, (ids) => {
  if (!ids.includes(CANVAS_DOCUMENT_FRAME_ID)) finishEditing()
}, { deep: true })

onMounted(() => {
  canvas.connectWhenReady()
  updateViewportSize()
  viewportLifecycle.applyCamera()
  void nextTick(viewportLifecycle.attachEditorListeners)
})

onBeforeUnmount(() => {
  frameMetrics.disconnect()
})
</script>

<template>
  <div
    ref="viewport"
    class="edgeless-canvas"
    :class="{
      'edgeless-canvas--space-pan': panMode,
      'edgeless-canvas--presenting': p1.presentation.active.value,
      [`edgeless-canvas--tool-${activeTool}`]: true,
    }"
    tabindex="0"
    :aria-label="t('workspace.canvas.ariaLabel')"
    @pointerdown="handleViewportPointerDown"
    @dblclick="onEditorDoubleClick"
    @wheel="onWheel"
    @paste="onPaste"
    @dragover.prevent
    @drop="onDrop"
  >
    <div class="edgeless-canvas__grid" />
    <CanvasSvgLayer
      :snapshot="canvas.snapshot.value"
      :camera="cameraView"
      :viewport-width="viewportSize.width"
      :viewport-height="viewportSize.height"
      :selected-ids="selectedIds"
      :drafts="elementDrafts"
      :connector-drafts="connectorGestures.drafts"
      :creation-draft="creation.draft.value"
      :connect-draft="quickConnect.draft.value ? { ...quickConnect.draft.value, ...toolStyle.connector } : null"
      :connect-target-id="quickConnect.targetId.value"
      :resolve-asset-src="resolveAssetSrc"
      :asset-refresh-token="assetRefreshToken"
      :notes="notes"
      @select="select"
      @interact="handleObjectInteraction"
      @edit="editCanvasItem"
    />
    <CanvasDocumentFrameChrome
      :frame="effectiveFrame"
      :camera="cameraView"
      :selected="frameSelected"
      :editing="editingFrame"
      :label="frameChromeLabels.label"
      :collapsed="frameCollapsed"
      :title="frameTitle"
      :collapsed-hint="frameChromeLabels.collapsedHint"
      :toggle-label="frameChromeLabels.toggleLabel"
      @header-pointerdown="onFrameHeaderPointerDown"
      @resize-pointerdown="onResizePointerDown"
      @enter-edit="enterFrameEditFromHeader"
      @toggle-collapsed="toggleFrameCollapsed"
    />
    <CanvasInteractionOverlays
      :presenting="p1.presentation.active.value"
      :selected-item="selectedItem"
      :selection-chrome-style="selectionChromeStyle"
      :selected-connector="selectedConnectorDisplay"
      :camera="cameraView"
      :guides="alignmentGuides"
      :marquee="marquee"
      :marquee-style="marqueeStyle"
      :editing-text-id="inlineEditing.editingId.value"
      :editing-text="inlineEditing.editingValue.value"
      :editing-text-style="inlineEditing.editingStyle.value"
      :editing-rich-id="p1.richEditing.editingId.value"
      :editing-rich-content="p1.richEditing.draft.value"
      :editing-rich-style="p1.richEditing.editingStyle.value"
      :labels="canvasLabels.overlays.value"
      @resize="onResizePointerDown"
      @rotate="selectedItem?.kind === 'element' && rotationGesture.onRotatePointerDown(selectedItem.id, $event)"
      @endpoint="moveSelectedConnectorEndpoint"
      @commit-text="inlineEditing.commit"
      @cancel-text="inlineEditing.cancel"
      @commit-rich="p1.richEditing.commit"
      @cancel-rich="p1.richEditing.cancel"
    />
    <CanvasConnectAnchors
      v-if="!p1.presentation.active.value && quickConnect.anchorObject.value"
      :anchors="quickConnect.anchors.value"
      :camera="cameraView"
      :label="t('workspace.canvas.connectAnchor')"
      @anchor-pointerdown="quickConnect.onAnchorPointerDown"
    />
    <CanvasControls
      v-if="!p1.presentation.active.value"
      :zoom="cameraView.zoom"
      :active-tool="activeTool"
      :toolbar-labels="canvasLabels.toolbar.value"
      :property-labels="canvasLabels.properties.value"
      :selection-count="selectedIds.length"
      :selected-element="selectionActions.selectedElement.value"
      :selected-connector="selectionActions.selectedConnector.value"
      :selection-locked="selectionActions.allSelectedElementsLocked.value"
      :snapshot="canvas.snapshot.value"
      :effective-frame="effectiveFrame"
      :camera="cameraView"
      :viewport-width="viewportSize.width"
      :viewport-height="viewportSize.height"
      :can-present="hasPresentationFrames"
      v-on="controlHandlers"
    />
    <CanvasNoteLinkPicker
      :open="p1.notePickerOpen.value"
      :notes="notes ?? []"
      :title="t('workspace.canvas.noteLinkPickerTitle')"
      :search-label="t('workspace.canvas.noteLinkSearch')"
      :empty-label="t('workspace.canvas.noteLinkEmpty')"
      :close-label="t('workspace.canvas.cancel')"
      @close="p1.notePickerOpen.value = false; returnToSelect()"
      @select="p1.insertNoteLink"
    />
    <CanvasPresentationControls
      :active="p1.presentation.active.value"
      :current="p1.presentation.index.value"
      :total="p1.presentation.frames.value.length"
      :title="t('workspace.canvas.presentation')"
      :previous-label="t('workspace.canvas.previousFrame')"
      :next-label="t('workspace.canvas.nextFrame')"
      :exit-label="t('workspace.canvas.exitPresentation')"
      @previous="p1.presentation.previous"
      @next="p1.presentation.next"
      @exit="p1.presentation.stop"
    />
    <CanvasExportDialog
      :open="canvasExport.open.value"
      :format="canvasExport.format.value"
      :scope="canvasExport.scope.value"
      :exporting="canvasExport.exporting.value"
      :error-message="canvasExport.errorMessage.value"
      @close="canvasExport.open.value = false"
      @export="canvasExport.performExport"
      @update:format="canvasExport.format.value = $event"
      @update:scope="canvasExport.scope.value = $event"
    />
    <input ref="imageInput" class="canvas-image-input tw:sr-only" type="file" accept="image/*" @change="onImageInput">
    <p
      v-if="imageAssets.errorMessage.value"
      class="canvas-import-error tw:absolute tw:z-50 tw:right-4 tw:bottom-4 tw:max-w-[360px] tw:m-0 tw:py-2.5 tw:px-3 tw:rounded-[10px] tw:border tw:border-solid tw:border-danger tw:text-danger tw:bg-surface-raised tw:shadow-(--shadow-raised) tw:text-xs"
      role="alert"
    >{{ imageAssets.errorMessage.value }}</p>
  </div>
</template>
