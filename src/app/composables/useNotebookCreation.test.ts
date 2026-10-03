import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '../../locales/en.json'
import { useTreeStore } from '../../stores/tree'
import { useToast } from '../../ui/composables/useToast'
import { useNotebookCreation } from './useNotebookCreation'
import type { NoteDocument } from '../../types/note'

afterEach(() => {
  const toast = useToast()
  for (const item of [...toast.toastState.items]) toast.dismissToast(item.id)
  vi.restoreAllMocks()
})

function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const onCreated = vi.fn()
  let creation!: ReturnType<typeof useNotebookCreation>
  const wrapper = mount(defineComponent({
    setup() { creation = useNotebookCreation(onCreated); return () => null },
  }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  return { wrapper, creation, onCreated, store: useTreeStore() }
}

describe('immediate notebook creation', () => {
  it('creates in the chosen folder with defaults and opens the result once', async () => {
    const { wrapper, creation, onCreated, store } = setup()
    const note = { id: 'created-notebook' } as NoteDocument
    let resolve!: (note: NoteDocument) => void
    const create = vi.spyOn(store, 'createNotebook').mockImplementation(() => new Promise(r => { resolve = r }))
    const pending = creation.create('folder-1')
    await creation.create('folder-2')
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith('folder-1', en.workspace.untitledNote, '📓', 'ruled')
    expect(onCreated).not.toHaveBeenCalled()
    resolve(note)
    await pending
    expect(onCreated).toHaveBeenCalledWith(note)
    expect(creation.submitting.value).toBe(false)
    wrapper.unmount()
  })

  it('reports failures and allows another attempt without a dialog', async () => {
    const { wrapper, creation, onCreated, store } = setup()
    const create = vi.spyOn(store, 'createNotebook').mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce(null)
    await creation.create(null)
    expect(useToast().toastState.items.at(-1)?.message).toBe('Disk full')
    await creation.create(null)
    expect(create).toHaveBeenCalledTimes(2)
    expect(useToast().toastState.items.at(-1)?.message).toBe(en.app.notebook.createError)
    expect(onCreated).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
