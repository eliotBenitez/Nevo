import { createI18n } from 'vue-i18n'
import type { AppLocale } from './types/workspace'
import en from './locales/en.json'
import ru from './locales/ru.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import de from './locales/de.json'

export const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'en',
  messages: { en, ru, fr, es, de },
})

export function applyAppLocale(locale: AppLocale) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}
