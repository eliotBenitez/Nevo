<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Pencil, Plus, X } from '../../../ui/icons'
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

const SWATCH_SELECTED = 'is-selected tw:border-[color-mix(in_oklab,var(--accent)_70%,white)] tw:[box-shadow:0_0_0_2px_var(--accent-soft)]'
const SWATCH_IDLE = 'tw:border-line-default/70 tw:[box-shadow:inset_0_0_0_1px_color-mix(in_oklab,var(--shadow)_10%,transparent)]'

function swatchStateClass(color: string): string {
  return colorsMatch(color, props.modelValue) ? SWATCH_SELECTED : SWATCH_IDLE
}

function update(color: string | null): void {
  if (color) emit('update:modelValue', color)
}
</script>

<template>
  <div class="notebook-color-control tw:flex tw:flex-none tw:items-center tw:gap-1.5">
    <NvColorPicker
      :model-value="modelValue"
      :colors="builtinOptions"
      trigger="swatch"
      :trigger-label="label ?? t('notebook.palette.open')"
      :disabled="disabled"
      @update:model-value="update"
    >
      <template #sections="{ select }">
        <section class="notebook-color-control__section tw:mt-2.5 tw:grid tw:gap-1.5">
          <div class="notebook-color-control__heading tw:flex tw:min-h-[26px] tw:items-center tw:justify-between tw:gap-2 tw:whitespace-nowrap tw:text-[11.5px] tw:leading-[normal] tw:font-semibold tw:text-content-secondary tw:font-nv-ui">
            <span>{{ t('notebook.palette.custom') }}</span>
            <span class="notebook-color-control__actions tw:inline-flex tw:gap-1">
              <button
                type="button"
                class="notebook-color-control__action notebook-color-control__add tw:inline-grid tw:size-[26px] tw:cursor-pointer tw:place-items-center tw:rounded-[7px] tw:border tw:border-transparent tw:bg-transparent tw:p-0 tw:text-[11px] tw:leading-[normal] tw:font-semibold tw:text-content-secondary tw:font-nv-ui tw:enabled:hover:border-line-default tw:enabled:hover:bg-(--hover) tw:enabled:hover:text-content-primary tw:aria-pressed:border-line-default tw:aria-pressed:bg-(--hover) tw:aria-pressed:text-content-primary tw:disabled:cursor-not-allowed tw:disabled:opacity-45 tw:coarse:size-9 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-focus-ring"
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
                class="notebook-color-control__action notebook-color-control__edit tw:inline-grid tw:size-[26px] tw:cursor-pointer tw:place-items-center tw:rounded-[7px] tw:border tw:border-transparent tw:bg-transparent tw:p-0 tw:text-[11px] tw:leading-[normal] tw:font-semibold tw:text-content-secondary tw:font-nv-ui tw:enabled:hover:border-line-default tw:enabled:hover:bg-(--hover) tw:enabled:hover:text-content-primary tw:aria-pressed:border-line-default tw:aria-pressed:bg-(--hover) tw:aria-pressed:text-content-primary tw:disabled:cursor-not-allowed tw:disabled:opacity-45 tw:coarse:size-9 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-focus-ring"
                :aria-pressed="editing"
                :aria-label="editing ? t('notebook.palette.done') : t('notebook.palette.edit')"
                :title="editing ? t('notebook.palette.done') : t('notebook.palette.edit')"
                @click="editing = !editing"
              >
                <component :is="editing ? Check : Pencil" :size="14" aria-hidden="true" />
              </button>
            </span>
          </div>
          <div v-if="presets.length" class="notebook-color-control__grid tw:grid tw:grid-cols-[repeat(6,minmax(0,1fr))] tw:gap-2" role="group" :aria-label="t('notebook.palette.custom')">
            <span v-for="color in presets" :key="color" class="notebook-color-control__cell tw:relative tw:block">
              <button
                type="button"
                class="notebook-color-control__swatch tw:box-border tw:block tw:aspect-square tw:w-full tw:cursor-pointer tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:p-0 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-focus-ring"
                :class="swatchStateClass(color)"
                :style="{ background: color }"
                :aria-label="color"
                :title="color"
                @click="select(color)"
              />
              <button
                v-if="editing"
                type="button"
                class="notebook-color-control__remove tw:absolute tw:-top-[5px] tw:-right-[5px] tw:grid tw:size-4 tw:cursor-pointer tw:place-items-center tw:rounded-full tw:border tw:border-line-default tw:bg-surface-panel tw:p-0 tw:text-content-primary tw:coarse:-top-2 tw:coarse:-right-2 tw:coarse:size-6 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-focus-ring"
                :aria-label="t('notebook.palette.remove', { color })"
                :title="t('notebook.palette.remove', { color })"
                @click="emit('remove-preset', color)"
              >
                <X :size="10" aria-hidden="true" />
              </button>
            </span>
          </div>
        </section>
        <section v-if="recents.length" class="notebook-color-control__section tw:mt-2.5 tw:grid tw:gap-1.5">
          <div class="notebook-color-control__heading tw:flex tw:min-h-[26px] tw:items-center tw:justify-between tw:gap-2 tw:whitespace-nowrap tw:text-[11.5px] tw:leading-[normal] tw:font-semibold tw:text-content-secondary tw:font-nv-ui"><span>{{ t('notebook.palette.recent') }}</span></div>
          <div class="notebook-color-control__grid tw:grid tw:grid-cols-[repeat(6,minmax(0,1fr))] tw:gap-2" role="group" :aria-label="t('notebook.palette.recent')">
            <span v-for="color in recents" :key="color" class="notebook-color-control__cell tw:relative tw:block">
              <button
                type="button"
                class="notebook-color-control__swatch tw:box-border tw:block tw:aspect-square tw:w-full tw:cursor-pointer tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:p-0 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-focus-ring"
                :class="swatchStateClass(color)"
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
    <div v-if="showQuick && quickColors.length" class="notebook-color-control__quick tw:flex tw:items-center tw:gap-1" role="group" :aria-label="t('notebook.palette.quick')">
      <button
        v-for="color in quickColors"
        :key="color"
        type="button"
        class="notebook-color-control__quick-swatch tw:box-border tw:size-5 tw:cursor-pointer tw:rounded-md tw:border tw:border-line-default tw:p-0 tw:[box-shadow:inset_0_0_0_1px_color-mix(in_oklab,var(--shadow)_10%,transparent)] tw:aria-pressed:border-[color-mix(in_oklab,var(--accent)_70%,white)] tw:aria-pressed:[box-shadow:0_0_0_2px_var(--accent-soft)] tw:disabled:cursor-not-allowed tw:disabled:opacity-45 tw:coarse:size-8 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-focus-ring"
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
