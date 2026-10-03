export type TourStepSide = 'top' | 'right' | 'bottom' | 'left'

/**
 * A single spotlight step of the product tour. `target` matches a
 * `data-tour="<target>"` attribute on a live shell element — the tour never
 * renders a screenshot, only a ring + coachmark around the real element.
 */
export interface TourStep {
  id: string
  target: string
  side: TourStepSide
  titleKey: string
  textKey: string
}

// Desktop shell: sidebar "New note" -> pages tree -> titlebar search -> the
// starter note row on Home -> the Graph nav item. Order matches the visual
// reference (docs/design/nevo-reference.html, #tour).
export const DESKTOP_TOUR_STEPS: TourStep[] = [
  {
    id: 'new-note',
    target: 'new-note',
    side: 'right',
    titleKey: 'onboarding.tour.steps.newNote.title',
    textKey: 'onboarding.tour.steps.newNote.text',
  },
  {
    id: 'tree',
    target: 'tree',
    side: 'right',
    titleKey: 'onboarding.tour.steps.tree.title',
    textKey: 'onboarding.tour.steps.tree.text',
  },
  {
    id: 'search',
    target: 'search',
    side: 'bottom',
    titleKey: 'onboarding.tour.steps.search.title',
    textKey: 'onboarding.tour.steps.search.text',
  },
  {
    id: 'starter',
    target: 'starter',
    side: 'right',
    titleKey: 'onboarding.tour.steps.starter.title',
    textKey: 'onboarding.tour.steps.starter.text',
  },
  {
    id: 'graph',
    target: 'graph',
    side: 'right',
    titleKey: 'onboarding.tour.steps.graph.title',
    textKey: 'onboarding.tour.steps.graph.text',
  },
]

// Mobile shell has no sidebar; steps point at the bottom navigation instead.
export const MOBILE_TOUR_STEPS: TourStep[] = [
  {
    id: 'mobile-notes',
    target: 'mobile-notes',
    side: 'top',
    titleKey: 'onboarding.tour.steps.mobileNotes.title',
    textKey: 'onboarding.tour.steps.mobileNotes.text',
  },
  {
    id: 'mobile-search',
    target: 'mobile-search',
    side: 'top',
    titleKey: 'onboarding.tour.steps.mobileSearch.title',
    textKey: 'onboarding.tour.steps.mobileSearch.text',
  },
  {
    id: 'mobile-boards',
    target: 'mobile-boards',
    side: 'top',
    titleKey: 'onboarding.tour.steps.mobileBoards.title',
    textKey: 'onboarding.tour.steps.mobileBoards.text',
  },
]
