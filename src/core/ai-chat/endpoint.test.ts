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

  it.each([
    ['HTTP status client error (429 Too Many Requests) for url (https://openrouter.ai/api/v1/chat/completions)', 'rateLimit'],
    ['HTTP status client error (401 Unauthorized) for url (https://openrouter.ai/api/v1/chat/completions)', 'auth'],
    ['HTTP status client error (403 Forbidden) for url (https://api.groq.com/openai/v1/models)', 'auth'],
  ])('%s', (msg, kind) => {
    expect(classifyAiError(msg)).toBe(kind)
  })

  it('does not treat other numbers as status codes', () => {
    expect(classifyAiError('model qwen-4013b not found')).toBe('other')
  })

  it('falls back to other', () => {
    expect(classifyAiError('model not found')).toBe('other')
  })
})
