import type { BlockNode } from '../../types/note'

/** Icon assigned to the "Getting started" note created for every new workspace. */
export const STARTER_NOTE_ICON = '🎓'

/**
 * Content for the "Getting started" note dropped into every new workspace
 * (including the `empty` template) — a real, editable note rather than a
 * modal, so the tour can point at it and its blocks demonstrate the editor
 * inline. `t` is the caller's i18n translate function; kept framework-agnostic
 * so this can be shared between the desktop wizard and the mobile flow.
 */
export function buildStarterNoteContent(t: (key: string) => string): BlockNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: t('onboarding.starterNote.intro') }],
      },
      {
        type: 'callout',
        attrs: { variant: 'info', icon: '💡' },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: t('onboarding.starterNote.callout') }],
          },
        ],
      },
      {
        type: 'checklist_item',
        attrs: { checked: true },
        content: [{ type: 'text', text: t('onboarding.starterNote.checklistCheck') }],
      },
      {
        type: 'checklist_item',
        attrs: { checked: false },
        content: [{ type: 'text', text: t('onboarding.starterNote.checklistLink') }],
      },
      {
        type: 'checklist_item',
        attrs: { checked: false },
        content: [{ type: 'text', text: t('onboarding.starterNote.checklistGraph') }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: t('onboarding.starterNote.closing') }],
      },
    ],
  }
}
