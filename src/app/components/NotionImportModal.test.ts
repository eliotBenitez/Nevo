import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick, ref } from 'vue'
import NotionImportModal from './NotionImportModal.vue'
import en from '../../locales/en.json'
import type { NotionImportProgress, NotionImportResult } from '../../types/notion-import'

function idleProgress(): NotionImportProgress {
  return {
    phase: 'idle', totalItems: 0, processedItems: 0, foldersCreated: 0, notesCreated: 0,
    databasesCreated: 0, assetsImported: 0, warnings: 0, errors: 0, error: null,
  }
}

const mockImporting = ref(false)
const mockProgress = ref<NotionImportProgress>(idleProgress())
const mockImportExport = vi.fn<() => Promise<NotionImportResult | null>>()

vi.mock('../../composables/useNotionImport', () => ({
  useNotionImport: () => ({ importing: mockImporting, progress: mockProgress, importExport: mockImportExport }),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function result(): NotionImportResult {
  return {
    rootName: 'Team Export (Notion)', rootFolderId: 'root', foldersCreated: 3, notesCreated: 4,
    databasesCreated: 1, assetsImported: 2, warnings: 1, errors: 1,
    issues: [{ path: 'Page.md', reason: 'fallback used' }],
  }
}

function mountModal() {
  return mount(NotionImportModal, {
    props: { open: true },
    global: { plugins: [i18n], stubs: { teleport: true } },
    attachTo: document.body,
  })
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('NotionImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockImporting.value = false
    mockProgress.value = idleProgress()
    mockImportExport.mockResolvedValue(null)
  })

  afterEach(() => { document.body.innerHTML = '' })

  it('starts from the ZIP picker and focuses the primary action', async () => {
    const wrapper = mountModal()
    await flush()
    const button = wrapper.findAll('button').find(item => item.text().includes('Select Notion ZIP'))
    expect(document.activeElement).toBe(button?.element)
    await button?.trigger('click')
    expect(mockImportExport).toHaveBeenCalledOnce()
  })

  it('shows phase progress and cannot close while importing', async () => {
    mockImporting.value = true
    mockProgress.value = { ...idleProgress(), phase: 'assets', totalItems: 10, processedItems: 4 }
    const wrapper = mountModal()
    await flush()
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('40')
    expect(wrapper.text()).toContain('Copying attachments')
    await wrapper.find('.notion-import-backdrop').trigger('keydown', { key: 'Escape' })
    await wrapper.find('.notion-import-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toBeFalsy()
  })

  it('renders result statistics, issues, and refocuses close', async () => {
    mockImportExport.mockResolvedValueOnce(result())
    const wrapper = mountModal()
    await wrapper.findAll('button').find(item => item.text().includes('Select Notion ZIP'))?.trigger('click')
    await flush()
    expect(wrapper.text()).toContain('Team Export (Notion)')
    expect(wrapper.text()).toContain('Databases created')
    expect(wrapper.text()).toContain('fallback used')
    const close = wrapper.findAll('button').find(item => item.text() === 'Close')
    expect(document.activeElement).toBe(close?.element)
  })

  it('shows a fatal scan error and closes on Escape', async () => {
    mockProgress.value = { ...idleProgress(), phase: 'error', error: 'Invalid ZIP' }
    const wrapper = mountModal()
    await flush()
    expect(wrapper.find('[role="alert"]').text()).toContain('Invalid ZIP')
    await wrapper.find('.notion-import-backdrop').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
