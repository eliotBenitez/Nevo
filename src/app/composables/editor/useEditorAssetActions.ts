import { ref } from 'vue'
import { noteCommands, workspaceCommands } from '../../../tauri/commands'
import { mediaHttpUrl } from '../../../tauri/mediaServer'
import { CloudBackend, CLOUD_ASSET_SCHEME, type WorkspaceBackend } from '../../../core/workspace-backend'
import { appLogger } from '../../../utils/logger'
import { workspaceAssetUrl } from '../../../utils/workspaceAssetUrl'

interface EditorAssetActionsOptions {
  getWorkspacePath: () => string | null
  getBackend: () => WorkspaceBackend | null
  getCover: () => string | null | undefined
  emitCover: (cover: string | null) => void
  clickCoverInput: () => void
}

export function useEditorAssetActions(options: EditorAssetActionsOptions) {
  const cloudAssetRefreshToken = ref(0)
  const pendingCloudAssetPrefetches = new Set<string>()
  const pendingCoverAssetCleanup = new Set<string>()
  let pendingAssetCleanup = false

  function resolveCloudAsset(src: string): string {
    const cloud = options.getBackend()
    if (!(cloud instanceof CloudBackend)) return ''
    const cached = cloud.assetUrl(src)
    if (cached) return cached
    if (!pendingCloudAssetPrefetches.has(src)) {
      pendingCloudAssetPrefetches.add(src)
      void cloud.prefetchAsset(src).then(() => {
        if (cloud.assetUrl(src)) cloudAssetRefreshToken.value += 1
      }).finally(() => {
        pendingCloudAssetPrefetches.delete(src)
      })
    }
    return ''
  }

  function resolveWorkspaceAssetSrc(src: string): string | null {
    if (src.startsWith(CLOUD_ASSET_SCHEME)) return resolveCloudAsset(src) || null
    if (!options.getWorkspacePath()) return null
    return workspaceAssetUrl(src)
  }

  function resolveEditorAssetSrc(src: string): string {
    if (/^(https?|data|blob):/.test(src)) return src
    if (src.startsWith(CLOUD_ASSET_SCHEME)) return resolveCloudAsset(src)
    if (!options.getWorkspacePath()) return src
    return workspaceAssetUrl(src)
  }

  function resolveMediaAssetSrc(src: string): string | null {
    if (/^(https?|data|blob):/.test(src)) return src
    if (src.startsWith(CLOUD_ASSET_SCHEME)) return resolveCloudAsset(src) || null
    const workspacePath = options.getWorkspacePath()
    if (!workspacePath) return null
    return mediaHttpUrl(`${workspacePath}/${src}`, src)
  }

  function backendSupportsPathImport(): boolean {
    return options.getBackend()?.handle.kind === 'local'
  }

  async function openFileAsset(src: string) {
    const workspacePath = options.getWorkspacePath()
    if (!workspacePath || !src.startsWith('.nevo/assets/')) return
    try {
      await noteCommands.openWorkspaceAsset(workspacePath, src)
    } catch (error) {
      await appLogger.warn({
        source: 'frontend.editor',
        event: 'open_file_asset',
        message: 'Failed to open file attachment',
        workspacePath,
        payload: { src },
        error,
      })
    }
  }

  function localCoverAssetSrc(cover: string | null | undefined): string | null {
    if (!cover) return null
    const src = cover.startsWith('image:') ? cover.slice(6) : cover
    return src.startsWith('.nevo/assets/') ? src : null
  }

  function updateCover(nextCover: string | null) {
    const previousAssetSrc = localCoverAssetSrc(options.getCover())
    if (previousAssetSrc && localCoverAssetSrc(nextCover) !== previousAssetSrc) {
      pendingCoverAssetCleanup.add(previousAssetSrc)
    }
    options.emitCover(nextCover)
  }

  async function cleanupPendingCoverAssets() {
    if (pendingCoverAssetCleanup.size === 0) return
    const backend = options.getBackend()
    if (!backend) return

    const assetSrcs = Array.from(pendingCoverAssetCleanup)
    pendingCoverAssetCleanup.clear()
    for (const assetSrc of assetSrcs) {
      try {
        await backend.deleteUnreferencedAsset(assetSrc)
      } catch (error) {
        pendingCoverAssetCleanup.add(assetSrc)
        await appLogger.error({
          source: 'frontend.editor',
          event: 'delete_cover_asset',
          message: 'Failed to delete removed cover asset',
          workspacePath: options.getWorkspacePath(),
          error,
          payload: { assetSrc },
        })
      }
    }
  }

  async function pickCoverImage() {
    const workspacePath = options.getWorkspacePath()
    if (!workspacePath || !backendSupportsPathImport()) return
    try {
      const imported = await noteCommands.pickAndImportAsset(workspacePath, 'image')
      if (imported) updateCover(`image:${imported.src}`)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.editor',
        event: 'import_cover_image',
        message: 'Failed to import cover image',
        workspacePath,
        error,
      })
    }
  }

  function onRequestCoverImage() {
    if (backendSupportsPathImport()) {
      void pickCoverImage()
    } else {
      options.clickCoverInput()
    }
  }

  async function onCoverImageInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      const backend = options.getBackend()
      if (!backend) return
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
      const imported = await backend.importImageAsset(file.name, bytes)
      updateCover(`image:${imported.src}`)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.editor',
        event: 'import_cover_image',
        message: 'Failed to import cover image',
        workspacePath: options.getWorkspacePath(),
        error,
        payload: { fileName: file.name },
      })
    } finally {
      input.value = ''
    }
  }

  function markRemovedEditorAssets() {
    pendingAssetCleanup = true
  }

  function afterSuccessfulSave() {
    if (pendingAssetCleanup) {
      pendingAssetCleanup = false
      const workspacePath = options.getWorkspacePath()
      if (workspacePath) workspaceCommands.cleanupOrphanedAssets(workspacePath).catch(() => {})
    }
    void cleanupPendingCoverAssets()
  }

  return {
    cloudAssetRefreshToken,
    resolveWorkspaceAssetSrc,
    resolveEditorAssetSrc,
    resolveMediaAssetSrc,
    backendSupportsPathImport,
    openFileAsset,
    updateCover,
    onRequestCoverImage,
    onCoverImageInputChange,
    markRemovedEditorAssets,
    afterSuccessfulSave,
  }
}
