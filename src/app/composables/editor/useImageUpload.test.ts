import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import { redo, undo } from 'prosemirror-history'
import { EditorView } from 'prosemirror-view'
import { createNevoEditorState } from '../../../editor-core/state'
import { nevoBaseSchema } from '../../../editor-core/schema'
import type { EditorCore } from './useEditorCore'
import { useImageUpload } from './useImageUpload'

const IMPORTED_SRC = '.nevo/assets/pasted.png'

const clipboardMock = vi.hoisted(() => ({
  readImage: vi.fn(),
  readText: vi.fn(),
}))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => clipboardMock)

const noteCommandMocks = vi.hoisted(() => ({
  pickAndImportAsset: vi.fn(),
  importClipboardImagePath: vi.fn(),
}))
vi.mock('../../../tauri/commands', () => ({ noteCommands: noteCommandMocks }))

vi.mock('../../../utils/logger', () => ({
  appLogger: {
    warn: vi.fn(() => Promise.resolve()),
    error: vi.fn(() => Promise.resolve()),
    info: vi.fn(() => Promise.resolve()),
    debug: vi.fn(() => Promise.resolve()),
  },
}))

const mockBackend = {
  handle: { kind: 'local', path: '/workspace' },
  importImageAsset: vi.fn(async () => ({ src: IMPORTED_SRC, hash: 'h', deduplicated: false, bytes: 3 })),
  importImageFromUrl: vi.fn(async () => ({ src: IMPORTED_SRC, hash: 'h', deduplicated: false, bytes: 3 })),
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

function buildTypedPasteEvent(dataByType: Record<string, string>, files: File[] = []): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: {
      files: buildFileList(files),
      types: Object.keys(dataByType),
      getData: (type: string) => dataByType[type] ?? '',
    },
  })
  return event
}

// Mirrors WebKitGTK: types advertises text/uri-list but the payload is withheld
// from the webview (getData returns '') — the value is only reachable natively.
function buildUriListPasteEvent(): ClipboardEvent {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: {
      files: buildFileList([]),
      types: ['text/uri-list'],
      getData: () => '',
    },
  })
  return event
}

async function useLocalBackend() {
  const { useWorkspaceStore } = await import('../../../stores/workspace')
  useWorkspaceStore().activeHandle = { kind: 'local', path: '/workspace' } as never
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockBackend.importImageAsset.mockClear()
  mockBackend.importImageFromUrl.mockClear()
  noteCommandMocks.pickAndImportAsset.mockReset()
  noteCommandMocks.importClipboardImagePath.mockReset()
  noteCommandMocks.importClipboardImagePath.mockResolvedValue(null)
  clipboardMock.readImage.mockReset()
  clipboardMock.readText.mockReset()
  // Default: no bitmap on the clipboard.
  clipboardMock.readImage.mockRejectedValue(new Error('no image'))
  clipboardMock.readText.mockResolvedValue('')
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
    expect(view.state.selection).toBeInstanceOf(NodeSelection)
    expect((view.state.selection as NodeSelection).node.type.name).toBe('image_block')

    core.editorView?.destroy()
  })

  it.each([
    {
      name: 'at the beginning',
      content: { type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'after' }] }] },
      cursor: 1,
      expected: ['image_block', 'paragraph'],
      expectedText: 'after',
    },
    {
      name: 'in the middle',
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
          { type: 'paragraph' },
          { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
        ],
      },
      cursor: 9,
      expected: ['paragraph', 'image_block', 'paragraph'],
      expectedText: 'beforeafter',
    },
  ])('selects the pasted image when replacing an empty paragraph $name', async ({ content, cursor, expected, expectedText }) => {
    await useLocalBackend()
    const core = createCoreWithView(content)
    const view = core.editorView!
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cursor)))
    const upload = useImageUpload(core, () => '/workspace', () => {})

    upload.onEditorPaste(buildPasteEvent([new File(['png-bytes'], 'pasted.png', { type: 'image/png' })]))
    await new Promise((r) => setTimeout(r, 0))

    expect(view.state.doc.content.content.map((node) => node.type.name)).toEqual(expected)
    expect(view.state.doc.textContent).toBe(expectedText)
    expect(view.state.selection).toBeInstanceOf(NodeSelection)
    expect((view.state.selection as NodeSelection).node.type.name).toBe('image_block')

    expect(undo(view.state, (tr) => view.dispatch(tr))).toBe(true)
    expect(view.state.doc.content.content.map((node) => node.type.name)).toEqual(content.content.map((node) => node.type))
    expect(view.state.doc.textContent).toBe(expectedText)
    expect(redo(view.state, (tr) => view.dispatch(tr))).toBe(true)
    expect(view.state.doc.content.content.map((node) => node.type.name)).toEqual(expected)
    expect(view.state.doc.textContent).toBe(expectedText)
    view.destroy()
  })

  it('preserves each image when multiple image files are pasted into an empty paragraph', async () => {
    await useLocalBackend()
    const core = createCoreWithView({
      type: 'doc',
      content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'after' }] }],
    })
    const view = core.editorView!
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
    const upload = useImageUpload(core, () => '/workspace', () => {})

    upload.onEditorPaste(buildPasteEvent([
      new File(['first'], 'first.png', { type: 'image/png' }),
      new File(['second'], 'second.png', { type: 'image/png' }),
    ]))
    await new Promise((r) => setTimeout(r, 0))

    const images: string[] = []
    view.state.doc.descendants((node) => {
      if (node.type.name === 'image_block') images.push(node.attrs.alt as string)
    })
    expect(images).toEqual(['first.png', 'second.png'])
    expect(view.state.doc.content.content.map((node) => node.type.name)).toEqual(['image_block', 'image_block', 'paragraph'])
    expect(view.state.doc.textContent).toBe('after')
    expect(view.state.selection).toBeInstanceOf(NodeSelection)
    expect((view.state.selection as NodeSelection).node.attrs.alt).toBe('second.png')
    view.destroy()
  })

  it('replaces an already selected image when a single image is pasted', async () => {
    await useLocalBackend()
    const core = createCoreWithView({
      type: 'doc',
      content: [{ type: 'image_block', attrs: { src: '.nevo/assets/old.png', alt: 'old.png' } }],
    })
    const view = core.editorView!
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))
    const upload = useImageUpload(core, () => '/workspace', () => {})

    upload.onEditorPaste(buildPasteEvent([new File(['new'], 'new.png', { type: 'image/png' })]))
    await new Promise((r) => setTimeout(r, 0))

    const images: string[] = []
    view.state.doc.descendants((node) => {
      if (node.type.name === 'image_block') images.push(node.attrs.alt as string)
    })
    expect(images).toEqual(['new.png'])
    view.destroy()
  })

  it('imports a local image from the native clipboard (file:// path via readText)', async () => {
    await useLocalBackend()
    clipboardMock.readText.mockResolvedValue('file:///home/user/photo.png')
    noteCommandMocks.importClipboardImagePath.mockResolvedValue({
      src: IMPORTED_SRC,
      hash: 'h',
      deduplicated: false,
      bytes: 3,
      fileName: 'photo.png',
    })
    const core = createCoreWithView({
      type: 'doc',
      content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'after' }] }],
    })
    core.editorView!.dispatch(core.editorView!.state.tr.setSelection(TextSelection.create(core.editorView!.state.doc, 1)))
    const upload = useImageUpload(core, () => '/workspace', () => {})

    const event = buildUriListPasteEvent()
    const handled = upload.onEditorPaste(event)

    expect(handled).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(noteCommandMocks.importClipboardImagePath).toHaveBeenCalledWith('/workspace')
    expect(core.editorView!.state.doc.firstChild?.type.name).toBe('image_block')
    expect(core.editorView!.state.doc.textContent).toBe('after')
    expect(core.editorView!.state.selection).toBeInstanceOf(NodeSelection)
    expect((core.editorView!.state.selection as NodeSelection).node.type.name).toBe('image_block')

    core.editorView?.destroy()
  })

  it('downloads a web image from the native clipboard (http URL via readText)', async () => {
    await useLocalBackend()
    const url = 'https://example.com/pic.png'
    clipboardMock.readText.mockResolvedValue(url)
    const core = createCoreWithView({
      type: 'doc',
      content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'after' }] }],
    })
    core.editorView!.dispatch(core.editorView!.state.tr.setSelection(TextSelection.create(core.editorView!.state.doc, 1)))
    const upload = useImageUpload(core, () => '/workspace', () => {})

    const event = buildUriListPasteEvent()
    const handled = upload.onEditorPaste(event)

    expect(handled).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(mockBackend.importImageFromUrl).toHaveBeenCalledWith(url)

    const { doc } = core.editorView!.state
    let imageSrc: string | null = null
    doc.descendants((node) => {
      if (node.type.name === 'image_block') imageSrc = node.attrs.src as string
    })
    expect(imageSrc).toBe(IMPORTED_SRC)
    expect(core.editorView!.state.doc.textContent).toBe('after')
    expect(core.editorView!.state.selection).toBeInstanceOf(NodeSelection)
    expect((core.editorView!.state.selection as NodeSelection).node.type.name).toBe('image_block')

    core.editorView?.destroy()
  })

  it('downloads a web image pasted as image-only text/html', async () => {
    await useLocalBackend()
    const url = 'https://private-user-images.githubusercontent.com/1/abc.png?jwt=x'
    const event = buildTypedPasteEvent({ 'text/html': `<meta charset="utf-8"><img src="${url}" alt="">` })
    const core = createCoreWithView({
      type: 'doc',
      content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'after' }] }],
    })
    core.editorView!.dispatch(core.editorView!.state.tr.setSelection(TextSelection.create(core.editorView!.state.doc, 1)))
    const upload = useImageUpload(core, () => '/workspace', () => {})

    const handled = upload.onEditorPaste(event)

    expect(handled).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(mockBackend.importImageFromUrl).toHaveBeenCalledWith(url)

    const { doc } = core.editorView!.state
    let imageSrc: string | null = null
    doc.descendants((node) => {
      if (node.type.name === 'image_block') imageSrc = node.attrs.src as string
    })
    expect(imageSrc).toBe(IMPORTED_SRC)
    expect(core.editorView!.state.doc.textContent).toBe('after')
    expect(core.editorView!.state.selection).toBeInstanceOf(NodeSelection)
    expect((core.editorView!.state.selection as NodeSelection).node.type.name).toBe('image_block')

    core.editorView?.destroy()
  })

  it('does not hijack a rich-text/html paste that contains text alongside an image', async () => {
    await useLocalBackend()
    const event = buildTypedPasteEvent({
      'text/html': '<p>hello <img src="https://example.com/x.png"> world</p>',
      'text/plain': 'hello world',
    })
    const core = createCoreWithView()
    const upload = useImageUpload(core, () => '/workspace', () => {})

    const handled = upload.onEditorPaste(event)

    expect(handled).toBe(false)
    expect(mockBackend.importImageFromUrl).not.toHaveBeenCalled()

    core.editorView?.destroy()
  })

  it('does not treat a plain-text paste (no uri-list) as an image', async () => {
    const core = createCoreWithView()
    const upload = useImageUpload(core, () => '/workspace', () => {})

    const event = buildTypedPasteEvent({ 'text/plain': 'https://example.com/article' })
    const handled = upload.onEditorPaste(event)

    expect(handled).toBe(false)
    expect(event.defaultPrevented).toBe(false)

    core.editorView?.destroy()
  })
})
