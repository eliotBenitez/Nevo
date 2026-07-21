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

  it('updates scroll metrics before repositioning every overlay', () => {
    const calls: string[] = []
    const interactions = useEditorOverlayInteractions(createOptions({
      onEditorScroll: () => calls.push('scroll'),
      repositionOverlays: [
        () => calls.push('toolbar'),
        () => calls.push('math'),
      ],
    }))

    interactions.handleEditorScroll()

    expect(calls).toEqual(['scroll', 'toolbar', 'math'])
  })
})
