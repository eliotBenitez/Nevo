import type { Transaction } from 'prosemirror-state'
import type { EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { NevoEditorPluginManifest } from '../../types/editor-plugin'
import { assertJsonValue, manifestCapabilities, type SandboxedPluginSession } from './sandbox'
import { applyTransactionIntent, createEditorSnapshot, validateTransactionIntent } from './sandboxTransactions'
import type { EditorPluginHostOptions } from './utils'

const MAX_FRAME_PATCH_BYTES = 256 * 1024

interface SandboxEditorBridgeDeps {
  runtime: EditorPluginHostOptions['runtime']
  getRevision: () => number
  recordError: (pluginId: string, phase: string, error: unknown) => void
}

/** Applies results coming back from sandboxed plugins (handler intents, frame attr patches) to the live editor. */
export class SandboxEditorBridge {
  private readonly runtime: EditorPluginHostOptions['runtime']
  private readonly getRevision: () => number
  private readonly recordError: SandboxEditorBridgeDeps['recordError']

  constructor(deps: SandboxEditorBridgeDeps) {
    this.runtime = deps.runtime
    this.getRevision = deps.getRevision
    this.recordError = deps.recordError
  }

  async executeHandler(
    manifest: NevoEditorPluginManifest,
    session: SandboxedPluginSession,
    handlerId: string,
    state: EditorState,
    dispatch: (transaction: Transaction) => void,
    input: unknown,
    view?: EditorView,
  ): Promise<void> {
    try {
      const invocationState = view?.state ?? state
      const revision = this.getRevision()
      const snapshot = createEditorSnapshot(
        invocationState,
        revision,
        manifestCapabilities(manifest).includes('editor.read'),
        this.runtime?.locale?.() ?? 'en',
        this.runtime?.timeZone?.() ?? 'UTC',
      )
      const result = await session.invoke(handlerId, input, snapshot)
      const currentState = view?.state ?? invocationState
      const currentRevision = this.getRevision()
      const intent = validateTransactionIntent(result, currentRevision)
      dispatch(applyTransactionIntent(currentState, intent))
    } catch (error) {
      this.recordError(manifest.id, 'handler', error)
    }
  }

  /**
   * Applies an attr patch proposed by a Tier 2 block iframe. The write is gated by
   * `editor.write.self`, validated as bounded JSON, and confined to the single node
   * that owns the frame (identified by its live position); unknown attrs are dropped
   * by ProseMirror against the node's schema.
   */
  applyFramePatch(
    manifest: NevoEditorPluginManifest,
    view: EditorView,
    position: number,
    patch: Record<string, unknown>,
  ): boolean {
    if (!manifestCapabilities(manifest).includes('editor.write.self')) {
      this.recordError(manifest.id, 'frame-patch',
        new Error(`Plugin ${manifest.id} requires capability editor.write.self`))
      return false
    }
    try {
      assertJsonValue(patch, 'frame.patch')
      if (new TextEncoder().encode(JSON.stringify(patch)).byteLength > MAX_FRAME_PATCH_BYTES) {
        throw new Error('Sandbox block patch exceeds the value limit')
      }
    } catch (error) {
      this.recordError(manifest.id, 'frame-patch', error)
      return false
    }
    const node = view.state.doc.nodeAt(position)
    if (!node) return false
    try {
      const transaction = view.state.tr.setNodeMarkup(
        position,
        undefined,
        { ...node.attrs, ...patch },
        node.marks,
      )
      view.dispatch(transaction)
      return true
    } catch (error) {
      this.recordError(manifest.id, 'frame-patch', error)
      return false
    }
  }
}
