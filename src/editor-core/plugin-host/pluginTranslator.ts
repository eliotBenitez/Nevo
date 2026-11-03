export const MAX_PLUGIN_MESSAGE_KEYS = 2000

export interface PluginTranslator {
  readonly locale: string
  t(key: string, params?: Record<string, string | number>): string
}

const PLACEHOLDER = /\{([A-Za-z0-9_.-]+)\}/g

/** Same algorithm as `createTranslator` in `packages/plugin-sdk/src/i18n.ts` (the worker cannot import the SDK package). */
export function createPluginTranslator(
  messages: Record<string, string>,
  locale: string,
): PluginTranslator {
  const has = (source: object, key: string) => Object.prototype.hasOwnProperty.call(source, key)
  return Object.freeze({
    locale,
    t(key: string, params?: Record<string, string | number>): string {
      const template = has(messages, key) ? messages[key] : undefined
      if (typeof template !== 'string') return key
      if (!params) return template
      return template.replace(PLACEHOLDER, (match, name: string) =>
        has(params, name) ? String(params[name]) : match)
    },
  })
}

/** Defense in depth before a catalog reaches the worker: plain string→string object, bounded size. */
export function sanitizePluginMessages(value: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  let count = 0
  for (const [key, text] of Object.entries(value)) {
    if (typeof text !== 'string') continue
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    if (count >= MAX_PLUGIN_MESSAGE_KEYS) break
    result[key] = text
    count += 1
  }
  return result
}
