import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../../locales/en.json'
import MobileEditorHeader from './MobileEditorHeader.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

describe('MobileEditorHeader', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the compact document navigation and forwards its actions', async () => {
    const onBack = vi.fn()
    const onExport = vi.fn()
    const onDetails = vi.fn()
    const onChangeMode = vi.fn()
    const wrapper = mount(MobileEditorHeader, {
      attachTo: document.body,
      props: {
        mode: 'document',
        context: 'Product / Planning',
        title: 'Q4 strategy',
        onBack,
        onExport,
        onDetails,
        onChangeMode,
      },
      global: { plugins: [i18n] },
    })

    expect(wrapper.get('.mobile-editor-header__context').text()).toBe('Product / Planning')
    expect(wrapper.find('.mobile-editor-header__canvas-title').exists()).toBe(false)

    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')
    await nextTick()

    const canvasItem = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .find(item => item.textContent?.trim() === 'Canvas')
    canvasItem?.click()
    await nextTick()

    await buttons[2].trigger('click')
    await nextTick()
    const detailsItem = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .find(item => item.textContent?.trim() === 'Note details')
    detailsItem?.click()

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onChangeMode).toHaveBeenCalledWith('canvas')
    expect(onDetails).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('uses the floating canvas title and offers the document view', async () => {
    const onChangeMode = vi.fn()
    const wrapper = mount(MobileEditorHeader, {
      attachTo: document.body,
      props: {
        mode: 'canvas',
        context: 'Product / Planning',
        title: 'Q4 strategy',
        onChangeMode,
      },
      global: { plugins: [i18n] },
    })

    expect(wrapper.get('.mobile-editor-header__canvas-title').text()).toBe('Canvas · Q4 strategy')
    expect(wrapper.findAll('button')).toHaveLength(2)

    await wrapper.findAll('button')[1]!.trigger('click')
    await nextTick()
    const documentItem = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .find(item => item.textContent?.trim() === 'Document')
    documentItem?.click()

    expect(onChangeMode).toHaveBeenCalledWith('document')

    wrapper.unmount()
  })
})
