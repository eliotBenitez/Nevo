import type { useEditorCore } from './useEditorCore'
import type { useEditorToolbarActions } from './useEditorToolbarActions'
import type { useLinkEditor } from './useLinkEditor'
import type { useMathEditor } from './useMathEditor'
import type { useFormulaEditor } from './useFormulaEditor'
import type { useMermaidEditor } from './useMermaidEditor'
import type { useMarkmapEditor } from './useMarkmapEditor'
import type { useVegaEditor } from './useVegaEditor'
import type { usePluginNodePopover } from './usePluginNodePopover'
import type { useBlockHandle } from './useBlockHandle'
import type { OverlayHandlers } from '../../components/editor/EditorOverlayContainer.vue'

interface ValueState {
  href?: string
  latex?: string
  formula?: string
  code?: string
  markdown?: string
  spec?: string
}

interface WorkspaceEditorOverlayHandlerOptions {
  editorSetup: ReturnType<typeof useEditorCore>
  toolbarActions: ReturnType<typeof useEditorToolbarActions>
  linkEditor: ReturnType<typeof useLinkEditor>
  mathEditor: ReturnType<typeof useMathEditor>
  formulaEditor: ReturnType<typeof useFormulaEditor>
  mermaidEditor: ReturnType<typeof useMermaidEditor>
  markmapEditor: ReturnType<typeof useMarkmapEditor>
  vegaEditor: ReturnType<typeof useVegaEditor>
  pluginNodeEditor: ReturnType<typeof usePluginNodePopover>
  blockHandle: ReturnType<typeof useBlockHandle>
  linkPopover: ValueState
  mathPopover: ValueState
  formulaPopover: ValueState
  mermaidPopover: ValueState
  markmapPopover: ValueState
  vegaPopover: ValueState
  backendSupportsPathImport: () => boolean
  pickAndInsertImage: () => Promise<unknown>
  requestImagePicker: () => void
  clickImageInput: () => void
  confirmEmbedUrl: OverlayHandlers['confirmEmbedUrl']
  cancelEmbedUrl: OverlayHandlers['cancelEmbedUrl']
  onEmbedUrlInputKeyDown: OverlayHandlers['onEmbedUrlInputKeyDown']
  selectLinkNote: OverlayHandlers['selectLinkNote']
  selectLinkCreateNote: OverlayHandlers['selectLinkCreateNote']
  selectSlashEmoji: OverlayHandlers['selectSlashEmoji']
  openSlashEmojiPicker: OverlayHandlers['openSlashEmojiPicker']
  closeSlashEmojiPicker: OverlayHandlers['closeSlashEmojiPicker']
  selectCalloutIcon: OverlayHandlers['selectCalloutIcon']
  closeCalloutIconPicker: OverlayHandlers['closeCalloutIconPicker']
  hideToolbarManually: OverlayHandlers['hideToolbarManually']
}

export function createWorkspaceEditorOverlayHandlers(
  options: WorkspaceEditorOverlayHandlerOptions,
): OverlayHandlers {
  const {
    editorSetup,
    toolbarActions,
    linkEditor,
    mathEditor,
    formulaEditor,
    mermaidEditor,
    markmapEditor,
    vegaEditor,
    pluginNodeEditor,
    blockHandle,
  } = options

  return {
    runSlashItem: editorSetup.runSlashItemFromOverlay,
    executeCommandById: editorSetup.executeCommandById,
    openLinkPopover: linkEditor.openLinkPopover,
    openHighlightPicker: toolbarActions.openHighlightPicker,
    openTextColorPicker: toolbarActions.openTextColorPicker,
    requestImage: () => {
      if (options.backendSupportsPathImport()) {
        void options.pickAndInsertImage()
      } else {
        options.requestImagePicker()
        options.clickImageInput()
      }
    },
    runPluginAction: toolbarActions.runPluginAction,
    applyHighlight: toolbarActions.applyHighlight,
    removeHighlight: toolbarActions.removeHighlight,
    applyTextColor: toolbarActions.applyTextColor,
    removeTextColor: toolbarActions.removeTextColor,
    applyTableCellAlignment: toolbarActions.applyTableCellAlignment,
    applyTableCellBackground: toolbarActions.applyTableCellBackground,
    applyTableCellAttr: toolbarActions.applyTableCellAttr,
    updateLinkHref: (value) => { options.linkPopover.href = value },
    applyLink: linkEditor.applyLinkFromPopover,
    removeLink: linkEditor.removeLinkFromPopover,
    onLinkInputKeyDown: linkEditor.onLinkInputKeyDown,
    updateLatex: (value) => { options.mathPopover.latex = value },
    applyMath: mathEditor.applyMathFromPopover,
    removeMath: mathEditor.removeMathFromPopover,
    onMathInputKeyDown: mathEditor.onMathInputKeyDown,
    openTableCellFormula: toolbarActions.openTableCellFormula,
    updateFormula: (value) => { options.formulaPopover.formula = value },
    applyFormula: formulaEditor.applyFormulaFromPopover,
    removeFormula: formulaEditor.removeFormulaFromPopover,
    onFormulaInputKeyDown: formulaEditor.onFormulaInputKeyDown,
    updateCode: (value) => { options.mermaidPopover.code = value },
    applyMermaid: mermaidEditor.applyMermaidFromPopover,
    removeMermaid: mermaidEditor.removeMermaidFromPopover,
    onMermaidInputKeyDown: mermaidEditor.onMermaidInputKeyDown,
    updateMarkmapMarkdown: (value) => { options.markmapPopover.markdown = value },
    applyMarkmap: markmapEditor.applyMarkmapFromPopover,
    removeMarkmap: markmapEditor.removeMarkmapFromPopover,
    onMarkmapInputKeyDown: markmapEditor.onMarkmapInputKeyDown,
    updateSpec: (value) => { options.vegaPopover.spec = value },
    applyVega: vegaEditor.applyVegaFromPopover,
    removeVega: vegaEditor.removeVegaFromPopover,
    onVegaInputKeyDown: vegaEditor.onVegaInputKeyDown,
    updatePluginNodeValue: ({ key, value }) => pluginNodeEditor.setValue(key, value),
    applyPluginNode: pluginNodeEditor.apply,
    removePluginNode: pluginNodeEditor.remove,
    onPluginNodeKeyDown: pluginNodeEditor.onKeyDown,
    confirmEmbedUrl: options.confirmEmbedUrl,
    cancelEmbedUrl: options.cancelEmbedUrl,
    onEmbedUrlInputKeyDown: options.onEmbedUrlInputKeyDown,
    selectLinkNote: options.selectLinkNote,
    selectLinkCreateNote: options.selectLinkCreateNote,
    selectSlashEmoji: options.selectSlashEmoji,
    openSlashEmojiPicker: options.openSlashEmojiPicker,
    closeSlashEmojiPicker: options.closeSlashEmojiPicker,
    selectCalloutIcon: options.selectCalloutIcon,
    closeCalloutIconPicker: options.closeCalloutIconPicker,
    onBlockHandlePointerDown: blockHandle.onHandlePointerDown,
    onTypeIconClick: () => blockHandle.onTypeIconClick(),
    onHandleMouseEnter: blockHandle.onHandleMouseEnter,
    onHandleMouseLeave: blockHandle.onHandleMouseLeave,
    turnInto: blockHandle.turnInto,
    duplicateBlock: blockHandle.duplicateBlock,
    insertBlockAbove: blockHandle.insertBlockAbove,
    insertBlockBelow: blockHandle.insertBlockBelow,
    deleteBlock: blockHandle.deleteBlock,
    copyBlockRef: blockHandle.copyBlockRef,
    closeTypeMenu: blockHandle.closeTypeMenu,
    onMenuMouseEnter: blockHandle.onMenuMouseEnter,
    onMenuMouseLeave: blockHandle.onMenuMouseLeave,
    hideToolbarManually: options.hideToolbarManually,
  }
}
