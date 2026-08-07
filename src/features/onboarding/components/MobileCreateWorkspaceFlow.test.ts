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
      stubs: {
        AmbientBackdrop: true,
      },
    },
  })
}

describe('MobileCreateWorkspaceFlow', () => {
  it('moves through identity, protected local storage, and template steps', async () => {
    const wrapper = mountFlow()

    expect(wrapper.text()).toContain(en.onboarding.create.mobile.identityTitle)
    expect(wrapper.get('.mobile-create__workspace-glyph').text()).toBe('A')
    expect(wrapper.find('legend').exists()).toBe(false)
    expect(wrapper.get('.mobile-create__option-group').text())
      .toContain(en.onboarding.create.glyphLabel)

    await wrapper.get('.mobile-create__primary').trigger('click')

    expect(wrapper.text()).toContain(en.onboarding.create.mobile.storageTitle)
    expect(wrapper.text()).toContain(en.onboarding.create.mobile.deviceTitle)
    expect(wrapper.text()).toContain(en.onboarding.create.mobile.cloudTitle)
    expect(wrapper.text()).not.toContain(en.onboarding.create.locationLabel)
    expect(wrapper.get('.mobile-create__choice[disabled]').attributes('title'))
      .toBe(en.onboarding.create.mobile.cloudUnavailable)

    await wrapper.get('.mobile-create__primary').trigger('click')

    expect(wrapper.text()).toContain(en.onboarding.create.mobile.templateTitle)
    expect(wrapper.text()).toContain(en.onboarding.create.mobile.createNamed.replace('{name}', 'Atelier'))
  })

  it('opens storage information and returns to the previous wizard step', async () => {
    const wrapper = mountFlow()

    await wrapper.get('.mobile-create__primary').trigger('click')
    await wrapper.get('.mobile-create__text-action').trigger('click')

    expect(wrapper.get('[role="dialog"]').text())
      .toContain(en.onboarding.create.mobile.storageInfoTitle)
    expect(wrapper.find('.mobile-create__footer').exists()).toBe(false)

    await wrapper.get('.mobile-create__sheet-close').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.find('.mobile-create__footer').exists()).toBe(true)

    await wrapper.get('.mobile-create__icon-button').trigger('click')
    expect(wrapper.text()).toContain(en.onboarding.create.mobile.identityTitle)
  })

  it('emits the final create action', async () => {
    const wrapper = mountFlow()
    const onCreate = vi.fn()
    await wrapper.setProps({ onCreate })

    await wrapper.get('.mobile-create__primary').trigger('click')
    await wrapper.get('.mobile-create__primary').trigger('click')
    await wrapper.get('.mobile-create__primary').trigger('click')

    expect(onCreate).toHaveBeenCalledOnce()
  })
})
