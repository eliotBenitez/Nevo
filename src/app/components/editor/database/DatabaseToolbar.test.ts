import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import DatabaseToolbar from './DatabaseToolbar.vue'
import type { DbView } from '../../../../types/database-block'

function view(id: string, type: DbView['type']): DbView {
  return { id, name: id, type, filters: [], sorts: [] }
}

describe('DatabaseToolbar view context menu', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('deletes the view selected with the secondary mouse button', async () => {
    const views = [view('table', 'table'), view('list', 'list')]
    const wrapper = mount(DatabaseToolbar, {
      attachTo: document.body,
      props: {
        t: (key: string) => key,
        views,
        activeViewId: 'table',
        activeView: views[0],
        fields: [],
        onRequestDelete: () => {},
        onOpenCsvImport: () => {},
      },
    })

    await wrapper.findAll('.nv-db-toolbar__view-btn')[1].trigger('contextmenu', { clientX: 80, clientY: 40 })
    await nextTick()
    const action = document.querySelector('.nv-db-view-context-menu__item') as HTMLButtonElement
    expect(action.disabled).toBe(false)
    action.click()
    expect(wrapper.emitted('delete-view')).toEqual([['list']])
  })

  it('does not allow the final view to be removed', async () => {
    const views = [view('table', 'table')]
    const wrapper = mount(DatabaseToolbar, {
      attachTo: document.body,
      props: {
        t: (key: string) => key,
        views,
        activeViewId: 'table',
        activeView: views[0],
        fields: [],
        onRequestDelete: () => {},
        onOpenCsvImport: () => {},
      },
    })

    await wrapper.find('.nv-db-toolbar__view-btn').trigger('contextmenu', { clientX: 80, clientY: 40 })
    await nextTick()
    expect((document.querySelector('.nv-db-view-context-menu__item') as HTMLButtonElement).disabled).toBe(true)
  })
})
