import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useImageLightbox } from './useImageLightbox'

function figure(src: string, caption = '', alt = ''): string {
  return `<figure class="nv-image-block"><img class="nv-image-preview" src="${src}" alt="${alt}"><figcaption>${caption}</figcaption></figure>`
}

function mountLightbox(html: string) {
  let api!: ReturnType<typeof useImageLightbox>
  const wrapper = mount(defineComponent({
    setup() {
      const root = ref<HTMLElement | null>(null)
      api = useImageLightbox(root)
      return () => h('div', { ref: root, class: 'doc-editor', innerHTML: html })
    },
  }), { attachTo: document.body })
  const images = () => Array.from(wrapper.element.querySelectorAll('img')) as HTMLImageElement[]
  return { wrapper, api, images }
}

describe('useImageLightbox', () => {
  it('opens on double click with every image of the note, starting at the clicked one', () => {
    const { api, images, wrapper } = mountLightbox(figure('http://x/a.png', 'First') + '<p>text</p>' + figure('http://x/b.png', '', 'Second alt'))
    images()[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(api.open.value).toBe(true)
    expect(api.index.value).toBe(1)
    expect(api.images.value).toEqual([
      { src: 'http://x/a.png', alt: '', caption: 'First' },
      { src: 'http://x/b.png', alt: 'Second alt', caption: '' },
    ])
    wrapper.unmount()
  })

  it('skips placeholders without src and images of nested editors', () => {
    const nested = `<div class="doc-editor">${figure('http://x/nested.png')}</div>`
    const { api, images, wrapper } = mountLightbox(figure('http://x/a.png') + '<img class="nv-image-preview">' + nested)
    api.openFrom(images()[0])
    expect(api.images.value.map((image) => image.src)).toEqual(['http://x/a.png'])
    wrapper.unmount()
  })

  it('steps within bounds and closes', () => {
    const { api, images, wrapper } = mountLightbox(figure('http://x/a.png') + figure('http://x/b.png'))
    api.openFrom(images()[0])
    api.previous()
    expect(api.index.value).toBe(0)
    api.next()
    api.next()
    expect(api.index.value).toBe(1)
    api.close()
    expect(api.open.value).toBe(false)
    wrapper.unmount()
  })
})
