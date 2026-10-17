import { inject, ref, watchEffect, type InjectionKey, type Ref } from 'vue'
import { renderBlockSvg } from '../../utils/noteExport/blockSvg'
import type { ProcessedNode } from '../../utils/noteExport/docxPagination'

export const DOCX_PREVIEW_RELAYOUT: InjectionKey<() => void> = Symbol('docxPreviewRelayout')

// Shared by the hidden measurement container and the visible pages so each source renders once.
// shortcut: never evicted, fine for one-off export previews; add LRU eviction if memory shows up in profiles.
const svgCache = new Map<string, Promise<string | null>>()
const settledKeys = new Set<string>()

function cachedSvg(node: ProcessedNode): { key: string; pending: Promise<string | null> } {
  const source = JSON.stringify([node.attrs?.code, node.attrs?.markdown, node.attrs?.spec, node.attrs?.latex, node.content])
  const key = `${node.type}\u0000${source}`
  let pending = svgCache.get(key)
  if (!pending) {
    pending = renderBlockSvg(node).catch(() => null).finally(() => settledKeys.add(key))
    svgCache.set(key, pending)
  }
  return { key, pending }
}

export function useDocxPreviewSvg(getNode: () => ProcessedNode): { url: Ref<string | null>; settled: Ref<boolean> } {
  const relayout = inject(DOCX_PREVIEW_RELAYOUT, () => {})
  const url = ref<string | null>(null)
  const settled = ref(false)

  watchEffect((onCleanup) => {
    const node = getNode()
    let stale = false
    onCleanup(() => { stale = true })
    settled.value = false
    const { key, pending } = cachedSvg(node)
    const wasSettled = settledKeys.has(key)
    void pending.then((svg) => {
      if (stale) return
      url.value = svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null
      settled.value = true
      // Only a first-time render changes heights; re-mounted cached nodes must not re-trigger pagination.
      if (!wasSettled) relayout()
    })
  })

  return { url, settled }
}
