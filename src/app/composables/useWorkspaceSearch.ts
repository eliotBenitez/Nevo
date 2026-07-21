import { computed, getCurrentInstance, ref, watch, type Ref } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import type { WorkspaceManifest } from '../../types/workspace'
import { appLogger } from '../../utils/logger'
import type { SearchResultGroup } from '../search'
import { collectWorkspaceEntitySearchItems, groupVisibleTitleBarResults } from '../search'
import type {
  TitleBarSearchResult,
  WorkspaceBlockSearchItem,
  WorkspaceSettingSearchItem,
} from '../../types/search'

export interface UseWorkspaceSearchOptions {
  manifest: Ref<WorkspaceManifest | null>
  workspacePath: Ref<string | null>
  settingsItems: Ref<WorkspaceSettingSearchItem[]>
  onSelect: (result: TitleBarSearchResult) => void
}

// Stateful search logic shared by the titlebar trigger and the command-palette
// overlay: query text, async block search against the workspace backend,
// ranked/grouped results (via the pure helpers in `../search`), and keyboard
// navigation state. Open/close UI state and DOM focus stay in the consuming
// components — this composable owns only the search state itself.
export function useWorkspaceSearch(opts: UseWorkspaceSearchOptions) {
  const workspaceStore = useWorkspaceStore()
  const instanceId = getCurrentInstance()?.uid ?? 0

  const query = ref('')
  const blockResults = ref<WorkspaceBlockSearchItem[]>([])
  const isLoadingBlocks = ref(false)
  const activeIndex = ref(-1)

  let latestSearchToken = 0

  const normalizedQuery = computed(() => query.value.trim().toLowerCase())
  const entityItems = computed(() => collectWorkspaceEntitySearchItems(opts.manifest.value))
  const allResults = computed<TitleBarSearchResult[]>(() => [
    ...entityItems.value,
    ...blockResults.value,
    ...opts.settingsItems.value,
  ])
  const visibleGroups = computed<SearchResultGroup[]>(() => {
    if (!normalizedQuery.value) return []
    return groupVisibleTitleBarResults(normalizedQuery.value, allResults.value)
  })
  const flatVisibleResults = computed(() => visibleGroups.value.flatMap(group => group.items))
  const activeResultKey = computed(() => {
    const result = flatVisibleResults.value[activeIndex.value]
    return result ? `${result.type}:${result.id}` : null
  })

  function clearBlockSearchState() {
    latestSearchToken += 1
    isLoadingBlocks.value = false
    blockResults.value = []
  }

  async function runBlockSearch(queryText: string) {
    if (!opts.workspacePath.value || !queryText) {
      blockResults.value = []
      isLoadingBlocks.value = false
      return
    }

    const currentToken = ++latestSearchToken
    isLoadingBlocks.value = true

    try {
      const results = await (workspaceStore.backend?.searchWorkspaceBlocks(queryText) ?? [])
      if (currentToken !== latestSearchToken) return
      blockResults.value = results.map(result => ({
        ...result,
        type: 'block',
        id: result.id || `${result.noteId}:${result.blockIndex}`,
      }))
    } catch (error) {
      if (currentToken !== latestSearchToken) return
      await appLogger.warn({
        source: 'frontend.search',
        event: 'search_workspace_blocks',
        message: 'Failed to search workspace blocks',
        workspacePath: opts.workspacePath.value,
        error,
        payload: { queryLength: queryText.length },
      })
      blockResults.value = []
    } finally {
      if (currentToken === latestSearchToken) {
        isLoadingBlocks.value = false
      }
    }
  }

  function moveActiveIndex(delta: number) {
    const total = flatVisibleResults.value.length
    if (!total) return
    if (activeIndex.value < 0) {
      activeIndex.value = delta > 0 ? 0 : total - 1
      return
    }
    activeIndex.value = (activeIndex.value + delta + total) % total
  }

  function reset() {
    query.value = ''
    activeIndex.value = -1
    clearBlockSearchState()
  }

  function selectResult(result: TitleBarSearchResult) {
    opts.onSelect(result)
    reset()
  }

  watch(normalizedQuery, (nextQuery) => {
    activeIndex.value = -1
    if (!nextQuery) {
      clearBlockSearchState()
      return
    }
    void runBlockSearch(nextQuery)
  })

  watch(visibleGroups, () => {
    const lastIndex = flatVisibleResults.value.length - 1
    if (lastIndex < 0) {
      activeIndex.value = -1
      return
    }
    if (activeIndex.value > lastIndex) activeIndex.value = lastIndex
  })

  watch(opts.workspacePath, () => {
    clearBlockSearchState()
  })

  return {
    instanceId,
    query,
    isLoadingBlocks,
    normalizedQuery,
    visibleGroups,
    flatVisibleResults,
    activeIndex,
    activeResultKey,
    moveActiveIndex,
    selectResult,
    reset,
  }
}
