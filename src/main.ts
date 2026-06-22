import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { useThemeStore } from './stores/theme'
import { useWorkspaceStore } from './stores/workspace'
import { useAuthStore } from './stores/auth'
import { initGlobalShortcuts } from './composables/useGlobalShortcuts'
import { i18n } from './i18n'
import './styles/tokens.css'
import './styles/base.css'
import './styles/primitives.css'
import './styles/app.css'
import './styles/editor.css'
import './styles/settings.css'
import './styles/onboarding.css'
import './styles/graph.css'
import './styles/ui.css'
import './styles/features/kanban-modal.css'
import './features/draw/draw.css'
import 'highlight.js/styles/github-dark.css'

const pinia = createPinia()

async function bootstrap() {
  const app = createApp(App)
  app.use(pinia)
  app.use(router)
  app.use(i18n)

  const workspaceStore = useWorkspaceStore()
  await workspaceStore.init()
  await useThemeStore().init()
  initGlobalShortcuts()

  const restored = await workspaceStore.restoreLastWorkspace()
  await router.replace(restored ? '/workspace' : '/onboarding')

  app.mount('#app')

  // Restore any cloud session (shared storages) in the background, after mount
  // so it never races the initial render. Failures are isolated.
  void useAuthStore().init().catch(() => { /* no cloud session */ })
}

void bootstrap()
