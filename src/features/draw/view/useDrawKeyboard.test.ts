import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useDrawKeyboard } from './useDrawKeyboard'
import type { DrawEditorTool } from '../useDrawEditor'

describe('useDrawKeyboard', () => {
  it('switches tools when numbers 1-9 and 0 are pressed', () => {
    const tool = ref<DrawEditorTool>('select')
    const selection = ref(new Set<string>())
    const textEditorActive = vi.fn(() => false)
    const options = {
      tool,
      selection,
      textEditorActive,
      canPaste: ref(false),
      back: vi.fn(),
      pasteImageFromClipboard: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      duplicateSelection: vi.fn(),
      bringToFront: vi.fn(),
      bringForward: vi.fn(),
      sendToBack: vi.fn(),
      sendBackward: vi.fn(),
      deleteSelection: vi.fn(),
      clearSelection: vi.fn(),
      selectAll: vi.fn(),
      copySelection: vi.fn(),
      cutSelection: vi.fn(),
      paste: vi.fn(),
      scheduleSave: vi.fn(),
      group: vi.fn(),
      ungroup: vi.fn(),
    }

    const { onKeydown } = useDrawKeyboard(options)

    // Тестируем переключение по цифрам
    const tests: { key: string; expected: DrawEditorTool }[] = [
      { key: '1', expected: 'select' },
      { key: '2', expected: 'freehand' },
      { key: '3', expected: 'highlighter' },
      { key: '4', expected: 'rectangle' },
      { key: '5', expected: 'line' },
      { key: '6', expected: 'arrow' },
      { key: '7', expected: 'ellipse' },
      { key: '8', expected: 'diamond' },
      { key: '9', expected: 'text' },
      { key: '0', expected: 'eraser' },
    ]

    for (const test of tests) {
      tool.value = 'hand' // Сброс
      const event = new KeyboardEvent('keydown', { key: test.key })
      onKeydown(event)
      expect(tool.value).toBe(test.expected)
    }
  })

  it('keeps original letter shortcuts working', () => {
    const tool = ref<DrawEditorTool>('select')
    const selection = ref(new Set<string>())
    const textEditorActive = vi.fn(() => false)
    const options = {
      tool,
      selection,
      textEditorActive,
      canPaste: ref(false),
      back: vi.fn(),
      pasteImageFromClipboard: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      duplicateSelection: vi.fn(),
      bringToFront: vi.fn(),
      bringForward: vi.fn(),
      sendToBack: vi.fn(),
      sendBackward: vi.fn(),
      deleteSelection: vi.fn(),
      clearSelection: vi.fn(),
      selectAll: vi.fn(),
      copySelection: vi.fn(),
      cutSelection: vi.fn(),
      paste: vi.fn(),
      scheduleSave: vi.fn(),
      group: vi.fn(),
      ungroup: vi.fn(),
    }

    const { onKeydown } = useDrawKeyboard(options)

    const event = new KeyboardEvent('keydown', { key: 'r' })
    onKeydown(event)
    expect(tool.value).toBe('rectangle')
  })

  it('ignores tool shortcuts when editing text or typing', () => {
    const tool = ref<DrawEditorTool>('select')
    const selection = ref(new Set<string>())
    const textEditorActive = vi.fn(() => false)
    const options = {
      tool,
      selection,
      textEditorActive,
      canPaste: ref(false),
      back: vi.fn(),
      pasteImageFromClipboard: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      duplicateSelection: vi.fn(),
      bringToFront: vi.fn(),
      bringForward: vi.fn(),
      sendToBack: vi.fn(),
      sendBackward: vi.fn(),
      deleteSelection: vi.fn(),
      clearSelection: vi.fn(),
      selectAll: vi.fn(),
      copySelection: vi.fn(),
      cutSelection: vi.fn(),
      paste: vi.fn(),
      scheduleSave: vi.fn(),
      group: vi.fn(),
      ungroup: vi.fn(),
    }

    const { onKeydown } = useDrawKeyboard(options)

    // Имитируем фокус на инпуте
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const event = new KeyboardEvent('keydown', { key: '2' })
    Object.defineProperty(event, 'target', { value: input, enumerable: true })

    onKeydown(event)
    expect(tool.value).toBe('select') // Не изменилось на freehand

    document.body.removeChild(input)
  })
})
