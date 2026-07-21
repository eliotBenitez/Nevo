import { describe, expect, it, vi } from 'vitest'
import type { Command } from 'prosemirror-state'
import type { EditorCore } from './useEditorCore'
import { useEditorToolbarActions } from './useEditorToolbarActions'

function createActions() {
  const commands = {
    toggleHighlight: vi.fn(() => 'highlight' as unknown as Command),
    removeHighlight: 'remove-highlight' as unknown as Command,
    toggleTextColor: vi.fn(() => 'text-color' as unknown as Command),
    removeTextColor: 'remove-text-color' as unknown as Command,
    setTableCellAlignment: vi.fn(() => 'alignment' as unknown as Command),
    setTableCellBackground: vi.fn(() => 'background' as unknown as Command),
    setTableCellAttr: vi.fn(() => 'attribute' as unknown as Command),
  }
  const executeStateCommand = vi.fn(() => true)
  const highlightPicker = { open: false, position: { top: 0, left: 0 } }
  const textColorPicker = { open: false, position: { top: 0, left: 0 } }
  const openFormulaForCell = vi.fn()
  const actions = useEditorToolbarActions({
    core: { coreCommands: commands } as unknown as EditorCore,
    executeStateCommand,
    runPluginToolbarAction: vi.fn(),
    toolbarOverlay: { visible: true, position: { top: 20, left: 12 } },
    highlightPicker,
    textColorPicker,
    getActiveTableCellPos: () => 7,
    openFormulaForCell,
  })
  return {
    actions,
    commands,
    executeStateCommand,
    highlightPicker,
    textColorPicker,
    openFormulaForCell,
  }
}

describe('useEditorToolbarActions', () => {
  it('positions and applies the highlight picker', () => {
    const {
      actions,
      commands,
      executeStateCommand,
      highlightPicker,
    } = createActions()

    actions.openHighlightPicker()
    expect(highlightPicker).toEqual({ open: true, position: { top: 56, left: 12 } })

    actions.applyHighlight('#ffee00')
    expect(commands.toggleHighlight).toHaveBeenCalledWith('#ffee00')
    expect(executeStateCommand).toHaveBeenCalledWith('highlight')
    expect(highlightPicker.open).toBe(false)
  })

  it('forwards table actions and opens the active cell formula', () => {
    const { actions, commands, executeStateCommand, openFormulaForCell } = createActions()

    actions.applyTableCellAlignment('center')
    actions.applyTableCellBackground('#fff')
    actions.applyTableCellAttr('data-format', 'currency')
    actions.openTableCellFormula()

    expect(commands.setTableCellAlignment).toHaveBeenCalledWith('center')
    expect(commands.setTableCellBackground).toHaveBeenCalledWith('#fff')
    expect(commands.setTableCellAttr).toHaveBeenCalledWith('data-format', 'currency')
    expect(executeStateCommand).toHaveBeenCalledTimes(3)
    expect(openFormulaForCell).toHaveBeenCalledWith(7)
  })
})
