import { ref } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'
import { freeOpenRouterModels, isOpenRouterUrl } from '../core/ai/openrouter'
import { useAiCompletion } from './useAiCompletion'

export type AiModelsStatus = 'idle' | 'checking' | 'ok' | 'error'

// Shared by Settings → AI and the chat model picker so one fetch serves both.
const models = ref<string[]>([])
const status = ref<AiModelsStatus>('idle')
let loadedFor = ''

export function useAiModels() {
  const workspaceStore = useWorkspaceStore()
  const ai = useAiCompletion()

  const sourceKey = () => `${workspaceStore.settings.ai.apiKind}|${workspaceStore.settings.ai.baseUrl}`

  /** Lists the endpoint's models; cached per endpoint unless `force`. */
  async function load(force = false): Promise<void> {
    const key = sourceKey()
    if (!force && key === loadedFor && status.value === 'ok') return
    status.value = 'checking'
    try {
      const result = await ai.testConnection()
      // The endpoint changed while the request was in flight; its caller reloads.
      if (sourceKey() !== key) return
      const { apiKind, baseUrl, defaultModel } = workspaceStore.settings.ai
      const openRouter = apiKind === 'openai' && isOpenRouterUrl(baseUrl)
      models.value = openRouter ? freeOpenRouterModels(result) : result
      loadedFor = key
      status.value = 'ok'
      const first = models.value[0]
      // Only replace a model the endpoint does not serve; a paid model the user chose stays.
      if (openRouter && first && !result.includes(defaultModel)) await select(first)
    } catch {
      if (sourceKey() !== key) return
      models.value = []
      loadedFor = ''
      status.value = 'error'
    }
  }

  function reset() {
    models.value = []
    status.value = 'idle'
    loadedFor = ''
  }

  function select(model: string) {
    return workspaceStore.updateSettings(d => { d.ai.defaultModel = model })
  }

  return { models, status, load, reset, select }
}
