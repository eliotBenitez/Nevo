import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useEditorOverlayInteractions, type EditorOverlayElements } from './useEditorOverlayInteractions'

function emptyElements(): EditorOverlayElements {
  return {
    slashMenuEl: null,
    toolbarEl: null,
    linkPopoverEl: null,
    mathPopoverEl: null,
    formulaPopoverEl: null,
    mermaidPopoverEl: null,
    queryPopoverEl: null,
    markmapPopoverEl: null,
    vegaPopoverEl: null,
    pluginNodePopoverEl: null,
    embedUrlPopoverEl: null,
    calloutIconPickerEl: null,
    blockHandleEl: null,
    blockTypeMenuEl: null,
  }
}

function createOptions(overrides: Record<string, unknown> = {}) {
  return {
    overlayElements: ref<EditorOverlayElements | null>(emptyElements()),
    noteEmbedPickerEl: () => null,
    isBlockTypeMenuOpen: () => false,
    isLinkPopoverOpen: () => false,
    isMathPopoverOpen: () => false,
    isFormulaPopoverOpen: () => false,
    isMermaidPopoverOpen: () => false,
    isQueryPopoverOpen: () => false,
    isMarkmapPopoverOpen: () => false,
    isVegaPopoverOpen: () => false,
    isPluginNodePopoverOpen: () => false,
    isEmbedUrlPopoverOpen: () => false,
    isCalloutIconPickerOpen: () => false,
    isSlashEmojiPickerOpen: () => false,
    isNoteEmbedPickerOpen: () => false,
    closeBlockTypeMenu: vi.fn(),
    closeLinkPopover: vi.fn(),
    closeMathPopover: vi.fn(),
    closeFormulaPopover: vi.fn(),
    closeMermaidPopover: vi.fn(),
    closeQueryPopover: vi.fn(),
    closeMarkmapPopover: vi.fn(),
    closeVegaPopover: vi.fn(),
    closePluginNodePopover: vi.fn(),
    closeEmbedUrlPopover: vi.fn(),
    closeCalloutIconPicker: vi.fn(),
    closeSlashEmojiPicker: vi.fn(),
    closeNoteEmbedPicker: vi.fn(),
    isEmbedOpeningClickIgnored: () => false,
    onEditorScroll: vi.fn(),
    repositionOverlays: [],
    ...overrides,
  }
}

describe('useEditorOverlayInteractions', () => {
  it('closes an embed popover only after its opening click is no longer ignored', () => {
    const closeEmbedUrlPopover = vi.fn()
    let ignoreOpeningClick = true
    const options = createOptions({
      isEmbedUrlPopoverOpen: () => true,
      isEmbedOpeningClickIgnored: () => ignoreOpeningClick,
      closeEmbedUrlPopover,
    })
    const interactions = useEditorOverlayInteractions(options)
    const target = document.createElement('button')

    interactions.onDocumentMouseDown({ target } as unknown as MouseEvent)
    expect(closeEmbedUrlPopover).not.toHaveBeenCalled()

    ignoreOpeningClick = false
    interactions.onDocumentMouseDown({ target } as unknown as MouseEvent)
    expect(closeEmbedUrlPopover).toHaveBeenCalledOnce()
  })

  it('keeps a plugin popover open while interacting with a shared select menu', () => {
    const closePluginNodePopover = vi.fn()
    const selectMenu = document.createElement('div')
    selectMenu.className = 'nv-select__menu'
    const option = document.createElement('button')
    selectMenu.append(option)
    const interactions = useEditorOverlayInteractions(createOptions({
      isPluginNodePopoverOpen: () => true,
      closePluginNodePopover,
    }))

    interactions.onDocumentMouseDown({ target: option } as unknown as MouseEvent)

    expect(closePluginNodePopover).not.toHaveBeenCalled()
  })

  it('keeps a query popover open while interacting with a teleported date picker', () => {
    const closeQueryPopover = vi.fn()
    const datePopover = document.createElement('div')
    datePopover.className = 'ndp-popover'
    const day = document.createElement('button')
    datePopover.append(day)
    const interactions = useEditorOverlayInteractions(createOptions({
      isQueryPopoverOpen: () => true,
      closeQueryPopover,
    }))

    interactions.onDocumentMouseDown({ target: day } as unknown as MouseEvent)

    expect(closeQueryPopover).not.toHaveBeenCalled()
  })

  it('updates scroll metrics once per frame and repositions only active overlays', () => {
    const calls: string[] = []
    let pendingFrame: FrameRequestCallback | null = null
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      pendingFrame = callback
      return 1
    })
    const interactions = useEditorOverlayInteractions(createOptions({
      onEditorScroll: () => calls.push('scroll'),
      repositionOverlays: [
        { isActive: () => true, reposition: () => calls.push('toolbar') },
        { isActive: () => false, reposition: () => calls.push('math') },
      ],
    }))

    interactions.handleEditorScroll()
    interactions.handleEditorScroll()

    expect(requestFrame).toHaveBeenCalledOnce()
    expect(calls).toEqual([])

    const frame = pendingFrame as FrameRequestCallback | null
    expect(frame).not.toBeNull()
    frame?.(16)

    expect(calls).toEqual(['scroll', 'toolbar'])
    requestFrame.mockRestore()
  })
})
