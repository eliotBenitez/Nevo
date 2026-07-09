<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useWorkspaceStore } from '../../stores/workspace'
import type { WorkspaceManifest } from '../../types/workspace'
import { appLogger } from '../../utils/logger'
import type {
  SearchResultGroup,
} from '../search'
import {
  collectWorkspaceEntitySearchItems,
  groupVisibleTitleBarResults,
} from '../search'
import type {
  TitleBarSearchResult,
  WorkspaceBlockSearchItem,
  WorkspaceSettingSearchItem,
} from '../../types/search'

interface Props {
  manifest: WorkspaceManifest | null
  workspacePath: string | null
  settingsItems: WorkspaceSettingSearchItem[]
  searchShortcut?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'select-result': [result: TitleBarSearchResult]
}>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()

const rootRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const isOpen = ref(false)
const blockResults = ref<WorkspaceBlockSearchItem[]>([])
const activeIndex = ref(-1)
const isLoadingBlocks = ref(false)
const instanceId = getCurrentInstance()?.uid ?? 0
const listboxId = `titlebar-search-listbox-${instanceId}`

let latestSearchToken = 0

const normalizedQuery = computed(() => query.value.trim().toLowerCase())
const entityItems = computed(() => collectWorkspaceEntitySearchItems(props.manifest))
const allResults = computed<TitleBarSearchResult[]>(() => [
  ...entityItems.value,
  ...blockResults.value,
  ...props.settingsItems,
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
const activeOptionId = computed(() => activeResultKey.value ? resultOptionId(activeResultKey.value) : undefined)
const shortcutSegments = computed(() => {
  const shortcut = props.searchShortcut?.trim()
  if (!shortcut) return []
  return shortcut
    .split('+')
    .map(segment => segment.trim())
    .filter(Boolean)
})
const showInlineHints = computed(() => !normalizedQuery.value && shortcutSegments.value.length > 0)

function groupTitle(group: SearchResultGroup['id']): string {
  if (group === 'entities') return t('workspace.titlebarSearch.groups.entities')
  if (group === 'blocks') return t('workspace.titlebarSearch.groups.blocks')
  return t('workspace.titlebarSearch.groups.settings')
}

function hintLabel(segment: string): string {
  if (segment === 'Space') return t('settings.hotkeys.keys.space')
  return segment
}

function resultSubtitle(result: TitleBarSearchResult): string {
  if (result.type === 'note') {
    return result.pathLabel || t('workspace.titlebarSearch.rootLabel')
  }
  if (result.type === 'folder') {
    return result.pathLabel || t('workspace.titlebarSearch.rootLabel')
  }
  if (result.type === 'block') {
    return result.noteTitle
  }
  return result.sectionLabel
}

function resultBody(result: TitleBarSearchResult): string {
  if (result.type === 'block') return result.snippet
  if (result.type === 'setting') return result.description
  return result.title
}

function resultOptionId(key: string): string {
  return `titlebar-search-option-${instanceId}-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function openDropdown() {
  isOpen.value = true
}

function closeDropdown() {
  isOpen.value = false
  activeIndex.value = -1
}

function clearBlockSearchState() {
  latestSearchToken += 1
  isLoadingBlocks.value = false
  blockResults.value = []
}

async function runBlockSearch(queryText: string) {
  if (!props.workspacePath || !queryText) {
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
      workspacePath: props.workspacePath,
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

function selectResult(result: TitleBarSearchResult) {
  emit('select-result', result)
  query.value = ''
  clearBlockSearchState()
  closeDropdown()
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

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    openDropdown()
    moveActiveIndex(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    openDropdown()
    moveActiveIndex(-1)
    return
  }

  if (event.key === 'Enter') {
    if (!isOpen.value) return
    const result = flatVisibleResults.value[activeIndex.value < 0 ? 0 : activeIndex.value]
    if (!result) return
    event.preventDefault()
    selectResult(result)
    return
  }

  if (event.key === 'Escape') {
    if (!isOpen.value) return
    event.preventDefault()
    closeDropdown()
    return
  }
}

function onDocumentMouseDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (rootRef.value?.contains(target)) return
  closeDropdown()
}

function focusSearch(seed?: string) {
  if (typeof seed === 'string') {
    query.value = seed
  }
  openDropdown()
  void nextTick(() => {
    inputRef.value?.focus()
    const length = inputRef.value?.value.length ?? 0
    inputRef.value?.setSelectionRange(length, length)
  })
}

defineExpose({
  focusSearch,
})

watch(normalizedQuery, (nextQuery) => {
  activeIndex.value = -1
  if (!nextQuery) {
    clearBlockSearchState()
    return
  }
  openDropdown()
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

watch(
  () => props.workspacePath,
  () => {
    clearBlockSearchState()
  },
)

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  clearBlockSearchState()
})
</script>

<template>
  <div ref="rootRef" class="titlebar-search">
    <label class="titlebar-search__field" :class="{ 'is-open': isOpen }">
      <Search :size="13" class="titlebar-search__icon" />
      <input
        ref="inputRef"
        v-model="query"
        class="titlebar-search__input"
        type="search"
        role="combobox"
        autocomplete="off"
        :aria-expanded="isOpen"
        :aria-controls="listboxId"
        :aria-activedescendant="activeOptionId"
        :placeholder="t('workspace.titlebarSearch.placeholder')"
        @focus="openDropdown"
        @keydown="onKeydown"
      />
      <div v-if="showInlineHints" class="titlebar-search__hints">
        <div class="titlebar-search__hint-group">
          <kbd
            v-for="segment in shortcutSegments"
            :key="`shortcut-${segment}`"
            class="nv-kbd titlebar-search__hint-key"
          >
            {{ hintLabel(segment) }}
          </kbd>
        </div>
      </div>
    </label>

    <div v-if="isOpen" :id="listboxId" class="titlebar-search__dropdown" role="listbox">
      <template v-if="visibleGroups.length">
        <section v-for="group in visibleGroups" :key="group.id" class="titlebar-search__group">
          <div class="titlebar-search__group-title">{{ groupTitle(group.id) }}</div>
          <button
            v-for="result in group.items"
            :key="`${result.type}:${result.id}`"
            :id="resultOptionId(`${result.type}:${result.id}`)"
            type="button"
            role="option"
            class="titlebar-search__result"
            :class="{ 'is-active': activeResultKey === `${result.type}:${result.id}` }"
            :aria-selected="activeResultKey === `${result.type}:${result.id}`"
            @mousedown.prevent
            @click="selectResult(result)"
          >
            <div class="titlebar-search__result-head">
              <span class="titlebar-search__result-title">{{ result.type === 'block' ? result.noteTitle : result.title }}</span>
              <span v-if="resultSubtitle(result)" class="titlebar-search__result-subtitle">{{ resultSubtitle(result) }}</span>
            </div>
            <div class="titlebar-search__result-body">{{ resultBody(result) }}</div>
          </button>
        </section>
        <div v-if="isLoadingBlocks" class="titlebar-search__loading" role="status" aria-live="polite">
          <span class="titlebar-search__spinner" aria-hidden="true" />
          <span>{{ t('workspace.titlebarSearch.loadingShort') }}</span>
        </div>
      </template>

      <div v-else-if="normalizedQuery" class="titlebar-search__empty" role="status" aria-live="polite">
        <div v-if="isLoadingBlocks" class="titlebar-search__loading titlebar-search__loading--empty">
          <span class="titlebar-search__spinner" aria-hidden="true" />
          <span>{{ t('workspace.titlebarSearch.loadingTitle') }}</span>
        </div>
        <div v-else class="titlebar-search__empty-title">{{ t('workspace.titlebarSearch.emptyTitle') }}</div>
        <div class="titlebar-search__empty-subtitle">
          {{ isLoadingBlocks ? t('workspace.titlebarSearch.loading') : t('workspace.titlebarSearch.emptyDescription') }}
        </div>
      </div>

      <div v-else class="titlebar-search__empty">
        <div class="titlebar-search__empty-title">{{ t('workspace.titlebarSearch.idleTitle') }}</div>
        <div class="titlebar-search__empty-subtitle">{{ t('workspace.titlebarSearch.idleDescription') }}</div>
      </div>
    </div>
  </div>
</template>
