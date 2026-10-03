import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent, h, nextTick } from 'vue'
import NvModal from './NvModal.vue'
import en from '../../locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountModal(props: Record<string, unknown> = {}) {
  return mount(NvModal, {
    props: { open: true, title: 'Delete note', ...props },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('NvModal', () => {
  it('renders nothing when closed', async () => {
    mountModal({ open: false })
    await nextTick()
    expect(document.body.querySelector('.nv-modal')).toBeNull()
  })

  it('renders role="dialog" and aria-modal when open', async () => {
    mountModal()
    await nextTick()
    const panel = document.body.querySelector('.nv-modal__panel')
    expect(panel?.getAttribute('role')).toBe('dialog')
    expect(panel?.getAttribute('aria-modal')).toBe('true')
  })

  it('points aria-labelledby at the rendered title', async () => {
    mountModal()
    await nextTick()
    const panel = document.body.querySelector('.nv-modal__panel')
    const labelledBy = panel?.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    const title = document.body.querySelector(`#${labelledBy}`)
    expect(title?.textContent).toBe('Delete note')
  })

  it('emits close on Escape', async () => {
    const wrapper = mountModal()
    await nextTick()
    const panel = document.body.querySelector('.nv-modal__panel')
    panel?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close on backdrop click', async () => {
    const wrapper = mountModal()
    await nextTick()
    const scrim = document.body.querySelector('.nv-modal__scrim')
    scrim?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('suppresses backdrop close when close-on-backdrop is false', async () => {
    const wrapper = mountModal({ closeOnBackdrop: false })
    await nextTick()
    const scrim = document.body.querySelector('.nv-modal__scrim')
    scrim?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('hides the close button when dismissible is false', async () => {
    mountModal({ dismissible: false })
    await nextTick()
    expect(document.body.querySelector('.nv-modal__header .nv-btn--icon')).toBeNull()
  })

  it('gives two simultaneously-open modals distinct ids', async () => {
    const TwoModals = defineComponent({
      render() {
        return h('div', [
          h(NvModal, { open: true, title: 'First' }),
          h(NvModal, { open: true, title: 'Second' }),
        ])
      },
    })

    mount(TwoModals, { global: { plugins: [i18n] }, attachTo: document.body })
    await nextTick()

    const panels = document.body.querySelectorAll('.nv-modal__panel')
    expect(panels).toHaveLength(2)
    const ids = Array.from(panels).map((panel) => panel.getAttribute('aria-labelledby'))
    expect(ids[0]).toBeTruthy()
    expect(ids[1]).toBeTruthy()
    expect(ids[0]).not.toBe(ids[1])
  })
})
