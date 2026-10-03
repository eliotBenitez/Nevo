import { ref, watch, type Ref } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { normalizeHistoryBlocks, type HistoryComparableBlock } from '../../utils/noteHistory'
import type { ArchiveItemViewModel } from './useArchiveItems'

export interface UseArchivePreviewResult {
  loading: Ref<boolean>
  error: Ref<string | null>
  blocks: Ref<HistoryComparableBlock[]>
  moreCount: Ref<number>
  kind: Ref<'note' | 'folder' | null>
}

export function useArchivePreview(
  selectedItem: Ref<ArchiveItemViewModel | null>,
): UseArchivePreviewResult {
  const workspaceStore = useWorkspaceStore()

  const loading = ref(false)
  const error = ref<string | null>(null)
  const blocks = ref<HistoryComparableBlock[]>([])
  const moreCount = ref(0)
  const kind = ref<'note' | 'folder' | null>(null)

  let requestToken = 0

  watch(
    selectedItem,
    async (item) => {
      const currentToken = ++requestToken

      if (!item) {
        kind.value = null
        loading.value = false
        error.value = null
        blocks.value = []
        moreCount.value = 0
        return
      }

      if (item.item.type === 'folder') {
        kind.value = 'folder'
        loading.value = false
        error.value = null
        blocks.value = []
        moreCount.value = 0
        return
      }

      // Note preview
      kind.value = 'note'
      loading.value = true
      error.value = null
      blocks.value = []
      moreCount.value = 0

      try {
        if (!workspaceStore.backend) {
          blocks.value = []
          moreCount.value = 0
          loading.value = false
          return
        }
        const doc = await workspaceStore.backend.loadNote(item.item.id)
        if (currentToken !== requestToken) return

        if (!doc || !doc.content) {
          blocks.value = []
          moreCount.value = 0
        } else {
          const allBlocks = normalizeHistoryBlocks(doc.content)
          blocks.value = allBlocks.slice(0, 12)
          moreCount.value = Math.max(0, allBlocks.length - 12)
        }
        loading.value = false
      } catch (err: unknown) {
        if (currentToken !== requestToken) return
        error.value = err instanceof Error ? err.message : 'Preview unavailable'
        loading.value = false
      }
    },
    { immediate: true },
  )

  return {
    loading,
    error,
    blocks,
    moreCount,
    kind,
  }
}
