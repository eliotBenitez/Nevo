<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createNotebook, decodeNoteFormat } from '../../core/notebook/codec'
import type { NotebookLineStyle, NotebookPaperKind, NotebookSnapshotV1 } from '../../core/notebook/types'
import { isNotebookStroke, NOTEBOOK_SERIALIZED_LIMIT_BYTES } from '../../core/notebook/types'
import type { NoteDocument } from '../../types/note'
import { useNoteStore, type SaveStatus } from '../../stores/note'
import { useWorkspaceStore } from '../../stores/workspace'
import { confirm } from '../../ui/composables/useConfirmDialog'
import { exportNotebookSource } from '../../tauri/notebook'
import NotebookPage from './components/NotebookPage.vue'
import NotebookPagesPanel from './components/NotebookPagesPanel.vue'
import NotebookToolbar from './components/NotebookToolbar.vue'
import NotebookSelectionToolbar from './components/NotebookSelectionToolbar.vue'
import { useNotebookDocument } from './composables/useNotebookDocument'
import { createNotebookInput, type NotebookEraserMode, type NotebookGestureStyle, type NotebookInputTool } from './composables/useNotebookInput'
import { useNotebookExport } from './composables/useNotebookExport'
import { useNotebookPersistence } from './composables/useNotebookPersistence'
import { createNotebookViewport } from './composables/useNotebookViewport'
import { useNotebookInteraction } from './composables/useNotebookInteraction'
import { notebookSelectionUnits } from '../../core/notebook/alignment'
import { captureNotebookRulerGuide } from '../../core/notebook/ruler'
import { recognizeNotebookShape } from '../../core/notebook/recognize'
import { useNotebookRulerOverlay } from './composables/useNotebookRulerOverlay'
import { useNotebookLaser } from './composables/useNotebookLaser'
import { isNotebookInkTool, useNotebookPalette } from './composables/useNotebookPalette'
import { useNotebookToolPreferences } from './composables/useNotebookToolPreferences'
import { isNotebookPasteTargetIgnored, useNotebookImageImport } from './composables/useNotebookImageImport'

const props = defineProps<{ note: NoteDocument; workspacePath: string; saveStatus: SaveStatus }>()
const emit = defineEmits<{ 'update:notebook': [snapshot: NotebookSnapshotV1]; 'update:title': [title: string] }>()
const { t } = useI18n()
const noteStore = useNoteStore()
const workspaceStore = useWorkspaceStore()
const sessionNoteId = props.note.id
const sessionWorkspacePath = props.workspacePath
const sessionBackend = workspaceStore.backend
function isCurrentSession(): boolean {
  return workspaceStore.backend === sessionBackend
    && workspaceStore.activePath === sessionWorkspacePath
    && props.workspacePath === sessionWorkspacePath
    && props.note.id === sessionNoteId
    && noteStore.activeNote?.id === sessionNoteId
}
const format = shallowRef(decodeNoteFormat(props.note))
const editable = computed(() => format.value.status === 'notebook')
const initial = format.value.status === 'notebook' ? format.value.snapshot : null
const notebook = shallowRef<NotebookSnapshotV1 | null>(initial)
const noteEnvelopeBytes = new TextEncoder().encode(JSON.stringify({ ...props.note, notebook: null })).byteLength - 4
const doc = useNotebookDocument(notebook.value ?? createNotebook(), snapshot => {
  if (!isCurrentSession()) return
  notebook.value = snapshot
  emit('update:notebook', snapshot)
}, NOTEBOOK_SERIALIZED_LIMIT_BYTES - noteEnvelopeBytes)

const tool = ref<NotebookInputTool | 'hand'>('pen')
const palette = useNotebookPalette()
const toolPreferences = useNotebookToolPreferences()
const penColor = ref(toolPreferences.initial.penColor)
const markerColor = ref(toolPreferences.initial.markerColor)
const laserColor = ref('#ef4444')
const laserWidth = ref(2.5)
const strokeWidth = ref(toolPreferences.initial.strokeWidth)
const markerWidth = ref(toolPreferences.initial.markerWidth)
watch([penColor, markerColor, strokeWidth, markerWidth], ([pen, marker, stroke, markerSize]) => {
  toolPreferences.remember({ penColor: pen, markerColor: marker, strokeWidth: stroke, markerWidth: markerSize })
})
const eraserDiameter = ref(12)
const lineDash = ref<NotebookLineStyle>('solid')
const eraserMode = ref<NotebookEraserMode>('partial')
const selectionActive = ref(false)
const selectionVisible = computed(() => (tool.value === 'lasso' || tool.value === 'move') && doc.selectedObjectIds.value.length > 0)
const selectedObjects = computed(() => currentPage.value?.objects.filter(object => doc.selectedObjectIds.value.includes(object.id)) ?? [])
const selectionColor = computed(() => selectedObjects.value.find(isNotebookStroke)?.color ?? penColor.value)
const selectionUnitCount = computed(() => currentPage.value ? notebookSelectionUnits(currentPage.value, doc.selectedObjectIds.value).length : 0)
const selectionHasInk = computed(() => selectedObjects.value.some(isNotebookStroke))
const pagesOpen = ref(false)
const narrow = ref(false)
const activePageId = ref(notebook.value?.pages[0]?.id ?? null)
const stage = ref<HTMLElement | null>(null)
const scroller = ref<HTMLElement | null>(null)
const titleInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const editorRootEl = ref<HTMLElement | null>(null)
const saveError = ref<string | null>(null)
const sourceExporting = ref(false)
const limitMessage = computed(() => doc.limitReached.value ? t(doc.limitReached.value) : null)
const savedSnapshot = shallowRef<NotebookSnapshotV1 | null>(null)
let ignoreOwnEcho: NotebookSnapshotV1 | null = null

const ghostPage = computed(() => doc.ghostPage.value)
const displayPages = computed(() => notebook.value ? (ghostPage.value ? [...notebook.value.pages, ghostPage.value] : notebook.value.pages) : [])
const viewport = createNotebookViewport(() => displayPages.value.length)
const visiblePages = computed(() => displayPages.value.slice(viewport.visibleRange.value.start, viewport.visibleRange.value.end))
const topSpacer = computed(() => viewport.visibleRange.value.start * viewport.rowHeight.value)
const bottomSpacer = computed(() => Math.max(0, displayPages.value.length - viewport.visibleRange.value.end) * viewport.rowHeight.value)
const summaryPage = computed(() => displayPages.value[viewport.selectedIndex.value] ?? currentPage.value)
const selectedPageId = computed(() => doc?.currentPage.value.id ?? '')
const currentPage = computed(() => doc?.currentPage.value ?? null)
const laser = useNotebookLaser()
const currentColor = computed(() => tool.value === 'marker' ? markerColor.value : tool.value === 'laser' ? laserColor.value : penColor.value)
const currentWidth = computed(() => tool.value === 'laser' ? laserWidth.value : strokeWidth.value)
const gestureStyle = computed<NotebookGestureStyle>(() => ({
  color: currentColor.value,
  width: currentWidth.value,
  markerWidth: markerWidth.value,
  eraserDiameter: eraserDiameter.value,
  dash: tool.value === 'line' ? lineDash.value : undefined,
  eraserMode: tool.value === 'eraser' ? eraserMode.value : undefined,
}))

let interaction: ReturnType<typeof useNotebookInteraction> | null = null
const { open: rulerOpen, active: rulerActive, pose: rulerPose, toggle: toggleRuler } = useNotebookRulerOverlay({
  root: stage, scroller, page: () => currentPage.value, zoom: () => viewport.zoom.value,
  inputActive: () => input.isActive.value, beforeToggle: () => interaction?.finishBeforeCommand(),
})
const input = createNotebookInput({
  element: () => {
    const id = activePageId.value
    const page = Array.from(stage.value?.querySelectorAll<HTMLElement>('[data-page-id]') ?? []).find(element => element.dataset.pageId === id)
    return page?.querySelector<SVGSVGElement>('.notebook-page') ?? null
  },
  zoom: () => viewport.zoom.value,
  rulerGuide: point => rulerOpen.value ? captureNotebookRulerGuide(rulerPose.value, point, viewport.zoom.value) : null,
  tool: () => tool.value,
  pageId: () => activePageId.value,
  style: () => gestureStyle.value,
  modelStrokes: () => true,
  touchPointerIds: () => interaction?.touchPointerIds() ?? [],
  onCheckpoint: (points, gestureTool, style, actionId, pageId) => doc.checkpointGesture(points, gestureTool, style, actionId, pageId),
  recognizeHold: points => recognizeNotebookShape(points)?.points ?? null,
  onRecognized: (points, style, actionId, pageId) => {
    doc.applyRecognizedStroke(points, style, pageId, actionId)
    palette.recordUse(style.color)
  },
  onStroke: (points, gestureTool, style, actionId, pageId) => {
    if (gestureTool === 'laser') laser.add(points, style, pageId)
    else {
      doc.applyGesture(points, gestureTool, style, pageId, actionId)
      if (isNotebookInkTool(gestureTool)) palette.recordUse(style.color)
    }
  },
})

const persist = useNotebookPersistence({
  noteId: props.note.id,
  workspacePath: props.workspacePath,
  isCurrent: isCurrentSession,
  flushInput: () => input.finish(),
  suspendInput: () => input.pause(),
  flushDurably: options => noteStore.flushDurably(options),
  supportsLifecycleEvents: workspaceStore.appMetadata?.supportsNotebookLifecycleEvents === true,
  resumeInput: () => input.resume(),
  onError: error => {
    saveError.value = error instanceof Error ? error.message : t('notebook.saveStatus.error')
  },
})

interaction = useNotebookInteraction({ input, viewport, scroller, tool, activePageId, document: doc, isOverlayActive: () => rulerActive.value || selectionActive.value })

const imageImport = useNotebookImageImport({
  getBackend: () => sessionBackend,
  canImport: () => editable.value && isCurrentSession(),
  insertImage: (src, width, height) => {
    interaction?.finishBeforeCommand()
    const id = doc.insertImage(src, width, height)
    if (id) chooseTool('lasso')
    return id
  },
})

const exporter = useNotebookExport({
  noteId: props.note.id,
  workspacePath: props.workspacePath,
  title: () => props.note.title,
  snapshot: () => notebook.value ?? initial!,
  pauseInput: () => { input.finish(); input.pause() },
  resumeInput: () => input.resume(),
  includePaper: () => true,
  flushDurably: () => noteStore.flushDurably(),
  onError: error => { saveError.value = error instanceof Error ? error.message : t('notebook.errors.export') },
})

watch(() => notebook.value, value => { if (value) viewport.attach(() => scroller.value) }, { immediate: true })
watch(() => [scroller.value, viewport.visibleRange.value] as const, () => {
  if (scroller.value) viewport.onScroll({ currentTarget: scroller.value } as unknown as Event)
}, { flush: 'post' })
watch([pagesOpen, narrow], () => {
  if (scroller.value) viewport.onScroll({ currentTarget: scroller.value } as unknown as Event)
}, { flush: 'post' })
watch(() => [props.note.documentKind, props.note.notebook] as const, ([, incoming]) => {
  if (!isCurrentSession()) { input.cancel(); return }
  if (toRaw(incoming) === toRaw(notebook.value) || toRaw(incoming) === toRaw(ignoreOwnEcho)) {
    if (incoming) ignoreOwnEcho = null
    return
  }
  const next = decodeNoteFormat(props.note)
  format.value = next
  if (next.status !== 'notebook') {
    input.cancel()
    return
  }
  if (next.snapshot === notebook.value || next.snapshot === ignoreOwnEcho) {
    if (next.status === 'notebook') ignoreOwnEcho = null
    return
  }
  input.cancel()
  doc?.setExternalSnapshot(next.snapshot)
  notebook.value = next.snapshot
  savedSnapshot.value = next.snapshot
}, { deep: false })
watch(() => props.note.title, title => { if (titleInput.value && document.activeElement !== titleInput.value) titleInput.value.value = title })
watch(() => props.saveStatus, status => { if (status !== 'error') saveError.value = null })

function updateNotebook(snapshot: NotebookSnapshotV1): void {
  if (!isCurrentSession()) return
  ignoreOwnEcho = snapshot
  const changed = noteStore.activeNote?.notebook !== snapshot
  if (!noteStore.setNotebookFromSession(snapshot, props.note.id)) return
  savedSnapshot.value = snapshot
  if (changed) persist.markChanged()
}

// `doc` emits before persistence; keeping the store update synchronous preserves
// the active session's exact immutable snapshot while the debounced disk write runs.
const stopNotebookWatch = watch(notebook, snapshot => {
  if (snapshot) updateNotebook(snapshot)
}, { flush: 'sync' })

function recolorSelection(color: string): void {
  if (doc.colorSelection(color)) palette.recordUse(color)
}

function chooseTool(next: NotebookInputTool | 'hand'): void {
  input.finish()
  tool.value = next
}

function chooseImageFile(): void {
  if (imageImport.importing.value) return
  interaction?.finishBeforeCommand()
  imageInput.value?.click()
}

async function onImageFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await imageImport.importFile(file)
}

function onPaste(event: ClipboardEvent): void {
  if (!editable.value || isNotebookPasteTargetIgnored(event.target)) return
  void imageImport.onPaste(event)
}

function togglePages(): void {
  interaction?.finishBeforeCommand()
  pagesOpen.value = !pagesOpen.value
}

async function closePages(): Promise<void> {
  interaction?.finishBeforeCommand()
  pagesOpen.value = false
  await nextTick()
  stage.value?.querySelector<HTMLButtonElement>('.notebook-toolbar__pages-toggle')?.focus()
}

function undo(): void { interaction?.finishBeforeCommand(); doc.history.undo() }
function redo(): void { interaction?.finishBeforeCommand(); doc.history.redo() }
function addPage(): void {
  interaction?.finishBeforeCommand()
  const pageId = doc.addPage()
  if (pageId) selectPage(pageId)
}
function duplicatePage(pageId: string): void {
  interaction?.finishBeforeCommand()
  const nextId = doc.duplicatePage(pageId)
  activePageId.value = nextId
  const index = notebook.value?.pages.findIndex(page => page.id === nextId) ?? -1
  if (index >= 0) viewport.scrollToPage(index)
}
function movePage(pageId: string, direction: -1 | 1): void {
  interaction?.finishBeforeCommand()
  doc.movePage(pageId, direction)
}
function selectPage(pageId: string): void {
  const index = notebook.value?.pages.findIndex(page => page.id === pageId) ?? -1
  if (index < 0) return
  input.finish()
  doc.setCurrentPage(pageId)
  activePageId.value = pageId
  viewport.scrollToPage(index)
}
watch(() => viewport.selectedIndex.value, index => {
  if (input.isActive.value || selectionActive.value) return
  const pageId = notebook.value?.pages[index]?.id
  if (pageId && pageId !== activePageId.value) {
    doc.setCurrentPage(pageId)
    activePageId.value = pageId
  }
})
// Undo of a materialized ghost page removes the page the next stroke was aimed at.
watch(() => notebook.value, () => {
  if (input.isActive.value || !activePageId.value) return
  if (!displayPages.value.some(page => page.id === activePageId.value)) activePageId.value = doc.currentPage.value.id
})
function setPaper(paper: NotebookPaperKind): void { interaction?.finishBeforeCommand(); doc?.setPaper(paper) }
function saveTitle(): void {
  if (!isCurrentSession()) return
  const title = titleInput.value?.value.trim()
  if (title && title !== props.note.title) emit('update:title', title)
}
async function removePage(pageId: string): Promise<void> {
  interaction?.finishBeforeCommand()
  const page = notebook.value?.pages.find(candidate => candidate.id === pageId)
  if (!page || !doc || (notebook.value?.pages.length ?? 0) <= 1) return
  const accepted = !page.objects.length || await confirm({
    title: t('notebook.deletePage.title'), message: t('notebook.deletePage.message'),
    confirmLabel: t('notebook.deletePage.confirm'), cancelLabel: t('notebook.deletePage.cancel'), variant: 'danger',
  })
  if (!accepted) return
  doc.deletePage(pageId)
  activePageId.value = doc.currentPage.value.id
  const activeIndex = notebook.value?.pages.findIndex(candidate => candidate.id === activePageId.value) ?? 0
  viewport.scrollToPage(activeIndex)
  await nextTick()
  await nextTick()
  const selectedThumbnail = Array.from(stage.value?.querySelectorAll<HTMLButtonElement>('[data-page-thumbnail]') ?? []).find(element => element.dataset.pageThumbnail === activePageId.value)
  if (selectedThumbnail) selectedThumbnail.focus()
  else scroller.value?.focus()
}

async function exportSource(): Promise<void> {
  if (!isCurrentSession()) return
  if (sourceExporting.value) return
  sourceExporting.value = true
  try {
    await exportNotebookSource({ workspacePath: props.workspacePath, noteId: props.note.id })
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : t('notebook.errors.export')
  } finally {
    sourceExporting.value = false
  }
}

function flushSave(): Promise<void> {
  if (!isCurrentSession()) { input.cancel(); return Promise.resolve() }
  input.finish()
  return persist.flushNow()
}
function suspend(): void { input.finish(); input.pause(); persist.suspend() }

defineExpose({ editorRootEl, flushSave, suspend })

let updateNarrow: (() => void) | undefined
onMounted(() => {
  editorRootEl.value = stage.value
  updateNarrow = () => { narrow.value = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches; if (narrow.value) pagesOpen.value = false }
  updateNarrow()
  window.addEventListener('resize', updateNarrow)
})
onBeforeUnmount(() => { input.finish(); stopNotebookWatch(); if (updateNarrow) window.removeEventListener('resize', updateNarrow) })

</script>

<template>
  <section ref="stage" class="notebook-view" :class="{ 'notebook-view--panning': interaction?.isPanning.value }" :aria-label="t('notebook.toolbar')" @keydown="interaction?.onKeyDown" @keyup="interaction?.onKeyUp" @pointerdown.capture="interaction?.onPointerDown" @pointermove.capture="interaction?.onPointerMove" @pointerup.capture="interaction?.onPointerUp" @pointercancel.capture="interaction?.onPointerCancel" @wheel="interaction?.onWheel" @paste="onPaste">
    <template v-if="editable && notebook && doc">
      <div class="notebook-view__title-row">
        <input ref="titleInput" class="notebook-view__title" :value="note.title" :aria-label="t('notebook.title')" @change="saveTitle" @keydown.enter="($event.target as HTMLInputElement).blur()">
      </div>
      <NotebookToolbar
        :class="{ 'notebook-toolbar--selection': selectionVisible }"
        :tool="tool" :color="currentColor" :stroke-width="currentWidth" :marker-width="markerWidth" :eraser-diameter="eraserDiameter"
        :paper="currentPage?.paper.kind ?? 'ruled'" :zoom="viewport.zoom.value" :can-undo="doc.history.canUndo.value" :can-redo="doc.history.canRedo.value" :pages-open="pagesOpen"
        :line-dash="lineDash" :eraser-mode="eraserMode" :ruler-open="rulerOpen"
        :exporting="exporter.exporting.value" :importing="imageImport.importing.value" :save-status="saveError ? 'error' : saveStatus" :error="saveError ?? imageImport.error.value ?? limitMessage"
        :presets="palette.presets.value" :recents="palette.recents.value" :quick-colors="palette.quickColors.value" @add-preset="palette.addPreset" @remove-preset="palette.removePreset"
        @update:tool="chooseTool" @update:color="color => tool === 'marker' ? markerColor = color : tool === 'laser' ? laserColor = color : penColor = color"
        @update:stroke-width="tool === 'laser' ? laserWidth = $event : strokeWidth = $event" @update:marker-width="markerWidth = $event" @update:eraser-diameter="eraserDiameter = $event"
        @update:line-dash="lineDash = $event"
        @update:eraser-mode="eraserMode = $event"
        @update:paper="setPaper" @undo="undo" @redo="redo" @toggle-ruler="toggleRuler" @insert-image="chooseImageFile"
        @zoom-in="!input.isActive.value && !rulerActive && !selectionActive && viewport.zoomBy(1.1)" @zoom-out="!input.isActive.value && !rulerActive && !selectionActive && viewport.zoomBy(0.9)" @toggle-pages="togglePages" @export="isCurrentSession() && exporter.exportPdf()"
      />
      <NotebookSelectionToolbar
        v-if="selectionVisible" :count="doc.selectedObjectIds.value.length" :unit-count="selectionUnitCount" :color="selectionColor" :color-disabled="!selectionHasInk" :disabled="input.isActive.value || selectionActive"
        :presets="palette.presets.value" :recents="palette.recents.value" @add-preset="palette.addPreset" @remove-preset="palette.removePreset"
        @flip="doc.flipSelection" @align="doc.alignSelection" @distribute="doc.distributeSelection" @copy="doc.copySelection" @color="recolorSelection" @transform="doc.transformSelection" @clear="doc.clearSelection(); scroller?.focus({ preventScroll: true })"
      />
      <input ref="imageInput" class="notebook-view__file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden tabindex="-1" aria-hidden="true" @change="onImageFileChosen">
      <div class="notebook-view__body">
        <NotebookPagesPanel
          :pages="notebook.pages" :selected-page-id="selectedPageId" :open="pagesOpen" :narrow="narrow"
          @select="selectPage" @add="addPage" @duplicate="duplicatePage" @move="movePage"
          @remove="removePage" @close="closePages"
        />
        <main ref="scroller" class="notebook-view__scroller" tabindex="0" :aria-label="t('notebook.pages.label')" @scroll="interaction?.onScroll">
          <div class="notebook-view__pages" :style="{ minHeight: `${viewport.totalHeight.value}px` }">
            <div v-if="topSpacer" aria-hidden="true" :style="{ height: `${topSpacer}px` }" />
            <NotebookPage
              v-for="(page, visibleIndex) in visiblePages" :key="page.id" :data-page-id="page.id" :page="page" :page-number="viewport.visibleRange.value.start + visibleIndex + 1"
              :zoom="viewport.zoom.value" :tool="tool" :ghost="page.id === ghostPage?.id" :active-points="activePageId === page.id ? input.activePoints.value : []" :active-modeled="input.isModeled.value"
              :stroke-color="currentColor" :stroke-width="currentWidth" :marker-width="markerWidth" :eraser-diameter="eraserDiameter" :line-dash="lineDash" :selected-object-ids="currentPage?.id === page.id ? doc.selectedObjectIds.value : []" :pen-active="input.isPenActive.value"
              :laser-traces="laser.traces.value.filter(trace => trace.pageId === page.id)"
              :ruler="rulerOpen && activePageId === page.id ? rulerPose : null" :input-active="input.isActive.value"
              @selection-transform="doc.transformSelection" @selection-active="selectionActive = $event" @ruler-update="rulerPose = $event" @ruler-active="rulerActive = $event"
              @pointerdown="event => interaction?.onPagePointerDown(page.id, event)" @pointermove="interaction?.onPagePointerMove" @pointerup="interaction?.onPagePointerUp" @pointercancel="interaction?.onPagePointerCancel" @lostpointercapture="interaction?.onPageLostCapture"
            />
            <div v-if="bottomSpacer" aria-hidden="true" :style="{ height: `${bottomSpacer}px` }" />
          </div>
        </main>
      </div>
      <p class="notebook-view__sr-only" aria-live="polite">{{ summaryPage ? (summaryPage.id === ghostPage?.id ? t('notebook.pages.ghost') : t('notebook.pages.accessibleSummary', { page: viewport.selectedIndex.value + 1, marks: summaryPage.objects.length, paper: t(`notebook.paper.${summaryPage.paper.kind}`) })) : '' }}</p>
    </template>
    <div v-else class="notebook-view__unsupported" role="status">
      <h2>{{ t('notebook.readOnlyTitle') }}</h2>
      <p>{{ t('notebook.readOnlyDescription') }}</p>
      <ul><li v-for="diagnostic in ('diagnostics' in format ? format.diagnostics : [])" :key="`${diagnostic.code}:${diagnostic.path}`">{{ diagnostic.code }} — {{ diagnostic.path }}</li></ul>
      <p v-if="saveError" role="alert">{{ saveError }}</p>
      <button class="notebook-view__source-export" type="button" :disabled="sourceExporting" @click="exportSource">{{ sourceExporting ? t('notebook.saveStatus.saving') : t('notebook.exportSource') }}</button>
    </div>
  </section>
</template>

<style scoped>
.notebook-view { display:flex; width:100%; height:100%; min-width:0; min-height:0; flex-direction:column; overflow:hidden; color:var(--text-primary); background:var(--surface-0); container:notebook-editor / inline-size; }
.notebook-view__title-row { display:flex; flex:none; align-items:center; min-height:40px; padding:0 14px; }
.notebook-view__title { width:min(100%,720px); height:32px; border:0; outline:0; background:transparent; color:var(--text-primary); font:600 16px/1.3 var(--font-ui); }
.notebook-view__title:focus-visible { border-radius:6px; box-shadow:0 0 0 2px var(--focus-ring); }
.notebook-view__body { position:relative; display:flex; flex:1; min-height:0; }
.notebook-view :deep(.notebook-toolbar--selection .notebook-toolbar__save) { position:static; grid-column:1 / -1; justify-self:end; }
.notebook-view :deep(.notebook-pages .nv-btn) { min-width:44px; min-height:44px; }
.notebook-view__scroller { position:relative; flex:1; min-width:0; overflow:auto; overscroll-behavior:contain; background:var(--surface-0); outline:none; touch-action:none; }
.notebook-view__scroller:focus-visible:not([data-pointer-focus]) { box-shadow:inset 0 0 0 2px var(--focus-ring); }
.notebook-view__pages { display:flex; min-width:max-content; flex-direction:column; align-items:center; }
.notebook-view--panning, .notebook-view--panning * { cursor:grabbing!important; }
.notebook-view__unsupported { max-width:640px; margin:48px auto; padding:24px; color:var(--text-primary); }
.notebook-view__source-export { min-height:44px; padding:0 14px; border:1px solid var(--border-subtle); border-radius:8px; background:var(--surface-panel); color:var(--text-primary); font:500 13px var(--font-ui); cursor:pointer; }
.notebook-view__source-export:focus-visible { outline:2px solid var(--focus-ring); outline-offset:2px; }
.notebook-view__sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@media(max-width:760px) { .notebook-view__title-row { min-height:42px; padding-inline:12px; } .notebook-view__title { font-size:16px; } }
</style>
