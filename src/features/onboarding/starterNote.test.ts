import { describe, expect, it } from 'vitest'
import { nevoBaseSchema } from '../../editor-core/schema'
import { buildStarterNoteContent, STARTER_NOTE_ICON } from './starterNote'

describe('buildStarterNoteContent', () => {
  it('produces a document that is valid against the editor schema', () => {
    const content = buildStarterNoteContent(key => key)

    expect(() => nevoBaseSchema.nodeFromJSON(content).check()).not.toThrow()
  })

  it('routes every piece of body text through the translate function', () => {
    const seen: string[] = []
    buildStarterNoteContent((key) => {
      seen.push(key)
      return key
    })

    expect(seen).toEqual([
      'onboarding.starterNote.intro',
      'onboarding.starterNote.callout',
      'onboarding.starterNote.checklistCheck',
      'onboarding.starterNote.checklistLink',
      'onboarding.starterNote.checklistGraph',
      'onboarding.starterNote.closing',
    ])
  })

  it('checks off exactly the first checklist item', () => {
    const content = buildStarterNoteContent(key => key)
    const checklistItems = (content.content ?? []).filter(node => node.type === 'checklist_item')

    expect(checklistItems).toHaveLength(3)
    expect(checklistItems.map(item => item.attrs?.checked)).toEqual([true, false, false])
  })

  it('exposes a fixed starter note icon', () => {
    expect(STARTER_NOTE_ICON).toBe('🎓')
  })
})
