import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import UpdateDialog from './UpdateDialog.vue'
import en from '../../locales/en.json'

const updater = vi.hoisted(() => ({
  state: null as any,
  downloadAndInstall: vi.fn(),
  relaunchApp: vi.fn(),
  dismiss: vi.fn(),
}))

vi.mock('../../composables/useAppUpdater', async () => {
  const { ref } = await import('vue')
  updater.state = {
    status: ref('upToDate'),
    progress: ref(0),
    availableVersion: ref<string | null>(null),
    releaseNotes: ref<string | null>(null),
    errorMessage: ref<string | null>(null),
    dialogOpen: ref(true),
    downloadAndInstall: updater.downloadAndInstall,
    relaunchApp: updater.relaunchApp,
    dismiss: updater.dismiss,
  }
  return { useAppUpdater: () => updater.state }
})

vi.mock('../../tauri/commands', () => ({
  systemCommands: { openExternalUrl: vi.fn() },
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountDialog() {
  return mount(UpdateDialog, {
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

describe('UpdateDialog', () => {
  beforeEach(() => {
    updater.state.status.value = 'upToDate'
    updater.state.progress.value = 0
    updater.state.availableVersion.value = null
    updater.state.releaseNotes.value = null
    updater.state.errorMessage.value = null
    updater.state.dialogOpen.value = true
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('groups the up-to-date description with its title and closes from a neutral footer button', async () => {
    const wrapper = mountDialog()
    const dialog = document.body.querySelector('[role="dialog"]')!
    const title = dialog.querySelector('#updater-modal-title')!
    const description = dialog.querySelector('#updater-modal-description')!
    const close = [...dialog.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Close')!

    expect(title.textContent).toContain("You're up to date")
    expect(description.textContent).toContain('You have the latest version of Nevo.')
    expect(dialog.getAttribute('aria-describedby')).toBe(description.id)
    expect(description.closest('.updater-modal__success-copy')).toBeTruthy()
    expect(close.classList.contains('nv-btn--primary')).toBe(false)
    expect(dialog.classList.contains('updater-modal--success')).toBe(true)

    await close.click()
    expect(updater.dismiss).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('keeps retry and restart actions available for error and ready states', async () => {
    updater.state.status.value = 'error'
    updater.state.availableVersion.value = '1.2.3'
    updater.state.errorMessage.value = 'Network unavailable'
    const errorWrapper = mountDialog()
    const retry = [...document.body.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Retry')!
    expect(document.body.textContent).toContain('Network unavailable')
    await retry.click()
    expect(updater.downloadAndInstall).toHaveBeenCalledOnce()
    errorWrapper.unmount()

    updater.state.status.value = 'ready'
    const readyWrapper = mountDialog()
    const restart = [...document.body.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Restart')!
    expect(document.body.textContent).toContain('Restart the app to apply the update.')
    await restart.click()
    expect(updater.relaunchApp).toHaveBeenCalledOnce()
    readyWrapper.unmount()
  })

  it('blocks Escape and backdrop dismissal while downloading, and disables both actions', async () => {
    updater.state.status.value = 'downloading'
    updater.state.availableVersion.value = '1.2.3'
    const wrapper = mountDialog()
    const dialog = document.body.querySelector('[role="dialog"]')!
    const buttons = [...dialog.querySelectorAll('button')]
    const later = buttons.find(button => button.textContent?.trim() === 'Later')!
    const update = buttons.find(button => button.textContent?.trim() === 'Update')!

    expect(later.disabled).toBe(true)
    expect(update.disabled).toBe(true)
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    document.body.querySelector('.nv-modal__scrim')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(updater.dismiss).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
