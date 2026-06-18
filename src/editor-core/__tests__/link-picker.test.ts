import { describe, expect, it } from 'vitest'
import { parseWikiQuery } from '../link-picker'

describe('parseWikiQuery', () => {
  it('parses a plain title', () => {
    expect(parseWikiQuery('Meeting Notes')).toEqual({
      noteTitle: 'Meeting Notes',
      anchor: null,
      alias: null,
    })
  })

  it('trims the title', () => {
    expect(parseWikiQuery('  Spaces  ')).toEqual({
      noteTitle: 'Spaces',
      anchor: null,
      alias: null,
    })
  })

  it('parses a title with an anchor (#)', () => {
    expect(parseWikiQuery('Note#Agenda')).toEqual({
      noteTitle: 'Note',
      anchor: 'Agenda',
      alias: null,
    })
  })

  it('trims the anchor', () => {
    expect(parseWikiQuery('Note#  Agenda  ')).toEqual({
      noteTitle: 'Note',
      anchor: 'Agenda',
      alias: null,
    })
  })

  it('parses a title with an alias (|)', () => {
    expect(parseWikiQuery('Note|the alias')).toEqual({
      noteTitle: 'Note',
      anchor: null,
      alias: 'the alias',
    })
  })

  it('parses the full form Note#Anchor|Alias', () => {
    expect(parseWikiQuery('Note#Section|Display')).toEqual({
      noteTitle: 'Note',
      anchor: 'Section',
      alias: 'Display',
    })
  })

  it('returns empty title for a blank query', () => {
    expect(parseWikiQuery('')).toEqual({ noteTitle: '', anchor: null, alias: null })
    expect(parseWikiQuery('   ')).toEqual({ noteTitle: '', anchor: null, alias: null })
  })

  it('treats an empty alias after the pipe as null', () => {
    expect(parseWikiQuery('Note|')).toEqual({ noteTitle: 'Note', anchor: null, alias: null })
  })

  it('treats an empty anchor after the hash as null', () => {
    expect(parseWikiQuery('Note#')).toEqual({ noteTitle: 'Note', anchor: null, alias: null })
  })
})
