import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FirstStepId, FirstUseHintId, OnboardingState } from '../types/workspace'
import { useWorkspaceStore } from './workspace'

const TOTAL_FIRST_STEPS = 5

export const useOnboardingStore = defineStore('onboarding', () => {
  // In-memory only: whether the product tour overlay is currently shown, and
  // the id of the starter note created for this workspace (if any). Neither
  // is persisted — the tour's persisted state is `tourStatus` on
  // `workspaceStore.appConfig.onboarding`, and the starter note is found
  // again through the note tree, not through this id.
  const tourActive = ref(false)
  const starterNoteId = ref<string | null>(null)
  // The first-use hint currently shown (in-memory only, at most one at a
  // time). Which hints have been seen/dismissed is persisted separately in
  // `onboarding.seenHints`.
  const activeHint = ref<FirstUseHintId | null>(null)

  const workspaceStore = useWorkspaceStore()

  const onboarding = computed<OnboardingState>(() => workspaceStore.appConfig.onboarding)
  const tourStatus = computed(() => onboarding.value.tourStatus)
  const hintsEnabled = computed(() => onboarding.value.hintsEnabled)

  const completedFirstSteps = computed<FirstStepId[]>(() => {
    const completed = new Set<FirstStepId>(onboarding.value.firstSteps)
    // Detected implicitly rather than persisted as discrete events.
    completed.add('createWorkspace')
    if (tourStatus.value === 'completed') completed.add('takeTour')
    return Array.from(completed)
  })

  const firstStepsVisible = computed(() =>
    !onboarding.value.firstStepsHidden && completedFirstSteps.value.length < TOTAL_FIRST_STEPS,
  )

  function maybeStartTour() {
    if (tourStatus.value !== 'pending') return
    tourActive.value = true
  }

  function startTour() {
    tourActive.value = true
    // The guided tour and a first-use hint must never overlap on screen.
    activeHint.value = null
  }

  async function completeTour() {
    tourActive.value = false
    await workspaceStore.saveAppConfig({ onboarding: { ...onboarding.value, tourStatus: 'completed' } })
  }

  async function dismissTour() {
    tourActive.value = false
    // Closing a replay early must not undo an earlier completion.
    if (tourStatus.value === 'completed') return
    await workspaceStore.saveAppConfig({ onboarding: { ...onboarding.value, tourStatus: 'dismissed' } })
  }

  async function markFirstStep(id: FirstStepId) {
    if (onboarding.value.firstSteps.includes(id)) return
    await workspaceStore.saveAppConfig({
      onboarding: { ...onboarding.value, firstSteps: [...onboarding.value.firstSteps, id] },
    })
  }

  async function setFirstStepsHidden(hidden: boolean) {
    if (onboarding.value.firstStepsHidden === hidden) return
    await workspaceStore.saveAppConfig({ onboarding: { ...onboarding.value, firstStepsHidden: hidden } })
  }

  function setStarterNoteId(id: string | null) {
    starterNoteId.value = id
  }

  /**
   * Requests to show a first-use hint. Returns whether it was actually
   * activated — refused when hints are disabled, this hint was already
   * seen, the guided tour is active, or another hint is already showing (one
   * hint on screen at a time).
   */
  function requestHint(id: FirstUseHintId): boolean {
    if (!hintsEnabled.value) return false
    if (onboarding.value.seenHints.includes(id)) return false
    if (tourActive.value) return false
    if (activeHint.value !== null) return false
    activeHint.value = id
    return true
  }

  /** Marks a hint as seen (idempotent — a single save) and clears it if active. */
  async function dismissHint(id: FirstUseHintId) {
    if (activeHint.value === id) activeHint.value = null
    if (onboarding.value.seenHints.includes(id)) return
    await workspaceStore.saveAppConfig({
      onboarding: { ...onboarding.value, seenHints: [...onboarding.value.seenHints, id] },
    })
  }

  /** Same as `dismissHint`, but only when `id` is the currently active hint — used when the user finds the feature on their own (e.g. clicks the target) rather than dismissing the popover. */
  async function releaseHint(id: FirstUseHintId) {
    if (activeHint.value !== id) return
    await dismissHint(id)
  }

  /** Clears the active hint without marking it seen — used when its target vanishes from the screen (e.g. navigation away) rather than being dismissed or discovered. */
  function cancelHint(id: FirstUseHintId) {
    if (activeHint.value === id) activeHint.value = null
  }

  async function setHintsEnabled(enabled: boolean) {
    if (!enabled) activeHint.value = null
    if (onboarding.value.hintsEnabled === enabled) return
    await workspaceStore.saveAppConfig({ onboarding: { ...onboarding.value, hintsEnabled: enabled } })
  }

  return {
    tourActive,
    starterNoteId,
    activeHint,
    tourStatus,
    hintsEnabled,
    completedFirstSteps,
    firstStepsVisible,
    maybeStartTour,
    startTour,
    completeTour,
    dismissTour,
    markFirstStep,
    setFirstStepsHidden,
    setStarterNoteId,
    requestHint,
    dismissHint,
    releaseHint,
    cancelHint,
    setHintsEnabled,
  }
})
