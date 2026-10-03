<script setup lang="ts">
import type { CanvasExportScope } from '../../../core/canvas'
import type { CanvasExportFormat } from '../composables/useCanvasExport'
import NvModal from '../../../ui/primitives/NvModal.vue'

defineProps<{
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
</script>

<template>
  <NvModal :open="open" size="md" :title="$t('workspace.canvas.exportTitle')" @close="$emit('close')">
    <label class="tw:grid tw:gap-[7px] tw:text-[13px] tw:text-content-secondary">
      <span>{{ $t('workspace.canvas.exportScope') }}</span>
      <select
        class="tw:min-h-[42px] tw:rounded-[10px] tw:border tw:border-solid tw:border-(--border-subtle) tw:bg-surface-canvas tw:px-3 tw:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent"
        :value="scope"
        @change="$emit('update:scope', ($event.target as HTMLSelectElement).value as CanvasExportScope)"
      >
        <option value="all">{{ $t('workspace.canvas.exportAll') }}</option>
        <option value="selection">{{ $t('workspace.canvas.exportSelection') }}</option>
        <option value="viewport">{{ $t('workspace.canvas.exportViewport') }}</option>
      </select>
    </label>

    <label class="tw:mt-3.5 tw:grid tw:gap-[7px] tw:text-[13px] tw:text-content-secondary">
      <span>{{ $t('workspace.canvas.exportFormat') }}</span>
      <select
        class="tw:min-h-[42px] tw:rounded-[10px] tw:border tw:border-solid tw:border-(--border-subtle) tw:bg-surface-canvas tw:px-3 tw:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent"
        :value="format"
        @change="$emit('update:format', ($event.target as HTMLSelectElement).value as CanvasExportFormat)"
      >
        <option value="png">PNG</option>
        <option value="svg">SVG</option>
      </select>
    </label>

    <p v-if="errorMessage" class="canvas-export-dialog__error tw:mt-3.5 tw:mb-0 tw:text-[13px] tw:text-danger" role="alert">
      {{ errorMessage === 'selectionEmpty'
        ? $t('workspace.canvas.exportSelectionEmpty')
        : $t('workspace.canvas.exportFailed') }}
    </p>

    <template #footer>
      <button type="button" class="canvas-export-dialog__secondary tw:min-h-10 tw:rounded-[10px] tw:border tw:border-solid tw:border-(--border-subtle) tw:bg-transparent tw:px-4 tw:font-semibold tw:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent" @click="$emit('close')">
        {{ $t('workspace.canvas.cancel') }}
      </button>
      <button type="button" class="canvas-export-dialog__primary tw:min-h-10 tw:rounded-[10px] tw:border tw:border-solid tw:border-transparent tw:bg-accent tw:px-4 tw:font-semibold tw:text-surface-canvas tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:cursor-wait tw:disabled:opacity-65" :disabled="exporting" @click="$emit('export')">
        {{ exporting ? $t('workspace.canvas.exporting') : $t('workspace.canvas.exportAction') }}
      </button>
    </template>
  </NvModal>
</template>
