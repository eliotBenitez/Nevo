import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { TextSelection } from 'prosemirror-state'
import type { NoteDocument } from '../../../types/note'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'
import { appLogger } from '../../../utils/logger'
import { getSlashMenuState } from '../../../editor-core'
import { createEditorCore, useEditorCore } from './useEditorCore'

vi.mock('../../../tauri/commands', () => ({
  collabCommands: {
    loadYjsState: vi.fn(),
    saveYjsState: vi.fn(),
  },
}))

vi.mock('../../../utils/logger', () => ({
  appLogger: {
    warn: vi.fn(() => Promise.resolve()),
    error: vi.fn(() => Promise.resolve()),
    info: vi.fn(() => Promise.resolve()),
    debug: vi.fn(() => Promise.resolve()),
  },
}))

const settings = createDefaultWorkspaceSettings()

beforeEach(() => {
  // useEditorCore resolves the workspace/auth stores at setup.
  setActivePinia(createPinia())
})

function createNote(content: NoteDocument['content']): NoteDocument {
  return {
    id: 'note-1',
    title: 'Editor note',
    icon: '📄',
    folderId: null,
    createdAt: '2026-05-21T10:00:00.000Z',
    updatedAt: '2026-05-21T10:00:00.000Z',
    content,
  }
}

function createCallbacks() {
  return {
    onOverlaysUpdate: vi.fn(),
    onCloseOverlays: vi.fn(),
    onContentUpdate: vi.fn(),
    onDocDirty: vi.fn(),
    onDocChanged: vi.fn(),
    onInternalLinkOpen: vi.fn(),
    onLinkPickerEnter: vi.fn(() => false),
    onImagePickerRequest: vi.fn(),
    onFilePickerRequest: vi.fn(),
    onFileOpenRequest: vi.fn(),
    onMathEditRequest: vi.fn(),
    onMathInlineInsert: vi.fn(() => false),
    onMathBlockInsert: vi.fn(() => false),
    onSlashMathItemRan: vi.fn(),
    onSlashEmojiPickRequest: vi.fn(),
    onMermaidEditRequest: vi.fn(),
    onMarkmapEditRequest: vi.fn(),
    onVegaEditRequest: vi.fn(),
    onPluginNodeEditRequest: vi.fn(),
    onCalloutIconPickRequest: vi.fn(),
    onMediaPickerRequest: vi.fn(),
    onNoteEmbedPickRequest: vi.fn(),
    onEmbedUrlRequest: vi.fn(),
    onNoteEmbedOpen: vi.fn(),
    onImageContextMenuRequest: vi.fn(),
    onAfterTransaction: vi.fn(),
  }
}

async function mountEditor(note: NoteDocument, settingsOverride = settings) {
  const core = createEditorCore()
  const callbacks = createCallbacks()
  const editor = useEditorCore(core, callbacks)
  const root = document.createElement('div')
  document.body.appendChild(root)
  await editor.setupEditorForNote(note, root, settingsOverride)
  return { core, callbacks, editor, root, destroy: () => { editor.destroyEditorView(); root.remove() } }
}

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.lang = ''
})

describe('useEditorCore internal links', () => {
  it('enables native spellcheck and editor language attributes when configured', async () => {
    document.documentElement.lang = 'en'
    const note = createNote({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
    const spellcheckSettings = createDefaultWorkspaceSettings()
    spellcheckSettings.editor.spellCheck = true

    const { root, destroy } = await mountEditor(note, spellcheckSettings)

    try {
      const editorEl = root.querySelector('.ProseMirror')
      expect(editorEl).toBeInstanceOf(HTMLElement)
      expect(editorEl?.getAttribute('spellcheck')).toBe('true')
      expect(editorEl?.getAttribute('lang')).toBe('en')
    } finally {
      destroy()
    }
  })

  it('disables native spellcheck when configured', async () => {
    const note = createNote({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
    const spellcheckSettings = createDefaultWorkspaceSettings()
    spellcheckSettings.editor.spellCheck = false

    const { root, destroy } = await mountEditor(note, spellcheckSettings)

    try {
      const editorEl = root.querySelector('.ProseMirror')
      expect(editorEl).toBeInstanceOf(HTMLElement)
      expect(editorEl?.getAttribute('spellcheck')).toBe('false')
    } finally {
      destroy()
    }
  })

  it('inserts a selected emoji into the active slash range', async () => {
    const note = createNote({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '/emoji' }],
        },
      ],
    })

    const { core, editor, destroy } = await mountEditor(note)

    try {
      const view = core.editorView
      expect(view).not.toBeNull()

      view?.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)))

      expect(editor.insertEmojiFromSlashPicker('🙂')).toBe(true)
      expect(core.editorView?.state.doc.textContent).toBe('🙂')
    } finally {
      destroy()
    }
  })

  it('opens the embed URL request after running the embed slash item', async () => {
    const note = createNote({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '/embed' }],
        },
      ],
    })

    const { core, callbacks, editor, destroy } = await mountEditor(note)

    try {
      const view = core.editorView
      expect(view).not.toBeNull()
      if (!view) return

      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)))
      const slashState = getSlashMenuState(view.state)
      expect(slashState.open).toBe(true)

      const embedItem = core.slashItems.find((item) => item.id === 'embed')
      expect(embedItem).toBeDefined()
      expect(editor.runSlashItemFromOverlay(embedItem!, slashState)).toBe(true)

      expect(callbacks.onEmbedUrlRequest).toHaveBeenCalledTimes(1)
      const [pos] = callbacks.onEmbedUrlRequest.mock.calls[0]
      expect(core.editorView?.state.doc.nodeAt(pos)?.type.name).toBe('embed_block')
    } finally {
      destroy()
    }
  })

  it('batches content updates and flushes the latest document on demand', async () => {
    vi.useFakeTimers()
    const note = createNote({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })

    const { core, callbacks, editor, destroy } = await mountEditor(note)

    try {
      const view = core.editorView
      expect(view).not.toBeNull()

      view?.dispatch(view.state.tr.insertText('A', 1))
      view?.dispatch(view.state.tr.insertText('B', 2))

      expect(callbacks.onDocDirty).toHaveBeenCalledTimes(2)
      expect(callbacks.onContentUpdate).not.toHaveBeenCalled()

      const flushed = editor.flushPendingContentUpdate()

      expect(callbacks.onContentUpdate).toHaveBeenCalledTimes(1)
      expect(flushed).toEqual({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'AB' }],
          },
        ],
      })

      vi.advanceTimersByTime(300)
      expect(callbacks.onContentUpdate).toHaveBeenCalledTimes(1)
    } finally {
      destroy()
      vi.useRealTimers()
    }
  })

  it('serializes once after the debounce window for rapid edits', async () => {
    vi.useFakeTimers()
    const note = createNote({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })

    const { core, callbacks, destroy } = await mountEditor(note)

    try {
      const view = core.editorView
      view?.dispatch(view.state.tr.insertText('A', 1))
      vi.advanceTimersByTime(200)
      view?.dispatch(view.state.tr.insertText('B', 2))
      vi.advanceTimersByTime(249)

      expect(callbacks.onContentUpdate).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)

      expect(callbacks.onContentUpdate).toHaveBeenCalledTimes(1)
      expect(callbacks.onContentUpdate).toHaveBeenCalledWith({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'AB' }],
          },
        ],
      })
    } finally {
      destroy()
      vi.useRealTimers()
    }
  })

  it('opens internal links on ordinary left click and passes noteId with anchor', async () => {
    const note = createNote({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Linked note',
              marks: [{ type: 'internal_link', attrs: { noteId: 'note-2', anchor: 'heading-1' } }],
            },
          ],
        },
      ],
    })

    const { callbacks, root, destroy } = await mountEditor(note)

    try {
      const link = root.querySelector('a[data-note-id="note-2"]')
      expect(link).toBeInstanceOf(HTMLAnchorElement)

      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      link?.dispatchEvent(event)

      expect(callbacks.onInternalLinkOpen).toHaveBeenCalledWith('note-2', 'heading-1')
      expect(event.defaultPrevented).toBe(true)
    } finally {
      destroy()
    }
  })

  it('ignores modified clicks and non-internal anchors', async () => {
    const note = createNote({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Linked note',
              marks: [{ type: 'internal_link', attrs: { noteId: 'note-2', anchor: null } }],
            },
          ],
        },
      ],
    })

    const { callbacks, root, destroy } = await mountEditor(note)

    try {
      const internalLink = root.querySelector('a[data-note-id="note-2"]')
      expect(internalLink).toBeInstanceOf(HTMLAnchorElement)

      const externalLink = document.createElement('a')
      externalLink.href = 'https://example.com'
      externalLink.textContent = 'External'
      root.appendChild(externalLink)

      externalLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
      internalLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true }))
      internalLink?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }))

      expect(callbacks.onInternalLinkOpen).not.toHaveBeenCalled()
    } finally {
      destroy()
    }
  })

  it('logs and suppresses ProseMirror transform errors from editor commands', async () => {
    const note = createNote({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
    const { editor, callbacks, destroy } = await mountEditor(note)

    try {
      const result = editor.executeStateCommand(() => {
        const error = new Error('Structure gap-replace would overwrite content')
        error.name = 'TransformError'
        throw error
      })

      expect(result).toBe(false)
      expect(callbacks.onOverlaysUpdate).toHaveBeenCalledTimes(1)
      expect(appLogger.warn).toHaveBeenCalledWith(expect.objectContaining({
        event: 'command_transform_error',
      }))
    } finally {
      destroy()
    }
  })
})
