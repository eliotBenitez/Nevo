import { pluginMessagesCommands } from '../../tauri/pluginMessages'
import type { MarketplaceCatalogItem, PluginManifest } from '../../types/workspace'

export type PluginCatalogMessages = Record<string, string>

const DEFAULT_LOCALE = 'en'

// Session cache keyed `local:<id>@<version>:<locale>` / `remote:<id>@<treeSha>:<locale>`.
const cache = new Map<string, PluginCatalogMessages>()

export function clearPluginMessagesCache() {
  cache.clear()
}

/** Requested locale, its base language (`pt-BR` -> `pt`), then the default locale; no duplicates. */
export function localeChain(locale: string, defaultLocale: string): string[] {
  const chain: string[] = []
  const add = (value: string) => {
    const trimmed = value.trim()
    if (trimmed && !chain.some(item => item.toLowerCase() === trimmed.toLowerCase())) chain.push(trimmed)
  }
  add(locale)
  add(locale.split(/[-_]/)[0] ?? '')
  add(defaultLocale || DEFAULT_LOCALE)
  return chain
}

/** Picks the README spelling from a catalog file list for the locale chain, then `README.md`. */
export function readmeFileForLocale(
  files: string[],
  locale: string,
  defaultLocale: string,
): string | null {
  const find = (name: string) => files.find(file => file.toLowerCase() === name.toLowerCase()) ?? null
  for (const candidate of localeChain(locale, defaultLocale)) {
    const match = find(`README.${candidate}.md`)
    if (match) return match
  }
  return find('README.md')
}

export function pluginText(
  messages: PluginCatalogMessages | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number>,
): string {
  const template = messages && Object.prototype.hasOwnProperty.call(messages, key)
    ? messages[key]
    : undefined
  if (typeof template !== 'string' || !template) return fallback
  if (!params) return template
  return template.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match)
}

export async function loadLocalPluginMessages(
  workspacePath: string,
  manifest: Pick<PluginManifest, 'id' | 'version' | 'defaultLocale'>,
  locale: string,
): Promise<PluginCatalogMessages> {
  const key = `local:${manifest.id}@${manifest.version}:${locale}`
  const cached = cache.get(key)
  if (cached) return cached
  const result = await pluginMessagesCommands.readLocal(
    workspacePath,
    manifest.id,
    locale,
    manifest.defaultLocale ?? DEFAULT_LOCALE,
  )
  const messages = result?.messages ?? {}
  cache.set(key, messages)
  return messages
}

export function hasRemoteMessages(item: Pick<MarketplaceCatalogItem, 'files'>): boolean {
  return item.files.some(file => /^locales\/[^/]+\.json$/i.test(file))
}

export async function loadRemotePluginMessages(
  item: Pick<MarketplaceCatalogItem, 'pluginId' | 'treeSha' | 'files' | 'manifest'>,
  locale: string,
): Promise<PluginCatalogMessages> {
  if (!hasRemoteMessages(item)) return {}
  const key = `remote:${item.pluginId}@${item.treeSha}:${locale}`
  const cached = cache.get(key)
  if (cached) return cached
  const result = await pluginMessagesCommands.fetchMarketplace(
    item.pluginId,
    locale,
    item.manifest?.defaultLocale ?? DEFAULT_LOCALE,
  )
  const messages = result?.messages ?? {}
  cache.set(key, messages)
  return messages
}
