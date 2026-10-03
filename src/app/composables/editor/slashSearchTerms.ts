import type { NevoSlashItem } from '../../../types/editor-plugin'
import { i18n } from '../../../i18n'

export function getSlashSearchTerms(item: NevoSlashItem): string[] {
  const key = `slashMenu.items.${item.id.replace(/-/g, '_')}`
  const locale = i18n.global.locale.value
  const hasTranslation = typeof i18n.global.te === 'function'
    ? i18n.global.te(key, locale)
    : i18n.global.t(key) !== key
  return hasTranslation ? [i18n.global.t(key)] : []
}
