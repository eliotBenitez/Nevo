import { describe, expect, it } from 'vitest'
import { createTranslator } from './i18n'
import {
  createPluginTranslator,
  sanitizePluginMessages,
} from '../../../src/editor-core/plugin-host/pluginTranslator'

type Params = Record<string, string | number> | undefined
const cases: Array<[Record<string, string>, string, Params, string]> = [
  [{ hi: 'Hello' }, 'hi', undefined, 'Hello'],
  [{ hi: 'Hello {name}, {n} left' }, 'hi', { name: 'Bo', n: 3 }, 'Hello Bo, 3 left'],
  [{ hi: 'Hello {name} {other}' }, 'hi', { name: 'Bo' }, 'Hello Bo {other}'],
  [{}, 'missing.key', undefined, 'missing.key'],
  [{}, 'toString', undefined, 'toString'],
  [{ hi: '{a}{a}' }, 'hi', { a: 1 }, '11'],
]

// The worker cannot import the SDK, so both copies must agree on every case.
describe.each([
  ['sdk createTranslator', createTranslator],
  ['host createPluginTranslator', createPluginTranslator],
])('%s', (_name, create) => {
  it.each(cases)('translates %j %s', (messages, key, params, expected) => {
    expect(create(messages, 'ru').t(key, params)).toBe(expected)
  })

  it('exposes a frozen locale', () => {
    const translator = create({}, 'ru')
    expect(translator.locale).toBe('ru')
    expect(Object.isFrozen(translator)).toBe(true)
  })
})

describe('sanitizePluginMessages', () => {
  it('keeps only string values and caps the key count', () => {
    expect(sanitizePluginMessages({ a: 'x', b: 1, c: null })).toEqual({ a: 'x' })
    expect(sanitizePluginMessages([1])).toEqual({})
    expect(sanitizePluginMessages(null)).toEqual({})
    const big = Object.fromEntries(Array.from({ length: 2500 }, (_, i) => [`k${i}`, 'v']))
    expect(Object.keys(sanitizePluginMessages(big))).toHaveLength(2000)
  })
})
