import { describe, expect, it } from 'vitest'
import { readAudioTranscript } from './audioTranscript'

describe('audio transcript', () => {
  it('accepts timestamped speech and discards invalid or unsafe entries', () => {
    expect(readAudioTranscript([
      { start: 1.2, end: 2.3, text: ' Hello ', extra: 'ignored' },
      { start: -1, end: 3, text: 'bad' },
      { start: 1, end: 0, text: 'backwards' },
      { start: 1, end: 2, text: '' },
      { start: 0, end: 2, text: '<script>' },
    ])).toEqual([
      { start: 1.2, end: 2.3, text: 'Hello' },
      { start: 0, end: 2, text: '<script>' },
    ])
    expect(readAudioTranscript('wrong')).toEqual([])
  })
})
