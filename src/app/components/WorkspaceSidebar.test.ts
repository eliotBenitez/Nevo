import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick } from 'vue'
import WorkspaceSidebar from './WorkspaceSidebar.vue'
import en from '../../locales/en.json'
import type { TreeNode } from '../../types/note'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

const tree: TreeNode[] = [
  {
    kind: 'note',
    meta: {
      id: 'note-1',
      title: 'First note',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-05-14T10:00:00.000Z',
    },
  },
]

function mountSidebar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/workspace', component: { template: '<div />' } }],
  })

  void router.push('/workspace')

  return mount(WorkspaceSidebar, {
    attachTo: document.body,
    global: {
      plugins: [i18n, createPinia(), router],
    },
    props: {
      workspaceName: 'Workspace',
      workspaceGlyph: 'N',
      tree,
      activeNoteId: 'note-1',
      activeFolderId: null,
    },
  })
}

async function openNoteContextMenu(wrapper: VueWrapper) {
  await wrapper.get('.tree-row').trigger('contextmenu', {
    clientX: 40,
    clientY: 50,
  })
}

async function flushUi() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await nextTick()
}

async function activateMenuButton(label: string) {
  const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
    .find(candidate => candidate.textContent?.includes(label))
  expect(button).toBeTruthy()
  button!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  button!.click()
  await flushUi()
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('WorkspaceSidebar', () => {
  it('emits open-history when the sidebar history button is clicked', async () => {
    const wrapper = mountSidebar()

    const historyButton = wrapper.findAll('.sidebar-system__item')
      .find(button => button.text().includes('History'))

    expect(historyButton).toBeTruthy()

    await historyButton!.trigger('click')

    expect(wrapper.emitted('open-history')).toEqual([[]])
    wrapper.unmount()
  })

  it('offers a History action for note context menus', async () => {
    const wrapper = mountSidebar()

    await openNoteContextMenu(wrapper)

    const historyAction = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .find(button => button.textContent?.includes('History'))

    expect(historyAction).toBeTruthy()

    historyAction!.click()

    expect(wrapper.emitted('tree-action')).toEqual([
      [{ action: 'history', target: expect.objectContaining({ kind: 'note', id: 'note-1' }) }],
    ])
    wrapper.unmount()
  })

  it('offers export formats in a submenu for note context menus', async () => {
    const wrapper = mountSidebar()

    await openNoteContextMenu(wrapper)

    await activateMenuButton('Export')
    expect(Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-menu-item'))
      .some(button => button.textContent?.includes('Typst archive (.zip)'))).toBe(true)
    await activateMenuButton('Typst archive (.zip)')

    expect(wrapper.emitted('tree-action')).toEqual([
      [{
        action: 'export',
        format: 'typst',
        target: expect.objectContaining({ kind: 'note', id: 'note-1' }),
      }],
    ])
    wrapper.unmount()
  })
})
