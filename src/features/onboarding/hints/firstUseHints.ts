import type { FirstUseHintId } from '../../../types/workspace'
import type { TourStepSide } from '../tour/tourSteps'

/** Static definition of a single first-use hint — one per screen (see docs/design/nevo-reference.html, "Подсказка при первом использовании"). */
export interface FirstUseHintDefinition {
  /** Matches a `data-hint="<target>"` attribute on a live element. */
  target: string
  /** Preferred side for the coachmark relative to the target; flips automatically when there isn't room (see `placeCoachmark`). */
  side: TourStepSide
  titleKey: string
  textKey: string
}

export const FIRST_USE_HINTS: Record<FirstUseHintId, FirstUseHintDefinition> = {
  editorCanvas: {
    target: 'editorCanvas',
    side: 'bottom',
    titleKey: 'onboarding.hints.editorCanvas.title',
    textKey: 'onboarding.hints.editorCanvas.text',
  },
  kanbanViews: {
    target: 'kanbanViews',
    side: 'bottom',
    titleKey: 'onboarding.hints.kanbanViews.title',
    textKey: 'onboarding.hints.kanbanViews.text',
  },
  graphFilters: {
    target: 'graphFilters',
    side: 'top',
    titleKey: 'onboarding.hints.graphFilters.title',
    textKey: 'onboarding.hints.graphFilters.text',
  },
  historyRestore: {
    target: 'historyRestore',
    side: 'bottom',
    titleKey: 'onboarding.hints.historyRestore.title',
    textKey: 'onboarding.hints.historyRestore.text',
  },
  canvasPresent: {
    target: 'canvasPresent',
    side: 'bottom',
    titleKey: 'onboarding.hints.canvasPresent.title',
    textKey: 'onboarding.hints.canvasPresent.text',
  },
}
