import { invoke } from '@tauri-apps/api/core'
import type { EditorPluginHostOptions } from '../../../editor-core/plugin-host/utils'
import { workspaceCommands } from '../../../tauri/commands'
import { pluginSecretKey, secureStore } from '../../../tauri/secureStore'
import { i18n } from '../../../i18n'
import type { useWorkspaceStore } from '../../../stores/workspace'

type WorkspaceStore = ReturnType<typeof useWorkspaceStore>

/**
 * Assemble the plugin-host runtime bridge for a workspace. Capability methods
 * are included only when the corresponding Tauri command wrapper exists
 * (`typeof … === 'function'`), so the host degrades gracefully on builds where a
 * command is unavailable. Extracted from `useEditorCore` so the entire
 * plugin↔host↔Tauri surface lives in one place instead of leaking into the
 * editor lifecycle. Behavior is identical to the previous inline object.
 */
export function buildPluginRuntime(
  workspacePath: string,
  workspaceStore: WorkspaceStore,
): NonNullable<EditorPluginHostOptions['runtime']> {
  return {
    invoke: (commandId, args = {}) => invoke(commandId, { workspacePath, ...args }),
    t: (key, params) => String(i18n.global.t(key, params ?? {})),
    getPluginSetting: (pluginId, key) => workspaceStore.getPluginSetting(pluginId, key),
    setPluginSetting: (pluginId, key, value) => { void workspaceStore.setPluginSetting(pluginId, key, value) },
    locale: () => String(i18n.global.locale.value),
    timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    ...(typeof workspaceCommands.createPluginCodeSession === 'function'
      ? {
          createPluginCodeSession: (pluginId: string, entryPoint: string) =>
            workspaceCommands.createPluginCodeSession(workspacePath, pluginId, entryPoint),
        }
      : {}),
    ...(typeof workspaceCommands.revokePluginCodeSession === 'function'
      ? {
          revokePluginCodeSession: (token: string) =>
            workspaceCommands.revokePluginCodeSession(token),
        }
      : {}),
    ...(typeof workspaceCommands.pluginStorageGet === 'function'
      ? {
          pluginStorageGet: (pluginId: string, scope: 'workspace' | 'local', key: string) =>
            workspaceCommands.pluginStorageGet(workspacePath, pluginId, scope, key),
        }
      : {}),
    ...(typeof workspaceCommands.pluginStorageSet === 'function'
      ? {
          pluginStorageSet: (
            pluginId: string,
            scope: 'workspace' | 'local',
            key: string,
            value: unknown,
          ) => workspaceCommands.pluginStorageSet(workspacePath, pluginId, scope, key, value),
        }
      : {}),
    ...(typeof workspaceCommands.pluginStorageDelete === 'function'
      ? {
          pluginStorageDelete: (pluginId: string, scope: 'workspace' | 'local', key: string) =>
            workspaceCommands.pluginStorageDelete(workspacePath, pluginId, scope, key),
        }
      : {}),
    getPluginSecret: (pluginId, key) => secureStore.get(pluginSecretKey(pluginId, key)),
    ...(typeof workspaceCommands.pluginAssetWrite === 'function'
      ? {
          pluginAssetWrite: (pluginId: string, dataBase64: string) =>
            workspaceCommands.pluginAssetWrite(workspacePath, pluginId, dataBase64),
        }
      : {}),
    ...(typeof workspaceCommands.pluginAssetRead === 'function'
      ? {
          pluginAssetRead: (pluginId: string, assetId: string) =>
            workspaceCommands.pluginAssetRead(workspacePath, pluginId, assetId),
        }
      : {}),
    ...(typeof workspaceCommands.pluginAssetDelete === 'function'
      ? {
          pluginAssetDelete: (pluginId: string, assetId: string) =>
            workspaceCommands.pluginAssetDelete(workspacePath, pluginId, assetId),
        }
      : {}),
    ...(typeof workspaceCommands.pluginAssetBeginUpload === 'function'
      ? {
          pluginAssetBeginUpload: (pluginId: string) =>
            workspaceCommands.pluginAssetBeginUpload(workspacePath, pluginId),
        }
      : {}),
    ...(typeof workspaceCommands.pluginAssetAppendChunk === 'function'
      ? {
          pluginAssetAppendChunk: (pluginId: string, uploadId: string, chunkBase64: string) =>
            workspaceCommands.pluginAssetAppendChunk(workspacePath, pluginId, uploadId, chunkBase64),
        }
      : {}),
    ...(typeof workspaceCommands.pluginAssetFinishUpload === 'function'
      ? {
          pluginAssetFinishUpload: (pluginId: string, uploadId: string) =>
            workspaceCommands.pluginAssetFinishUpload(workspacePath, pluginId, uploadId),
        }
      : {}),
    ...(typeof workspaceCommands.pluginAssetAbortUpload === 'function'
      ? {
          pluginAssetAbortUpload: (pluginId: string, uploadId: string) =>
            workspaceCommands.pluginAssetAbortUpload(workspacePath, pluginId, uploadId),
        }
      : {}),
    ...(typeof workspaceCommands.pluginAssetUrl === 'function'
      ? {
          pluginAssetUrl: (pluginId: string, assetId: string) =>
            workspaceCommands.pluginAssetUrl(workspacePath, pluginId, assetId),
        }
      : {}),
    ...(typeof workspaceCommands.pluginNetworkFetch === 'function'
      ? {
          pluginNetworkFetch: (pluginId: string, request: Record<string, unknown>) =>
            workspaceCommands.pluginNetworkFetch(workspacePath, pluginId, {
              url: String(request.url ?? ''),
              method: String(request.method ?? 'GET'),
              headers: request.headers && typeof request.headers === 'object'
                ? request.headers as Record<string, string>
                : undefined,
              bodyBase64: typeof request.bodyBase64 === 'string' ? request.bodyBase64 : undefined,
            }),
        }
      : {}),
    ...(typeof workspaceCommands.pluginRegistryLoad === 'function'
      ? { loadPluginRegistry: () => workspaceCommands.pluginRegistryLoad(workspacePath) }
      : {}),
    ...(typeof workspaceCommands.pluginRegistrySave === 'function'
      ? {
          savePluginRegistry: (registry: Parameters<typeof workspaceCommands.pluginRegistrySave>[1]) =>
            workspaceCommands.pluginRegistrySave(workspacePath, registry),
        }
      : {}),
  }
}
