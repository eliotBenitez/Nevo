import { getActivePinia, storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'
import { resolveRuntimeCapabilities } from '../utils/runtime'

const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth)
const viewportHeight = ref(typeof window === 'undefined' ? 800 : window.innerHeight)
const coarsePointer = ref(false)
const hoverCapable = ref(true)
let listenersBound = false
let activeConsumers = 0
let rafId: number | null = null

function updateViewport() {
  if (typeof window === 'undefined') return
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
  updatePointerCapabilities()
}

function scheduleUpdateViewport() {
  if (typeof window === 'undefined') return
  if (rafId !== null) return
  rafId = window.requestAnimationFrame(() => {
    rafId = null
    updateViewport()
  })
}

function updatePointerCapabilities() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  coarsePointer.value = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
  hoverCapable.value = window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function bindGlobalListeners() {
  if (listenersBound || typeof window === 'undefined') return
  listenersBound = true
  updateViewport()
  updatePointerCapabilities()
  window.addEventListener('resize', scheduleUpdateViewport)
  window.addEventListener('orientationchange', scheduleUpdateViewport)
}

function unbindGlobalListeners() {
  if (!listenersBound || typeof window === 'undefined') return
  listenersBound = false
  window.removeEventListener('resize', scheduleUpdateViewport)
  window.removeEventListener('orientationchange', scheduleUpdateViewport)
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId)
    rafId = null
  }
}

export function useDeviceLayout() {
  const pinia = getActivePinia()
  const appMetadata = pinia ? storeToRefs(useWorkspaceStore()).appMetadata : ref(null)

  onMounted(() => {
    activeConsumers += 1
    bindGlobalListeners()
    updatePointerCapabilities()
  })

  onBeforeUnmount(() => {
    activeConsumers = Math.max(0, activeConsumers - 1)
    if (activeConsumers === 0) {
      unbindGlobalListeners()
    }
  })

  const runtime = computed(() => resolveRuntimeCapabilities(appMetadata.value))
  const isPhone = computed(() => viewportWidth.value < 720)
  const isTablet = computed(() => viewportWidth.value >= 720 && viewportWidth.value < 1100)
  const isDesktop = computed(() => viewportWidth.value >= 1100)
  const isTouch = computed(() => coarsePointer.value || runtime.value.isMobileRuntime)
  const supportsHover = computed(() => hoverCapable.value && !isTouch.value)
  const useDrawerNavigation = computed(() => viewportWidth.value < 960)
  const useCompactHeader = computed(() => viewportWidth.value < 1100 || runtime.value.isMobileRuntime)
  const useFullscreenDialogs = computed(() => viewportWidth.value < 720)
  const horizontalPadding = computed(() => {
    if (isPhone.value) return '12px'
    if (isTablet.value) return '16px'
    return '18px'
  })
  const shellStyle = computed(() => ({
    '--app-titlebar-height': useCompactHeader.value ? '56px' : '42px',
    '--app-shell-padding-x': horizontalPadding.value,
    '--app-dialog-padding': useFullscreenDialogs.value ? '0px' : '18px',
    '--app-sidebar-width': isTablet.value ? '248px' : '272px',
  }))

  return {
    viewportWidth,
    viewportHeight,
    runtime,
    isPhone,
    isTablet,
    isDesktop,
    isTouch,
    supportsHover,
    useDrawerNavigation,
    useCompactHeader,
    useFullscreenDialogs,
    shellStyle,
  }
}
