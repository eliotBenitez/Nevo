import { describe, expect, it } from 'vitest'
import { joinDictatedText, splitSpokenCommands } from './dictatedText'

describe('joinDictatedText', () => {
  it('adds no space at the block start', () => {
    expect(joinDictatedText('', '  hello ')).toBe('hello')
  })

  it('prefixes a single space after a word', () => {
    expect(joinDictatedText('Hello', ' world')).toBe(' world')
  })

  it('adds no space after whitespace or an opening bracket or quote', () => {
    for (const before of ['Hello ', 'a(', 'a[', 'a{', 'a«', 'a"', "a'"]) {
      expect(joinDictatedText(before, 'x')).toBe('x')
    }
  })

  it('never puts a space before punctuation', () => {
    for (const chunk of [', and', '. Next', '!', '?', ': list', '; more']) {
      expect(joinDictatedText('word', chunk)).toBe(chunk.trim())
    }
  })

  it('returns an empty string for a blank chunk', () => {
    expect(joinDictatedText('word', '   ')).toBe('')
  })
})

describe('splitSpokenCommands', () => {
  it('returns plain text as one op', () => {
    expect(splitSpokenCommands(' Just text. ')).toEqual([{ kind: 'text', text: 'Just text.' }])
  })

  it('recognizes commands in every supported language, case-insensitively', () => {
    for (const command of ['Новый абзац', 'NEW PARAGRAPH', 'neuer Absatz', 'Nouveau paragraphe', 'Nuevo párrafo']) {
      expect(splitSpokenCommands(`One. ${command}. Two`)).toEqual([
        { kind: 'text', text: 'One.' },
        { kind: 'paragraph' },
        { kind: 'text', text: 'Two' },
      ])
    }
  })

  it('drops empty text around commands', () => {
    expect(splitSpokenCommands('new paragraph! new paragraph')).toEqual([{ kind: 'paragraph' }, { kind: 'paragraph' }])
  })

  it('matches a decomposed accent', () => {
    expect(splitSpokenCommands('nuevo párrafo')).toEqual([{ kind: 'paragraph' }])
  })

  it('does not match inside other words', () => {
    expect(splitSpokenCommands('renew paragraphs')).toEqual([{ kind: 'text', text: 'renew paragraphs' }])
  })
})
