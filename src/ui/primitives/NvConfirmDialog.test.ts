import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import NvConfirmDialog from './NvConfirmDialog.vue'
import { confirm, resolveConfirmDialog } from '../composables/useConfirmDialog'
import enMessages from '../../locales/en.json'
import ruMessages from '../../locales/ru.json'

function mountDialog(): VueWrapper {
  const i18n = createI18n({
    legacy: false,
    locale: 'ru',
    messages: {
      en: enMessages,
      ru: ruMessages,
    },
  })

  return mount(NvConfirmDialog, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
    },
  })
}

async function flushDialog() {
  await nextTick()
  await nextTick()
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
    .find(item => item.textContent?.trim() === label)
  expect(button).toBeTruthy()
  return button as HTMLButtonElement
}

afterEach(() => {
  resolveConfirmDialog(false)
  document.body.innerHTML = ''
})

describe('NvConfirmDialog', () => {
  it('shows the requested message and moves focus into the dialog', async () => {
    const wrapper = mountDialog()

    const result = confirm({ message: 'Удалить заметку?', variant: 'danger' })
    await flushDialog()

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.classList.contains('nv-confirm-dialog--danger')).toBe(true)
    expect(dialog?.getAttribute('aria-labelledby')).toBe('nv-confirm-title')
    expect(dialog?.getAttribute('aria-describedby')).toBe('nv-confirm-message')
    expect(document.body.querySelector('#nv-confirm-title')?.textContent).toContain('Подтвердите действие')
    expect(document.body.querySelector('#nv-confirm-message')?.textContent).toContain('Удалить заметку?')
    expect(document.body.textContent).toContain('Удалить заметку?')
    expect(document.body.textContent).toContain('Подтвердите действие')
    expect(dialog?.contains(document.activeElement)).toBe(true)

    const deleteButton = findButton('Удалить')
    expect(deleteButton.classList.contains('nv-btn--danger')).toBe(true)
    expect(deleteButton.querySelector('svg')).not.toBeNull()
    expect(dialog?.querySelector('.nv-confirm-dialog__icon svg')).not.toBeNull()

    deleteButton.click()
    await expect(result).resolves.toBe(true)
    wrapper.unmount()
  })

  it('resolves true when the confirm action is clicked', async () => {
    const wrapper = mountDialog()

    const result = confirm({ message: 'Продолжить?', confirmLabel: 'Да' })
    await flushDialog()

    findButton('Да').click()

    await expect(result).resolves.toBe(true)
    wrapper.unmount()
  })

  it('resolves false when the cancel action is clicked', async () => {
    const wrapper = mountDialog()

    const result = confirm({ message: 'Продолжить?' })
    await flushDialog()

    findButton('Отмена').click()

    await expect(result).resolves.toBe(false)
    wrapper.unmount()
  })

  it('resolves false on Escape and backdrop click', async () => {
    const wrapper = mountDialog()

    const escapeResult = confirm({ message: 'Закрыть через Escape?' })
    await flushDialog()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(escapeResult).resolves.toBe(false)

    const backdropResult = confirm({ message: 'Закрыть через фон?' })
    await flushDialog()
    document.body
      .querySelector<HTMLElement>('[data-testid="nv-confirm-backdrop"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await expect(backdropResult).resolves.toBe(false)
    wrapper.unmount()
  })
})
