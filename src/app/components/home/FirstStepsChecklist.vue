<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, X } from '@lucide/vue'
import type { FirstStepId } from '../../../types/workspace'

const props = withDefaults(defineProps<{
  visible?: boolean
  completedSteps?: FirstStepId[]
}>(), {
  visible: false,
  completedSteps: () => [],
})

const emit = defineEmits<{
  hide: []
  'take-tour': []
}>()

const { t } = useI18n()

const TOTAL = 5
const ITEMS: { id: FirstStepId; hintKey: string | null }[] = [
  { id: 'createWorkspace', hintKey: null },
  { id: 'takeTour', hintKey: 'onboarding.firstSteps.items.takeTour.hint' },
  { id: 'insertBlock', hintKey: 'onboarding.firstSteps.items.insertBlock.hint' },
  { id: 'openGraph', hintKey: 'onboarding.firstSteps.items.openGraph.hint' },
  { id: 'chooseAppearance', hintKey: 'onboarding.firstSteps.items.chooseAppearance.hint' },
]

const doneCount = computed(() => props.completedSteps.length)
const progressPercent = computed(() => Math.round((doneCount.value / TOTAL) * 100))

function isDone(id: FirstStepId) {
  return props.completedSteps.includes(id)
}
</script>

<template>
  <section v-if="visible" class="first-steps tw:flex tw:flex-col tw:gap-2.5" :aria-label="t('onboarding.firstSteps.title')">
    <div class="first-steps__head tw:flex tw:items-baseline tw:gap-2">
      <h2 class="tw:m-0 tw:text-[15px] tw:font-[650] tw:tracking-normal">{{ t('onboarding.firstSteps.title') }}</h2>
      <span class="tw:font-nv-mono tw:text-[11px] tw:text-content-muted">{{ t('onboarding.firstSteps.progress', { done: doneCount, total: TOTAL }) }}</span>
      <button
        type="button"
        class="nv-btn nv-btn--ghost nv-btn--icon tw:ml-auto tw:self-center"
        :aria-label="t('onboarding.firstSteps.hide')"
        @click="emit('hide')"
      >
        <X :size="14" aria-hidden="true" />
      </button>
    </div>

    <div
      class="first-steps__bar tw:h-1 tw:overflow-hidden tw:rounded-full tw:bg-line-default"
      role="progressbar"
      :aria-valuenow="progressPercent"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="t('onboarding.firstSteps.progressAria', { done: doneCount, total: TOTAL })"
    >
      <i class="tw:block tw:h-full tw:bg-accent tw:transition-[width] tw:duration-300 tw:motion-reduce:transition-none" :style="{ width: `${progressPercent}%` }" />
    </div>

    <ul class="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-0.5 tw:p-0">
      <li
        v-for="item in ITEMS"
        :key="item.id"
        class="first-steps__item tw:grid tw:items-start tw:gap-2.5 tw:py-1.5 tw:text-[13px] tw:[grid-template-columns:16px_minmax(0,1fr)]"
      >
        <span
          class="tw:mt-0.5 tw:grid tw:h-4 tw:w-4 tw:place-items-center tw:rounded-full tw:border tw:border-solid"
          :class="isDone(item.id) ? 'tw:border-accent tw:bg-accent tw:text-content-on-accent' : 'tw:border-line-strong tw:bg-transparent'"
          aria-hidden="true"
        >
          <Check v-if="isDone(item.id)" :size="11" :stroke-width="2.5" />
        </span>

        <button
          v-if="item.id === 'takeTour' && !isDone(item.id)"
          type="button"
          class="tw:m-0 tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:font-nv-ui tw:text-[13px] tw:font-medium tw:text-content-primary tw:underline-offset-2 tw:hover:underline"
          @click="emit('take-tour')"
        >
          {{ t(`onboarding.firstSteps.items.${item.id}.label`) }}
          <span v-if="item.hintKey" class="tw:ml-1.5 tw:font-normal tw:text-[11.5px] tw:text-content-muted">{{ t(item.hintKey) }}</span>
        </button>
        <span v-else class="tw:block" :class="isDone(item.id) ? 'tw:text-content-muted' : 'tw:text-content-primary'">
          <b class="tw:font-medium" :class="isDone(item.id) ? 'tw:text-content-muted tw:line-through tw:decoration-line-strong' : ''">{{ t(`onboarding.firstSteps.items.${item.id}.label`) }}</b>
          <span v-if="item.hintKey" class="tw:ml-1.5 tw:text-[11.5px] tw:text-content-muted">{{ t(item.hintKey) }}</span>
        </span>
      </li>
    </ul>
  </section>
</template>
