import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useOnboardingStore } from '../../../stores/onboarding'
import { useWorkspaceStore } from '../../../stores/workspace'
import { DESKTOP_TOUR_STEPS, MOBILE_TOUR_STEPS, type TourStep } from './tourSteps'
import { placeCoachmark, type Rect } from './tourPlacement'

export type TourCardKind = 'welcome' | 'spotlight' | 'done'

export interface TourPlacement {
  kind: TourCardKind
  step: TourStep | null
  stepNumber: number
  totalSteps: number
  ring: Rect | null
  coach: { left: number; top: number }
  side: TourStep['side'] | null
  arrowOffset: { top?: number; left?: number }
}

export interface UseProductTourOptions {
  /** Element the coachmark card renders into — measured for placement. */
  coachEl: Ref<HTMLElement | null>
  /** True while the mobile shell (bottom nav, no sidebar) is what's actually rendered. */
  isMobileLayout: Ref<boolean>
  /** Navigates to the starter note; called by the "Open Getting started" action. */
  onOpenStarterNote: () => void
}

function findTargetEl(target: string): HTMLElement | null {
  // `target` always comes from the static step tables in tourSteps.ts (never
  // user input), so a plain attribute selector is safe without CSS.escape.
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
}

function isVisible(el: HTMLElement | null): boolean {
  if (!el) return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function useProductTour(options: UseProductTourOptions) {
  const onboardingStore = useOnboardingStore()
  const workspaceStore = useWorkspaceStore()

  // 0 = welcome card, 1..activeSteps.length = spotlight steps, length+1 = done card.
  const stepIndex = ref(0)
  // Snapshot of steps whose target existed when the tour opened — keeps "Step i
  // of N" numbering stable even if a step is skipped later (target vanished).
  const activeSteps = ref<TourStep[]>([])
  const placement = ref<TourPlacement | null>(null)
  let resizeObserver: ResizeObserver | null = null
  let targetResizeObserver: ResizeObserver | null = null
  let observedTarget: HTMLElement | null = null

  const active = computed(() => onboardingStore.tourActive)
  const totalSteps = computed(() => activeSteps.value.length)
  const kind = computed<TourCardKind>(() => {
    if (stepIndex.value <= 0) return 'welcome'
    if (stepIndex.value > totalSteps.value) return 'done'
    return 'spotlight'
  })
  const currentStep = computed<TourStep | null>(() =>
    kind.value === 'spotlight' ? activeSteps.value[stepIndex.value - 1] ?? null : null,
  )

  const reducedMotion = computed(() => {
    const setting = workspaceStore.appConfig.reducedMotion
    if (setting === 'reduce') return true
    if (setting === 'full') return false
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  function stepList(): TourStep[] {
    return options.isMobileLayout.value ? MOBILE_TOUR_STEPS : DESKTOP_TOUR_STEPS
  }

  function observeTarget(step: TourStep | null) {
    const el = step ? findTargetEl(step.target) : null
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
    const coachEl = options.coachEl.value
    if (!coachEl || !active.value) return
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const coachSize = { width: coachEl.offsetWidth, height: coachEl.offsetHeight }

    if (kind.value !== 'spotlight') {
      placement.value = {
        kind: kind.value,
        step: null,
        stepNumber: 0,
        totalSteps: totalSteps.value,
        ring: null,
        coach: {
          left: Math.round((viewport.width - coachSize.width) / 2),
          top: Math.round((viewport.height - coachSize.height) / 2),
        },
        side: null,
        arrowOffset: {},
      }
      observeTarget(null)
      return
    }

    const step = currentStep.value
    if (!step) return
    const targetEl = findTargetEl(step.target)
    if (!isVisible(targetEl)) {
      // The target vanished after the tour opened (e.g. sidebar collapsed
      // mid-tour) — drop it and re-measure the step that takes its place.
      activeSteps.value = activeSteps.value.filter(s => s.id !== step.id)
      stepIndex.value = Math.min(stepIndex.value, totalSteps.value + 1)
      nextTick(measure)
      return
    }
    observeTarget(step)
    const rect = targetEl!.getBoundingClientRect()
    const result = placeCoachmark({
      target: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      coach: coachSize,
      viewport,
      side: step.side,
    })
    placement.value = {
      kind: 'spotlight',
      step,
      stepNumber: stepIndex.value,
      totalSteps: totalSteps.value,
      ring: result.ring,
      coach: result.coach,
      side: result.side,
      arrowOffset: result.arrowOffset,
    }
  }

  function scheduleMeasure() {
    nextTick(measure)
  }

  function goTo(index: number) {
    stepIndex.value = Math.max(0, Math.min(totalSteps.value + 1, index))
    scheduleMeasure()
  }

  function next() {
    goTo(stepIndex.value + 1)
  }

  function prev() {
    goTo(stepIndex.value - 1)
  }

  /** Ends the tour: "completed" once the user has reached the final card, "dismissed" for any earlier exit. */
  function close() {
    if (kind.value === 'done') void onboardingStore.completeTour()
    else void onboardingStore.dismissTour()
  }

  function openStarterNoteAndFinish() {
    void onboardingStore.completeTour()
    options.onOpenStarterNote()
  }

  function start() {
    activeSteps.value = stepList().filter(step => isVisible(findTargetEl(step.target)))
    stepIndex.value = 0
    // Seed a sane default before the first measure() pass: the coachmark
    // must render (and exist in the DOM) before it can be measured, so the
    // overlay renders it as soon as the tour is active rather than waiting
    // on `placement` — this avoids a render/measure chicken-and-egg gap.
    placement.value = {
      kind: 'welcome',
      step: null,
      stepNumber: 0,
      totalSteps: activeSteps.value.length,
      ring: null,
      coach: { left: 0, top: 0 },
      side: null,
      arrowOffset: {},
    }
    scheduleMeasure()
  }

  function stop() {
    observeTarget(null)
    placement.value = null
  }

  watch(active, (isActive) => {
    if (isActive) start()
    else stop()
  }, { immediate: true })

  function onWindowResize() {
    if (active.value) measure()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onWindowResize)
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => { if (active.value) measure() })
  }
  watch(() => options.coachEl.value, (el) => {
    resizeObserver?.disconnect()
    if (el) resizeObserver?.observe(el)
    scheduleMeasure()
  })

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', onWindowResize)
    resizeObserver?.disconnect()
    targetResizeObserver?.disconnect()
  })

  return {
    active,
    kind,
    stepIndex,
    totalSteps,
    currentStep,
    placement,
    reducedMotion,
    next,
    prev,
    close,
    openStarterNoteAndFinish,
    measure,
  }
}
