import { describe, expect, it } from 'vitest'
import { classifyAiError, describeEndpoint } from './endpoint'

describe('describeEndpoint', () => {
  it.each([
    ['http://localhost:11434', true, 'localhost'],
    ['http://127.0.0.5:8080/v1', true, '127.0.0.5'],
    ['http://[::1]:11434', true, '::1'],
    ['https://example.com', false, 'example.com'],
    ['not a url', false, ''],
  ])('%s', (url, local, host) => {
    expect(describeEndpoint(url)).toEqual({ local, host })
  })
})

describe('classifyAiError', () => {
  it('detects privacy mode', () => {
    expect(classifyAiError('AI privacy mode blocks non-local endpoints')).toBe('privacy')
  })

  it.each(['Connection refused', 'error sending request for url', 'tcp connect error', 'operation timed out', 'dns error'])('offline: %s', (msg) => {
    expect(classifyAiError(msg)).toBe('offline')
  })

  it('falls back to other', () => {
    expect(classifyAiError('model not found')).toBe('other')
  })
})
