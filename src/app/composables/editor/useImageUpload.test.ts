import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createNevoEditorState } from '../../../editor-core/state'
import { nevoBaseSchema } from '../../../editor-core/schema'
import type { EditorCore } from './useEditorCore'
import { useImageUpload } from './useImageUpload'

const IMPORTED_SRC = '.nevo/assets/pasted.png'

vi.mock('../../../utils/logger', () => ({
  appLogger: {
    warn: vi.fn(() => Promise.resolve()),
    error: vi.fn(() => Promise.resolve()),
    info: vi.fn(() => Promise.resolve()),
    debug: vi.fn(() => Promise.resolve()),
  },
}))

const mockBackend = {
  importImageAsset: vi.fn(async () => ({ src: IMPORTED_SRC, hash: 'h', deduplicated: false, bytes: 3 })),
}

vi.mock('../../../core/workspace-backend', async () => {
  const actual = await vi.importActual<typeof import('../../../core/workspace-backend')>('../../../core/workspace-backend')
  return {
    ...actual,
    resolveBackend: () => mockBackend,
  }
})

function createCoreWithView(content: { type: string; content?: unknown[] } = { type: 'doc', content: [{ type: 'paragraph' }] }): EditorCore {
  const mount = document.createElement('div')
  document.body.appendChild(mount)

  const setup = createNevoEditorState({
    schema: nevoBaseSchema,
    content: content as never,
  })

  const view = new EditorView(mount, {
    state: setup.state,
    nodeViews: setup.nodeViews,
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction))
    },
  })

  return {
    editorView: view,
    pluginHost: null,
    schema: setup.state.schema as never,
    commandRegistry: new Map(),
    coreCommands: null,
    slashItems: [],
    toolbarPluginActions: [],
    pendingImageTargetPos: null,
    pendingFileTargetPos: null,
    pendingMediaTargetPos: null,
    pendingMediaKind: null,
    lastSlashPluginState: { open: false, query: '', range: null, activeIndex: 0, itemIds: [] },
    isApplyingExternalState: false,
    lastSerializedContent: '',
    lastSerializedContentRef: null,
    setLastSerializedFromDoc: vi.fn(),
    lastLoadedNoteId: null,
    ydoc: null,
    awareness: null,
    ownsYdoc: false,
    workspacePath: null,
    refreshBrokenLinks: vi.fn(),
  } as unknown as EditorCore
}

function buildFileList(files: File[]): { item: (i: number) => File | null; length: number } {
  return new Proxy(files, {
    get(target, prop, receiver) {
      if (prop === 'item') return (i: number) => target[i] ?? null
      if (prop === 'length') return target.length
      return Reflect.get(target, prop, receiver)
    },
  }) as unknown as { item: (i: number) => File | null; length: number }
}

function buildPasteEvent(files: File[], plainText?: string): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: {
      files: buildFileList(files),
      types: plainText ? ['text/plain'] : ['Files'],
      getData: () => plainText ?? '',
    },
  })
  return event
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useImageUpload — paste handling', () => {
  it('detects an image file in the clipboard and blocks the default paste', async () => {
    const core = createCoreWithView()
    const upload = useImageUpload(
      core,
      () => '/workspace',
      () => {},
    )

    const file = new File(['png-bytes'], 'pasted.png', { type: 'image/png' })
    const event = buildPasteEvent([file])

    const handled = upload.onEditorPaste(event)

    expect(handled).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    // Flush any pending microtasks (import kicked off asynchronously).
    await Promise.resolve()

    core.editorView?.destroy()
  })

  it('returns false (and does not preventDefault) for a plain-text paste', async () => {
    const core = createCoreWithView()
    const upload = useImageUpload(
      core,
      () => '/workspace',
      () => {},
    )

    const event = buildPasteEvent([], 'Hello')

    const handled = upload.onEditorPaste(event)

    expect(handled).toBe(false)
    expect(event.defaultPrevented).toBe(false)

    core.editorView?.destroy()
  })

  it('ignores non-image files on the clipboard', async () => {
    const core = createCoreWithView()
    const upload = useImageUpload(
      core,
      () => '/workspace',
      () => {},
    )

    const file = new File(['pdf-bytes'], 'doc.pdf', { type: 'application/pdf' })
    const event = buildPasteEvent([file])

    const handled = upload.onEditorPaste(event)

    expect(handled).toBe(false)
    expect(event.defaultPrevented).toBe(false)

    core.editorView?.destroy()
  })

  it('replaces the empty paragraph with an image_block instead of inserting beside it', async () => {
    // Doc: [paragraph "abc", paragraph ""]
    const core = createCoreWithView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'abc' }] },
        { type: 'paragraph' },
      ],
    })
    const view = core.editorView!
    // Place the caret inside the empty (second) paragraph.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)))

    // Resolve the mocked backend by opening a local handle.
    const { useWorkspaceStore } = await import('../../../stores/workspace')
    useWorkspaceStore().activeHandle = { kind: 'local', path: '/workspace' } as never

    const upload = useImageUpload(
      core,
      () => '/workspace',
      () => {},
    )

    const file = new File(['png-bytes'], 'pasted.png', { type: 'image/png' })
    const event = buildPasteEvent([file])
    upload.onEditorPaste(event)
    // Let the async import + dispatch settle.
    await new Promise((r) => setTimeout(r, 0))

    expect(mockBackend.importImageAsset).toHaveBeenCalledTimes(1)

    const { doc } = core.editorView!.state
    const nodeTypes: string[] = []
    for (let i = 0; i < doc.childCount; i++) nodeTypes.push(doc.child(i).type.name)

    // The empty paragraph must have been replaced, not left in place.
    expect(nodeTypes).toEqual(['paragraph', 'image_block'])

    core.editorView?.destroy()
  })
})
