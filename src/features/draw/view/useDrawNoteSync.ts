import { useWorkspaceStore } from '../../../stores/workspace'
import { useNoteStore } from '../../../stores/note'
import { sanitizeSvg } from '../../../utils/sanitizeSvg'
import { patchDrawBlockInContent } from '../../../editor-core/content/drawBlockPatch'

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

      // The drawing editor replaces the editor pane, so there is no live
      // EditorView to dispatch a transaction on. `note.content` is the
      // note's source of truth while the note editor isn't mounted (see
      // WorkspaceShell.vue's onUpdateDraw), so the block is patched there
      // directly and saved through the note store's normal persist path.
      if (workspaceStore.backendKind !== 'local') return
      if (!options.getWorkspacePath()) return

      try {
        const note = noteStore.activeNote
        if (!note || note.id !== noteId) return
        const result = patchDrawBlockInContent(note.content, options.drawId, {
          src,
          svgPreview: sanitizeSvg(svgPreview),
        })
        if (!result.changed) return
        noteStore.setContent(result.content)
        // `saveNote` never throws — failures are logged and surfaced via
        // `saveStatus` — so this try/catch only guards `patchDrawBlockInContent`
        // and `setContent` against an unexpectedly malformed document.
        await noteStore.saveNote()
      } catch (error) {
        console.warn('[DrawView] Failed to save draw src into note content', error)
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
