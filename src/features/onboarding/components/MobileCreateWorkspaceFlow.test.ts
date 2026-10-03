import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import MobileCreateWorkspaceFlow from './MobileCreateWorkspaceFlow.vue'
import en from '../../../locales/en.json'
import { WORKSPACE_GRADIENTS } from '../../../utils/workspaceGradients'

const glyphs = ['N', '◐', '✦', '◇', '◑', '⌘'] as const
const templates = ['empty', 'researcher', 'pm', 'writer'] as const

function mountFlow() {
  return mount(MobileCreateWorkspaceFlow, {
    props: {
      name: 'Atelier',
      selectedGlyph: 0,
      selectedGradient: 0,
      selectedTemplate: 'empty',
      glyphs,
      gradients: WORKSPACE_GRADIENTS,
      templates,
      isCreating: false,
      creationError: '',
    },
    global: {
      plugins: [
        createI18n({
          legacy: false,
          locale: 'en',
          messages: { en },
        }),
      ],
    },
  })
}

describe('MobileCreateWorkspaceFlow', () => {
  it('moves through identity and template steps', async () => {
    const wrapper = mountFlow()

    expect(wrapper.text()).toContain(en.onboarding.create.mobile.identityTitle)
    expect(wrapper.get('.mobile-create__workspace-glyph').text()).toBe('A')
    expect(wrapper.find('legend').exists()).toBe(false)
    expect(wrapper.get('.mobile-create__option-group').text())
      .toContain(en.onboarding.create.glyphLabel)

    await wrapper.get('.mobile-create__primary').trigger('click')

    expect(wrapper.text()).toContain(en.onboarding.create.mobile.templateTitle)
    expect(wrapper.text()).toContain(en.onboarding.create.mobile.createNamed.replace('{name}', 'Atelier'))
  })

  it('goes back to the previous wizard step', async () => {
    const wrapper = mountFlow()

    await wrapper.get('.mobile-create__primary').trigger('click')
    expect(wrapper.text()).toContain(en.onboarding.create.mobile.templateTitle)

    await wrapper.get('.mobile-create__icon-button').trigger('click')
    expect(wrapper.text()).toContain(en.onboarding.create.mobile.identityTitle)
  })

  it('emits the final create action', async () => {
    const wrapper = mountFlow()
    const onCreate = vi.fn()
    await wrapper.setProps({ onCreate })

    await wrapper.get('.mobile-create__primary').trigger('click')
    await wrapper.get('.mobile-create__primary').trigger('click')

    expect(onCreate).toHaveBeenCalledOnce()
  })
})
