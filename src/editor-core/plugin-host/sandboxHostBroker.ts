import type { NevoEditorPluginManifest } from '../../types/editor-plugin'
import { assertWorkspaceCommandCapability } from './capabilities'
import { manifestCapabilities, type SandboxedPluginSession } from './sandbox'
import type { EditorPluginHostOptions } from './utils'

interface SandboxHostBrokerDeps {
  runtime: EditorPluginHostOptions['runtime']
  getSession: (pluginId: string) => SandboxedPluginSession | undefined
  recordError: (pluginId: string, phase: string, error: unknown) => void
}

/** Serves host calls from sandboxed plugin workers; every method is gated by a manifest capability. */
export class SandboxHostBroker {
  private readonly runtime: EditorPluginHostOptions['runtime']
  private readonly getSession: SandboxHostBrokerDeps['getSession']
  private readonly recordError: SandboxHostBrokerDeps['recordError']
  private readonly schedules = new Map<string, Map<string, ReturnType<typeof setTimeout>>>()

  constructor(deps: SandboxHostBrokerDeps) {
    this.runtime = deps.runtime
    this.getSession = deps.getSession
    this.recordError = deps.recordError
  }

  async execute(
    manifest: NevoEditorPluginManifest,
    method: string,
    args: unknown,
  ): Promise<unknown> {
    const values = args && typeof args === 'object' && !Array.isArray(args)
      ? args as Record<string, unknown>
      : {}
    const key = typeof values.key === 'string' ? values.key : ''
    const capabilities = manifestCapabilities(manifest)
    const requireCapability = (capability: typeof capabilities[number]) => {
      if (!capabilities.includes(capability)) {
        throw new Error(`Plugin ${manifest.id} requires capability ${capability}`)
      }
    }
    if (method.startsWith('storage.workspace.')) {
      requireCapability('storage.workspace')
      if (!key) throw new Error('Plugin storage key is required')
      if (method.endsWith('.get')) {
        if (!this.runtime?.pluginStorageGet) throw new Error('Workspace plugin storage is unavailable')
        return this.runtime.pluginStorageGet(manifest.id, 'workspace', key)
      }
      if (method.endsWith('.set')) {
        if (!this.runtime?.pluginStorageSet) throw new Error('Workspace plugin storage is unavailable')
        await this.runtime.pluginStorageSet(manifest.id, 'workspace', key, values.value)
        return null
      }
      if (!method.endsWith('.delete')) throw new Error(`Plugin host method is not exposed: ${method}`)
      if (!this.runtime?.pluginStorageDelete) throw new Error('Workspace plugin storage is unavailable')
      await this.runtime.pluginStorageDelete(manifest.id, 'workspace', key)
      return null
    }
    if (method.startsWith('storage.local.')) {
      requireCapability('storage.local')
      if (!key) throw new Error('Plugin storage key is required')
      if (method.endsWith('.get')) {
        if (!this.runtime?.pluginStorageGet) throw new Error('Local plugin storage is unavailable')
        return this.runtime.pluginStorageGet(manifest.id, 'local', key)
      }
      if (method.endsWith('.set')) {
        if (!this.runtime?.pluginStorageSet) throw new Error('Local plugin storage is unavailable')
        await this.runtime.pluginStorageSet(manifest.id, 'local', key, values.value)
        return null
      }
      if (!method.endsWith('.delete')) throw new Error(`Plugin host method is not exposed: ${method}`)
      if (!this.runtime?.pluginStorageDelete) throw new Error('Local plugin storage is unavailable')
      await this.runtime.pluginStorageDelete(manifest.id, 'local', key)
      return null
    }
    if (method === 'settings.get') {
      requireCapability('settings.read')
      if (!key) throw new Error('Plugin setting key is required')
      return this.runtime?.getPluginSetting?.(manifest.id, key) ?? null
    }
    if (method === 'settings.set') {
      requireCapability('settings.write')
      if (!key) throw new Error('Plugin setting key is required')
      if (!this.runtime?.setPluginSetting) throw new Error('Plugin settings are unavailable')
      this.runtime.setPluginSetting(manifest.id, key, values.value)
      return null
    }
    if (method === 'secrets.get') {
      requireCapability('secrets.read')
      if (!key) throw new Error('Plugin secret key is required')
      if (!this.runtime?.getPluginSecret) throw new Error('Plugin secrets are unavailable')
      return this.runtime.getPluginSecret(manifest.id, key)
    }
    if (method === 'assets.write') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetWrite) throw new Error('Plugin asset store is unavailable')
      const dataBase64 = typeof values.dataBase64 === 'string' ? values.dataBase64 : ''
      if (!dataBase64) throw new Error('Plugin asset data is required')
      return this.runtime.pluginAssetWrite(manifest.id, dataBase64)
    }
    if (method === 'assets.read') {
      requireCapability('assets.read')
      if (!this.runtime?.pluginAssetRead) throw new Error('Plugin asset store is unavailable')
      const assetId = typeof values.assetId === 'string' ? values.assetId : ''
      if (!assetId) throw new Error('Plugin asset id is required')
      return this.runtime.pluginAssetRead(manifest.id, assetId)
    }
    if (method === 'assets.delete') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetDelete) throw new Error('Plugin asset store is unavailable')
      const assetId = typeof values.assetId === 'string' ? values.assetId : ''
      if (!assetId) throw new Error('Plugin asset id is required')
      await this.runtime.pluginAssetDelete(manifest.id, assetId)
      return null
    }
    if (method === 'assets.beginUpload') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetBeginUpload) throw new Error('Plugin asset store is unavailable')
      return this.runtime.pluginAssetBeginUpload(manifest.id)
    }
    if (method === 'assets.appendChunk') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetAppendChunk) throw new Error('Plugin asset store is unavailable')
      const uploadId = typeof values.uploadId === 'string' ? values.uploadId : ''
      const chunkBase64 = typeof values.chunkBase64 === 'string' ? values.chunkBase64 : ''
      if (!uploadId || !chunkBase64) throw new Error('Plugin asset chunk is required')
      await this.runtime.pluginAssetAppendChunk(manifest.id, uploadId, chunkBase64)
      return null
    }
    if (method === 'assets.finishUpload') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetFinishUpload) throw new Error('Plugin asset store is unavailable')
      const uploadId = typeof values.uploadId === 'string' ? values.uploadId : ''
      if (!uploadId) throw new Error('Plugin asset upload id is required')
      return this.runtime.pluginAssetFinishUpload(manifest.id, uploadId)
    }
    if (method === 'assets.abortUpload') {
      requireCapability('assets.write')
      if (!this.runtime?.pluginAssetAbortUpload) throw new Error('Plugin asset store is unavailable')
      const uploadId = typeof values.uploadId === 'string' ? values.uploadId : ''
      if (!uploadId) throw new Error('Plugin asset upload id is required')
      await this.runtime.pluginAssetAbortUpload(manifest.id, uploadId)
      return null
    }
    if (method === 'assets.url') {
      requireCapability('assets.read')
      if (!this.runtime?.pluginAssetUrl) throw new Error('Plugin asset store is unavailable')
      const assetId = typeof values.assetId === 'string' ? values.assetId : ''
      if (!assetId) throw new Error('Plugin asset id is required')
      return this.runtime.pluginAssetUrl(manifest.id, assetId)
    }
    if (method === 'network.fetch') {
      requireCapability('network.fetch')
      if (!this.runtime?.pluginNetworkFetch) throw new Error('Plugin network broker is unavailable')
      return this.runtime.pluginNetworkFetch(manifest.id, values)
    }
    if (method === 'runtime.schedule') {
      requireCapability('runtime.scheduling')
      const handlerId = typeof values.handlerId === 'string' ? values.handlerId : ''
      const delayMs = typeof values.delayMs === 'number' ? values.delayMs : Number.NaN
      const repeat = values.repeat === true
      if (!handlerId.startsWith(`${manifest.id}:h`) || !Number.isSafeInteger(delayMs)) {
        throw new Error('Plugin schedule request is invalid')
      }
      if (delayMs < 100 || delayMs > 24 * 60 * 60 * 1_000) {
        throw new Error('Plugin schedule delay must be between 100 ms and 24 hours')
      }
      const schedules = this.schedules.get(manifest.id) ?? new Map()
      if (schedules.size >= 32) throw new Error('Plugin schedule limit exceeded')
      const scheduleId = globalThis.crypto?.randomUUID?.()
        ?? `${manifest.id}-${Date.now()}-${Math.random()}`
      const invoke = () => {
        const session = this.getSession(manifest.id)
        if (!session) return
        void session.invoke(handlerId, {
          scheduleId,
          scheduledAt: new Date().toISOString(),
        }).catch(error => this.recordError(manifest.id, 'schedule', error))
        if (!repeat) schedules.delete(scheduleId)
      }
      const timer = repeat
        ? globalThis.setInterval(invoke, delayMs)
        : globalThis.setTimeout(invoke, delayMs)
      schedules.set(scheduleId, timer)
      this.schedules.set(manifest.id, schedules)
      return scheduleId
    }
    if (method === 'runtime.schedule.clear') {
      requireCapability('runtime.scheduling')
      const scheduleId = typeof values.scheduleId === 'string' ? values.scheduleId : ''
      const schedules = this.schedules.get(manifest.id)
      const timer = schedules?.get(scheduleId)
      if (timer !== undefined) {
        globalThis.clearTimeout(timer)
        globalThis.clearInterval(timer)
        schedules?.delete(scheduleId)
      }
      return null
    }
    if (method === 'workspace.invoke') {
      const commandId = typeof values.commandId === 'string' ? values.commandId : ''
      assertWorkspaceCommandCapability(manifest, commandId)
      if (!this.runtime?.invoke) throw new Error('Workspace invoke runtime is unavailable')
      const commandArgs = values.args && typeof values.args === 'object' && !Array.isArray(values.args)
        ? values.args as Record<string, unknown>
        : undefined
      return this.runtime.invoke(commandId, commandArgs)
    }
    throw new Error(`Plugin host method is not exposed: ${method}`)
  }

  clearAllSchedules(): void {
    for (const schedules of this.schedules.values()) {
      for (const timer of schedules.values()) {
        globalThis.clearTimeout(timer)
        globalThis.clearInterval(timer)
      }
    }
    this.schedules.clear()
  }
}
