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
// editor.css, settings.css, mobile-settings.css, onboarding.css, graph.css,
// features/kanban-modal.css, features/draw/draw.css, and the highlight.js
// theme moved to the components that actually render that content (editor
// route, settings modal, onboarding route, graph feature, kanban card modal,
// draw route, code-block node view) so they ship with those routes instead
// of app startup. @vue-flow/* styles were dropped entirely: nothing in `src`
// imports `@vue-flow/core` or uses its components (the graph feature uses its
// own D3 force-directed canvas), so they were dead CSS.

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
    console.log('Global window contextmenu event fired!', { shiftKey: e.shiftKey, defaultPrevented: e.defaultPrevented })
    if (!e.shiftKey) e.preventDefault()
  })

  const restored = await workspaceStore.restoreLastWorkspace()
  await router.replace(restored ? '/workspace' : '/onboarding')

  app.mount('#app')

  // Best-effort, one-time cleanup of leftover cloud/shared-storage state from
  // before the feature was removed. Fire-and-forget so it never races mount.
  void runLegacyCloudCleanup()
}

void bootstrap()
