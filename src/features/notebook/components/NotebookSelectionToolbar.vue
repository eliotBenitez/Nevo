<script setup lang="ts">
import { Copy, FlipHorizontal2, FlipVertical2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NotebookAlignMenu from './NotebookAlignMenu.vue'
import NotebookColorControl from './NotebookColorControl.vue'
import type { NotebookAlignMode, NotebookDistributeAxis } from '../../../core/notebook/alignment'
import type { NotebookFlipAxis, NotebookSelectionTransform } from '../../../core/notebook/selectionTransform'

defineProps<{ count: number; unitCount: number; color: string; disabled: boolean; colorDisabled?: boolean; presets?: readonly string[]; recents?: readonly string[] }>()
const emit = defineEmits<{ copy: []; clear: []; color: [color: string]; transform: [transform: NotebookSelectionTransform]; flip: [axis: NotebookFlipAxis]; align: [mode: NotebookAlignMode]; distribute: [axis: NotebookDistributeAxis]; addPreset: [color: string]; removePreset: [color: string] }>()
const { t } = useI18n()
function transform(event: Event, mode: 'scale' | 'angle'): void {
  const input = event.target as HTMLInputElement, value = Number(input.value)
  if (input.value && input.validity.valid && Number.isFinite(value)) emit('transform', mode === 'scale' ? { scale: value / 100 } : { angle: value })
  input.value = mode === 'scale' ? '100' : '0'
}
</script>

<template>
  <div class="notebook-selection-toolbar" role="group" :aria-label="t('notebook.selection.label')">
    <span class="notebook-selection-toolbar__count">{{ t('notebook.selection.count', { count }) }}</span>
    <label class="notebook-selection-toolbar__field">
      <span>{{ t('notebook.selection.scale') }}</span>
      <input type="number" value="100" min="5" max="2000" step="5" :disabled="disabled" :aria-label="t('notebook.selection.scale')" @change="transform($event, 'scale')" @keydown.enter="($event.target as HTMLInputElement).blur()">
      <span aria-hidden="true">%</span>
    </label>
    <label class="notebook-selection-toolbar__field">
      <span>{{ t('notebook.selection.rotate') }}</span>
      <input type="number" value="0" min="-360" max="360" step="1" :disabled="disabled" :aria-label="t('notebook.selection.rotate')" @change="transform($event, 'angle')" @keydown.enter="($event.target as HTMLInputElement).blur()">
      <span aria-hidden="true">°</span>
    </label>
    <div class="notebook-selection-toolbar__actions">
      <NvButton variant="ghost" size="sm" icon :disabled="disabled" :aria-label="t('notebook.selection.flipHorizontal')" :title="`${t('notebook.selection.flipHorizontal')} (Shift+H)`" aria-keyshortcuts="Shift+H" @click="emit('flip', 'horizontal')"><FlipHorizontal2 :size="16" aria-hidden="true" /></NvButton>
      <NvButton variant="ghost" size="sm" icon :disabled="disabled" :aria-label="t('notebook.selection.flipVertical')" :title="`${t('notebook.selection.flipVertical')} (Shift+V)`" aria-keyshortcuts="Shift+V" @click="emit('flip', 'vertical')"><FlipVertical2 :size="16" aria-hidden="true" /></NvButton>
      <NotebookAlignMenu :unit-count="unitCount" :disabled="disabled" @align="emit('align', $event)" @distribute="emit('distribute', $event)" />
      <NotebookColorControl
        class="notebook-selection-toolbar__color"
        :model-value="color"
        :presets="presets"
        :recents="recents"
        :show-quick="false"
        :disabled="disabled || colorDisabled"
        :label="t('notebook.selection.color')"
        @update:model-value="emit('color', $event)"
        @add-preset="emit('addPreset', $event)"
        @remove-preset="emit('removePreset', $event)"
      />
      <NvButton variant="ghost" size="sm" icon :disabled="disabled" :aria-label="t('notebook.selection.copy')" :title="t('notebook.selection.copy')" @click="emit('copy')"><Copy :size="16" /></NvButton>
      <NvButton variant="ghost" size="sm" icon :disabled="disabled" :aria-label="t('notebook.selection.clear')" :title="t('notebook.selection.clear')" @click="emit('clear')"><X :size="16" /></NvButton>
    </div>
  </div>
</template>

<style scoped>
.notebook-selection-toolbar { display:flex; flex:none; flex-wrap:wrap; align-items:center; justify-content:center; gap:6px 12px; padding:4px 12px 8px; color:var(--text-secondary); font:12px var(--font-ui); }
.notebook-selection-toolbar__count { font-variant-numeric:tabular-nums; }
.notebook-selection-toolbar__actions { display:flex; flex:none; align-items:center; gap:6px; }
.notebook-selection-toolbar__field { display:flex; align-items:center; gap:6px; white-space:nowrap; }
.notebook-selection-toolbar__field input { box-sizing:border-box; width:62px; height:30px; border:0; border-radius:6px; padding:0 6px; background:var(--input-bg); color:var(--text-primary); font:12px var(--font-ui); font-variant-numeric:tabular-nums; }
.notebook-selection-toolbar input:focus-visible { outline:2px solid var(--focus-ring); outline-offset:2px; }
.notebook-selection-toolbar input:disabled { opacity:.45; }
.notebook-selection-toolbar :deep(.nv-btn) { width:30px; height:30px; min-height:30px; }
@media(pointer:coarse) { .notebook-selection-toolbar__field input, .notebook-selection-toolbar :deep(.nv-btn) { min-width:44px; min-height:44px; } }
@container notebook-editor (max-width:600px) {
  .notebook-selection-toolbar__count { flex:1 0 calc(100% - 170px); }
  .notebook-selection-toolbar__field { order:1; }
}
</style>
