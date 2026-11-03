import { invoke } from '@tauri-apps/api/core'
import { appLogger } from '../utils/logger'

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    await appLogger.error({
      source: 'frontend.invoke',
      event: command,
      message: 'Tauri command failed',
      error,
    })
    throw error
  }
}

/** A plugin catalog resolved for one app locale: requested → base language → default locale, merged. */
export interface PluginMessages {
  /** Most specific catalog that was found, e.g. `ru`; the default locale when only it exists. */
  locale: string
  messages: Record<string, string>
}

export const pluginMessagesCommands = {
  /** Reads `locales/<locale>.json` catalogs from an installed plugin; `null` when it ships none. */
  readLocal: (workspacePath: string, pluginId: string, locale: string, defaultLocale: string) =>
    invokeCommand<PluginMessages | null>('plugin_messages_read', { workspacePath, pluginId, locale, defaultLocale }),
  /** Downloads the same catalogs for a marketplace plugin that is not installed. */
  fetchMarketplace: (pluginId: string, locale: string, defaultLocale: string) =>
    invokeCommand<PluginMessages | null>('marketplace_plugin_messages', { pluginId, locale, defaultLocale }),
}
