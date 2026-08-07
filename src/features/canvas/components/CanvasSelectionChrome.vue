<script setup lang="ts">
import { LockKeyhole, RotateCw } from 'lucide-vue-next'
import type { CSSProperties } from 'vue'

defineProps<{
  chromeStyle: CSSProperties
  locked?: boolean
  resizable?: boolean
  rotatable?: boolean
  rotateLabel: string
}>()

defineEmits<{
  resize: [event: PointerEvent]
  rotate: [event: PointerEvent]
}>()
</script>

<template>
  <div class="edgeless-canvas__selection" :class="{ 'is-locked': locked }" :style="chromeStyle">
    <LockKeyhole v-if="locked" class="canvas-selection__lock" :size="14" aria-hidden="true" />
    <button
      v-if="rotatable && !locked"
      type="button"
      class="canvas-selection__rotate"
      :aria-label="rotateLabel"
      :title="rotateLabel"
      @pointerdown.stop="$emit('rotate', $event)"
    >
      <RotateCw :size="13" />
    </button>
    <span
      v-if="resizable && !locked"
      class="edgeless-canvas__resize-handle"
      @pointerdown="$emit('resize', $event)"
    />
  </div>
</template>

<style scoped>
.canvas-selection__rotate {
  position: absolute;
  top: -32px;
  left: 50%;
  /* `.edgeless-canvas__selection` is `pointer-events: none` so the chrome never
   * blocks clicks on what it outlines; the handles inside it have to opt back
   * in, exactly as `.edgeless-canvas__resize-handle` does. */
  pointer-events: auto;
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--accent);
  border-radius: 50%;
  color: var(--accent);
  background: var(--canvas-1);
  transform: translateX(-50%);
  cursor: grab;
}

.canvas-selection__lock {
  position: absolute;
  top: -8px;
  right: -8px;
  padding: 3px;
  border-radius: 50%;
  color: var(--text-secondary);
  background: var(--canvas-1);
}

.is-locked {
  border-style: dashed;
}
</style>
