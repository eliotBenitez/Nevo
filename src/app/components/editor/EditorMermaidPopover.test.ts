import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import EditorMermaidPopover from './EditorMermaidPopover.vue'
import en from '../../../locales/en.json'
import ru from '../../../locales/ru.json'

function mountPopover() {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: { en, ru },
  })

  return mount(EditorMermaidPopover, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
    },
    props: {
      open: true,
      code: 'graph TD\n  A --> B',
      popoverStyle: {},
    },
  })
}

describe('EditorMermaidPopover', () => {
  it('renders the shared editor popup layout and keeps the textarea focusable', () => {
    const wrapper = mountPopover()
    const form = wrapper.get('form')
    const textarea = wrapper.get('textarea')

    expect(form.classes()).toContain('editor-popup-panel')
    expect(form.classes()).toContain('mermaid-popover')
    expect(wrapper.get('label').attributes('for')).toBe('mermaid-input')
    expect(wrapper.text()).toContain('Mermaid diagram')
    expect(wrapper.text()).toContain('Ctrl/Cmd + Enter')
    expect(wrapper.text()).toContain('to apply')
    expect(textarea.attributes('placeholder')).toBe('graph TD\n  A --> B')
    const textareaEl = textarea.element as HTMLTextAreaElement
    expect(textareaEl.value).toBe('graph TD\n  A --> B')

    textareaEl.focus()
    expect(document.activeElement).toBe(textarea.element)

    wrapper.unmount()
  })

  it('emits apply on submit and remove from the secondary action', async () => {
    const wrapper = mountPopover()

    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('apply')).toHaveLength(1)

    const buttons = wrapper.findAll('button')
    await buttons[1]?.trigger('click')
    expect(wrapper.emitted('remove')).toHaveLength(1)

    wrapper.unmount()
  })
})
