import type { EditorCore } from './useEditorCore'
import type { NevoToolbarAction } from '../../../types/editor-plugin'
import type { Command } from 'prosemirror-state'

interface ColorPickerState {
  open: boolean
  position: { top: number; left: number }
}

interface EditorToolbarActionsOptions {
  core: EditorCore
  executeStateCommand: (command: Command) => boolean
  runPluginToolbarAction: (action: NevoToolbarAction) => void
  toolbarOverlay: {
    visible: boolean
    position: { top: number; left: number }
  }
  highlightPicker: ColorPickerState
  textColorPicker: ColorPickerState
  getActiveTableCellPos: () => number | null
  openFormulaForCell: (cellPos: number) => void
}

export function useEditorToolbarActions(options: EditorToolbarActionsOptions) {
  function applyHighlight(color: string) {
    if (!options.core.coreCommands) return
    options.executeStateCommand(options.core.coreCommands.toggleHighlight(color))
    options.highlightPicker.open = false
  }

  function removeHighlight() {
    if (!options.core.coreCommands) return
    options.executeStateCommand(options.core.coreCommands.removeHighlight)
    options.highlightPicker.open = false
  }

  function applyTextColor(color: string) {
    if (!options.core.coreCommands) return
    options.executeStateCommand(options.core.coreCommands.toggleTextColor(color))
    options.textColorPicker.open = false
  }

  function removeTextColor() {
    if (!options.core.coreCommands) return
    options.executeStateCommand(options.core.coreCommands.removeTextColor)
    options.textColorPicker.open = false
  }

  function openHighlightPicker() {
    if (!options.toolbarOverlay.visible) return
    options.textColorPicker.open = false
    options.highlightPicker.open = !options.highlightPicker.open
    options.highlightPicker.position = {
      top: options.toolbarOverlay.position.top + 36,
      left: options.toolbarOverlay.position.left,
    }
  }

  function openTextColorPicker() {
    if (!options.toolbarOverlay.visible) return
    options.highlightPicker.open = false
    options.textColorPicker.open = !options.textColorPicker.open
    options.textColorPicker.position = {
      top: options.toolbarOverlay.position.top + 36,
      left: options.toolbarOverlay.position.left,
    }
  }

  function applyTableCellAlignment(alignment: string | null) {
    if (!options.core.coreCommands) return
    options.executeStateCommand(options.core.coreCommands.setTableCellAlignment(
      alignment as 'left' | 'center' | 'right' | 'justify' | null,
    ))
  }

  function applyTableCellBackground(color: string | null) {
    if (!options.core.coreCommands) return
    options.executeStateCommand(options.core.coreCommands.setTableCellBackground(color))
  }

  function applyTableCellAttr(name: string, value: string | null) {
    if (!options.core.coreCommands) return
    options.executeStateCommand(options.core.coreCommands.setTableCellAttr(name, value))
  }

  function openTableCellFormula() {
    const cellPos = options.getActiveTableCellPos()
    if (cellPos !== null) options.openFormulaForCell(cellPos)
  }

  function runPluginAction(action: NevoToolbarAction) {
    options.runPluginToolbarAction(action)
  }

  return {
    applyHighlight,
    removeHighlight,
    applyTextColor,
    removeTextColor,
    openHighlightPicker,
    openTextColorPicker,
    applyTableCellAlignment,
    applyTableCellBackground,
    applyTableCellAttr,
    openTableCellFormula,
    runPluginAction,
  }
}
