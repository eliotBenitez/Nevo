import { noteCommands } from '../../../tauri/commands'
import { ensureMediaServer, mediaHttpUrl } from '../../../tauri/mediaServer'
import { CloudBackend, type WorkspaceBackend } from '../../../core/workspace-backend'
import { appLogger } from '../../../utils/logger'
import type { EditorCore } from './useEditorCore'

/**
 * Opens the browser's own file chooser.
 *
 * A local workspace picks through Rust, which copies the file into the
 * workspace and hands back a path. A cloud workspace has nowhere on disk to
 * copy to — it needs the bytes — so it goes through the webview instead.
 */
function pickMediaFile(kind: 'audio' | 'video'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = kind === 'video' ? 'video/*' : 'audio/*'
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
}

function getMediaDurationFromUrl(url: string, isVideo: boolean): Promise<number | null> {
  return new Promise((resolve) => {
    const el = isVideo ? document.createElement('video') : document.createElement('audio')
    const done = (dur: number | null) => {
      clearTimeout(timer)
      el.removeAttribute('src')
      resolve(dur)
    }
    const timer = setTimeout(() => done(null), 5000)
    el.preload = 'metadata'
    el.addEventListener('loadedmetadata', () => {
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null
      done(dur)
    }, { once: true })
    el.addEventListener('error', () => done(null), { once: true })
    el.src = url
  })
}

export function useMediaUpload(
  core: EditorCore,
  getWorkspacePath: () => string | null,
  onOverlaysUpdate: () => void,
  getBackend: () => WorkspaceBackend | null = () => null,
) {
  function updateMediaNodeAtPosition(position: number, attrs: Record<string, unknown>) {
    if (!core.editorView) return
    const targetNode = core.editorView.state.doc.nodeAt(position)
    if (!targetNode || targetNode.type.name !== 'media_block') return
    core.editorView.dispatch(
      core.editorView.state.tr.setNodeMarkup(position, undefined, { ...targetNode.attrs, ...attrs }).scrollIntoView(),
    )
  }

  /** Uploads the picked file as an encrypted relay asset (cloud workspaces). */
  async function importForCloud(cloud: CloudBackend, kind: 'audio' | 'video') {
    const file = await pickMediaFile(kind)
    if (!file) return null
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
      const imported = await cloud.importImageAsset(file.name, bytes)
      return { fileName: file.name, src: imported.src, bytes: imported.bytes }
    } catch (error) {
      // Most likely the relay's per-asset size limit; a large video will not fit.
      await appLogger.error({
        source: 'frontend.editor',
        event: 'import_cloud_media',
        message: 'Failed to upload media to the cloud workspace',
        error,
        payload: { kind, fileName: file.name, size: file.size },
      })
      return null
    }
  }

  async function openMediaPicker(targetPos: number | null, kind: 'audio' | 'video') {
    const workspacePath = getWorkspacePath()
    const backend = getBackend()
    const cloud = backend instanceof CloudBackend ? backend : null
    if (!workspacePath && !cloud) return

    const imported = cloud
      ? await importForCloud(cloud, kind)
      : await noteCommands.pickAndImportAsset(workspacePath!, kind)
    if (!imported) return
    const fileName = imported.fileName
    const extension = fileName.split('.').pop()?.toLowerCase() ?? ''

    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
      mkv: 'video/x-matroska', avi: 'video/x-msvideo',
      mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
      ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
    }
    const mime = mimeMap[extension] ?? (kind === 'video' ? 'video/mp4' : 'audio/mpeg')

    // Probe duration via the HTTP media server for both audio and video.
    // asset:// cannot feed WebKitGTK's GStreamer backend for either media type.
    let duration: number | null = null
    try {
      if (cloud) {
        // Already cached as an object URL by the upload; no media server for
        // a workspace whose assets never touch the disk.
        const url = cloud.assetUrl(imported.src)
        if (url) duration = await getMediaDurationFromUrl(url, kind === 'video')
      } else {
        await ensureMediaServer()
        const url = mediaHttpUrl(`${workspacePath}/${imported.src}`, imported.src)
        if (url) duration = await getMediaDurationFromUrl(url, kind === 'video')
      }
    } catch { duration = null }

    const nextAttrs = {
      kind,
      src: imported.src,
      name: fileName,
      mime,
      size: (imported as { bytes?: number }).bytes ?? 0,
      duration,
      poster: '',
    }

    if (!core.editorView) return

    if (typeof targetPos === 'number') {
      updateMediaNodeAtPosition(targetPos, nextAttrs)
      onOverlaysUpdate()
      return
    }

    const mediaBlockType = core.editorView.state.schema.nodes.media_block
    if (!mediaBlockType) return
    const mediaNode = mediaBlockType.create(nextAttrs)
    core.editorView.dispatch(core.editorView.state.tr.replaceSelectionWith(mediaNode, false).scrollIntoView())
    onOverlaysUpdate()
  }

  function requestMediaPicker(targetPos: number | null = null, kind: 'audio' | 'video' = 'audio') {
    openMediaPicker(targetPos, kind).catch(() => {})
  }

  return { requestMediaPicker }
}
