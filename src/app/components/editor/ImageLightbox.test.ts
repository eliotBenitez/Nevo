import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import ImageLightbox from './ImageLightbox.vue'
import en from '../../../locales/en.json'

const images = [
  { src: 'http://x/a.png', alt: 'A', caption: 'First caption' },
  { src: 'http://x/b.png', alt: 'B', caption: '' },
]

let wrapper: VueWrapper | null = null

function mountLightbox(index: number) {
  wrapper = mount(ImageLightbox, {
    props: { open: true, images, index },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    attachTo: document.body,
  })
  return wrapper
}

const dialog = () => document.body.querySelector<HTMLElement>('.image-lightbox')!
const button = (label: string) => document.body.querySelector<HTMLButtonElement>(`.image-lightbox button[aria-label="${label}"]`)!

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('ImageLightbox', () => {
  it('renders the current image, counter and caption as a modal dialog', () => {
    mountLightbox(0)
    expect(dialog().getAttribute('role')).toBe('dialog')
    expect(dialog().getAttribute('aria-modal')).toBe('true')
    expect(dialog().querySelector('img')!.getAttribute('src')).toBe('http://x/a.png')
    expect(dialog().querySelector('.image-lightbox__counter')!.textContent!.trim()).toBe('1 of 2')
    expect(dialog().querySelector('.image-lightbox__caption')!.textContent!.trim()).toBe('First caption')
  })

  it('falls back to alt text when there is no caption', () => {
    mountLightbox(1)
    expect(dialog().querySelector('.image-lightbox__caption')!.textContent!.trim()).toBe('B')
  })

  it('handles Escape and arrow keys, ignoring arrows past the ends', () => {
    const w = mountLightbox(0)
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(w.emitted('previous')).toBeUndefined()
    expect(w.emitted('next')).toHaveLength(1)
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('disables navigation buttons at the ends and emits from the enabled ones', async () => {
    const w = mountLightbox(1)
    expect(button(en.image.lightbox.next).disabled).toBe(true)
    button(en.image.lightbox.previous).click()
    button(en.common.close).click()
    expect(w.emitted('previous')).toHaveLength(1)
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('toggles zoom on image click and resets it when the image changes', async () => {
    const w = mountLightbox(0)
    const img = () => dialog().querySelector('img')!
    img().click()
    await nextTick()
    expect(img().classList.contains('tw:cursor-zoom-out')).toBe(true)
    await w.setProps({ index: 1 })
    expect(img().classList.contains('tw:cursor-zoom-in')).toBe(true)
  })

  it('moves focus into the dialog when opened', async () => {
    wrapper = mount(ImageLightbox, {
      props: { open: false, images, index: 0 },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
      attachTo: document.body,
    })
    await wrapper.setProps({ open: true })
    await nextTick()
    expect(dialog().contains(document.activeElement)).toBe(true)
  })
})
