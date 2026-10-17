import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '../../locales/en.json'
import NvToastHost from './NvToastHost.vue'
import { useToast } from '../composables/useToast'

const toast = useToast()
let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  toast.toastState.items.map(item => item.id).forEach(toast.dismissToast)
  vi.useRealTimers()
})

describe('NvToastHost', () => {
  it('renders the action button and runs it on click', async () => {
    wrapper = mount(NvToastHost, { attachTo: document.body, global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
    const run = vi.fn()
    toast.showToast({ message: 'Note moved to archive', action: { label: 'Undo', run } })
    await nextTick()

    const button = document.body.querySelector<HTMLButtonElement>('.nv-toast__action')!
    expect(button.textContent!.trim()).toBe('Undo')
    button.click()
    await nextTick()
    expect(run).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('.nv-toast__action')).toBeNull()
  })

  it('keeps the toast while it has keyboard focus', async () => {
    vi.useFakeTimers()
    wrapper = mount(NvToastHost, { attachTo: document.body, global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
    toast.showToast({ message: 'Moved', duration: 1000, action: { label: 'Undo', run: () => {} } })
    await nextTick()

    document.body.querySelector<HTMLButtonElement>('.nv-toast__action')!.focus()
    vi.advanceTimersByTime(5000)
    expect(toast.toastState.items).toHaveLength(1)
  })

  it('omits the action button for plain toasts', async () => {
    wrapper = mount(NvToastHost, { attachTo: document.body, global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
    toast.showToast({ message: 'Saved' })
    await nextTick()
    expect(document.body.querySelector('.nv-toast__action')).toBeNull()
  })

  it('labels the region and close button through i18n', async () => {
    wrapper = mount(NvToastHost, { attachTo: document.body, global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
    toast.showToast({ message: 'Saved' })
    await nextTick()
    expect(document.body.querySelector('.nv-toast-host')!.getAttribute('aria-label')).toBe(en.common.notifications)
    expect(document.body.querySelector('.nv-toast__close')!.getAttribute('aria-label')).toBe(en.common.close)
  })
})
