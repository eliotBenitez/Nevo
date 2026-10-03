<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type {
  CanvasBounds,
  CanvasCamera,
  CanvasConnector,
  CanvasRichTextDocument,
} from '../../../core/canvas'
import CanvasAlignmentGuides from './CanvasAlignmentGuides.vue'
import CanvasConnectorHandles from './CanvasConnectorHandles.vue'
import CanvasInlineTextEditor from './CanvasInlineTextEditor.vue'
import CanvasRichTextEditor from './CanvasRichTextEditor.vue'
import CanvasSelectionChrome from './CanvasSelectionChrome.vue'

defineProps<{
  presenting: boolean
  selectedItem: {
    id: string
    kind: 'frame' | 'element' | 'elements'
    bounds: CanvasBounds
    locked?: boolean
  } | null
  selectionChromeStyle: CSSProperties
  selectedConnector: CanvasConnector | null
  camera: CanvasCamera
  guides: readonly { axis: 'x' | 'y'; value: number }[]
  marquee: CanvasBounds | null
  marqueeStyle: CSSProperties
  editingTextId: string | null
  editingText: string
  editingTextStyle: CSSProperties
  editingRichId: string | null
  editingRichContent: CanvasRichTextDocument
  editingRichStyle: Record<string, string>
  labels: {
    rotate: string
    connectorFrom: string
    connectorTo: string
    editText: string
    editRichText: string
  }
}>()

defineEmits<{
  resize: [event: PointerEvent]
  rotate: [event: PointerEvent]
  endpoint: [endpoint: 'from' | 'to', event: PointerEvent]
  'commit-text': [text: string]
  'cancel-text': []
  'commit-rich': [content: CanvasRichTextDocument]
  'cancel-rich': []
}>()
</script>

<template>
  <template v-if="!presenting">
    <CanvasSelectionChrome
      v-if="selectedItem && selectedItem.kind !== 'frame'"
      :chrome-style="selectionChromeStyle"
      :locked="selectedItem.locked"
      :resizable="selectedItem.kind === 'element'"
      :rotatable="selectedItem.kind === 'element'"
      :rotate-label="labels.rotate"
      @resize="$emit('resize', $event)"
      @rotate="$emit('rotate', $event)"
    />
    <CanvasConnectorHandles
      v-if="selectedConnector"
      :connector="selectedConnector"
      :camera="camera"
      :from-label="labels.connectorFrom"
      :to-label="labels.connectorTo"
      @endpoint="(endpoint, event) => $emit('endpoint', endpoint, event)"
    />
    <CanvasAlignmentGuides :guides="guides" :camera="camera" />
    <div
      v-if="marquee"
      class="edgeless-canvas__marquee tw:absolute tw:z-22 tw:pointer-events-none tw:border tw:border-solid tw:border-accent tw:bg-(--accent-soft)"
      :style="marqueeStyle"
      aria-hidden="true"
    />
  </template>
  <CanvasInlineTextEditor
    v-if="editingTextId"
    :text="editingText"
    :style="editingTextStyle"
    :label="labels.editText"
    @commit="$emit('commit-text', $event)"
    @cancel="$emit('cancel-text')"
  />
  <CanvasRichTextEditor
    v-if="editingRichId"
    :content="editingRichContent"
    :style="editingRichStyle"
    :label="labels.editRichText"
    @commit="$emit('commit-rich', $event)"
    @cancel="$emit('cancel-rich')"
  />
</template>
