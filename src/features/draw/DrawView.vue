<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeft, Shapes, Settings, Download } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../stores/workspace'
import { useDrawEditor } from './useDrawEditor'
import { useDrawExport } from './view/useDrawExport'
import DrawToolbar from './DrawToolbar.vue'
import DrawPropertiesPanel from './DrawPropertiesPanel.vue'
import DrawTemplatesPanel from './DrawTemplatesPanel.vue'
import type { DrawStroke } from '../../utils/draw/drawEngine'
import DrawContextToolbar from './DrawContextToolbar.vue'
import NvColorPicker from '../../ui/primitives/NvColorPicker.vue'
import NvToggle from '../../ui/primitives/NvToggle.vue'
import { hexToRgb } from '../../utils/colorConversion'
import DrawZoomControl from './DrawZoomControl.vue'
import DrawTextInput from './DrawTextInput.vue'
import DrawSelectionOverlay from './DrawSelectionOverlay.vue'
import { parseDrawData } from '../../utils/draw/drawEngine'
import { useDrawNoteSync } from './view/useDrawNoteSync'
import { useDrawImageAssets } from './view/useDrawImageAssets'
import { useDrawCanvasRender } from './view/useDrawCanvasRender'
import { useDrawViewport, GRID_CELL } from './view/useDrawViewport'
import { useDrawTextOverlay } from './view/useDrawTextOverlay'
import { useDrawSelectionChrome, ROTATE_OFFSET } from './view/useDrawSelectionChrome'
import { useDrawPointer } from './view/useDrawPointer'
import { useDrawKeyboard } from './view/useDrawKeyboard'

const props = defineProps<{
  workspacePath: string | null
  // Note: WorkspaceShell guards this with `activeNoteId &&` in v-if, but Vue's
  // template type-narrowing doesn't propagate, so accept null here.
  noteId: string | null
  drawId: string
  isDark?: boolean
}>()

const emit = defineEmits<{
  'open-note': [noteId: string]
  'update-draw': [payload: { drawId: string; svgPreview: string; src: string }]
  back: []
}>()

const workspaceStore = useWorkspaceStore()

const loading = ref(true)
const errorMessage = ref<string>('')

// --- Template refs ---
const canvasEl = shallowRef<SVGSVGElement | null>(null)
const overlayEl = shallowRef<SVGSVGElement | null>(null)
const canvasWrapEl = ref<HTMLElement | null>(null)

// --- Y.Doc sync ---
const noteSync = useDrawNoteSync({
  drawId: props.drawId,
  getWorkspacePath: () => props.workspacePath,
  getNoteId: () => props.noteId,
})

// --- Image assets (нужен refreshCommittedSvg — передаём через геттер после создания canvasRender) ---
let _refreshCommittedSvg: () => Promise<void> = () => Promise.resolve()
const imageAssets = useDrawImageAssets({
  getRefreshCommittedSvg: () => _refreshCommittedSvg,
  getInsertImageStroke: () => editor.insertImageStroke,
})

// --- Editor ---
const editor = useDrawEditor({
  drawId: props.drawId,
  initialBytes: null,
  resolveImageHref: imageAssets.resolvePreviewHref,
  async onSave(bytes: number[]) {
    const backend = workspaceStore.backend
    if (!backend) throw new Error('Workspace backend not available')
    return backend.saveDrawAsset(props.drawId, bytes)
  },
  onPersisted(payload) {
    errorMessage.value = ''
    emit('update-draw', payload)
    void noteSync.patchDrawSrcIntoNoteDoc(payload.src, payload.svgPreview)
  },
  onSaveError(error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    console.error('[DrawView] Failed to save drawing', error)
  },
})

// Keep the composable's overlay reference in sync with the template ref.
watch(overlayEl, (el) => { editor.setOverlay(el); if (el) measureViewport() })

// --- Canvas render ---
const { overlaySvgInner, highlighterPreviewInner, refreshCommittedSvg } = useDrawCanvasRender({
  canvasEl,
  strokes: editor.strokes,
  activeStroke: editor.activeStroke,
  scheduleSave: editor.scheduleSave,
  resolveFullHref: imageAssets.resolveFullHref,
})
// Замыкаем геттер после создания
_refreshCommittedSvg = refreshCommittedSvg

// --- Viewport ---
const viewportModule = useDrawViewport({
  overlayEl,
  cameraViewBox: editor.cameraViewBox,
  cameraX: () => editor.camera.value.x,
  cameraY: () => editor.camera.value.y,
})
const { viewport, viewBox, gridOffset, measureViewport, disconnect: disconnectViewport } = viewportModule

// --- Text overlay ---
const {
  textEditorStyle,
  onTextInput,
  onTextBlur,
  onTextKeydown,
} = useDrawTextOverlay({
  textEditor: editor.textEditor,
  cameraScale: () => editor.camera.value.scale,
  cameraX: () => editor.camera.value.x,
  cameraY: () => editor.camera.value.y,
  setTextValue: editor.setTextValue,
  commitText: editor.commitText,
})

// --- isPanning shared ref (разрыв цикла selectionChrome ↔ pointer) ---
const isPanning = ref(false)

// --- Selection chrome ---
const selectionChrome = useDrawSelectionChrome({
  canvasWrapEl,
  overlayEl,
  tool: editor.tool,
  camera: editor.camera,
  strokes: editor.strokes,
  selectionBox: editor.selectionBox,
  selection: editor.selection,
  bindCandidateId: editor.bindCandidateId,
  isDrawing: editor.isDrawing,
  isPanning,
  isSelected: editor.isSelected,
  selectOnly: editor.selectOnly,
  toggleSelection: editor.toggleSelection,
  clearSelection: editor.clearSelection,
  selectInRect: editor.selectInRect,
  hitTestStrokeId: editor.hitTestStrokeId,
  eventToWorld: editor.eventToWorld,
  beginMoveSelection: editor.beginMoveSelection,
  endMoveSelection: editor.endMoveSelection,
  beginResizeSelection: editor.beginResizeSelection,
  resizeSelectionTo: editor.resizeSelectionTo,
  endResizeSelection: editor.endResizeSelection,
  beginRotateSelection: editor.beginRotateSelection,
  rotateSelectionTo: editor.rotateSelectionTo,
  endRotateSelection: editor.endRotateSelection,
  beginBendArrow: editor.beginBendArrow,
  bendArrowTo: editor.bendArrowTo,
  endBendArrow: editor.endBendArrow,
  scheduleSave: editor.scheduleSave,
})

const {
  selectMode,
  selectionScreen,
  bindHighlightScreen,
  bendHandleScreen,
  marqueeStyle,
  selectionAllLocked,
  selectionCount,
  cursorClass: selectionCursorClass,
  onSelectPointerDown,
  endSelectGesture,
  onPointerMoveChrome,
} = selectionChrome

// --- Pointer ---
const pointer = useDrawPointer({
  overlayEl,
  canvasWrapEl,
  tool: editor.tool,
  size: editor.size,
  camera: editor.camera,
  isMovingStroke: editor.isMovingStroke,
  isPanning,
  selectMode,
  onSelectPointerDown,
  endSelectGesture,
  onPointerMoveChrome,
  tryBeginMove: editor.tryBeginMove,
  beginStroke: editor.beginStroke,
  moveStroke: editor.moveStroke,
  endStroke: editor.endStroke,
  moveStrokeAt: editor.moveStrokeAt,
  endMove: editor.endMove,
  panBy: editor.panBy,
  onWheelEditor: editor.onWheel,
  scheduleSave: editor.scheduleSave,
  eventToWorld: editor.eventToWorld,
  hitTestStrokeId: editor.hitTestStrokeId,
  beginEditText: editor.beginEditText,
  strokes: editor.strokes,
  moveSelectionTo: editor.moveSelectionTo,
})

const {
  eraserCursor,
  eraserCursorSize,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onWheel,
  onMouseDown,
  onCanvasDblClick,
} = pointer

// --- Keyboard ---
useDrawKeyboard({
  tool: editor.tool,
  selection: editor.selection,
  textEditorActive: () => editor.textEditor.value.active,
  canPaste: editor.canPaste,
  back,
  pasteImageFromClipboard: imageAssets.pasteImageFromClipboard,
  undo: editor.undo,
  redo: editor.redo,
  duplicateSelection: editor.duplicateSelection,
  bringToFront: editor.bringToFront,
  bringForward: editor.bringForward,
  sendToBack: editor.sendToBack,
  sendBackward: editor.sendBackward,
  deleteSelection: editor.deleteSelection,
  clearSelection: editor.clearSelection,
  selectAll: editor.selectAll,
  copySelection: editor.copySelection,
  cutSelection: editor.cutSelection,
  paste: editor.paste,
  scheduleSave: editor.scheduleSave,
  group: editor.group,
  ungroup: editor.ungroup,
})

// --- Computed helpers ---
const zoomPercent = computed(() => `${Math.round((editor.camera.value.scale || 1) * 100)}%`)

const bgStyle = computed(() => ({
  backgroundColor: editor.bgColor.value && editor.bgColor.value !== 'transparent'
    ? editor.bgColor.value
    : '#ffffff',
}))

const cursorClass = computed(() => {
  if (isPanning.value || editor.isMovingStroke.value) return 'is-panning'
  if (editor.tool.value === 'hand') return 'is-hand'
  if (editor.tool.value === 'eraser') return 'is-eraser'
  if (editor.tool.value === 'text') return 'is-text'
  if (editor.tool.value === 'select') {
    return selectionCursorClass.value ?? 'is-select'
  }
  return 'is-drawing'
})

// --- Properties panel visibility ---
const DRAW_TOOLS = ['freehand', 'highlighter', 'rectangle', 'line', 'arrow', 'ellipse', 'diamond', 'text']
const showProps = computed(() =>
  editor.selection.value.size > 0 || DRAW_TOOLS.includes(editor.tool.value as string),
)

// --- Настройки холста, шаблоны и экспорт ---
const showSettings = ref(false)
const showTemplates = ref(false)
const showExport = ref(false)

function toggleTemplates() {
  showTemplates.value = !showTemplates.value
  if (showTemplates.value) {
    showSettings.value = false
    showExport.value = false
  }
}

function toggleSettings() {
  showSettings.value = !showSettings.value
  if (showSettings.value) {
    showTemplates.value = false
    showExport.value = false
  }
}

function toggleExport() {
  showExport.value = !showExport.value
  if (showExport.value) {
    showSettings.value = false
    showTemplates.value = false
  }
}

const drawExport = useDrawExport({
  strokes: editor.strokes,
  bgColor: editor.bgColor,
  camera: editor.camera,
  viewport,
  selection: editor.selection,
  drawId: props.drawId,
  resolveHref: imageAssets.resolveFullHref,
})

const bgColorOptions = () => {
  const base = ['#ffffff', '#f8f9fa', '#f1f3f5', '#fff5f5', '#fff9db', '#f4fce3', '#e7f5ff', '#f3f0ff', '#1e1e1e']
  return base.map((c) => ({ color: c }))
}

const isBackgroundDark = computed(() => {
  const bg = editor.bgColor.value
  if (!bg || bg === 'transparent') {
    return false
  }
  try {
    const rgb = hexToRgb(bg)
    const y = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
    return y < 128
  } catch {
    return false
  }
})

const gridStrokeColor = computed(() => {
  return isBackgroundDark.value ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
})

const gridDotColor = computed(() => {
  return isBackgroundDark.value ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'
})

// --- Библиотека шаблонов (правая вкладка) ---
function onInsertTemplate(strokes: DrawStroke[]) {
  editor.insertTemplate(strokes)
}

const FILL_SHAPE_TOOLS = ['rectangle', 'ellipse', 'diamond']
const showFill = computed(() => {
  if (FILL_SHAPE_TOOLS.includes(editor.tool.value as string)) return true
  if (editor.selection.value.size > 0) {
    return editor.strokes.value.some(
      (s) => s.id && editor.selection.value.has(s.id) && FILL_SHAPE_TOOLS.includes(s.type),
    )
  }
  return false
})

const GEOMETRY_TOOLS = ['rectangle', 'line', 'arrow', 'ellipse', 'diamond']
const showGeometry = computed(() => {
  if (GEOMETRY_TOOLS.includes(editor.tool.value as string)) return true
  if (editor.selection.value.size > 0) {
    return editor.strokes.value.some(
      (s) => s.id && editor.selection.value.has(s.id) && GEOMETRY_TOOLS.includes(s.type),
    )
  }
  return false
})

const showArrow = computed(() => {
  if (editor.tool.value === 'arrow') return true
  if (editor.selection.value.size > 0) {
    return editor.strokes.value.some(
      (s) => s.id && editor.selection.value.has(s.id) && s.type === 'arrow',
    )
  }
  return false
})

const showText = computed(() => {
  if (editor.tool.value === 'text' || editor.textEditor.value.active) return true
  if (editor.selection.value.size > 0) {
    return editor.strokes.value.some(
      (s) => s.id && editor.selection.value.has(s.id) && s.type === 'text',
    )
  }
  return false
})

// --- Load payload on mount ---
async function loadPayload() {
  loading.value = true
  try {
    const drawSrc = noteSync.findDrawSrcInContent()
    const backend = workspaceStore.backend
    if (backend) {
      let bytes: number[] | null = null
      if (drawSrc) {
        try {
          bytes = await backend.readDrawAsset(drawSrc)
        } catch (error) {
          console.warn('[DrawView] Stale draw src, falling back to latest by id', error)
        }
      }
      if (!bytes && backend.readLatestDrawAsset) {
        try {
          bytes = await backend.readLatestDrawAsset(props.drawId)
        } catch {
          bytes = null
        }
      }
      if (bytes) {
        const data = parseDrawData(new TextDecoder().decode(new Uint8Array(bytes)))
        editor.strokes.value = data.strokes
        editor.bgColor.value = data.bgColor
        editor.canvasSize.value = { ...data.canvas }
        editor.camera.value = { ...data.camera }
        void imageAssets.hydrateImageCaches(editor.strokes.value)
      }
    }
  } catch (error) {
    console.error('[DrawView] Failed to load drawing payload', error)
  } finally {
    loading.value = false
    measureViewport()
    await refreshCommittedSvg()
  }
}

onMounted(() => {
  void loadPayload()
})

onBeforeUnmount(() => {
  editor.commitText()
  // Best-effort flush if the view is torn down by something other than back().
  void editor.flushSave()
  disconnectViewport()
})

async function back() {
  // Зафиксировать незакоммиченный текст перед сохранением/навигацией.
  editor.commitText()
  // Await the flush so the drawing's asset src/preview is patched into the
  // note BEFORE we navigate and the editor pane remounts.
  await editor.flushSave()
  // The flush's onPersisted queues a direct Y.Doc patch; await it too.
  await noteSync.awaitDocPatch()
  emit('back')
}
</script>

<template>
  <div class="draw-view" :class="{ 'draw-view--dark': isDark }">
    <header class="draw-view__header">
      <button type="button" class="draw-view__back" :title="$t('common.back')" @click="back">
        <ArrowLeft :size="18" />
      </button>
      <div class="draw-view__title">{{ $t('editor.draw.label') }}</div>
      <div class="draw-view__header-spacer" />
      <div v-if="errorMessage" class="draw-view__error" role="alert">{{ errorMessage }}</div>
    </header>

    <div ref="canvasWrapEl" class="draw-view__canvas-wrap" :style="bgStyle" :class="cursorClass">
      <div v-if="loading" class="draw-view__loading">{{ $t('common.loading') }}</div>
      <!-- Background grid (в экранных координатах; фикс. размер клетки, едет за pan) -->
      <svg
        v-if="editor.gridType.value !== 'none'"
        class="draw-canvas draw-canvas--grid"
        :view-box.camel="`0 0 ${viewport.w} ${viewport.h}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <!-- Квадратная сетка -->
          <pattern id="draw-grid-square" :x="gridOffset.x" :y="gridOffset.y" :width="GRID_CELL" :height="GRID_CELL" patternUnits="userSpaceOnUse">
            <path :d="`M ${GRID_CELL} 0 L 0 0 0 ${GRID_CELL}`" fill="none" :stroke="gridStrokeColor" stroke-width="1" />
          </pattern>
          <!-- Горизонтальные линии -->
          <pattern id="draw-grid-lines" :x="gridOffset.x" :y="gridOffset.y" :width="GRID_CELL" :height="GRID_CELL" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" :x2="GRID_CELL" y2="0" :stroke="gridStrokeColor" stroke-width="1" />
          </pattern>
          <!-- Точечная сетка -->
          <pattern id="draw-grid-dots" :x="gridOffset.x" :y="gridOffset.y" :width="GRID_CELL" :height="GRID_CELL" patternUnits="userSpaceOnUse">
            <circle :cx="GRID_CELL / 2" :cy="GRID_CELL / 2" r="1.5" :fill="gridDotColor" />
          </pattern>
        </defs>
        <rect x="0" y="0" :width="viewport.w" :height="viewport.h" :fill="`url(#draw-grid-${editor.gridType.value})`" />
      </svg>
      <!-- Live-превью маркера: под committed-слоем (раньше в DOM при том же z-index),
           чтобы штрих маркера сразу рисовался под фигурами, как после коммита. -->
      <svg
        class="draw-canvas draw-canvas--hl-preview"
        :view-box.camel="viewBox"
        preserveAspectRatio="none"
        aria-hidden="true"
        v-html="highlighterPreviewInner"
      />
      <!-- Committed strokes -->
      <svg
        ref="canvasEl"
        class="draw-canvas"
        :view-box.camel="viewBox"
        preserveAspectRatio="none"
      />
      <!-- Live in-progress stroke overlay (also captures pointer events) -->
      <svg
        ref="overlayEl"
        class="draw-canvas draw-canvas--overlay"
        :view-box.camel="viewBox"
        preserveAspectRatio="none"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerLeave"
        @mousedown="onMouseDown"
        @wheel="onWheel"
        @dblclick="onCanvasDblClick"
        v-html="overlaySvgInner"
      />
      <!-- Кастомный курсор-круг режима «стёрки» (диаметр = размер кисти) -->
      <div
        v-if="editor.tool.value === 'eraser' && eraserCursor.visible"
        class="draw-eraser-cursor"
        :style="{
          left: `${eraserCursor.x}px`,
          top: `${eraserCursor.y}px`,
          width: `${eraserCursorSize}px`,
          height: `${eraserCursorSize}px`,
        }"
        aria-hidden="true"
      />
      <!-- Редактируемый оверлей ввода текста (инструмент «текст») -->
      <DrawTextInput
        :active="editor.textEditor.value.active"
        :edit-id="editor.textEditor.value.editId"
        :value="editor.textEditor.value.value"
        :style="textEditorStyle"
        @input="onTextInput"
        @blur="onTextBlur"
        @keydown="onTextKeydown"
      />
      <!-- Хром выделения и marquee -->
      <DrawSelectionOverlay
        :selection-screen="selectionScreen"
        :marquee-style="marqueeStyle"
        :bind-highlight="bindHighlightScreen"
        :selection-all-locked="selectionAllLocked"
        :rotate-offset="ROTATE_OFFSET"
        :bend-handle="bendHandleScreen"
      />
      <!-- Кнопка экспорта рисунка (SVG, PNG) -->
      <button
        type="button"
        class="draw-export-toggle"
        :class="{ 'is-active': showExport }"
        :title="$t('editor.draw.export.title')"
        :aria-pressed="showExport"
        @click="toggleExport"
      >
        <Download :size="18" />
      </button>

      <!-- Кнопка настроек холста (задний фон, сетка) -->
      <button
        type="button"
        class="draw-canvas-settings-toggle"
        :class="{ 'is-active': showSettings }"
        :title="$t('editor.draw.settings.title')"
        :aria-pressed="showSettings"
        @click="toggleSettings"
      >
        <Settings :size="18" />
      </button>

      <!-- Кнопка открытия библиотеки шаблонов (правый верхний угол холста) -->
      <button
        type="button"
        class="draw-templates-toggle"
        :class="{ 'is-active': showTemplates }"
        :title="$t('editor.draw.templates.open')"
        :aria-pressed="showTemplates"
        @click="toggleTemplates"
      >
        <Shapes :size="18" />
      </button>

      <!-- Панель экспорта рисунка -->
      <div v-if="showExport" class="draw-export-settings">
        <div class="draw-export-settings__header">
          <div class="draw-export-settings__title">{{ $t('editor.draw.export.title') }}</div>
          <button
            type="button"
            class="draw-export-settings__close"
            :title="$t('editor.draw.templates.close')"
            @click="showExport = false"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <!-- Выбор формата -->
        <div class="draw-export-settings__section">
          <div class="draw-export-settings__label">{{ $t('editor.draw.export.format') }}</div>
          <div class="draw-export-settings__segs">
            <button
              type="button"
              class="draw-export-settings__seg"
              :class="{ 'is-active': drawExport.format.value === 'png' }"
              @click="drawExport.format.value = 'png'"
            >
              PNG
            </button>
            <button
              type="button"
              class="draw-export-settings__seg"
              :class="{ 'is-active': drawExport.format.value === 'svg' }"
              @click="drawExport.format.value = 'svg'"
            >
              SVG
            </button>
          </div>
        </div>

        <!-- Выбор области экспорта -->
        <div class="draw-export-settings__section">
          <div class="draw-export-settings__label">{{ $t('editor.draw.export.scope') }}</div>
          <div class="draw-export-settings__segs draw-export-settings__segs--vertical">
            <button
              type="button"
              class="draw-export-settings__seg"
              :class="{ 'is-active': drawExport.scope.value === 'all' }"
              @click="drawExport.scope.value = 'all'"
            >
              {{ $t('editor.draw.export.scopeAll') }}
            </button>
            <button
              type="button"
              class="draw-export-settings__seg"
              :class="{ 'is-active': drawExport.scope.value === 'viewport' }"
              @click="drawExport.scope.value = 'viewport'"
            >
              {{ $t('editor.draw.export.scopeViewport') }}
            </button>
            <button
              type="button"
              class="draw-export-settings__seg"
              :class="{ 'is-active': drawExport.scope.value === 'selection' }"
              @click="drawExport.scope.value = 'selection'"
            >
              {{ $t('editor.draw.export.scopeSelection') }}
            </button>
          </div>
        </div>

        <!-- Прозрачность фона -->
        <div class="draw-export-settings__section draw-export-settings__section--row">
          <div class="draw-export-settings__label">{{ $t('editor.draw.export.transparent') }}</div>
          <NvToggle
            :model-value="drawExport.transparent.value"
            @update:model-value="(v) => drawExport.transparent.value = v"
          />
        </div>

        <!-- Ошибка, если область "выделенное", но ничего не выбрано -->
        <div v-if="drawExport.errorMessage.value" class="draw-export-settings__error">
          {{ drawExport.errorMessage.value === 'selectionEmpty' ? $t('editor.draw.export.errorSelectionEmpty') : drawExport.errorMessage.value }}
        </div>

        <!-- Кнопка действия -->
        <button
          type="button"
          class="draw-export-settings__btn"
          :disabled="drawExport.exporting.value"
          @click="drawExport.performExport"
        >
          {{ drawExport.exporting.value ? $t('editor.draw.export.exporting') : $t('editor.draw.export.button') }}
        </button>
      </div>

      <!-- Боковая панель настроек холста -->
      <div v-if="showSettings" class="draw-canvas-settings">
        <div class="draw-canvas-settings__header">
          <div class="draw-canvas-settings__title">{{ $t('editor.draw.settings.title') }}</div>
          <button
            type="button"
            class="draw-canvas-settings__close"
            :title="$t('editor.draw.templates.close')"
            @click="showSettings = false"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <!-- Выбор цвета фона холста -->
        <div class="draw-canvas-settings__section">
          <div class="draw-canvas-settings__label">{{ $t('editor.draw.settings.bgColor') }}</div>
          <NvColorPicker
            :model-value="editor.bgColor.value === 'transparent' ? null : editor.bgColor.value"
            :colors="bgColorOptions()"
            :allow-none="true"
            display="popover"
            @update:model-value="(v) => editor.setBgColor(v ?? 'transparent')"
          />
        </div>

        <!-- Выбор типа сетки -->
        <div class="draw-canvas-settings__section">
          <div class="draw-canvas-settings__label">{{ $t('editor.draw.settings.gridType') }}</div>
          <div class="draw-canvas-settings__segs">
            <button
              type="button"
              class="draw-canvas-settings__seg"
              :class="{ 'is-active': editor.gridType.value === 'none' }"
              @click="editor.setGridType('none')"
            >
              {{ $t('editor.draw.settings.gridNone') }}
            </button>
            <button
              type="button"
              class="draw-canvas-settings__seg"
              :class="{ 'is-active': editor.gridType.value === 'square' }"
              @click="editor.setGridType('square')"
            >
              {{ $t('editor.draw.settings.gridSquare') }}
            </button>
            <button
              type="button"
              class="draw-canvas-settings__seg"
              :class="{ 'is-active': editor.gridType.value === 'lines' }"
              @click="editor.setGridType('lines')"
            >
              {{ $t('editor.draw.settings.gridLines') }}
            </button>
            <button
              type="button"
              class="draw-canvas-settings__seg"
              :class="{ 'is-active': editor.gridType.value === 'dots' }"
              @click="editor.setGridType('dots')"
            >
              {{ $t('editor.draw.settings.gridDots') }}
            </button>
          </div>
        </div>

        <!-- Авто-распознавание фигур -->
        <div class="draw-canvas-settings__section draw-canvas-settings__section--row">
          <div class="draw-canvas-settings__label">{{ $t('editor.draw.settings.autoDetect') }}</div>
          <NvToggle
            :model-value="editor.autoDetectShapes.value"
            @update:model-value="editor.setAutoDetectShapes"
          />
        </div>
      </div>

      <!-- Боковая вкладка библиотеки UI/диаграмм-шаблонов -->
      <DrawTemplatesPanel
        v-if="showTemplates"
        @insert="onInsertTemplate"
        @close="showTemplates = false"
      />

      <!-- Контекстная панель действий над выделением -->
      <DrawContextToolbar
        v-if="selectionScreen"
        :left="selectionScreen.left + selectionScreen.width / 2"
        :top="selectionScreen.top - ROTATE_OFFSET - 10"
        @bring-to-front="editor.bringToFront"
        @bring-forward="editor.bringForward"
        @send-backward="editor.sendBackward"
        @send-to-back="editor.sendToBack"
        @duplicate="editor.duplicateSelection"
        @delete="editor.deleteSelection"
      />
    </div>

    <!-- Боковая панель свойств штриха (слева по вертикали) -->
    <DrawPropertiesPanel
      v-if="showProps"
      :active-style="editor.activeStyle.value"
      :palette="editor.palette"
      :show-fill="showFill"
      :show-geometry="showGeometry"
      :show-arrow="showArrow"
      :show-text="showText"
      :selection-count="selectionCount"
      :can-group="editor.canGroup.value"
      :can-ungroup="editor.canUngroup.value"
      :can-align="editor.canAlign.value"
      :can-distribute="editor.canDistribute.value"
      :has-locked="editor.hasLockedSelection.value"
      :has-unlocked="editor.hasUnlockedSelection.value"
      @update:stroke-color="editor.setStrokeColor"
      @update:fill-color="editor.setFillColor"
      @update:fill-style="editor.setFillStyle"
      @update:size="editor.setStrokeSize"
      @update:stroke-style="editor.setStrokeStyle"
      @update:opacity="editor.setOpacity"
      @update:roughness="editor.setRoughness"
      @update:arrow-shape="editor.setArrowShape"
      @update:start-cap="editor.setStartCap"
      @update:end-cap="editor.setEndCap"
      @update:font-family="editor.setFontFamily"
      @update:font-size="editor.setFontSize"
      @align="editor.alignSelection"
      @distribute="editor.distributeSelection"
      @flip="editor.flipSelection"
      @group="editor.group"
      @ungroup="editor.ungroup"
      @lock="editor.lockSelection"
      @unlock="editor.unlockSelection"
    />

    <!-- Левитирующая панель инструментов в нижней части холста -->
    <DrawToolbar
      :tool="editor.tool.value"
      :can-undo="editor.canUndo.value"
      :can-redo="editor.canRedo.value"
      @update:tool="editor.tool.value = $event"
      @undo="editor.undo"
      @redo="editor.redo"
      @clear="editor.clear"
    >
      <template #tools-trailing>
        <DrawZoomControl
          :zoom-percent="zoomPercent"
          @zoom-out="editor.zoomBy(0.8)"
          @zoom-in="editor.zoomBy(1.25)"
          @fit="editor.fitToContent()"
        />
      </template>
    </DrawToolbar>
  </div>
</template>
