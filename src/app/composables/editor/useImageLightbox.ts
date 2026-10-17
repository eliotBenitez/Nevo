import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

export interface LightboxImage {
  src: string
  alt: string
  caption: string
}

const IMAGE_SELECTOR = 'img.nv-image-preview'

/** Rendered, resolved images of one editor, in document order. */
function collectImages(root: HTMLElement): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>(IMAGE_SELECTOR))
    // Nested editors (e.g. embeds) own their own lightbox.
    .filter((img) => img.closest('.doc-editor') === root && Boolean(img.getAttribute('src')))
}

function toLightboxImage(img: HTMLImageElement): LightboxImage {
  return {
    src: img.currentSrc || img.src,
    alt: img.alt,
    caption: img.closest('figure')?.querySelector('figcaption')?.textContent?.trim() ?? '',
  }
}

/**
 * Full-screen image viewer state for one editor. Images are read from the
 * rendered node views, so their src is already resolved to a loadable URL.
 */
export function useImageLightbox(editorRoot: Ref<HTMLElement | null>) {
  const open = ref(false)
  const images = ref<LightboxImage[]>([])
  const index = ref(0)

  function openFrom(target: HTMLImageElement) {
    const root = editorRoot.value
    if (!root) return
    const elements = collectImages(root)
    const start = elements.indexOf(target)
    if (start < 0) return
    images.value = elements.map(toLightboxImage)
    index.value = start
    open.value = true
  }

  function close() {
    open.value = false
  }

  function go(step: -1 | 1) {
    const next = index.value + step
    if (next >= 0 && next < images.value.length) index.value = next
  }

  function onDblClick(event: MouseEvent) {
    const target = event.target
    if (target instanceof HTMLImageElement && target.matches(IMAGE_SELECTOR)) {
      event.preventDefault()
      openFrom(target)
    }
  }

  watch(editorRoot, (root, previous) => {
    previous?.removeEventListener('dblclick', onDblClick)
    root?.addEventListener('dblclick', onDblClick)
  }, { immediate: true, flush: 'sync' })

  onBeforeUnmount(() => editorRoot.value?.removeEventListener('dblclick', onDblClick))

  return { open, images, index, openFrom, close, next: () => go(1), previous: () => go(-1) }
}
