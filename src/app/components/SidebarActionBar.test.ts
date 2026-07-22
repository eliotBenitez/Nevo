import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import SidebarActionBar from './SidebarActionBar.vue'
import en from '../../locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

async function notionMenuButton(backendKind: 'local' | 'cloud') {
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

  it('offers Notion ZIP import in a local workspace', async () => {
    const { wrapper, notionButton } = await notionMenuButton('local')
    expect(notionButton?.disabled).toBe(false)
    notionButton?.click()
    expect(wrapper.emitted('import-notion')).toHaveLength(1)
  })

  it('explains and disables Notion import in a cloud workspace', async () => {
    const { wrapper, notionButton } = await notionMenuButton('cloud')
    expect(notionButton?.textContent).toContain('local only')
    expect(notionButton?.disabled).toBe(true)
    notionButton?.click()
    expect(wrapper.emitted('import-notion')).toBeFalsy()
  })
})
