<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Pencil, Plus, X } from '@lucide/vue'
import NvColorPicker from '../../../ui/primitives/NvColorPicker.vue'
import { colorsMatch, normalizeHex, type ColorOption } from '../../../utils/colorConversion'
import {
  NOTEBOOK_BUILTIN_COLORS,
  NOTEBOOK_PRESET_LIMIT,
  isBuiltinNotebookColor,
  notebookBuiltinColorName,
} from '../../../core/notebook/palette'

const props = withDefaults(defineProps<{
  modelValue: string
  presets?: readonly string[]
  recents?: readonly string[]
  quickColors?: readonly string[]
  showQuick?: boolean
  disabled?: boolean
  label?: string
}>(), {
  presets: () => [],
  recents: () => [],
  quickColors: () => [],
  showQuick: true,
  disabled: false,
  label: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [color: string]
  'add-preset': [color: string]
  'remove-preset': [color: string]
}>()

const { t } = useI18n()
const editing = ref(false)

const builtinOptions = computed<ColorOption[]>(() =>
  NOTEBOOK_BUILTIN_COLORS.map(entry => ({ color: entry.color, label: t(`notebook.palette.colors.${entry.name}`) })))

const canAddCurrent = computed(() => {
  const hex = normalizeHex(props.modelValue)
  return !!hex && !isBuiltinNotebookColor(hex) && !props.presets.includes(hex) && props.presets.length < NOTEBOOK_PRESET_LIMIT
})

function colorLabel(color: string): string {
  const name = notebookBuiltinColorName(color)
  return name ? t(`notebook.palette.colors.${name}`) : color
}

function update(color: string | null): void {
  if (color) emit('update:modelValue', color)
}
</script>

<template>
  <div class="notebook-color-control">
    <NvColorPicker
      :model-value="modelValue"
      :colors="builtinOptions"
      trigger="swatch"
      :trigger-label="label ?? t('notebook.palette.open')"
      :disabled="disabled"
      @update:model-value="update"
    >
      <template #sections="{ select }">
        <section class="notebook-color-control__section">
          <div class="notebook-color-control__heading">
            <span>{{ t('notebook.palette.custom') }}</span>
            <span class="notebook-color-control__actions">
              <button
                type="button"
                class="notebook-color-control__action notebook-color-control__add"
                :disabled="!canAddCurrent"
                :aria-label="t('notebook.palette.addCurrent')"
                :title="t('notebook.palette.addCurrent')"
                @click="emit('add-preset', modelValue)"
              >
                <Plus :size="14" aria-hidden="true" />
              </button>
              <button
                v-if="presets.length"
                type="button"
                class="notebook-color-control__action notebook-color-control__edit"
                :aria-pressed="editing"
                :aria-label="editing ? t('notebook.palette.done') : t('notebook.palette.edit')"
                :title="editing ? t('notebook.palette.done') : t('notebook.palette.edit')"
                @click="editing = !editing"
              >
                <component :is="editing ? Check : Pencil" :size="14" aria-hidden="true" />
              </button>
            </span>
          </div>
          <div v-if="presets.length" class="notebook-color-control__grid" role="group" :aria-label="t('notebook.palette.custom')">
            <span v-for="color in presets" :key="color" class="notebook-color-control__cell">
              <button
                type="button"
                class="notebook-color-control__swatch"
                :class="{ 'is-selected': colorsMatch(color, modelValue) }"
                :style="{ background: color }"
                :aria-label="color"
                :title="color"
                @click="select(color)"
              />
              <button
                v-if="editing"
                type="button"
                class="notebook-color-control__remove"
                :aria-label="t('notebook.palette.remove', { color })"
                :title="t('notebook.palette.remove', { color })"
                @click="emit('remove-preset', color)"
              >
                <X :size="10" aria-hidden="true" />
              </button>
            </span>
          </div>
        </section>
        <section v-if="recents.length" class="notebook-color-control__section">
          <div class="notebook-color-control__heading"><span>{{ t('notebook.palette.recent') }}</span></div>
          <div class="notebook-color-control__grid" role="group" :aria-label="t('notebook.palette.recent')">
            <span v-for="color in recents" :key="color" class="notebook-color-control__cell">
              <button
                type="button"
                class="notebook-color-control__swatch"
                :class="{ 'is-selected': colorsMatch(color, modelValue) }"
                :style="{ background: color }"
                :aria-label="colorLabel(color)"
                :title="colorLabel(color)"
                @click="select(color)"
              />
            </span>
          </div>
        </section>
      </template>
    </NvColorPicker>
    <div v-if="showQuick && quickColors.length" class="notebook-color-control__quick" role="group" :aria-label="t('notebook.palette.quick')">
      <button
        v-for="color in quickColors"
        :key="color"
        type="button"
        class="notebook-color-control__quick-swatch"
        :style="{ background: color }"
        :aria-label="colorLabel(color)"
        :title="colorLabel(color)"
        :aria-pressed="colorsMatch(color, modelValue)"
        :disabled="disabled"
        @click="emit('update:modelValue', color)"
      />
    </div>
  </div>
</template>

<style scoped>
.notebook-color-control { display: flex; flex: none; align-items: center; gap: 6px; }
.notebook-color-control__quick { display: flex; align-items: center; gap: 4px; }
.notebook-color-control__quick-swatch { box-sizing: border-box; width: 20px; height: 20px; padding: 0; border: 1px solid var(--border-default); border-radius: 6px; box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--shadow) 10%, transparent); cursor: pointer; }
.notebook-color-control__quick-swatch[aria-pressed='true'] { box-shadow: 0 0 0 2px var(--accent-soft); border-color: color-mix(in oklab, var(--accent) 70%, white); }
.notebook-color-control__quick-swatch:focus-visible, .notebook-color-control__swatch:focus-visible, .notebook-color-control__action:focus-visible, .notebook-color-control__remove:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.notebook-color-control__quick-swatch:disabled { cursor: not-allowed; opacity: 0.45; }
.notebook-color-control__section { display: grid; gap: 6px; margin-top: 10px; }
.notebook-color-control__heading { display: flex; min-height: 26px; align-items: center; justify-content: space-between; gap: 8px; white-space: nowrap; color: var(--text-secondary); font: 600 11.5px var(--font-ui); }
.notebook-color-control__actions { display: inline-flex; gap: 4px; }
.notebook-color-control__action { display: inline-grid; width: 26px; height: 26px; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--text-secondary); font: 600 11px var(--font-ui); cursor: pointer; }
.notebook-color-control__action:hover:not(:disabled), .notebook-color-control__action[aria-pressed='true'] { border-color: var(--border-default); background: var(--hover); color: var(--text-primary); }
.notebook-color-control__action:disabled { cursor: not-allowed; opacity: 0.45; }
.notebook-color-control__grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
.notebook-color-control__cell { position: relative; display: block; }
.notebook-color-control__swatch { box-sizing: border-box; display: block; width: 100%; aspect-ratio: 1; padding: 0; border: 1px solid color-mix(in oklab, var(--border-default) 70%, transparent); border-radius: calc(8px * var(--radius-scale, 1)); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--shadow) 10%, transparent); cursor: pointer; }
.notebook-color-control__swatch.is-selected { border-color: color-mix(in oklab, var(--accent) 70%, white); box-shadow: 0 0 0 2px var(--accent-soft); }
.notebook-color-control__remove { position: absolute; top: -5px; right: -5px; display: grid; width: 16px; height: 16px; place-items: center; padding: 0; border: 1px solid var(--border-default); border-radius: 50%; background: var(--surface-panel); color: var(--text-primary); cursor: pointer; }

@media (pointer: coarse) {
  .notebook-color-control__quick-swatch { width: 32px; height: 32px; }
  .notebook-color-control__action { width: 36px; height: 36px; }
  .notebook-color-control__remove { width: 24px; height: 24px; top: -8px; right: -8px; }
}
</style>
