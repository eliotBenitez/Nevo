import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import WorkspaceDrawer from './WorkspaceDrawer.vue'
import en from '../../locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

let wrapper: VueWrapper | null = null
let opener: HTMLButtonElement | null = null

function mountDrawer(open: boolean) {
  wrapper = mount(WorkspaceDrawer, {
    props: { open },
    slots: { default: '<button class="slot-btn">Item</button>' },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  return wrapper
}

const q = <T extends Element = HTMLElement>(sel: string) => document.body.querySelector<T>(sel)

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  opener?.remove()
  opener = null
})

describe('WorkspaceDrawer', () => {
  it('renders nothing when closed', () => {
    mountDrawer(false)
    expect(q('.workspace-drawer-backdrop')).toBeNull()
  })

  it('renders a modal dialog when open', async () => {
    mountDrawer(true)
    await nextTick()
    const panel = q('.workspace-drawer-panel')!
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(panel.getAttribute('aria-label')).toBe('Navigation')
    expect(q('.slot-btn')).not.toBeNull()
  })

  it('emits close on Escape inside the panel', async () => {
    const w = mountDrawer(true)
    await nextTick()
    q('.slot-btn')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('emits close on backdrop click but not on panel click', async () => {
    const w = mountDrawer(true)
    await nextTick()
    q('.workspace-drawer-panel')!.click()
    expect(w.emitted('close')).toBeUndefined()
    q('.workspace-drawer-backdrop')!.click()
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('emits close from the close button and back from the back button', async () => {
    const w = mountDrawer(true)
    await nextTick()
    q('.workspace-drawer-close')!.click()
    expect(w.emitted('close')).toHaveLength(1)
    q('.workspace-drawer-back')!.click()
    expect(w.emitted('back')).toHaveLength(1)
  })

  it('moves focus into the panel on open and restores it on close', async () => {
    opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const w = mountDrawer(false)
    await w.setProps({ open: true })
    await nextTick()
    expect(document.activeElement).toBe(q('.workspace-drawer-close'))
    await w.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(opener)
  })
})
