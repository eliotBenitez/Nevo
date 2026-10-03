/**
 * Starter structure created for each onboarding workspace template.
 * Framework-agnostic so it can be shared between the desktop wizard, the
 * mobile flow, and the live preview aside without pulling in Vue.
 */

export const WORKSPACE_TEMPLATES = ['empty', 'researcher', 'pm', 'writer'] as const
export type WorkspaceTemplateId = typeof WORKSPACE_TEMPLATES[number]

export interface WorkspaceTemplateStarterItem {
  kind: 'folder' | 'note'
  /** Suffix appended to `onboarding.create.templates.<template>.starter.` for the i18n key. */
  key: string
  emoji: string
}

// Order and content must stay identical to what `create()` in
// CreateWorkspaceView.vue used to create inline — this is a lossless
// extraction, not a redesign of the starter structure.
export const WORKSPACE_TEMPLATE_STARTERS: Record<WorkspaceTemplateId, WorkspaceTemplateStarterItem[]> = {
  empty: [],
  researcher: [
    { kind: 'folder', key: 'litReview', emoji: '📚' },
    { kind: 'folder', key: 'journals', emoji: '📖' },
    { kind: 'note', key: 'ideas', emoji: '💡' },
  ],
  pm: [
    { kind: 'folder', key: 'roadmaps', emoji: '🗺️' },
    { kind: 'folder', key: 'specs', emoji: '📝' },
    { kind: 'note', key: 'notes', emoji: '📋' },
  ],
  writer: [
    { kind: 'folder', key: 'drafts', emoji: '✍️' },
    { kind: 'folder', key: 'characters', emoji: '🎭' },
    { kind: 'note', key: 'ideas', emoji: '💡' },
  ],
}
