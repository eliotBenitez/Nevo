<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../stores/workspace'
import { useNoteStore } from '../../stores/note'
import { useDrawEditor } from './useDrawEditor'
import DrawToolbar from './DrawToolbar.vue'
import {
  parseDrawData,
  renderStrokesToSvgInner,
  type DrawData,
} from '../../utils/draw/drawEngine'

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
const noteStore = useNoteStore()

// --- Resolve the draw_block's current `src` so we can load its payload. ---
// Read from the full NoteDocument (noteStore has content; treeStore only has
// NoteMeta without content).
const drawSrc = ref<string>('')

function findDrawSrcInNode(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }
  if (n.type === 'draw_block' && n.attrs?.drawId === props.drawId) {
    return typeof n.attrs.src === 'string' ? n.attrs.src : ''
  }
  if (Array.isArray(n.content)) {
    for (const child of n.content) {
      const found = findDrawSrcInNode(child)
      if (found) return found
    }
  }
  return ''
}

function findDrawSrcInContent(): string {
  const note = noteStore.activeNote
  if (!note || note.id !== props.noteId) return ''
  // Walk the whole document tree — a draw_block may be nested (columns,
  // toggles, callouts), not just a top-level block.
  return findDrawSrcInNode(note.content)
}

const loading = ref(true)
const initialBytes = shallowRef<number[] | null>(null)
const errorMessage = ref<string>('')

const editor = useDrawEditor({
  drawId: props.drawId,
  initialBytes: null,
  async onSave(bytes: number[]) {
    const backend = workspaceStore.backend
    if (!backend) throw new Error('Workspace backend not available')
    return backend.saveDrawAsset(props.drawId, bytes)
  },
  onPersisted(payload) {
    errorMessage.value = ''
    emit('update-draw', payload)
  },
  onSaveError(error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    console.error('[DrawView] Failed to save drawing', error)
  },
})

const canvasEl = shallowRef<SVGSVGElement | null>(null)
const overlayEl = shallowRef<SVGSVGElement | null>(null)
const overlaySvgInner = ref<string>('')

// Keep the composable's overlay reference in sync with the template ref.
watch(overlayEl, (el) => { editor.setOverlay(el) })

async function refreshCommittedSvg() {
  if (!canvasEl.value) return
  const data: DrawData = { version: 1, strokes: editor.strokes.value, bgColor: editor.bgColor.value }
  const inner = await renderStrokesToSvgInner(data.strokes)
  canvasEl.value.innerHTML = inner
}

async function refreshActiveStrokeSvg() {
  const stroke = editor.activeStroke.value
  if (!stroke) {
    overlaySvgInner.value = ''
    return
  }
  overlaySvgInner.value = await renderStrokesToSvgInner([stroke])
}

// Re-render committed strokes whenever they change (but not during an active
// drag — the overlay handles that).
watch(
  () => editor.strokes.value.length,
  () => { void refreshCommittedSvg(); editor.scheduleSave() },
)
watch(editor.activeStroke, () => { void refreshActiveStrokeSvg() })

// --- Pointer handlers (bound on the overlay <svg>) -----------------------
function onPointerDown(event: PointerEvent) {
  editor.beginStroke(event)
}
function onPointerMove(event: PointerEvent) {
  editor.moveStroke(event)
}
function onPointerUp(event: PointerEvent) {
  editor.endStroke(event)
}

// --- Load the existing payload on mount ----------------------------------
async function loadPayload() {
  loading.value = true
  try {
    drawSrc.value = findDrawSrcInContent()
    const backend = workspaceStore.backend
    if (drawSrc.value && backend) {
      const bytes = await backend.readDrawAsset(drawSrc.value)
      initialBytes.value = bytes
      // Reload the editor state with the fetched bytes.
      const data = parseDrawData(new TextDecoder().decode(new Uint8Array(bytes)))
      editor.strokes.value = data.strokes
      editor.bgColor.value = data.bgColor
    }
  } catch (error) {
    console.error('[DrawView] Failed to load drawing payload', error)
  } finally {
    loading.value = false
    await refreshCommittedSvg()
  }
}

const viewBox = computed(() => {
  // Use a generous fixed canvas; strokes are in local coords relative to the
  // overlay rect. We'll recompute bounds on save for the preview snapshot.
  return '0 0 1600 1000'
})

const bgStyle = computed(() => ({
  // The drawing canvas is always light (like a sheet of paper) regardless of
  // the app theme — the default ink colour is dark and only reads on a light
  // surface. An explicit non-transparent bgColor (set by the user) wins.
  backgroundColor: editor.bgColor.value && editor.bgColor.value !== 'transparent'
    ? editor.bgColor.value
    : '#ffffff',
}))

onMounted(() => { void loadPayload() })

onBeforeUnmount(() => {
  // Best-effort flush if the view is torn down by something other than back().
  void editor.flushSave()
})

async function back() {
  // Await the flush so the drawing's asset src/preview is patched into the
  // note BEFORE we navigate and the editor pane remounts — otherwise the
  // remounted editor reads stale (empty) content and the drawing is lost.
  await editor.flushSave()
  emit('back')
}

// Keyboard: undo/redo, esc to go back.
function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey
  if (mod && event.key === 'z' && !event.shiftKey) { event.preventDefault(); editor.undo() }
  else if (mod && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) { event.preventDefault(); editor.redo() }
  else if (event.key === 'Escape') { void back() }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
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

    <DrawToolbar
      :tool="editor.tool.value"
      :color="editor.color.value"
      :size="editor.size.value"
      :palette="editor.palette"
      :can-undo="editor.canUndo.value"
      :can-redo="editor.canRedo.value"
      @update:tool="editor.tool.value = $event"
      @update:color="editor.color.value = $event"
      @update:size="editor.size.value = $event"
      @undo="editor.undo"
      @redo="editor.redo"
      @clear="editor.clear"
    />

    <div class="draw-view__canvas-wrap" :style="bgStyle">
      <div v-if="loading" class="draw-view__loading">{{ $t('common.loading') }}</div>
      <!-- Committed strokes -->
      <svg
        ref="canvasEl"
        class="draw-canvas"
        :view-box.camel="viewBox"
        preserveAspectRatio="xMidYMid meet"
      />
      <!-- Live in-progress stroke overlay (also captures pointer events) -->
      <svg
        ref="overlayEl"
        class="draw-canvas draw-canvas--overlay"
        :view-box.camel="viewBox"
        preserveAspectRatio="xMidYMid meet"
        :style="{ cursor: editor.tool.value === 'eraser' ? 'cell' : 'crosshair' }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
        v-html="overlaySvgInner"
      />
    </div>
  </div>
</template>
