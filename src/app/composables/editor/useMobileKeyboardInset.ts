import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

const MIN_KEYBOARD_INSET_PX = 80
const KEYBOARD_INSET_PROPERTY = '--mobile-keyboard-inset'

export function calculateMobileKeyboardInset(
  layoutViewportHeight: number,
  visualViewportHeight: number,
  visualViewportOffsetTop: number,
  visualViewportScale: number,
): number {
  if (visualViewportScale > 1.01) return 0
  const inset = Math.max(
    0,
    layoutViewportHeight - visualViewportHeight - visualViewportOffsetTop,
  )
  return inset >= MIN_KEYBOARD_INSET_PX ? Math.round(inset) : 0
}

export function useMobileKeyboardInset() {
  const keyboardInset = ref(0)
  let visualViewport: VisualViewport | null = null

  function updateKeyboardInset() {
    const nextInset = visualViewport
      ? calculateMobileKeyboardInset(
          window.innerHeight,
          visualViewport.height,
          visualViewport.offsetTop,
          visualViewport.scale,
        )
      : 0
    keyboardInset.value = nextInset
    document.documentElement.style.setProperty(
      KEYBOARD_INSET_PROPERTY,
      `${nextInset}px`,
    )
  }

  onMounted(() => {
    visualViewport = window.visualViewport
    visualViewport?.addEventListener('resize', updateKeyboardInset)
    visualViewport?.addEventListener('scroll', updateKeyboardInset)
    window.addEventListener('resize', updateKeyboardInset)
    updateKeyboardInset()
  })

  onBeforeUnmount(() => {
    visualViewport?.removeEventListener('resize', updateKeyboardInset)
    visualViewport?.removeEventListener('scroll', updateKeyboardInset)
    window.removeEventListener('resize', updateKeyboardInset)
    document.documentElement.style.removeProperty(KEYBOARD_INSET_PROPERTY)
  })

  return {
    keyboardInset: readonly(keyboardInset),
  }
}
