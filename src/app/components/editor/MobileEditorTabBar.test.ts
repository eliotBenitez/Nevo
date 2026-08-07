import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../../locales/en.json'
import MobileEditorTabBar from './MobileEditorTabBar.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

const wrappers: VueWrapper[] = []

afterEach(() => {
  while (wrappers.length > 0) {
    wrappers.pop()?.unmount()
  }
  document.body.innerHTML = ''
})

describe('MobileEditorTabBar', () => {
  it('renders the Figma editor actions and forwards core commands', async () => {
    const onCommand = vi.fn()
    const onOpenBlockMenu = vi.fn()
    const onOpenLink = vi.fn()
    const wrapper = mount(MobileEditorTabBar, {
      attachTo: document.body,
      props: {
        onCommand,
        onOpenBlockMenu,
        onOpenLink,
      },
      global: {
        plugins: [i18n],
      },
    })
    wrappers.push(wrapper)

    expect(wrapper.get('[role="toolbar"]').attributes('aria-label')).toBe('Editor tools')
    expect(wrapper.find('.is-active').exists()).toBe(false)
    expect(wrapper.get('button[aria-label="Bold (strong) Mod+B"]').attributes('aria-pressed')).toBeUndefined()

    await wrapper.get('button[aria-label="Insert block"]').trigger('click')
    await wrapper.get('button[aria-label="Heading 1"]').trigger('click')
    const headingMenu = document.body.querySelector<HTMLElement>('#mobile-editor-heading-menu')
    expect(headingMenu).toBeTruthy()
    expect(headingMenu?.querySelectorAll('button')).toHaveLength(6)
    const heading4Button = headingMenu?.querySelector<HTMLButtonElement>('button[aria-label="Heading 4"]')
    expect(heading4Button).toBeTruthy()
    heading4Button?.click()
    await wrapper.vm.$nextTick()
    await wrapper.get('button[aria-label="Bold (strong) Mod+B"]').trigger('click')
    await wrapper.get('button[aria-label="Link (a)"]').trigger('click')

    expect(onOpenBlockMenu).toHaveBeenCalledTimes(1)
    expect(onCommand.mock.calls).toEqual([
      ['core.heading.4'],
      ['core.bold'],
    ])
    expect(onOpenLink).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('#mobile-editor-heading-menu')).toBeNull()
  })

  it('exposes overflow formatting and image actions', async () => {
    const onRequestImage = vi.fn()
    const wrapper = mount(MobileEditorTabBar, {
      attachTo: document.body,
      props: {
        onRequestImage,
      },
      global: {
        plugins: [i18n],
      },
    })
    wrappers.push(wrapper)

    const moreButton = wrapper.get('button[aria-label="More formatting"]')
    await moreButton.trigger('click')

    expect(moreButton.attributes('aria-expanded')).toBe('true')
    const menu = document.body.querySelector<HTMLElement>('#mobile-editor-tab-bar-overflow')
    expect(menu).toBeTruthy()
    expect(menu?.querySelector('.is-active')).toBeNull()

    const imageButton = Array
      .from(menu?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find(button => button.textContent?.includes('Insert image'))
    expect(imageButton).toBeTruthy()
    imageButton?.click()
    await wrapper.vm.$nextTick()

    expect(onRequestImage).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('#mobile-editor-tab-bar-overflow')).toBeNull()
  })
})
