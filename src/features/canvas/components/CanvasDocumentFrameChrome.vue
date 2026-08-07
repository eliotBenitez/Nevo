<script setup lang="ts">
import { computed } from 'vue'
import type { CanvasBounds, CanvasCamera } from '../../../core/canvas'
import CanvasCollapsedFrameCard from './CanvasCollapsedFrameCard.vue'

const props = defineProps<{
  frame: CanvasBounds
  camera: CanvasCamera
  selected: boolean
  editing: boolean
  label: string
  collapsed: boolean
  title: string
  collapsedHint: string
  toggleLabel: string
}>()

const emit = defineEmits<{
  'header-pointerdown': [event: PointerEvent]
  'resize-pointerdown': [event: PointerEvent]
  'enter-edit': []
  'toggle-collapsed': []
}>()

const frameStyle = computed(() => ({
  left: `${(props.frame.x - props.camera.x) * props.camera.zoom}px`,
  top: `${(props.frame.y - props.camera.y) * props.camera.zoom}px`,
  width: `${props.frame.width * props.camera.zoom}px`,
  height: `${props.frame.height * props.camera.zoom}px`,
}))

// Entering edit mode on a collapsed frame would focus a `display: none`
// editor (see canvas.css), so the header's activation gestures toggle
// collapse instead of entering edit while collapsed.
function onHeaderActivate() {
  if (props.collapsed) emit('toggle-collapsed')
  else emit('enter-edit')
}
</script>

<template>
  <div
    class="edgeless-canvas__frame-chrome"
    :class="{ 'edgeless-canvas__frame-chrome--selected': selected }"
    :style="frameStyle"
  >
    <!-- Two sibling buttons rather than a toggle nested in the header: a
         button may not contain another focusable control, and the chrome sits
         inside the canvas viewport, whose own `dblclick` handler would toggle
         a second time — hence `.stop` on every activation gesture here. -->
    <div class="edgeless-canvas__frame-header-row">
      <button
        type="button"
        class="edgeless-canvas__frame-header"
        :aria-label="label"
        @pointerdown="$emit('header-pointerdown', $event)"
        @dblclick.stop="onHeaderActivate"
        @keydown.enter.prevent="onHeaderActivate"
        @keydown.space.prevent="onHeaderActivate"
      >
        {{ label }}
      </button>
      <button
        type="button"
        class="edgeless-canvas__frame-toggle"
        :aria-label="toggleLabel"
        :aria-expanded="!collapsed"
        @pointerdown.stop
        @dblclick.stop
        @click.stop="$emit('toggle-collapsed')"
      >
        <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M3 4.5 L6 7.5 L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
    <!-- Collapsed, the mini card *is* the note, so it selects and drags like
         the header does; expanded, that role belongs to the ProseMirror card. -->
    <CanvasCollapsedFrameCard
      v-if="collapsed"
      :title="title"
      :hint="collapsedHint"
      @pointerdown="$emit('header-pointerdown', $event)"
      @dblclick.stop="$emit('toggle-collapsed')"
    />
    <div v-if="selected" class="edgeless-canvas__frame-outline" aria-hidden="true" />
    <span
      v-if="selected && !editing && !collapsed"
      class="edgeless-canvas__frame-resize-handle"
      role="presentation"
      @pointerdown.stop="$emit('resize-pointerdown', $event)"
    />
  </div>
</template>
