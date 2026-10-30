import type { EditorState } from 'prosemirror-state'
import type { NevoEditorPluginManifest } from '../../types/editor-plugin'
import { manifestCapabilities, type SandboxedPluginSession } from './sandbox'
import { createEditorSnapshot } from './sandboxTransactions'
import type { EditorPluginHostOptions } from './utils'

// Editor events fire on every ProseMirror transaction (i.e. every keystroke). The
// Worker round-trip plus a full doc snapshot per transaction is wasteful, so bursts
// are coalesced into a single trailing dispatch carrying the latest editor state.
const EDITOR_EVENT_DEBOUNCE_MS = 48

interface SandboxEditorEventsDeps {
  manifests: NevoEditorPluginManifest[]
  runtime: EditorPluginHostOptions['runtime']
  getSession: (pluginId: string) => SandboxedPluginSession | undefined
  getRevision: () => number
  recordError: (pluginId: string, phase: string, error: unknown) => void
}

/** Registered `editorEvent` handlers of sandboxed plugins plus the debounced `transactionApplied` dispatch. */
export class SandboxEditorEvents {
  private readonly handlers = new Map<string, Map<string, string[]>>()
  private pendingState: EditorState | null = null
  private pendingDocChanged = false
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly deps: SandboxEditorEventsDeps) {}

  get hasHandlers(): boolean {
    return this.handlers.size > 0
  }

  addHandler(pluginId: string, event: string, handlerId: string): void {
    const events = this.handlers.get(pluginId) ?? new Map<string, string[]>()
    events.set(event, [...(events.get(event) ?? []), handlerId])
    this.handlers.set(pluginId, events)
  }

  schedule(state: EditorState, docChanged: boolean): void {
    this.pendingState = state
    this.pendingDocChanged = this.pendingDocChanged || docChanged
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flush(), EDITOR_EVENT_DEBOUNCE_MS)
    }
  }

  dispose(): void {
    this.handlers.clear()
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.pendingState = null
    this.pendingDocChanged = false
  }

  private flush(): void {
    this.flushTimer = null
    const state = this.pendingState
    if (!state) return
    const docChanged = this.pendingDocChanged
    this.pendingState = null
    this.pendingDocChanged = false
    const { manifests, runtime, getSession, getRevision, recordError } = this.deps
    for (const [pluginId, events] of this.handlers) {
      const handlers = events.get('transactionApplied')
      const session = getSession(pluginId)
      if (!handlers?.length || !session) continue
      const manifest = manifests.find(item => item.id === pluginId)
      if (!manifest) continue
      const snapshot = createEditorSnapshot(
        state,
        getRevision(),
        manifestCapabilities(manifest).includes('editor.read'),
        runtime?.locale?.() ?? 'en',
        runtime?.timeZone?.() ?? 'UTC',
      )
      for (const handlerId of handlers) {
        void session.invoke(handlerId, { docChanged }, snapshot)
          .catch(error => recordError(pluginId, 'event', error))
      }
    }
  }
}
