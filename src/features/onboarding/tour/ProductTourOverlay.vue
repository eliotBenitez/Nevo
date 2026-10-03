<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFocusTrap } from '../../../ui/composables/useFocusTrap'
import { useOnboardingStore } from '../../../stores/onboarding'
import { useProductTour } from './useProductTour'
import TourCoachmark from './TourCoachmark.vue'

const props = defineProps<{
  /** True while the mobile shell (bottom nav, no sidebar) is what's actually rendered. */
  isMobileLayout: boolean
}>()

const { t } = useI18n()
const router = useRouter()
const onboardingStore = useOnboardingStore()

const coachComponentRef = ref<InstanceType<typeof TourCoachmark> | null>(null)
const coachEl = computed(() => coachComponentRef.value?.el ?? null)
const isMobileLayoutRef = computed(() => props.isMobileLayout)

function openStarterNote() {
  const noteId = onboardingStore.starterNoteId
  if (!noteId) return
  void router.push(`/workspace/note/${noteId}`)
}

const tour = useProductTour({
  coachEl,
  isMobileLayout: isMobileLayoutRef,
  onOpenStarterNote: openStarterNote,
})

const { activate, deactivate } = useFocusTrap(coachEl, tour.active)

watch(tour.active, (isActive) => {
  if (isActive) void nextTick(() => activate())
  else deactivate()
})

// Every step/card change moves focus to the primary action, mirroring the
// reference behavior (`go(i, true)` focuses the "Next"/primary button).
watch(() => tour.stepIndex.value, () => {
  void nextTick(() => coachComponentRef.value?.focusPrimary())
})

const liveMessage = computed(() => {
  if (!tour.active.value) return ''
  if (tour.kind.value === 'spotlight' && tour.currentStep.value) {
    return t('onboarding.tour.liveStep', {
      n: tour.stepIndex.value,
      total: tour.totalSteps.value,
      title: t(tour.currentStep.value.titleKey),
    })
  }
  if (tour.kind.value === 'welcome') {
    return `${t('onboarding.tour.welcome.titleLead')} ${t('onboarding.tour.welcome.titleEmphasis')}`
  }
  return `${t('onboarding.tour.done.titleLead')} ${t('onboarding.tour.done.titleEmphasis')}`
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    tour.close()
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    tour.next()
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    tour.prev()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="tour.active.value"
      class="tour-layer tw:fixed tw:inset-0 tw:z-nv-modal"
      :class="tour.kind.value !== 'spotlight' ? 'tw:bg-scrim' : ''"
      @keydown="onKeydown"
    >
      <div
        v-if="tour.kind.value === 'spotlight' && tour.placement.value?.ring"
        class="tour-ring tw:pointer-events-none tw:absolute tw:rounded-[var(--radius-md)] tw:outline tw:outline-2 tw:outline-accent tw:outline-offset-2 tw:transition-[left,top,width,height] tw:duration-[240ms] tw:ease-out tw:motion-reduce:transition-none"
        :style="{
          left: `${tour.placement.value.ring.left}px`,
          top: `${tour.placement.value.ring.top}px`,
          width: `${tour.placement.value.ring.width}px`,
          height: `${tour.placement.value.ring.height}px`,
          boxShadow: '0 0 0 9999px var(--scrim)',
        }"
      />

      <!--
        Welcome/done cards are centered by CSS, never by measured coordinates:
        the first measure() pass lands a frame after mount, and animating from
        the seeded (0, 0) made the card fly in from the top-left corner. The
        key remounts the card between centered and spotlight modes so the
        left/top transition only ever runs between two real spotlight positions
        (or from the last centered position into the first spotlight).
      -->
      <TourCoachmark
        v-if="tour.placement.value"
        :key="tour.kind.value === 'spotlight' ? 'spotlight' : 'centered'"
        ref="coachComponentRef"
        :class="tour.kind.value === 'spotlight'
          ? 'tw:transition-[left,top] tw:duration-[240ms] tw:ease-out tw:motion-reduce:transition-none'
          : 'tw:left-1/2 tw:top-1/2 tw:-translate-x-1/2 tw:-translate-y-1/2'"
        :style="tour.kind.value === 'spotlight'
          ? { left: `${tour.placement.value.coach.left}px`, top: `${tour.placement.value.coach.top}px` }
          : undefined"
        :kind="tour.kind.value"
        :step-number="tour.stepIndex.value"
        :total-steps="tour.totalSteps.value"
        :title-key="tour.currentStep.value?.titleKey ?? null"
        :text-key="tour.currentStep.value?.textKey ?? null"
        :side="tour.placement.value.side"
        :arrow-offset="tour.placement.value.arrowOffset"
        :has-starter-note="!!onboardingStore.starterNoteId"
        :is-mobile-layout="isMobileLayout"
        @next="tour.next"
        @prev="tour.prev"
        @close="tour.close"
        @open-starter="tour.openStarterNoteAndFinish"
      />

      <div class="sr-only tw:absolute tw:h-px tw:w-px tw:overflow-hidden tw:whitespace-nowrap" style="clip: rect(0 0 0 0)" aria-live="polite">
        {{ liveMessage }}
      </div>
    </div>
  </Teleport>
</template>
