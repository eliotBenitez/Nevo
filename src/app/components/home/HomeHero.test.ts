import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import de from '../../../locales/de.json'
import en from '../../../locales/en.json'
import ru from '../../../locales/ru.json'
import HomeHero from './HomeHero.vue'

// `workspace.home.meta` is the only pluralized key in the catalogs, and no
// `pluralRules` are registered in src/i18n.ts — the component compensates by hand.
// Russian needs three forms where every other locale needs two, so these cases are
// what keeps that compensation honest.
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en, ru, de } })

function metaText(locale: 'en' | 'ru' | 'de', noteCount: number) {
  i18n.global.locale.value = locale
  const wrapper = mount(HomeHero, {
    global: { plugins: [i18n] },
    props: { workspaceName: 'Atelier', searchShortcut: 'Ctrl+P', noteCount, workspaceBytes: 1024 },
  })
  return wrapper.get('.workspace-home__meta').text()
}

describe('HomeHero meta line', () => {
  it('selects all three Russian plural forms', () => {
    expect(metaText('ru', 1)).toContain('заметка')
    expect(metaText('ru', 3)).toContain('заметки')
    expect(metaText('ru', 7)).toContain('заметок')
    expect(metaText('ru', 11)).toContain('заметок')
    expect(metaText('ru', 22)).toContain('заметки')
  })

  it('selects both forms in two-form locales, including zero', () => {
    expect(metaText('en', 0)).toContain('0 notes')
    expect(metaText('en', 1)).toContain('1 note ·')
    expect(metaText('en', 5)).toContain('5 notes')
    expect(metaText('de', 1)).toContain('1 Notiz ·')
    expect(metaText('de', 4)).toContain('4 Notizen')
  })

  it('renders no meta line until both diagnostics are known', () => {
    i18n.global.locale.value = 'en'
    const wrapper = mount(HomeHero, {
      global: { plugins: [i18n] },
      props: { workspaceName: 'Atelier', searchShortcut: 'Ctrl+P', noteCount: 3 },
    })
    expect(wrapper.find('.workspace-home__meta').exists()).toBe(false)
  })
})
