import { describe, expect, it } from 'vitest'
import { noteContextText } from './noteText'

describe('noteContextText', () => {
  it('includes text kept in block attributes, such as audio transcripts', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
        { type: 'media_block', attrs: { kind: 'audio', src: '.nevo/assets/a.m4a', name: 'Voice memo', transcript: [{ start: 0, end: 3, text: 'Patches go to the maintainer' }] } },
      ],
    }
    const text = noteContextText('Edits', content)
    expect(text).toContain('Intro')
    expect(text).toContain('Voice memo')
    expect(text).toContain('Patches go to the maintainer')
  })

  it('drops plugin markers and runs of blank lines', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph' },
        { type: 'some_plugin_node', attrs: { x: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inside' }] }] },
      ],
    }
    const text = noteContextText('T', content)
    expect(text).not.toContain('nevo-plugin-node')
    expect(text).not.toMatch(/\n{3,}/)
    expect(text).toContain('inside')
  })
})
