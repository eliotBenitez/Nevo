import { describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceEditorOverlayHandlers,
} from './createWorkspaceEditorOverlayHandlers'

type HandlerOptions = Parameters<typeof createWorkspaceEditorOverlayHandlers>[0]

function createOptions(local = true) {
  const pickAndInsertImage = vi.fn(async () => undefined)
  const requestImagePicker = vi.fn()
  const clickImageInput = vi.fn()
  const applyLink = vi.fn()
  const applyHighlight = vi.fn()
  const linkPopover = { href: '' }
  const mathPopover = { latex: '' }

  const options = {
    editorSetup: {
      runSlashItemFromOverlay: vi.fn(),
      executeCommandById: vi.fn(),
    },
    toolbarActions: {
      openHighlightPicker: vi.fn(),
      openTextColorPicker: vi.fn(),
      runPluginAction: vi.fn(),
      applyHighlight,
      removeHighlight: vi.fn(),
      applyTextColor: vi.fn(),
      removeTextColor: vi.fn(),
      applyTableCellAlignment: vi.fn(),
      applyTableCellBackground: vi.fn(),
      applyTableCellAttr: vi.fn(),
      openTableCellFormula: vi.fn(),
    },
    linkEditor: {
      openLinkPopover: vi.fn(),
      applyLinkFromPopover: applyLink,
      removeLinkFromPopover: vi.fn(),
      onLinkInputKeyDown: vi.fn(),
    },
    mathEditor: {
      applyMathFromPopover: vi.fn(),
      removeMathFromPopover: vi.fn(),
      onMathInputKeyDown: vi.fn(),
    },
    formulaEditor: {
      applyFormulaFromPopover: vi.fn(),
      removeFormulaFromPopover: vi.fn(),
      onFormulaInputKeyDown: vi.fn(),
    },
    mermaidEditor: {
      applyMermaidFromPopover: vi.fn(),
      removeMermaidFromPopover: vi.fn(),
      onMermaidInputKeyDown: vi.fn(),
    },
    markmapEditor: {
      applyMarkmapFromPopover: vi.fn(),
      removeMarkmapFromPopover: vi.fn(),
      onMarkmapInputKeyDown: vi.fn(),
    },
    vegaEditor: {
      applyVegaFromPopover: vi.fn(),
      removeVegaFromPopover: vi.fn(),
      onVegaInputKeyDown: vi.fn(),
    },
    pluginNodeEditor: {
      setValue: vi.fn(),
      apply: vi.fn(),
      remove: vi.fn(),
      onKeyDown: vi.fn(),
    },
    blockHandle: {
      onHandlePointerDown: vi.fn(),
      onTypeIconClick: vi.fn(),
      onHandleMouseEnter: vi.fn(),
      onHandleMouseLeave: vi.fn(),
      turnInto: vi.fn(),
      duplicateBlock: vi.fn(),
      insertBlockAbove: vi.fn(),
      insertBlockBelow: vi.fn(),
      deleteBlock: vi.fn(),
      copyBlockRef: vi.fn(),
      closeTypeMenu: vi.fn(),
      onMenuMouseEnter: vi.fn(),
      onMenuMouseLeave: vi.fn(),
    },
    linkPopover,
    mathPopover,
    formulaPopover: { formula: '' },
    mermaidPopover: { code: '' },
    markmapPopover: { markdown: '' },
    vegaPopover: { spec: '' },
    backendSupportsPathImport: () => local,
    pickAndInsertImage,
    requestImagePicker,
    clickImageInput,
    confirmEmbedUrl: vi.fn(),
    cancelEmbedUrl: vi.fn(),
    onEmbedUrlInputKeyDown: vi.fn(),
    selectLinkNote: vi.fn(),
    selectLinkCreateNote: vi.fn(),
    selectSlashEmoji: vi.fn(),
    openSlashEmojiPicker: vi.fn(),
    closeSlashEmojiPicker: vi.fn(),
    selectCalloutIcon: vi.fn(),
    closeCalloutIconPicker: vi.fn(),
    hideToolbarManually: vi.fn(),
  } as unknown as HandlerOptions

  return {
    options,
    pickAndInsertImage,
    requestImagePicker,
    clickImageInput,
    applyLink,
    applyHighlight,
    linkPopover,
    mathPopover,
  }
}

describe('createWorkspaceEditorOverlayHandlers', () => {
  it('preserves action bindings and popover state adapters', () => {
    const fixture = createOptions()
    const handlers = createWorkspaceEditorOverlayHandlers(fixture.options)

    handlers.applyLink()
    handlers.applyHighlight('#ff0')
    handlers.updateLinkHref('https://nevo.app')
    handlers.updateLatex('x^2')

    expect(fixture.applyLink).toHaveBeenCalledOnce()
    expect(fixture.applyHighlight).toHaveBeenCalledWith('#ff0')
    expect(fixture.linkPopover.href).toBe('https://nevo.app')
    expect(fixture.mathPopover.latex).toBe('x^2')
  })

  it('routes image requests for local and cloud workspaces', () => {
    const local = createOptions(true)
    createWorkspaceEditorOverlayHandlers(local.options).requestImage()

    expect(local.pickAndInsertImage).toHaveBeenCalledOnce()
    expect(local.requestImagePicker).not.toHaveBeenCalled()

    const cloud = createOptions(false)
    createWorkspaceEditorOverlayHandlers(cloud.options).requestImage()

    expect(cloud.requestImagePicker).toHaveBeenCalledOnce()
    expect(cloud.clickImageInput).toHaveBeenCalledOnce()
    expect(cloud.pickAndInsertImage).not.toHaveBeenCalled()
  })
})
