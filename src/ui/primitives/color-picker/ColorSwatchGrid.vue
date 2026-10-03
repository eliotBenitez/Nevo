<script setup lang="ts">
import { colorsMatch, type ColorOption } from '../../../utils/colorConversion'

interface Props {
  colors: ColorOption[]
  modelValue: string | null
  /** Popover panels use a fixed 6-column grid; inline panels auto-fill and reflow at phone width. */
  popover?: boolean
  gridLabel: string
}

withDefaults(defineProps<Props>(), {
  popover: false,
})

defineEmits<{ select: [color: string] }>()
</script>

<template>
  <div
    class="nv-color-picker__grid tw:grid tw:w-full tw:gap-2"
    :class="popover
      ? 'tw:grid-cols-6'
      : 'tw:grid-cols-[repeat(auto-fill,minmax(28px,1fr))] tw:max-[560px]:grid-cols-[repeat(auto-fill,minmax(24px,1fr))] tw:max-[560px]:gap-[7px]'"
    :aria-label="gridLabel"
  >
    <button
      v-for="opt in colors"
      :key="opt.color"
      type="button"
      class="nv-color-picker__swatch tw:aspect-square tw:w-full tw:min-w-0 tw:cursor-pointer tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:p-0 tw:transition-[border-color,box-shadow,transform] tw:duration-[120ms] tw:hover:-translate-y-px tw:hover:border-line-strong tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
      :class="colorsMatch(opt.color, modelValue ?? null)
        ? 'is-selected tw:border-[color-mix(in_oklab,var(--accent)_70%,white)] tw:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--shadow)_12%,transparent),0_0_0_2px_var(--accent-soft)]'
        : 'tw:border-[color-mix(in_oklab,var(--border-default)_70%,transparent)] tw:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--shadow)_10%,transparent)]'"
      :style="{ background: opt.color }"
      :aria-label="opt.label ?? opt.color"
      :title="opt.label ?? opt.color"
      @click="$emit('select', opt.color)"
    />
  </div>
</template>
