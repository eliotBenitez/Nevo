// vue-i18n maps two-form messages to choices 1/2, while Russian uses all three slots.
// src/i18n.ts registers no `pluralRules`, so callers resolve the choice by hand using
// Intl.PluralRules and this mapping.
export function pluralChoice(locale: string, count: number): number {
  const category = new Intl.PluralRules(locale).select(count)
  return locale === 'ru'
    ? category === 'one' ? 0 : category === 'few' ? 1 : 2
    : category === 'one' ? 1 : 2
}
