<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { SquarePen, Slash, Waypoints, X } from 'lucide-vue-next'
import type { TourCardKind } from './useProductTour'
import type { TourStepSide } from './tourSteps'

const props = defineProps<{
  kind: TourCardKind
  stepNumber: number
  totalSteps: number
  titleKey: string | null
  textKey: string | null
  side: TourStepSide | null
  arrowOffset?: { top?: number; left?: number }
  hasStarterNote: boolean
  isMobileLayout: boolean
}>()

const emit = defineEmits<{
  next: []
  prev: []
  close: []
  'open-starter': []
}>()

const { t } = useI18n()

const rootEl = ref<HTMLElement | null>(null)
const primaryBtnEl = ref<HTMLButtonElement | null>(null)

const isLast = computed(() => props.kind === 'spotlight' && props.stepNumber === props.totalSteps)
const arrowSide = computed(() => props.side ?? 'right')

function focusPrimary() {
  primaryBtnEl.value?.focus({ preventScroll: true })
}

defineExpose({ el: rootEl, focusPrimary })
</script>

<template>
  <div
    ref="rootEl"
    class="tour-coach tw:pointer-events-auto tw:absolute tw:flex tw:flex-col tw:rounded-[var(--radius-lg)] tw:border tw:border-solid tw:border-transparent tw:bg-modal tw:text-content-primary tw:shadow-nv-modal tw:outline-none tw:motion-reduce:transition-none"
    :class="[
      kind === 'spotlight'
        ? (isMobileLayout ? 'tw:w-[calc(100vw-24px)] tw:gap-2 tw:px-4 tw:pt-[14px] tw:pb-3' : 'tw:w-[304px] tw:gap-2 tw:px-4 tw:pt-[14px] tw:pb-3')
        : 'tw:w-[420px] tw:max-w-[calc(100vw-24px)] tw:gap-2.5 tw:px-6 tw:pt-[22px] tw:pb-[18px]',
      isMobileLayout && 'tw:[&_.nv-btn]:min-h-11',
    ]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tour-title"
    aria-describedby="tour-text"
    tabindex="-1"
  >
    <span
      v-if="kind === 'spotlight'"
      class="tour-coach__arrow tw:absolute tw:h-3 tw:w-3 tw:rotate-45 tw:border tw:border-solid tw:border-transparent tw:bg-modal"
      :class="{
        'tw:left-[-7px]': arrowSide === 'right',
        'tw:right-[-7px]': arrowSide === 'left',
        'tw:top-[-7px]': arrowSide === 'bottom',
        'tw:bottom-[-7px]': arrowSide === 'top',
      }"
      :style="side === 'right' || side === 'left' ? { top: `${arrowOffset?.top ?? 20}px` } : { left: `${arrowOffset?.left ?? 20}px` }"
      aria-hidden="true"
    />

    <div class="tour-coach__top tw:flex tw:min-h-6 tw:items-center tw:gap-2">
      <span class="tw:font-nv-mono tw:text-[11px] tw:font-medium tw:tracking-[0.04em] tw:text-content-muted tw:uppercase">
        {{ kind === 'spotlight' ? t('onboarding.tour.step', { n: stepNumber, total: totalSteps }) : kind === 'welcome' ? t('onboarding.tour.welcome.eyebrow') : t('onboarding.tour.done.eyebrow') }}
      </span>
      <button
        type="button"
        class="nv-btn nv-btn--ghost nv-btn--icon tw:ml-auto tw:-mr-1.5"
        :aria-label="t('onboarding.tour.closeAria')"
        @click="emit('close')"
      >
        <X :size="14" aria-hidden="true" />
      </button>
    </div>

    <template v-if="kind === 'welcome'">
      <h3 id="tour-title" class="tw:m-0 tw:text-[22px] tw:font-semibold tw:leading-[1.2] tw:tracking-[-0.02em]">
        {{ t('onboarding.tour.welcome.titleLead') }}
        <em class="tw:font-normal tw:italic tw:[font-family:var(--font-serif)]">{{ t('onboarding.tour.welcome.titleEmphasis') }}</em>
      </h3>
      <p id="tour-text" class="tw:m-0 tw:text-[13px] tw:text-content-secondary">{{ t('onboarding.tour.welcome.text') }}</p>
      <ul class="tw:m-0 tw:mt-0.5 tw:flex tw:list-none tw:flex-col tw:gap-1.5 tw:p-0 tw:text-[12.5px] tw:text-content-secondary">
        <li class="tw:flex tw:items-center tw:gap-2"><SquarePen :size="14" class="tw:text-accent" aria-hidden="true" />{{ t('onboarding.tour.welcome.listNewNote') }}</li>
        <li class="tw:flex tw:items-center tw:gap-2"><Slash :size="14" class="tw:text-accent" aria-hidden="true" />{{ t('onboarding.tour.welcome.listBlocks') }}</li>
        <li class="tw:flex tw:items-center tw:gap-2"><Waypoints :size="14" class="tw:text-accent" aria-hidden="true" />{{ t('onboarding.tour.welcome.listGraph') }}</li>
      </ul>
      <div class="tw:mt-1 tw:flex tw:items-center tw:gap-1.5">
        <span class="tw:mr-auto tw:text-[11.5px] tw:text-content-muted">{{ t('onboarding.tour.welcome.keysHint') }}</span>
        <button type="button" class="nv-btn nv-btn--ghost" @click="emit('close')">{{ t('onboarding.tour.welcome.later') }}</button>
        <button ref="primaryBtnEl" type="button" class="nv-btn nv-btn--primary" @click="emit('next')">{{ t('onboarding.tour.welcome.start') }}</button>
      </div>
    </template>

    <template v-else-if="kind === 'spotlight'">
      <h3 id="tour-title" class="tw:m-0 tw:text-[15px] tw:font-semibold tw:tracking-[-0.005em]">{{ t(titleKey!) }}</h3>
      <p id="tour-text" class="tw:m-0 tw:text-[13px] tw:text-content-secondary">{{ t(textKey!) }}</p>
      <div class="tw:mt-1 tw:flex tw:items-center tw:gap-1.5">
        <div class="tw:mr-auto tw:flex tw:items-center tw:gap-1" role="presentation" aria-hidden="true">
          <i
            v-for="dot in totalSteps"
            :key="dot"
            class="tw:block tw:h-[6px] tw:rounded-[3px] tw:transition-[width] tw:duration-200 tw:motion-reduce:transition-none"
            :class="dot === stepNumber ? 'tw:w-4 tw:bg-accent' : 'tw:w-[6px] tw:bg-line-strong'"
          />
        </div>
        <button type="button" class="nv-btn nv-btn--ghost" @click="emit('prev')">{{ t('onboarding.tour.back') }}</button>
        <button ref="primaryBtnEl" type="button" class="nv-btn nv-btn--primary" @click="emit('next')">{{ isLast ? t('onboarding.tour.finish') : t('onboarding.tour.next') }}</button>
      </div>
    </template>

    <template v-else>
      <h3 id="tour-title" class="tw:m-0 tw:text-[22px] tw:font-semibold tw:leading-[1.2] tw:tracking-[-0.02em]">
        {{ t('onboarding.tour.done.titleLead') }}
        <em class="tw:font-normal tw:italic tw:[font-family:var(--font-serif)]">{{ t('onboarding.tour.done.titleEmphasis') }}</em>
      </h3>
      <p id="tour-text" class="tw:m-0 tw:text-[13px] tw:text-content-secondary">{{ t('onboarding.tour.done.text') }}</p>
      <div class="tw:mt-1 tw:flex tw:items-center tw:gap-1.5">
        <button type="button" class="nv-btn nv-btn--ghost tw:mr-auto" @click="emit('prev')">{{ t('onboarding.tour.back') }}</button>
        <button type="button" class="nv-btn nv-btn--ghost" @click="emit('close')">{{ t('onboarding.tour.done.close') }}</button>
        <button v-if="hasStarterNote" ref="primaryBtnEl" type="button" class="nv-btn nv-btn--primary" @click="emit('open-starter')">{{ t('onboarding.tour.done.openStarter') }}</button>
      </div>
    </template>
  </div>
</template>
