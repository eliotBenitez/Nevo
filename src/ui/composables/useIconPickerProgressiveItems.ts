import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

const INITIAL_ITEM_LIMIT = 120
const ITEM_BATCH_SIZE = 120
const SCROLL_LOAD_DISTANCE = 120
const FOCUS_LOAD_DISTANCE = 12

export function useIconPickerProgressiveItems<T>(
  items: ComputedRef<T[]>,
  resetKey: ComputedRef<string>,
) {
  const renderedCount = ref(INITIAL_ITEM_LIMIT)
  const scrollContainer: Ref<HTMLElement | null> = ref(null)
  const visibleItems = computed(() => items.value.slice(0, renderedCount.value))

  function appendItems() {
    renderedCount.value = Math.min(items.value.length, renderedCount.value + ITEM_BATCH_SIZE)
  }

  function onScroll() {
    const container = scrollContainer.value
    if (!container) return

    if (container.scrollHeight - container.scrollTop - container.clientHeight <= SCROLL_LOAD_DISTANCE) {
      appendItems()
    }
  }

  function onFocusIn(event: FocusEvent) {
    const target = event.target
    if (!(target instanceof Element)) return

    const item = target.closest('.nv-icon-picker__item')
    if (!item) return

    const visibleItemElements = scrollContainer.value?.querySelectorAll('.nv-icon-picker__item')
    if (!visibleItemElements?.length) return

    const itemIndex = Array.prototype.indexOf.call(visibleItemElements, item) as number
    if (itemIndex >= renderedCount.value - FOCUS_LOAD_DISTANCE) {
      appendItems()
    }
  }

  watch(resetKey, () => {
    renderedCount.value = INITIAL_ITEM_LIMIT
    if (scrollContainer.value) scrollContainer.value.scrollTop = 0
  })

  return {
    renderedCount,
    scrollContainer,
    visibleItems,
    onScroll,
    onFocusIn,
  }
}
