import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { parseChatMarkdown } from '../../../core/ai-chat/markdown'
import type { ChatBlock } from '../../../core/ai-chat/markdown'

export interface ReadmeTarget {
  key: string
  load: () => Promise<string | null>
}
export type ReadmeStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

// Session cache of successful loads, keyed by target (`local:<id>`, `remote:<id>@<sha>`).
const cache = new Map<string, string | null>()

export function clearPluginReadmeCache() {
  cache.clear()
}

export function usePluginReadme(target: () => ReadmeTarget | null) {
  const status = ref<ReadmeStatus>('idle')
  const blocks: Ref<ChatBlock[]> = ref([])
  let sequence = 0

  function apply(text: string | null) {
    if (text === null || !text.trim()) {
      blocks.value = []
      status.value = 'empty'
      return
    }
    blocks.value = parseChatMarkdown(text)
    status.value = 'ready'
  }

  async function run(current: ReadmeTarget | null) {
    const token = ++sequence
    blocks.value = []
    if (!current) {
      status.value = 'idle'
      return
    }
    if (cache.has(current.key)) {
      apply(cache.get(current.key) ?? null)
      return
    }
    status.value = 'loading'
    try {
      const text = await current.load()
      if (token !== sequence) return
      cache.set(current.key, text)
      apply(text)
    } catch {
      if (token !== sequence) return
      status.value = 'error'
    }
  }

  watch(() => target()?.key ?? null, () => { void run(target()) }, { immediate: true })

  return { status, blocks, retry: () => run(target()) }
}
