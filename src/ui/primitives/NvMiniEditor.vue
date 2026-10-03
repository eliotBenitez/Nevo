<script setup lang="ts">
import { computed, toRaw } from 'vue'
import EditorSurface from '../../app/components/editor/EditorSurface.vue'
import { createDefaultWorkspaceSettings } from '../../utils/workspace-settings'
import type { BlockNode } from '../../types/note'
import type { PluginManifest, WorkspaceSettings } from '../../types/workspace'

interface Props {
  modelValue: unknown
  placeholder?: string
  workspacePath?: string | null
  pluginManifests?: PluginManifest[]
  settings?: WorkspaceSettings
  showBlockHandle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Write something...',
  workspacePath: null,
  pluginManifests: () => [],
  settings: () => createDefaultWorkspaceSettings(),
  showBlockHandle: true,
})

const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

// Reference identity must survive the editor→parent→prop round-trip so that
// EditorSurface can short-circuit its content watcher instead of rebuilding the
// editor (which would reset the cursor to the document start). We migrate legacy
// marks only for genuinely external values, and pass our own emitted value back
// through unchanged.
let lastEmittedValue: unknown

function onEditorUpdate(value: unknown) {
  lastEmittedValue = value
  emit('update:modelValue', value)
}

const LEGACY_MARK_RENAMES: Record<string, string> = { bold: 'strong', italic: 'em' }
const EMPTY_DOC: BlockNode = { type: 'doc', content: [] }

interface JsonNode {
  type?: string
  attrs?: Record<string, unknown>
  text?: string
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> } | string>
  content?: JsonNode[]
}

function migrateLegacyMarks(node: JsonNode): BlockNode {
  const next: BlockNode = {
    type: typeof node.type === 'string' ? node.type : 'paragraph',
    ...(node.attrs ? { attrs: node.attrs } : {}),
    ...(typeof node.text === 'string' ? { text: node.text } : {}),
  }
  if (Array.isArray(node.marks)) {
    next.marks = node.marks.map((mark) => {
      if (typeof mark === 'string') return { type: LEGACY_MARK_RENAMES[mark] ?? mark }
      const type = mark.type
      return type && LEGACY_MARK_RENAMES[type] ? { ...mark, type: LEGACY_MARK_RENAMES[type] } : mark
    }).filter((mark): mark is { type: string; attrs?: Record<string, unknown> } => typeof mark.type === 'string')
  }
  if (Array.isArray(node.content)) {
    next.content = node.content.map(migrateLegacyMarks)
  }
  return next
}

const editorContent = computed<BlockNode>(() => {
  const value = props.modelValue
  // The parent stores our emitted value in a deep `ref`, so it returns as a
  // reactive proxy. Compare/return the raw object to keep reference identity
  // that EditorSurface relies on to avoid rebuilding (and resetting the cursor).
  const raw = value && typeof value === 'object' ? toRaw(value) : value
  if (raw === lastEmittedValue) return lastEmittedValue as BlockNode
  if (!value || typeof value !== 'object') return EMPTY_DOC
  const node = value as JsonNode
  if (node.type !== 'doc') return EMPTY_DOC
  return migrateLegacyMarks(node)
})
</script>

<template>
  <div class="nme-root tw:relative tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-[color:var(--border-default,var(--border-subtle))] tw:bg-[color:var(--surface-overlay,var(--surface-raised))] tw:py-[10px] tw:px-3 tw:transition-[border-color] tw:duration-[120ms] tw:focus-within:border-accent">
    <EditorSurface
      :content="editorContent"
      variant="compact"
      document-id="nv-mini-editor"
      :placeholder="placeholder"
      :workspace-path="workspacePath"
      :plugin-manifests="pluginManifests"
      :settings="settings"
      :show-block-handle="showBlockHandle"
      @update:content="onEditorUpdate"
    />
  </div>
</template>
