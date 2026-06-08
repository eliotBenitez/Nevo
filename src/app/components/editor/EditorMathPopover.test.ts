import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import EditorMathPopover from './EditorMathPopover.vue'
import { buildKatexAutocompleteItem, findKatexCommandMatch, getKatexAutocompleteItems } from './katexAutocomplete'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      workspace: {
        inlineMathLabel: 'Inline math',
        mathBlockLabel: 'Math block',
        mathPlaceholder: '\\frac{a}{b}',
        mathPopoverHint: 'Apply formula',
        mathApply: 'Apply formula',
        mathRemove: 'Remove formula',
      },
      common: {
        keyboard: {
          ctrlCmdEnter: 'Ctrl/Cmd + Enter',
        },
      },
    },
  },
})

describe('katexAutocomplete', () => {
  it('finds the active command at the caret and builds brace placeholders', () => {
    expect(findKatexCommandMatch('x + \\fra', 8)).toEqual({
      from: 4,
      to: 8,
      query: 'fra',
    })

    expect(buildKatexAutocompleteItem('\\frac')).toEqual({
      command: '\\frac',
      insertText: '\\frac{}{}',
      cursorOffset: 6,
    })

    expect(getKatexAutocompleteItems('fra')[0]?.command).toBe('\\frac')
  })
})

describe('EditorMathPopover', () => {
  it('inserts braces for selected KaTeX suggestions and places the caret inside them', async () => {
    const wrapper = mount(EditorMathPopover, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
      },
      props: {
        open: true,
        latex: '\\fr',
        isInline: true,
        popoverStyle: {},
      },
    })

    const textarea = wrapper.get('textarea').element as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(3, 3)
    await wrapper.get('textarea').trigger('keyup')

    const suggestions = wrapper.findAll('.math-popover__suggestion')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions[0]?.text()).toContain('\\frac')

    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    await nextTick()

    const emittedUpdates = wrapper.emitted('update:latex') as Array<[string]> | undefined
    const emittedValue = emittedUpdates?.[emittedUpdates.length - 1]?.[0]
    expect(emittedValue).toBe('\\frac{}{}')

    await wrapper.setProps({ latex: emittedValue })
    await nextTick()

    expect(textarea.selectionStart).toBe(6)
    expect(textarea.selectionEnd).toBe(6)

    wrapper.unmount()
  })
})
