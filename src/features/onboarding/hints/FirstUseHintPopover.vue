<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from '@lucide/vue'
import { useOnboardingStore } from '../../../stores/onboarding'
import { FIRST_USE_HINTS } from './firstUseHints'
import { placeCoachmark, type Rect } from '../tour/tourPlacement'
import type { TourStepSide } from '../tour/tourSteps'

defineProps<{
  /** True while the mobile shell (bottom nav, no sidebar) is what's actually rendered. */
  isMobileLayout: boolean
}>()

const { t } = useI18n()
const onboardingStore = useOnboardingStore()

const popoverEl = ref<HTMLElement | null>(null)

const activeHint = computed(() => onboardingStore.activeHint)
const definition = computed(() => activeHint.value ? FIRST_USE_HINTS[activeHint.value] : null)

interface HintPlacement {
  ring: Rect
  coach: { left: number; top: number }
  side: TourStepSide
  arrowOffset: { top?: number; left?: number }
}

const placement = ref<HintPlacement | null>(null)
let targetResizeObserver: ResizeObserver | null = null
let observedTarget: HTMLElement | null = null

function findTargetEl(target: string): HTMLElement | null {
  // `target` always comes from the static FIRST_USE_HINTS table, never user input.
  return document.querySelector<HTMLElement>(`[data-hint="${target}"]`)
}

function isVisible(el: HTMLElement | null): boolean {
  if (!el) return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function observeTarget(el: HTMLElement | null) {
  // measure() calls this on every pass; a freshly created observer always
  // delivers an initial notification, so recreating it for the same element
  // would re-run measure() every frame ("ResizeObserver loop" errors).
  if (el === observedTarget) return
  targetResizeObserver?.disconnect()
  targetResizeObserver = null
  observedTarget = el
  if (!el || typeof ResizeObserver === 'undefined') return
  targetResizeObserver = new ResizeObserver(() => measure())
  targetResizeObserver.observe(el)
}

function measure() {
  const def = definition.value
  const card = popoverEl.value
  const id = activeHint.value
  if (!def || !card || !id) { placement.value = null; return }

  const targetEl = findTargetEl(def.target)
  if (!isVisible(targetEl)) {
    // The target vanished after the hint was requested (e.g. navigated away
    // mid-settle) — drop it silently, never counting this as "seen".
    onboardingStore.cancelHint(id)
    return
  }

  const rect = targetEl!.getBoundingClientRect()
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const coachSize = { width: card.offsetWidth, height: card.offsetHeight }
  const result = placeCoachmark({
    target: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    coach: coachSize,
    viewport,
    side: def.side,
  })
  placement.value = {
    ring: result.ring,
    coach: result.coach,
    side: result.side,
    arrowOffset: result.arrowOffset,
  }
  observeTarget(targetEl)
}

watch(activeHint, async (id) => {
  observeTarget(null)
  if (!id) {
    placement.value = null
    return
  }
  // Seed a placeholder so the popover element exists in the DOM (and can be
  // measured) before the real placement is computed — same chicken-and-egg
  // fix as the product tour's `start()` (see useProductTour.ts).
  placement.value = { ring: { left: 0, top: 0, width: 0, height: 0 }, coach: { left: 0, top: 0 }, side: FIRST_USE_HINTS[id].side, arrowOffset: {} }
  await nextTick()
  measure()
}, { immediate: true })

function onWindowReflow() {
  if (activeHint.value) measure()
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', onWindowReflow)
  window.addEventListener('scroll', onWindowReflow, true)
}

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', onWindowReflow)
    window.removeEventListener('scroll', onWindowReflow, true)
  }
  observeTarget(null)
})

function dismiss() {
  const id = activeHint.value
  if (!id) return
  void onboardingStore.dismissHint(id)
}

function disableAllHints() {
  void onboardingStore.setHintsEnabled(false)
}

// Esc only dismisses while focus is actually inside the popover — this
// handler is bound to the popover root, so it only ever fires from a
// keydown that bubbled up through one of its own descendants.
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    dismiss()
  }
}

const liveMessage = computed(() => (definition.value ? t(definition.value.titleKey) : ''))
</script>

<template>
  <Teleport to="body">
    <div v-if="activeHint && definition" class="hint-layer tw:fixed tw:inset-0 tw:z-nv-popover tw:pointer-events-none">
      <div
        v-if="placement"
        class="hint-ring tw:pointer-events-none tw:absolute tw:rounded-[var(--radius-md)] tw:outline tw:outline-2 tw:outline-accent tw:outline-offset-2 tw:transition-[left,top,width,height] tw:duration-[240ms] tw:ease-out tw:motion-reduce:transition-none"
        :style="{
          left: `${placement.ring.left}px`,
          top: `${placement.ring.top}px`,
          width: `${placement.ring.width}px`,
          height: `${placement.ring.height}px`,
        }"
      />

      <div
        v-if="placement"
        ref="popoverEl"
        class="hint-pop tw:pointer-events-auto tw:absolute tw:flex tw:w-[272px] tw:max-w-[calc(100vw-24px)] tw:flex-col tw:gap-1.5 tw:rounded-[var(--radius-lg)] tw:border tw:border-solid tw:border-transparent tw:bg-modal tw:p-3.5 tw:text-content-primary tw:shadow-nv-modal tw:outline-none tw:transition-[left,top] tw:duration-[240ms] tw:ease-out tw:motion-reduce:transition-none"
        :class="isMobileLayout && 'tw:[&_.nv-btn]:min-h-11'"
        :style="{ left: `${placement.coach.left}px`, top: `${placement.coach.top}px` }"
        role="dialog"
        aria-modal="false"
        aria-labelledby="hint-pop-title"
        aria-describedby="hint-pop-text"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <span
          class="hint-pop__arrow tw:absolute tw:h-3 tw:w-3 tw:rotate-45 tw:border tw:border-solid tw:border-transparent tw:bg-modal"
          :class="{
            'tw:left-[-7px]': placement.side === 'right',
            'tw:right-[-7px]': placement.side === 'left',
            'tw:top-[-7px]': placement.side === 'bottom',
            'tw:bottom-[-7px]': placement.side === 'top',
          }"
          :style="placement.side === 'right' || placement.side === 'left' ? { top: `${placement.arrowOffset.top ?? 20}px` } : { left: `${placement.arrowOffset.left ?? 20}px` }"
          aria-hidden="true"
        />

        <div class="hint-pop__top tw:flex tw:items-start tw:gap-2">
          <h3 id="hint-pop-title" class="tw:m-0 tw:flex-1 tw:text-[13px] tw:font-semibold tw:tracking-[-0.005em]">{{ t(definition.titleKey) }}</h3>
          <button
            type="button"
            class="nv-btn nv-btn--ghost nv-btn--icon tw:-mt-1 tw:-mr-1.5"
            :aria-label="t('common.close')"
            @click="dismiss"
          >
            <X :size="13" aria-hidden="true" />
          </button>
        </div>
        <p id="hint-pop-text" class="tw:m-0 tw:text-[12.5px] tw:leading-[1.5] tw:text-content-secondary">{{ t(definition.textKey) }}</p>
        <div class="hint-pop__actions tw:mt-0.5 tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
          <button type="button" class="nv-btn nv-btn--primary" @click="dismiss">{{ t('onboarding.hints.gotIt') }}</button>
          <button type="button" class="nv-btn nv-btn--ghost" @click="disableAllHints">{{ t('onboarding.hints.disable') }}</button>
        </div>
      </div>

      <div class="sr-only tw:absolute tw:h-px tw:w-px tw:overflow-hidden tw:whitespace-nowrap" style="clip: rect(0 0 0 0)" aria-live="polite">
        {{ liveMessage }}
      </div>
    </div>
  </Teleport>
</template>
