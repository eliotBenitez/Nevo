import { describe, expect, it } from 'vitest'
import { slashPreviewKind } from './slashBlockPreview'

describe('slashPreviewKind', () => {
  it.each([
    ['paragraph', 'text'], ['h1', 'heading-1'], ['h2', 'heading-2'], ['h3', 'heading-3'],
    ['h4', 'heading-4'], ['h5', 'heading-5'], ['h6', 'heading-6'], ['quote', 'quote'],
    ['callout', 'callout'], ['toggle', 'toggle'], ['ul', 'bullets'], ['ol', 'numbers'],
    ['checklist', 'checks'], ['code', 'code'], ['math', 'math'], ['math-inline', 'math-inline'],
    ['table', 'table'], ['database', 'database'], ['query', 'query'], ['image', 'image'],
    ['divider', 'divider'], ['embed', 'embed'], ['note-embed', 'note-embed'], ['emoji', 'emoji'], ['draw', 'draw'],
    ['audio', 'audio'], ['video', 'video'], ['file', 'file'], ['chart', 'chart'],
    ['mermaid', 'mermaid'], ['markmap', 'markmap'], ['insert-template', 'template'],
  ])('maps %s to %s', (id, kind) => {
    expect(slashPreviewKind(id)).toBe(kind)
  })

  it('maps voice-recording to audio', () => {
    expect(slashPreviewKind('voice-recording')).toBe('audio')
  })

  it.each(['ai-write', 'plugin:block'])('falls back for %s', id => {
    expect(slashPreviewKind(id)).toBeNull()
  })
})
