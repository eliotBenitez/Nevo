<script setup lang="ts">
import type {
  CanvasAlignment,
  CanvasBounds,
  CanvasCamera,
  CanvasConnector,
  CanvasDistribution,
  CanvasElement,
  CanvasElementStyle,
  CanvasSnapshotV1,
} from '../../../core/canvas'
import type { CanvasTool } from '../composables/useCanvasToolState'
import CanvasMinimap from './CanvasMinimap.vue'
import CanvasPropertiesPanel from './CanvasPropertiesPanel.vue'
import CanvasToolbar from './CanvasToolbar.vue'

defineProps<{
  zoom: number
  activeTool: CanvasTool
  toolbarLabels: Record<string, string>
  propertyLabels: Record<string, string>
  selectionCount: number
  selectedElement: CanvasElement | null
  selectedConnector: CanvasConnector | null
  selectionLocked: boolean
  snapshot: CanvasSnapshotV1
  effectiveFrame: CanvasBounds
  camera: CanvasCamera
  viewportWidth: number
  viewportHeight: number
  canPresent: boolean
}>()

defineEmits<{
  tool: [tool: CanvasTool]
  'zoom-in': []
  'zoom-out': []
  fit: []
  undo: []
  redo: []
  fullscreen: []
  present: []
  export: []
  style: [patch: CanvasElementStyle]
  connector: [patch: Partial<CanvasConnector>]
  rotation: [value: number]
  alt: [value: string]
  lock: [locked: boolean]
  group: [grouped: boolean]
  arrange: [direction: 'front' | 'back' | 'forward' | 'backward']
  align: [alignment: CanvasAlignment]
  distribute: [direction: CanvasDistribution]
  duplicate: []
  element: [patch: Record<string, unknown>]
  'mindmap-child': []
  'mindmap-layout': []
  'open-note-link': []
}>()
</script>

<template>
  <CanvasToolbar
    :zoom="zoom"
    :active-tool="activeTool"
    :labels="toolbarLabels"
    :can-present="canPresent"
    @tool="$emit('tool', $event)"
    @zoom-in="$emit('zoom-in')"
    @zoom-out="$emit('zoom-out')"
    @fit="$emit('fit')"
    @undo="$emit('undo')"
    @redo="$emit('redo')"
    @fullscreen="$emit('fullscreen')"
    @present="$emit('present')"
    @export="$emit('export')"
  />
  <CanvasPropertiesPanel
    :selection-count="selectionCount"
    :element="selectedElement"
    :connector="selectedConnector"
    :selection-locked="selectionLocked"
    :labels="propertyLabels"
    @style="$emit('style', $event)"
    @connector="$emit('connector', $event)"
    @rotation="$emit('rotation', $event)"
    @alt="$emit('alt', $event)"
    @lock="$emit('lock', $event)"
    @group="$emit('group', $event)"
    @arrange="$emit('arrange', $event)"
    @align="$emit('align', $event)"
    @distribute="$emit('distribute', $event)"
    @duplicate="$emit('duplicate')"
    @element="$emit('element', $event)"
    @mindmap-child="$emit('mindmap-child')"
    @mindmap-layout="$emit('mindmap-layout')"
    @open-note-link="$emit('open-note-link')"
  />
  <CanvasMinimap
    :snapshot="snapshot"
    :effective-frame="effectiveFrame"
    :camera="camera"
    :viewport-width="viewportWidth"
    :viewport-height="viewportHeight"
  />
</template>
