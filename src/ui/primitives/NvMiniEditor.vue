<script setup lang="ts">
import { computed } from 'vue'
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
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Write something...',
  workspacePath: null,
  pluginManifests: () => [],
  settings: () => createDefaultWorkspaceSettings(),
})

const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

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
  if (!value || typeof value !== 'object') return EMPTY_DOC
  const node = value as JsonNode
  if (node.type !== 'doc') return EMPTY_DOC
  return migrateLegacyMarks(node)
})
</script>

<template>
  <div class="nme-root">
    <EditorSurface
      :content="editorContent"
      variant="compact"
      document-id="nv-mini-editor"
      :placeholder="placeholder"
      :workspace-path="workspacePath"
      :plugin-manifests="pluginManifests"
      :settings="settings"
      @update:content="value => emit('update:modelValue', value)"
    />
  </div>
</template>

<style scoped>
.nme-root {
  position: relative;
  border: 1px solid var(--line-2, var(--border-subtle));
  border-radius: calc(10px * var(--radius-scale, 1));
  background: var(--glass-3, var(--surface-1));
  transition: border-color 0.12s;
  padding: 10px 12px;
}

.nme-root:focus-within {
  border-color: var(--accent);
}
</style>
