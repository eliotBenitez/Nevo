import { noteCommands } from '../../../tauri/commands'
import { ensureMediaServer, mediaHttpUrl } from '../../../tauri/mediaServer'
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

    const imported = await noteCommands.pickAndImportAsset(workspacePath, kind)
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
      await ensureMediaServer()
      const url = mediaHttpUrl(`${workspacePath}/${imported.src}`, imported.src)
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
