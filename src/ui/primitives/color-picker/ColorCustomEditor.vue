<script setup lang="ts">
import { useI18n } from 'vue-i18n'

interface Props {
  activeHex: string
  hexInvalid: boolean
  svBackground: Record<string, string>
  svThumbStyle: Record<string, string>
  hue: number
  /** True inside the teleported inline-mode popover, which drops the separator/spacing used when the editor sits below the preset grid. */
  popup?: boolean
}

withDefaults(defineProps<Props>(), {
  popup: false,
})

const emit = defineEmits<{
  'hex-input': []
  'hex-blur': []
  'hex-keydown': [event: KeyboardEvent]
  'sv-pointerdown': [event: PointerEvent]
  'sv-pointermove': [event: PointerEvent]
  'sv-pointerup': [event: PointerEvent]
  'hue-input': [event: Event]
}>()

const hexInput = defineModel<string>('hexInput', { required: true })

const { t } = useI18n()
</script>

<template>
  <div
    class="nv-color-picker__custom tw:grid tw:gap-[9px]"
    :class="popup
      ? 'nv-color-picker__custom--popup tw:mt-0 tw:border-t-0 tw:pt-0'
      : 'tw:mt-2.5 tw:border-0 tw:border-t tw:border-solid tw:border-(--border-subtle) tw:pt-2.5'"
  >
    <div class="nv-color-picker__custom-head tw:grid tw:grid-cols-[30px_minmax(0,1fr)] tw:items-center tw:gap-2">
      <span class="nv-color-picker__preview tw:h-[30px] tw:w-[30px] tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-line-default tw:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--shadow)_10%,transparent)]" :style="{ background: activeHex }" aria-hidden="true" />
      <input
        v-model="hexInput"
        type="text"
        class="nv-color-picker__hex tw:h-[30px] tw:min-w-0 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:px-[9px] tw:font-nv-mono tw:text-xs tw:font-semibold tw:lowercase tw:tracking-normal tw:text-content-primary tw:transition-[border-color,background-color] tw:duration-[120ms] tw:focus:border-accent tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
        :class="hexInvalid
          ? 'is-invalid tw:border-[color-mix(in_oklab,#ef4444_70%,var(--border-default))] tw:bg-[color-mix(in_oklab,#ef4444_10%,var(--hover))]'
          : 'tw:border-line-default tw:bg-(--hover)'"
        maxlength="7"
        placeholder="#000000"
        spellcheck="false"
        :aria-label="t('editor.colorPicker.hex')"
        @input="emit('hex-input')"
        @blur="emit('hex-blur')"
        @keydown="emit('hex-keydown', $event)"
      >
    </div>

    <div
      class="nv-color-picker__sv tw:relative tw:h-[92px] tw:max-[560px]:h-[88px] tw:cursor-crosshair tw:touch-none tw:overflow-hidden tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-line-default tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
      :style="svBackground"
      role="slider"
      tabindex="0"
      :aria-label="t('editor.colorPicker.sv')"
      :aria-valuetext="activeHex"
      @pointerdown="emit('sv-pointerdown', $event)"
      @pointermove="emit('sv-pointermove', $event)"
      @pointerup="emit('sv-pointerup', $event)"
      @pointercancel="emit('sv-pointerup', $event)"
    >
      <span class="nv-color-picker__sv-thumb tw:pointer-events-none tw:absolute tw:h-[14px] tw:w-[14px] tw:-translate-x-1/2 tw:-translate-y-1/2 tw:rounded-full tw:border-2 tw:border-solid tw:border-white tw:shadow-[0_0_0_1px_color-mix(in_oklab,black_45%,transparent),0_2px_8px_color-mix(in_oklab,black_24%,transparent)]" :style="svThumbStyle" />
    </div>

    <label class="nv-color-picker__hue tw:grid tw:grid-cols-[auto_minmax(0,1fr)] tw:items-center tw:gap-2">
      <span class="nv-color-picker__hue-label tw:text-[11px] tw:font-semibold tw:text-content-muted">{{ t('editor.colorPicker.hue') }}</span>
      <input
        type="range"
        min="0"
        max="360"
        step="1"
        :value="hue"
        class="tw:m-0 tw:h-4 tw:w-full tw:cursor-pointer tw:appearance-none tw:rounded-full tw:bg-[linear-gradient(to_right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
        :aria-label="t('editor.colorPicker.hue')"
        @input="emit('hue-input', $event)"
      >
    </label>
  </div>
</template>

<style scoped>
/* Native range-thumb pseudo-elements cannot be targeted with utility classes. */
.nv-color-picker__hue input::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 999px;
  background: transparent;
  box-shadow: 0 0 0 1px color-mix(in oklab, black 45%, transparent);
  appearance: none;
}

.nv-color-picker__hue input::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 999px;
  background: transparent;
  box-shadow: 0 0 0 1px color-mix(in oklab, black 45%, transparent);
}
</style>
