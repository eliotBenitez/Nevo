<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { CanvasExportScope } from '../../../core/canvas'
import type { CanvasExportFormat } from '../composables/useCanvasExport'

const props = defineProps<{
  open: boolean
  format: CanvasExportFormat
  scope: CanvasExportScope
  exporting: boolean
  errorMessage: string
}>()

defineEmits<{
  close: []
  export: []
  'update:format': [value: CanvasExportFormat]
  'update:scope': [value: CanvasExportScope]
}>()

const panel = ref<HTMLElement | null>(null)

watch(() => props.open, async (open) => {
  if (!open) return
  await nextTick()
  panel.value?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="canvas-export-overlay"
      @pointerdown.self="$emit('close')"
      @keydown.esc="$emit('close')"
    >
      <section
        ref="panel"
        class="canvas-export-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`canvas-export-title`"
        tabindex="-1"
      >
        <h2 id="canvas-export-title">{{ $t('workspace.canvas.exportTitle') }}</h2>

        <label>
          <span>{{ $t('workspace.canvas.exportScope') }}</span>
          <select
            :value="scope"
            @change="$emit('update:scope', ($event.target as HTMLSelectElement).value as CanvasExportScope)"
          >
            <option value="all">{{ $t('workspace.canvas.exportAll') }}</option>
            <option value="selection">{{ $t('workspace.canvas.exportSelection') }}</option>
            <option value="viewport">{{ $t('workspace.canvas.exportViewport') }}</option>
          </select>
        </label>

        <label>
          <span>{{ $t('workspace.canvas.exportFormat') }}</span>
          <select
            :value="format"
            @change="$emit('update:format', ($event.target as HTMLSelectElement).value as CanvasExportFormat)"
          >
            <option value="png">PNG</option>
            <option value="svg">SVG</option>
          </select>
        </label>

        <p v-if="errorMessage" class="canvas-export-dialog__error" role="alert">
          {{ errorMessage === 'selectionEmpty'
            ? $t('workspace.canvas.exportSelectionEmpty')
            : $t('workspace.canvas.exportFailed') }}
        </p>

        <footer>
          <button type="button" class="canvas-export-dialog__secondary" @click="$emit('close')">
            {{ $t('workspace.canvas.cancel') }}
          </button>
          <button type="button" class="canvas-export-dialog__primary" :disabled="exporting" @click="$emit('export')">
            {{ exporting ? $t('workspace.canvas.exporting') : $t('workspace.canvas.exportAction') }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.canvas-export-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, #020617 48%, transparent);
}

.canvas-export-dialog {
  width: min(400px, 100%);
  padding: 22px;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  color: var(--text-primary);
  background: var(--glass-3);
  box-shadow: var(--shadow-pop);
}

.canvas-export-dialog:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

h2 {
  margin: 0 0 20px;
  font-size: 18px;
}

label {
  display: grid;
  gap: 7px;
  margin-top: 14px;
  color: var(--text-secondary);
  font-size: 13px;
}

select {
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  color: var(--text-primary);
  background: var(--canvas-1);
}

select:focus-visible,
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.canvas-export-dialog__error {
  margin: 14px 0 0;
  color: var(--danger);
  font-size: 13px;
}

footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

button {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-weight: 600;
}

.canvas-export-dialog__secondary {
  border-color: var(--border-subtle);
  color: var(--text-primary);
  background: transparent;
}

.canvas-export-dialog__primary {
  color: var(--text-inv);
  background: var(--accent);
}

button:disabled {
  cursor: wait;
  opacity: 0.65;
}
</style>
