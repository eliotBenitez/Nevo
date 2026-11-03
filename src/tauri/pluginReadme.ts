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

/** README text for the plugin pages in Settings; `null` when the plugin ships none. */
export const pluginReadmeCommands = {
  /** Reads `README.md` (any case) from an installed plugin's folder. */
  readLocal: (workspacePath: string, pluginId: string) =>
    invokeCommand<string | null>('plugin_readme_read', { workspacePath, pluginId }),
  /** Downloads a marketplace plugin's README; `fileName` is the catalog's spelling of `README.md`. */
  fetchMarketplace: (pluginId: string, fileName: string) =>
    invokeCommand<string | null>('marketplace_plugin_readme', { pluginId, fileName }),
}
