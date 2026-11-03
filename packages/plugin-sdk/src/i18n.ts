export type PluginMessages = Record<string, string>

export interface PluginTranslator {
  readonly locale: string
  t(key: string, params?: Record<string, string | number>): string
}

const PLACEHOLDER = /\{([A-Za-z0-9_.-]+)\}/g

/** Pure translator over a resolved catalog. Keep in sync with the host copy in `src/editor-core/plugin-host/pluginTranslator.ts`. */
export function createTranslator(messages: PluginMessages, locale: string): PluginTranslator {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(messages, key)
  return Object.freeze({
    locale,
    t(key: string, params?: Record<string, string | number>): string {
      const template = has(key) ? messages[key] : undefined
      if (typeof template !== 'string') return key
      if (!params) return template
      return template.replace(PLACEHOLDER, (match, name: string) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match)
    },
  })
}
