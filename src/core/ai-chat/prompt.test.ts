import { describe, expect, it } from 'vitest'
import { buildChatPrompt, fitSources, type ChatSource } from './prompt'

const src = (n: number, text = 'x', extra: Partial<ChatSource> = {}): ChatSource =>
  ({ n, noteId: `n${n}`, noteTitle: `Note ${n}`, blockIndex: n, text, ...extra })

const base = { question: 'What?', history: [], sources: [src(1, 'alpha'), src(2, 'beta')], locale: 'en' }

describe('buildChatPrompt', () => {
  it('numbers sources with their citation number and title', () => {
    const { prompt } = buildChatPrompt(base)
    expect(prompt).toContain('[1] Note 1\nalpha')
    expect(prompt).toContain('[2] Note 2\nbeta')
    expect(prompt).toContain('What?')
  })

  it('keeps only the last 6 history turns', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, text: `turn-${i}` }))
    const { prompt } = buildChatPrompt({ ...base, history })
    expect(prompt).not.toContain('turn-3')
    expect(prompt).toContain('turn-4')
    expect(prompt).toContain('turn-9')
  })

  it('adds the selection instruction only when a selection is given', () => {
    expect(buildChatPrompt(base).system).not.toContain('rewrite')
    const withSel = buildChatPrompt({ ...base, selection: 'pick me' })
    expect(withSel.system).toContain('rewrite')
    expect(withSel.prompt).toContain('pick me')
  })

  it('drops lowest-ranked sources over budget but never the current note', () => {
    const big = 'a'.repeat(7000)
    const sources = [src(1, big, { current: true }), src(2, big), src(3, big)]
    expect(fitSources(sources).map(s => s.n)).toEqual([1])
    const mixed = [src(1, 'a'.repeat(5000)), src(2, 'b'.repeat(5000)), src(3, 'c'.repeat(5000))]
    expect(fitSources(mixed).map(s => s.n)).toEqual([1, 2])
    expect(fitSources([src(1, big), src(2, big, { current: true })]).map(s => s.n)).toEqual([2])
  })

  it('says sources are empty when none remain', () => {
    expect(buildChatPrompt({ ...base, sources: [] }).prompt).toContain('Sources: none')
  })
})
