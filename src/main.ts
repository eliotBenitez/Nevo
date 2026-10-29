import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useThemeStore } from './stores/theme'
import { useWorkspaceStore } from './stores/workspace'
import { initGlobalShortcuts } from './composables/useGlobalShortcuts'
import { runLegacyCloudCleanup } from './app/legacyCloudCleanup'
import { i18n } from './i18n'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource/instrument-serif'
import '@fontsource/instrument-serif/400-italic.css'
import './styles/tokens.css'
import './styles/tailwind.css'
import './styles/base.css'
import './styles/surfaces.css'
import './styles/primitives.css'
import './styles/nv-modal.css'
import './styles/app.css'

const pinia = createPinia()

async function bootstrap() {
  const app = createApp(App)
  app.use(pinia)
  app.use(router)
  app.use(i18n)

  const workspaceStore = useWorkspaceStore()
  await workspaceStore.init()
  document.documentElement.dataset.platform = workspaceStore.appMetadata?.platform ?? 'web'
  await useThemeStore().init()
  initGlobalShortcuts()

  // Prevent native context menu on Windows/Linux unless Shift is held
  window.addEventListener('contextmenu', (e) => {
    if (!e.shiftKey) e.preventDefault()
  })

  // dragDropEnabled is off so WebView2 delivers HTML5 drag events; an OS file
  // dropped where no handler accepts it would otherwise navigate the webview.
  const blockUnhandledFileDrop = (e: DragEvent) => {
    if (e.defaultPrevented || !e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'none'
  }
  window.addEventListener('dragover', blockUnhandledFileDrop)
  window.addEventListener('drop', blockUnhandledFileDrop)

  const restored = await workspaceStore.restoreLastWorkspace()
  await router.replace(restored ? '/workspace' : '/onboarding')

  app.mount('#app')

  // Best-effort, one-time cleanup of leftover cloud/shared-storage state from
  // before the feature was removed. Fire-and-forget so it never races mount.
  void runLegacyCloudCleanup()
}

void bootstrap()
