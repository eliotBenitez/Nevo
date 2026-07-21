import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { WorkspaceSettings } from '../../../types/workspace'
import type { EditorCore, EditorCoreCallbacks } from './useEditorCore'
import {
  useWorkspaceEditorCore,
  type WorkspaceEditorCoreOptions,
} from './useWorkspaceEditorCore'

const editorCoreMock = vi.hoisted(() => ({
  callbacks: null as EditorCoreCallbacks | null,
  setup: { marker: 'editor-setup' },
}))

const noteCommandMocks = vi.hoisted(() => ({
  loadNote: vi.fn(),
}))

const blockNodeMock = vi.hoisted(() => vi.fn())

vi.mock('./useEditorCore', () => ({
  useEditorCore: vi.fn((_core, callbacks: EditorCoreCallbacks) => {
    editorCoreMock.callbacks = callbacks
    return editorCoreMock.setup
  }),
}))

vi.mock('../../../tauri/commands', () => ({
  noteCommands: noteCommandMocks,
}))

vi.mock('../../../utils/noteExport/htmlSerializer', () => ({
  blockNode: blockNodeMock,
}))

function createOptions(overrides: Partial<WorkspaceEditorCoreOptions> = {}) {
  const core = {
    lastLoadedNoteId: 'note-1',
    pendingImageTargetPos: null,
    pendingFileTargetPos: null,
  } as EditorCore

  const settings = {
    editor: {
      typewriterScrolling: false,
      typewriterPosition: 'lower',
    },
  } as WorkspaceSettings

  const options: WorkspaceEditorCoreOptions = {
    core,
    editorScrollEl: ref(null),
    getSettings: () => settings,
    getNoteId: () => 'note-1',
    getWorkspacePath: () => '/workspace',
    updateOverlays: vi.fn(),
    closeOverlays: vi.fn(),
    closeSlashEmojiPicker: vi.fn(),
    closeEmbedUrlPopover: vi.fn(),
    emitContentUpdate: vi.fn(),
    emitContentDirty: vi.fn(),
    onTransactionDoc: vi.fn(),
    scheduleGraphUpdate: vi.fn(),
    markRemovedEditorAssets: vi.fn(),
    openInternalLink: vi.fn(),
    internalLinkExists: vi.fn(() => true),
    resolveWikiLink: vi.fn(() => 'note-2'),
    resolveAssetSrc: vi.fn(src => `asset://${src}`),
    resolveMediaSrc: vi.fn(src => `media://${src}`),
    backendSupportsPathImport: vi.fn(() => true),
    pickAndInsertImage: vi.fn(async () => undefined),
    requestImageInput: vi.fn(),
    onImagePaste: vi.fn(() => false),
    openImageContextMenu: vi.fn(),
    pickAndInsertFile: vi.fn(async () => undefined),
    requestFileInput: vi.fn(),
    openFileAsset: vi.fn(async () => undefined),
    requestMediaPicker: vi.fn(),
    openNoteEmbedPicker: vi.fn(),
    openEmbedUrlPopover: vi.fn(),
    openNoteEmbed: vi.fn(),
    openMathEditor: vi.fn(),
    openFormulaEditor: vi.fn(),
    openMermaidEditor: vi.fn(),
    openPluginNodeEditor: vi.fn(),
    openMarkmapEditor: vi.fn(),
    openVegaEditor: vi.fn(),
    openDraw: vi.fn(),
    selectActiveLinkPicker: vi.fn(() => false),
    insertInlineMath: vi.fn(() => true),
    insertBlockMath: vi.fn(() => true),
    openSelectedMathEditor: vi.fn(),
    openSlashEmojiPicker: vi.fn(),
    openCalloutIconPicker: vi.fn(),
    openTemplatePicker: vi.fn(),
    ...overrides,
  }

  return { core, options }
}

beforeEach(() => {
  editorCoreMock.callbacks = null
  noteCommandMocks.loadNote.mockReset()
  blockNodeMock.mockReset()
})

describe('useWorkspaceEditorCore', () => {
  it('only emits document changes for the currently loaded note', () => {
    const { core, options } = createOptions()
    const result = useWorkspaceEditorCore(options)
    const callbacks = editorCoreMock.callbacks

    expect(result.editorSetup).toBe(editorCoreMock.setup)
    callbacks?.onContentUpdate({ type: 'doc', content: [] })
    callbacks?.onDocDirty?.()
    expect(options.emitContentUpdate).toHaveBeenCalledOnce()
    expect(options.emitContentDirty).toHaveBeenCalledOnce()

    core.lastLoadedNoteId = 'other-note'
    callbacks?.onContentUpdate({ type: 'doc', content: [] })
    callbacks?.onDocDirty?.()
    expect(options.emitContentUpdate).toHaveBeenCalledOnce()
    expect(options.emitContentDirty).toHaveBeenCalledOnce()
  })

  it('routes picker requests through native paths or browser inputs', () => {
    const local = createOptions()
    useWorkspaceEditorCore(local.options)
    editorCoreMock.callbacks?.onImagePickerRequest(7)
    editorCoreMock.callbacks?.onFilePickerRequest(9)

    expect(local.options.pickAndInsertImage).toHaveBeenCalledWith(7)
    expect(local.options.pickAndInsertFile).toHaveBeenCalledWith(9)

    const cloud = createOptions({
      backendSupportsPathImport: () => false,
    })
    useWorkspaceEditorCore(cloud.options)
    editorCoreMock.callbacks?.onImagePickerRequest(11)
    editorCoreMock.callbacks?.onFilePickerRequest(13)

    expect(cloud.core.pendingImageTargetPos).toBe(11)
    expect(cloud.core.pendingFileTargetPos).toBe(13)
    expect(cloud.options.requestImageInput).toHaveBeenCalledOnce()
    expect(cloud.options.requestFileInput).toHaveBeenCalledOnce()
  })

  it('owns the AI ask request and resolves a confirmed instruction', () => {
    const { options } = createOptions()
    const result = useWorkspaceEditorCore(options)
    const submit = vi.fn()

    editorCoreMock.callbacks?.onAiAskRequest?.(submit)
    expect(result.aiAskOpen.value).toBe(true)

    result.aiAskValue.value = 'Summarize this'
    result.confirmAiAsk()

    expect(submit).toHaveBeenCalledWith('Summarize this')
    expect(result.aiAskOpen.value).toBe(false)
  })

  it('loads note embed HTML and resolves exported asset sources', async () => {
    const { options } = createOptions()
    noteCommandMocks.loadNote.mockResolvedValue({
      content: { type: 'doc', content: [] },
    })
    blockNodeMock.mockImplementation(async (_content, context) => {
      context.assetSrcs.push('.nevo/assets/preview.png')
      return '<img src="__EMBED__/preview.png">'
    })
    useWorkspaceEditorCore(options)
    const setHtml = vi.fn()
    const setLoading = vi.fn()

    await editorCoreMock.callbacks?.onNoteEmbedContentLoad?.({
      noteId: 'note-2',
      setHtml,
      setLoading,
    })

    expect(noteCommandMocks.loadNote).toHaveBeenCalledWith('/workspace', 'note-2')
    expect(setLoading.mock.calls).toEqual([[true], [false]])
    expect(setHtml).toHaveBeenCalledWith(
      '<img src="asset://.nevo/assets/preview.png">',
    )
  })
})
