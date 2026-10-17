import { describe, expect, it } from 'vitest'
import { freeOpenRouterModels, isOpenRouterUrl, OPENROUTER_BASE_URL } from './openrouter'

describe('isOpenRouterUrl', () => {
  it.each([
    [OPENROUTER_BASE_URL, true],
    ['https://OpenRouter.ai/api/v1/', true],
    ['https://openrouter.ai.evil.com/v1', false],
    ['http://localhost:1234/v1', false],
    ['not a url', false],
  ])('%s', (url, expected) => {
    expect(isOpenRouterUrl(url)).toBe(expected)
  })
})

describe('freeOpenRouterModels', () => {
  it('keeps only :free variants, sorted', () => {
    expect(freeOpenRouterModels([
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-r1:free',
      'deepseek/deepseek-r1',
    ])).toEqual(['deepseek/deepseek-r1:free', 'meta-llama/llama-3.3-70b-instruct:free'])
  })
})
