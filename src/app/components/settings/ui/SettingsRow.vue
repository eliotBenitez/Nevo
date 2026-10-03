<script setup lang="ts">
import { computed, useId, useSlots } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  controlId?: string
  disabled?: boolean
  layout?: 'inline' | 'stacked'
}>(), {
  description: undefined,
  controlId: undefined,
  disabled: false,
  layout: 'inline',
})

const titleId = useId()
const slots = useSlots()
const descriptionId = computed(() => (
  props.description || slots.description
    ? `${props.controlId ?? titleId}-desc`
    : undefined
))
</script>

<template>
  <div
    class="settings-row tw:grid tw:min-w-0 tw:py-[11px] tw:max-[719px]:p-[13px]"
    :class="[
      layout === 'stacked'
        ? 'settings-row--stacked settings-row--stack tw:grid-cols-[minmax(0,1fr)] tw:items-stretch tw:gap-2'
        : 'tw:grid-cols-[minmax(0,1fr)_auto] tw:items-center tw:gap-5 tw:max-[980px]:grid-cols-[minmax(0,1fr)] tw:max-[980px]:items-stretch tw:max-[980px]:gap-2',
      disabled && 'settings-row--disabled is-muted',
    ]"
  >
    <div class="row-copy tw:min-w-0">
      <label
        v-if="controlId"
        :id="titleId"
        :for="controlId"
        class="row-title tw:text-content-primary tw:text-[13.5px] tw:font-[550] tw:[overflow-wrap:anywhere]"
      >
        {{ title }}
      </label>
      <span
        v-else
        :id="titleId"
        class="row-title tw:text-content-primary tw:text-[13.5px] tw:font-[550] tw:[overflow-wrap:anywhere]"
      >
        {{ title }}
      </span>

      <div
        v-if="description || $slots.description"
        :id="descriptionId"
        class="row-sub tw:mt-0.5 tw:text-content-muted tw:text-xs tw:leading-[1.45] tw:[overflow-wrap:anywhere]"
      >
        <slot name="description">
          {{ description }}
        </slot>
      </div>
    </div>

    <div
      class="row-control"
      role="group"
      :aria-labelledby="titleId"
      :aria-describedby="descriptionId"
    >
      <slot :control-id="controlId" :description-id="descriptionId" />
    </div>
  </div>
</template>
