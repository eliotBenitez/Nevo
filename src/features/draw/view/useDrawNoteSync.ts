import { useWorkspaceStore } from '../../../stores/workspace'
import { useNoteStore } from '../../../stores/note'
import { useTreeStore } from '../../../stores/tree'
import { collabCommands, noteCommands } from '../../../tauri/commands'
import { CloudBackend } from '../../../core/workspace-backend'
import { sanitizeSvg } from '../../../utils/sanitizeSvg'
import {
  restoreYDocFromBinary,
  encodeYDocState,
  updateDrawBlockAttrsInYDoc,
} from '../../../editor-core/collaboration'

export interface DrawNoteSyncOptions {
  drawId: string
  getWorkspacePath: () => string | null
  getNoteId: () => string | null
}

export function useDrawNoteSync(options: DrawNoteSyncOptions) {
  const workspaceStore = useWorkspaceStore()
  const noteStore = useNoteStore()

  function findDrawSrcInNode(node: unknown): string {
    if (!node || typeof node !== 'object') return ''
    const n = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }
    if (n.type === 'draw_block' && n.attrs?.drawId === options.drawId) {
      return typeof n.attrs.src === 'string' ? n.attrs.src : ''
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) {
        const found = findDrawSrcInNode(child)
        if (found) return found
      }
    }
    return ''
  }

  function findDrawSrcInContent(): string {
    const noteId = options.getNoteId()
    const note = noteStore.activeNote
    if (!note || note.id !== noteId) return ''
    return findDrawSrcInNode(note.content)
  }

  // Writes are serialised through a promise chain so a slower older write
  // can't clobber a newer one with a stale src.
  let docPatchChain: Promise<void> = Promise.resolve()

  function patchDrawSrcIntoNoteDoc(src: string, svgPreview: string): Promise<void> {
    const run = async () => {
      const noteId = options.getNoteId()
      if (!noteId || !src) return

      // A cloud note's document is the live relay session rather than a file,
      // so the attrs are patched straight into it and sync on their own. The
      // drawing editor replaces the editor pane, so there is no EditorView to
      // dispatch a transaction on in either case.
      const backend = workspaceStore.backend
      if (backend instanceof CloudBackend) {
        const session = backend.getNoteSession(noteId)
        if (!session) return
        try {
          await session.whenSynced()
          updateDrawBlockAttrsInYDoc(session.ydoc, options.drawId, { src, svgPreview: sanitizeSvg(svgPreview) })
        } catch (error) {
          console.warn('[DrawView] Failed to patch draw src into cloud note document', error)
        }
        return
      }

      if (workspaceStore.backendKind !== 'local') return
      const workspacePath = options.getWorkspacePath()
      if (!workspacePath) return
      try {
        const bytes = await collabCommands.loadYjsState(workspacePath, noteId)
        if (!bytes.length) return
        const ydoc = restoreYDocFromBinary(bytes)
        try {
          if (updateDrawBlockAttrsInYDoc(ydoc, options.drawId, { src, svgPreview: sanitizeSvg(svgPreview) })) {
            await collabCommands.saveYjsState(workspacePath, noteId, encodeYDocState(ydoc))
            const updatedAt = await noteCommands.touchNoteUpdatedAt(workspacePath, noteId)
            useTreeStore().syncNoteMeta(noteId, {}, updatedAt)
          }
        } finally {
          ydoc.destroy()
        }
      } catch (error) {
        console.warn('[DrawView] Failed to patch draw src into note Y.Doc', error)
      }
    }
    docPatchChain = docPatchChain.then(run, run)
    return docPatchChain
  }

  function awaitDocPatch(): Promise<void> {
    return docPatchChain
  }

  return {
    findDrawSrcInContent,
    patchDrawSrcIntoNoteDoc,
    awaitDocPatch,
  }
}
