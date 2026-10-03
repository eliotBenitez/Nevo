import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import SidebarActionBar from './SidebarActionBar.vue'
import en from '../../locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

async function notionMenuButton(backendKind: 'local' | null) {
  const wrapper = mount(SidebarActionBar, {
    props: { backendKind, kanbanEnabled: false, collapseState: 'collapsed', sortMode: 'manual' },
    global: { plugins: [i18n, createPinia()] },
    attachTo: document.body,
  })
  await wrapper.find('.sidebar-actionbar__new').trigger('click')
  await nextTick()
  const importButton = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.trim() === 'Import')
  importButton?.click()
  await nextTick()
  await nextTick()
  const notionButton = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes('Notion ZIP'))
  return { wrapper, notionButton }
}

describe('SidebarActionBar Notion import', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('names icon-only sidebar controls for assistive technology', () => {
    const wrapper = mount(SidebarActionBar, {
      props: { backendKind: 'local', kanbanEnabled: false, collapseState: 'collapsed', sortMode: 'manual' },
      global: { plugins: [i18n, createPinia()] },
    })

    const iconButtons = wrapper.findAll('.sidebar-actionbar__icon')
    expect(iconButtons).toHaveLength(2)
    expect(iconButtons.every(button => Boolean(button.attributes('aria-label')))).toBe(true)
    wrapper.unmount()
  })

  it('offers Notion ZIP import in a local workspace', async () => {
    const { wrapper, notionButton } = await notionMenuButton('local')
    expect(notionButton?.disabled).toBe(false)
    notionButton?.click()
    expect(wrapper.emitted('import-notion')).toHaveLength(1)
  })

  it('disables Notion import when no local workspace is open', async () => {
    const { wrapper, notionButton } = await notionMenuButton(null)
    expect(notionButton?.disabled).toBe(true)
    notionButton?.click()
    expect(wrapper.emitted('import-notion')).toBeFalsy()
  })
})
