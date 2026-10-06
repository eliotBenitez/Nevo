import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '../../i18n'
import { pluralChoice } from '../../utils/plural-index'

// Mirrors GraphView/GraphControls. A `count` (or `n`) named arg would override the
// explicit plural choice in vue-i18n, so the counters interpolate `total` instead.
function label(key: 'graph.nodeCount' | 'graph.edgeCount', locale: string, value: number) {
  i18n.global.locale.value = locale as typeof i18n.global.locale.value
  return i18n.global.t(key, pluralChoice(locale, value), { named: { total: value } })
}

describe('graph count labels', () => {
  const initialLocale = i18n.global.locale.value
  afterEach(() => { i18n.global.locale.value = initialLocale })

  it('uses all three Russian plural forms', () => {
    expect(label('graph.nodeCount', 'ru', 1)).toBe('1 узел')
    expect(label('graph.nodeCount', 'ru', 4)).toBe('4 узла')
    expect(label('graph.nodeCount', 'ru', 5)).toBe('5 узлов')
    expect(label('graph.edgeCount', 'ru', 0)).toBe('0 рёбер')
    expect(label('graph.edgeCount', 'ru', 2)).toBe('2 ребра')
    expect(label('graph.edgeCount', 'ru', 21)).toBe('21 ребро')
  })

  it('uses singular and plural in English', () => {
    expect(label('graph.nodeCount', 'en', 1)).toBe('1 node')
    expect(label('graph.edgeCount', 'en', 3)).toBe('3 edges')
  })
})
