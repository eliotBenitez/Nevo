<script setup lang="ts">
import { computed, defineAsyncComponent, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { decodeNoteFormat } from '../../core/notebook'
import { exportNotebookSource } from '../../tauri/notebook'
import type { NoteFormatResult, NotebookSnapshotV1 } from '../../core/notebook'
import type { NoteDocument } from '../../types/note'
import type { SaveStatus } from '../../stores/note'
import type { CanvasSnapshotV1 } from '../../core/canvas'
import type { NoteViewMode } from '../../features/canvas/canvasPreferences'
import type { PluginManifest, WorkspaceSettings } from '../../types/workspace'
import type { NevoSandboxUiContributionSnapshot } from '../../types/editor-plugin'
import type { TreeNode } from '../../types/note'
import type { WorkspaceBlockNavigationTarget } from '../../types/search'

const WorkspaceEditorPane = defineAsyncComponent(() => import('./WorkspaceEditorPane.vue'))
const NotebookView = defineAsyncComponent(() => import('../../features/notebook/NotebookView.vue'))

interface Props {
  note: NoteDocument | null
  noteId?: string | null
  loadError?: boolean
  formatResult?: NoteFormatResult | null
  workspacePath: string | null
  workspaceName?: string
  pluginManifests: PluginManifest[]
  settings: WorkspaceSettings
  saveStatus: SaveStatus
  containerTitle: string | null
  containerKind: 'root' | 'folder' | null
  containerItems: TreeNode[]
  pendingBlockTarget?: WorkspaceBlockNavigationTarget | null
  pendingDrawUpdate?: { drawId: string; svgPreview: string; src: string; title?: string } | null
  workspaceId?: string
  viewMode?: NoteViewMode
}

const props = withDefaults(defineProps<Props>(), {
  workspaceName: '',
  noteId: null,
  loadError: false,
  formatResult: null,
  pendingBlockTarget: undefined,
  pendingDrawUpdate: undefined,
  workspaceId: '',
  viewMode: 'document',
})
const emit = defineEmits<{
  'update:title': [value: string]
  'update:icon': [value: string]
  'update:cover': [value: string | null]
  'update:content': [value: NoteDocument['content']]
  'content-dirty': []
  'create-note': []
  'consumed-pending-target': []
  'consumed-draw-update': []
  'open-note': [noteId: string, anchor?: string | null]
  'open-folder': [folderId: string]
  'request-export': [format: 'markdown' | 'html' | 'docx' | 'typst' | 'pdf']
  'request-import-md': []
  'open-draw': [noteId: string, drawId: string]
  'plugin-contributions': [snapshot: NevoSandboxUiContributionSnapshot]
  'change-view': [mode: NoteViewMode]
  'update:canvas': [snapshot: CanvasSnapshotV1]
  'update:notebook': [snapshot: NotebookSnapshotV1]
}>()

const { t } = useI18n()
const editorRef = ref<{
  editorRoot?: HTMLDivElement | null
  flushPendingContent?: () => void
  updateDrawBlock?: (payload: { drawId: string; svgPreview: string; src: string; title?: string }) => void
  dispatchPluginUiEvent?: (pluginId: string, contributionId: string, event: { type: string; payload: unknown }) => Promise<unknown>
  openFindInNote?: (withReplace?: boolean) => boolean
} | null>(null)
const notebookRef = ref<{
  editorRootEl?: HTMLElement | null
  flushSave?: () => Promise<void>
  suspend?: () => void
} | null>(null)
const diagnosticRoot = ref<HTMLElement | null>(null)
const sourceExporting = ref(false)
const sourceExportError = ref<string | null>(null)
const resolvedFormat = shallowRef<NoteFormatResult | null>(null)

watch(() => [props.note, props.formatResult] as const, ([note, suppliedFormat]) => {
  resolvedFormat.value = note ? suppliedFormat ?? decodeNoteFormat(note) : null
}, { immediate: true })

const renderer = computed(() => {
  if (!props.note && props.loadError) return 'load-error'
  if (!props.note) return 'empty'
  if (resolvedFormat.value?.status === 'document') return 'document'
  if (resolvedFormat.value?.status === 'notebook') return 'notebook'
  return 'readonly'
})
const editorRoot = computed(() =>
  renderer.value === 'notebook'
    ? notebookRef.value?.editorRootEl ?? null
    : renderer.value === 'readonly'
      ? diagnosticRoot.value
      : editorRef.value?.editorRoot ?? null,
)

function flushPendingContent(): void | Promise<void> {
  if (renderer.value === 'notebook') return notebookRef.value?.flushSave?.()
  return editorRef.value?.flushPendingContent?.()
}

function updateDrawBlock(payload: { drawId: string; svgPreview: string; src: string; title?: string }): void {
  editorRef.value?.updateDrawBlock?.(payload)
}

function dispatchPluginUiEvent(pluginId: string, contributionId: string, event: { type: string; payload: unknown }): Promise<unknown> {
  return editorRef.value?.dispatchPluginUiEvent?.(pluginId, contributionId, event) ?? Promise.resolve(undefined)
}

function openFindInNote(withReplace = false): boolean {
  return editorRef.value?.openFindInNote?.(withReplace) ?? false
}

function forwardOpenNote(noteId: string, anchor?: string | null): void {
  emit('open-note', noteId, anchor)
}

function forwardOpenDraw(noteId: string, drawId: string): void {
  emit('open-draw', noteId, drawId)
}

async function exportRawSource(): Promise<void> {
  const noteId = props.note?.id ?? props.noteId
  if (!noteId || !props.workspacePath || sourceExporting.value) return
  sourceExporting.value = true
  sourceExportError.value = null
  try {
    await exportNotebookSource({ workspacePath: props.workspacePath, noteId })
  } catch {
    sourceExportError.value = t('app.notebook.exportJsonError')
  } finally {
    sourceExporting.value = false
  }
}

defineExpose({ editorRoot, flushPendingContent, updateDrawBlock, dispatchPluginUiEvent, openFindInNote })
</script>

<template>
  <section v-if="renderer === 'load-error'" class="workspace-note-host__readonly" role="alert">
    <h2>{{ t('app.notebook.loadErrorTitle') }}</h2>
    <p>{{ t('app.notebook.loadErrorDescription') }}</p>
    <button type="button" class="nv-btn" :disabled="sourceExporting" @click="exportRawSource">
      {{ t(sourceExporting ? 'app.notebook.exportingJson' : 'app.notebook.exportJson') }}
    </button>
    <p v-if="sourceExportError" role="alert">{{ sourceExportError }}</p>
  </section>
  <WorkspaceEditorPane
    v-else-if="renderer === 'document' || renderer === 'empty'"
    ref="editorRef"
    :note="note"
    :workspace-path="workspacePath"
    :workspace-name="workspaceName"
    :plugin-manifests="pluginManifests"
    :settings="settings"
    :save-status="saveStatus"
    :container-title="containerTitle"
    :container-kind="containerKind"
    :container-items="containerItems"
    :pending-block-target="pendingBlockTarget"
    :pending-draw-update="pendingDrawUpdate"
    :workspace-id="workspaceId"
    :view-mode="viewMode"
    @update:title="emit('update:title', $event)"
    @update:icon="emit('update:icon', $event)"
    @update:cover="emit('update:cover', $event)"
    @update:content="emit('update:content', $event)"
    @update:canvas="emit('update:canvas', $event)"
    @change-view="emit('change-view', $event)"
    @content-dirty="emit('content-dirty')"
    @create-note="emit('create-note')"
    @consumed-pending-target="emit('consumed-pending-target')"
    @consumed-draw-update="emit('consumed-draw-update')"
    @open-note="forwardOpenNote"
    @open-folder="emit('open-folder', $event)"
    @request-export="emit('request-export', $event)"
    @request-import-md="emit('request-import-md')"
    @open-draw="forwardOpenDraw"
    @plugin-contributions="emit('plugin-contributions', $event)"
  />
  <NotebookView
    v-else-if="renderer === 'notebook' && note"
    ref="notebookRef"
    :note="note"
    :workspace-path="workspacePath ?? ''"
    :save-status="saveStatus"
    @update:notebook="emit('update:notebook', $event)"
    @update:title="emit('update:title', $event)"
  />
  <section v-else ref="diagnosticRoot" class="workspace-note-host__readonly" role="status" tabindex="-1">
    <h2>{{ t('app.notebook.readOnlyTitle') }}</h2>
    <p>{{ t('app.notebook.readOnlyDescription') }}</p>
    <ul>
      <li v-for="diagnostic in (resolvedFormat?.status === 'document' || resolvedFormat?.status === 'notebook' ? [] : resolvedFormat?.diagnostics ?? [])" :key="`${diagnostic.code}:${diagnostic.path}`">
        {{ diagnostic.code }} — {{ diagnostic.path }}
      </li>
    </ul>
    <button type="button" class="nv-btn" :disabled="sourceExporting" @click="exportRawSource">
      {{ t(sourceExporting ? 'app.notebook.exportingJson' : 'app.notebook.exportJson') }}
    </button>
    <p v-if="sourceExportError" role="alert">{{ sourceExportError }}</p>
  </section>
</template>

<style scoped>
.workspace-note-host__empty { width:100%; height:100%; min-width:0; min-height:0; }
.workspace-note-host__readonly { max-width:680px; margin:48px auto; padding:24px; color:var(--text-primary); }
.workspace-note-host__readonly h2 { margin:0 0 12px; font-size:18px; font-weight:600; }
.workspace-note-host__readonly p { color:var(--text-secondary); }
.workspace-note-host__readonly ul { max-height:240px; overflow:auto; color:var(--text-secondary); font:12px/1.5 var(--font-mono); }
</style>
