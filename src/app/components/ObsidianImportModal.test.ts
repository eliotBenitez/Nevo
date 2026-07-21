import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick, ref } from 'vue'
import ObsidianImportModal from './ObsidianImportModal.vue'
import en from '../../locales/en.json'
import type { ObsidianImportProgress, ObsidianImportResult } from '../../composables/useObsidianImport'

function createIdleProgress(): ObsidianImportProgress {
  return {
    phase: 'idle',
    totalNotes: 0,
    processedNotes: 0,
    foldersCreated: 0,
    notesCreated: 0,
    unresolvedLinks: 0,
    skippedFiles: 0,
    attachmentsImported: 0,
    unresolvedEmbeds: 0,
    notesWithFrontmatter: 0,
    tagsCollected: 0,
    error: null,
  }
}

const mockImporting = ref(false)
const mockProgress = ref<ObsidianImportProgress>(createIdleProgress())
const mockImportVault = vi.fn(async (_targetFolderId?: string | null): Promise<ObsidianImportResult | null> => null)

vi.mock('../../composables/useObsidianImport', () => ({
  useObsidianImport: () => ({ importing: mockImporting, progress: mockProgress, importVault: mockImportVault }),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function fullResult(overrides: Partial<ObsidianImportResult> = {}): ObsidianImportResult {
  return {
    rootName: 'MyVault',
    notesCreated: 12,
    foldersCreated: 3,
    unresolvedLinks: 0,
    skippedFiles: 0,
    attachmentsImported: 5,
    unresolvedEmbeds: 0,
    notesWithFrontmatter: 4,
    tagsCollected: 7,
    ...overrides,
  }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

function mountModal(targetFolderId: string | null = null) {
  return mount(ObsidianImportModal, {
    props: { open: true, targetFolderId },
    global: { plugins: [i18n], stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('ObsidianImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockImporting.value = false
    mockProgress.value = createIdleProgress()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('idle stage renders the select-folder button and starts import with the target folder id', async () => {
    mockImportVault.mockResolvedValueOnce(null)
    const wrapper = mountModal('folder-1')

    const button = wrapper.findAll('button').find((b) => b.text().includes('Select vault folder'))
    expect(button).toBeTruthy()

    await button!.trigger('click')
    expect(mockImportVault).toHaveBeenCalledWith('folder-1')
  })

  it('running stage renders a progressbar with the correct aria-valuenow and hides the select-folder button', async () => {
    mockImporting.value = true
    mockProgress.value = { ...createIdleProgress(), phase: 'writing', totalNotes: 10, processedNotes: 3 }
    const wrapper = mountModal()
    await flush()

    const bar = wrapper.find('[role="progressbar"]')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('aria-valuenow')).toBe('30')
    expect(bar.attributes('aria-valuemin')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe('100')
    expect(wrapper.findAll('button').some((b) => b.text().includes('Select vault folder'))).toBe(false)
  })

  it('does not close on Escape or backdrop click while running, but does once idle', async () => {
    mockImporting.value = true
    mockProgress.value = { ...createIdleProgress(), phase: 'writing', totalNotes: 10, processedNotes: 3 }
    const wrapper = mountModal()
    await flush()

    const backdrop = wrapper.find('.obsidian-import-backdrop')
    await backdrop.trigger('keydown', { key: 'Escape' })
    await backdrop.trigger('click')
    expect(wrapper.emitted('close')).toBeFalsy()

    mockImporting.value = false
    mockProgress.value = createIdleProgress()
    await flush()

    await backdrop.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('done stage renders the result counts', async () => {
    mockImportVault.mockResolvedValueOnce(fullResult())
    const wrapper = mountModal()

    const button = wrapper.findAll('button').find((b) => b.text().includes('Select vault folder'))
    await button!.trigger('click')
    await flush()

    expect(wrapper.text()).toContain('Import finished')
    expect(wrapper.text()).toContain('MyVault')
    expect(wrapper.text()).toContain('12')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('7')
    expect(wrapper.text()).toContain('4')
  })

  it('hides warning rows when their counts are 0', async () => {
    mockImportVault.mockResolvedValueOnce(fullResult())
    const wrapper = mountModal()

    const button = wrapper.findAll('button').find((b) => b.text().includes('Select vault folder'))
    await button!.trigger('click')
    await flush()

    expect(wrapper.text()).not.toContain('Unresolved links')
    expect(wrapper.text()).not.toContain('Unresolved embeds')
    expect(wrapper.text()).not.toContain('Skipped files')
    expect(wrapper.findAll('.obsidian-import__stat--warning')).toHaveLength(0)
  })

  it('shows warning rows when their counts are greater than 0', async () => {
    mockImportVault.mockResolvedValueOnce(
      fullResult({ unresolvedLinks: 2, unresolvedEmbeds: 1, skippedFiles: 3 }),
    )
    const wrapper = mountModal()

    const button = wrapper.findAll('button').find((b) => b.text().includes('Select vault folder'))
    await button!.trigger('click')
    await flush()

    expect(wrapper.text()).toContain('Unresolved links')
    expect(wrapper.text()).toContain('Unresolved embeds')
    expect(wrapper.text()).toContain('Skipped files')
    expect(wrapper.findAll('.obsidian-import__stat--warning')).toHaveLength(3)
  })

  it('error stage renders the progress error message', async () => {
    mockProgress.value = { ...createIdleProgress(), phase: 'error', error: 'Vault read failed' }
    const wrapper = mountModal()
    await flush()

    expect(wrapper.text()).toContain('Import failed')
    expect(wrapper.text()).toContain('Vault read failed')
  })

  // The shell mounts this modal behind a `v-if`, so it arrives already open and
  // never sees an open transition — focus must land without one.
  it('focuses the select-folder button on mount', async () => {
    const wrapper = mountModal()
    await flush()

    const button = wrapper.findAll('button').find((b) => b.text().includes('Select vault folder'))
    expect(document.activeElement).toBe(button!.element)
  })

  // Each stage destroys the previously focused button; without a refocus the
  // backdrop's Escape handler stops seeing the key, because it only fires while
  // focus is still inside the dialog.
  it('moves focus to the close button once the import finishes', async () => {
    mockImportVault.mockResolvedValueOnce(fullResult())
    const wrapper = mountModal()
    await flush()

    const start = wrapper.findAll('button').find((b) => b.text().includes('Select vault folder'))
    await start!.trigger('click')
    await flush()

    const close = wrapper.findAll('button').find((b) => b.text().includes('Close'))
    expect(close).toBeTruthy()
    expect(document.activeElement).toBe(close!.element)
  })
})
