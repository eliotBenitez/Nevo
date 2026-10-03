<script setup lang="ts">
import { nextRovingIndex } from '../rovingIndex'

export interface CreateWorkspaceStepTab {
  key: string
  label: string
}

const props = defineProps<{
  steps: CreateWorkspaceStepTab[]
  current: number
  /** Highest step index the user may jump to directly (steps beyond it are disabled). */
  reachable: number
  tablistLabel: string
}>()

const emit = defineEmits<{ select: [index: number] }>()

function isEnabled(index: number) {
  return index <= props.reachable
}

function onKeydown(event: KeyboardEvent, index: number) {
  const next = nextRovingIndex(event.key, index, props.steps.length, isEnabled)
  if (next === null) return
  event.preventDefault()
  emit('select', next)
}

function onClick(index: number) {
  if (isEnabled(index)) emit('select', index)
}
</script>

<template>
  <div>
    <div class="cw-steps tw:flex tw:gap-1" role="tablist" :aria-label="tablistLabel">
      <button
        v-for="(step, i) in steps"
        :id="`cw-tab-${step.key}`"
        :key="step.key"
        type="button"
        role="tab"
        class="cw-step tw:inline-flex tw:h-[30px] tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-lg tw:border-0 tw:px-2.5 tw:font-nv-ui tw:text-[12.5px] tw:font-medium tw:disabled:cursor-not-allowed tw:disabled:opacity-45 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-focus-ring tw:min-[1200px]:h-9 tw:min-[1200px]:gap-2.5 tw:min-[1200px]:rounded-[10px] tw:min-[1200px]:px-3.5 tw:min-[1200px]:text-sm tw:min-[1600px]:h-10 tw:min-[1600px]:px-4 tw:min-[1600px]:text-[15px]"
        :class="i === current ? 'is-active tw:bg-(--surface-raised) tw:text-content-primary tw:shadow-(--shadow-raised)' : i < current ? 'is-done tw:bg-transparent tw:text-content-muted tw:enabled:hover:bg-surface-subtle tw:enabled:hover:text-content-primary' : 'tw:bg-transparent tw:text-content-muted tw:enabled:hover:bg-surface-subtle tw:enabled:hover:text-content-primary'"
        :aria-selected="i === current"
        :aria-controls="`cw-panel-${step.key}`"
        :disabled="!isEnabled(i)"
        :tabindex="i === current ? 0 : -1"
        @click="onClick(i)"
        @keydown="onKeydown($event, i)"
      >
        <span class="cw-mono tw:font-nv-mono tw:text-[10.5px] tw:tabular-nums tw:min-[1200px]:text-xs tw:min-[1600px]:text-[12.5px]" :class="i < current ? 'tw:text-accent' : ''">{{ String(i + 1).padStart(2, '0') }}</span>{{ step.label }}
      </button>
    </div>
    <div class="stepper tw:mt-0.5 tw:flex tw:gap-1.5 tw:min-[1200px]:gap-2" aria-hidden="true">
      <i v-for="(step, i) in steps" :key="step.key" class="tw:h-[3px] tw:min-[1200px]:h-1 tw:flex-1 tw:rounded-[2px] tw:not-italic" :class="i <= current ? 'on tw:bg-accent' : 'tw:bg-line-default'" />
    </div>
  </div>
</template>
