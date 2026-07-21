import { computed, onScopeDispose, ref, type Ref } from 'vue'

export function useFloatingSidebar(isFloating: Ref<boolean>, pinned: Ref<boolean>) {
  const hovering = ref(false)
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  function clearHide() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function reveal() {
    clearHide()
    hovering.value = true
  }

  function scheduleHide() {
    clearHide()
    hideTimer = setTimeout(() => { hovering.value = false }, 150)
  }

  const revealed = computed(() => isFloating.value && (hovering.value || pinned.value))

  onScopeDispose(() => { clearHide() })

  return { revealed, onEdgeEnter: reveal, onSidebarEnter: reveal, onSidebarLeave: scheduleHide }
}
