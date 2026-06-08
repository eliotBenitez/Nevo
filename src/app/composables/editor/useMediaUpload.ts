import { noteCommands } from '../../../tauri/commands'
import { ensureMediaServer, mediaHttpUrl } from '../../../tauri/mediaServer'
import { appLogger } from '../../../utils/logger'
import type { EditorCore } from './useEditorCore'

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
) {
  function updateMediaNodeAtPosition(position: number, attrs: Record<string, unknown>) {
    if (!core.editorView) return
    const targetNode = core.editorView.state.doc.nodeAt(position)
    if (!targetNode || targetNode.type.name !== 'media_block') return
    core.editorView.dispatch(
      core.editorView.state.tr.setNodeMarkup(position, undefined, { ...targetNode.attrs, ...attrs }).scrollIntoView(),
    )
  }

  async function openMediaPicker(targetPos: number | null, kind: 'audio' | 'video') {
    const workspacePath = getWorkspacePath()
    if (!workspacePath) return

    const filters = kind === 'video'
      ? [{ name: 'Video', extensions: ['mp4', 'webm', 'ogv', 'mov', 'mkv', 'avi'] }]
      : [{ name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac'] }]

    let selectedPath: string
    try {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
      const result = await openDialog({ multiple: false, filters })
      if (!result || typeof result !== 'string') return
      selectedPath = result
    } catch {
      return
    }

    const fileName = selectedPath.split(/[\\/]/).pop() ?? 'media'
    const extension = fileName.split('.').pop()?.toLowerCase() ?? ''

    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
      mkv: 'video/x-matroska', avi: 'video/x-msvideo',
      mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
      ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
    }
    const mime = mimeMap[extension] ?? (kind === 'video' ? 'video/mp4' : 'audio/mpeg')

    let imported: { src: string }
    try {
      imported = await noteCommands.importAssetByPath(workspacePath, selectedPath, fileName)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.editor',
        event: 'import_media',
        message: 'Failed to import media into note',
        workspacePath,
        error,
        payload: { fileName },
      })
      return
    }

    // Probe duration via the HTTP media server for both audio and video.
    // asset:// cannot feed WebKitGTK's GStreamer backend for either media type.
    let duration: number | null = null
    try {
      await ensureMediaServer()
      const url = mediaHttpUrl(`${workspacePath}/${imported.src}`)
      if (url) duration = await getMediaDurationFromUrl(url, kind === 'video')
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
