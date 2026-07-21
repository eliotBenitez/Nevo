<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Search, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useWorkspaceSearch } from '../composables/useWorkspaceSearch'
import { useFocusTrap } from '../../ui/composables/useFocusTrap'
import type { SearchResultGroup } from '../search'
import type {
  TitleBarSearchResult,
  WorkspaceSettingSearchItem,
} from '../../types/search'
import type { WorkspaceManifest } from '../../types/workspace'

interface Props {
  open: boolean
  seed?: string
  manifest: WorkspaceManifest | null
  workspacePath: string | null
  settingsItems: WorkspaceSettingSearchItem[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  'select-result': [result: TitleBarSearchResult]
}>()

const { t } = useI18n()

const dialogRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const { activate, deactivate } = useFocusTrap(dialogRef, computed(() => props.open))

const {
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
} = useWorkspaceSearch({
  manifest: computed(() => props.manifest),
  workspacePath: computed(() => props.workspacePath),
  settingsItems: computed(() => props.settingsItems),
  onSelect: (result) => {
    emit('select-result', result)
    emit('close')
  },
})

const listboxId = `search-overlay-listbox-${instanceId}`
const activeOptionId = computed(() => activeResultKey.value ? resultOptionId(activeResultKey.value) : undefined)

function groupTitle(group: SearchResultGroup['id']): string {
  if (group === 'entities') return t('workspace.titlebarSearch.groups.entities')
  if (group === 'blocks') return t('workspace.titlebarSearch.groups.blocks')
  return t('workspace.titlebarSearch.groups.settings')
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
  return `search-overlay-option-${instanceId}-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActiveIndex(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActiveIndex(-1)
    return
  }

  if (event.key === 'Enter') {
    const result = flatVisibleResults.value[activeIndex.value < 0 ? 0 : activeIndex.value]
    if (!result) return
    event.preventDefault()
    selectResult(result)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

watch(() => props.open, (open) => {
  if (open) {
    query.value = props.seed ?? ''
    void nextTick(() => {
      activate()
      inputRef.value?.focus()
      const length = inputRef.value?.value.length ?? 0
      inputRef.value?.setSelectionRange(length, length)
    })
    return
  }

  reset()
  deactivate()
}, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="search-overlay-backdrop" @click.self="emit('close')">
      <section
        ref="dialogRef"
        class="search-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="t('workspace.searchOverlay.ariaLabel')"
      >
        <div class="search-overlay__field">
          <Search :size="16" class="search-overlay__icon" />
          <input
            ref="inputRef"
            v-model="query"
            class="search-overlay__input"
            type="search"
            role="combobox"
            autocomplete="off"
            :aria-expanded="open"
            :aria-controls="listboxId"
            :aria-activedescendant="activeOptionId"
            :placeholder="t('workspace.titlebarSearch.placeholder')"
            @keydown="onKeydown"
          />
          <button
            type="button"
            class="search-overlay__close"
            :aria-label="t('workspace.searchOverlay.close')"
            @click="emit('close')"
          >
            <X :size="15" />
          </button>
        </div>

        <div :id="listboxId" class="search-overlay__results" role="listbox">
          <template v-if="visibleGroups.length">
            <section v-for="group in visibleGroups" :key="group.id" class="search-overlay__group">
              <div class="search-overlay__group-title">{{ groupTitle(group.id) }}</div>
              <button
                v-for="result in group.items"
                :id="resultOptionId(`${result.type}:${result.id}`)"
                :key="`${result.type}:${result.id}`"
                type="button"
                role="option"
                class="search-overlay__result"
                :class="{ 'is-active': activeResultKey === `${result.type}:${result.id}` }"
                :aria-selected="activeResultKey === `${result.type}:${result.id}`"
                @mousedown.prevent
                @click="selectResult(result)"
              >
                <div class="search-overlay__result-head">
                  <span class="search-overlay__result-title">{{ result.type === 'block' ? result.noteTitle : result.title }}</span>
                  <span v-if="resultSubtitle(result)" class="search-overlay__result-subtitle">{{ resultSubtitle(result) }}</span>
                </div>
                <div class="search-overlay__result-body">{{ resultBody(result) }}</div>
              </button>
            </section>
            <div v-if="isLoadingBlocks" class="search-overlay__loading" role="status" aria-live="polite">
              <span class="search-overlay__spinner" aria-hidden="true" />
              <span>{{ t('workspace.titlebarSearch.loadingShort') }}</span>
            </div>
          </template>

          <div v-else-if="normalizedQuery" class="search-overlay__empty" role="status" aria-live="polite">
            <div v-if="isLoadingBlocks" class="search-overlay__loading search-overlay__loading--empty">
              <span class="search-overlay__spinner" aria-hidden="true" />
              <span>{{ t('workspace.titlebarSearch.loadingTitle') }}</span>
            </div>
            <div v-else class="search-overlay__empty-title">{{ t('workspace.titlebarSearch.emptyTitle') }}</div>
            <div class="search-overlay__empty-subtitle">
              {{ isLoadingBlocks ? t('workspace.titlebarSearch.loading') : t('workspace.titlebarSearch.emptyDescription') }}
            </div>
          </div>

          <div v-else class="search-overlay__empty">
            <div class="search-overlay__empty-title">{{ t('workspace.titlebarSearch.idleTitle') }}</div>
            <div class="search-overlay__empty-subtitle">{{ t('workspace.titlebarSearch.idleDescription') }}</div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.search-overlay-backdrop {
  position: fixed;
  z-index: 240;
  inset: 0;
  display: flex;
  justify-content: center;
  padding: 12vh 24px 24px;
  background: rgb(0 0 0 / 42%);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.search-overlay {
  width: min(640px, 100%);
  height: fit-content;
  max-height: min(64vh, 560px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line-2);
  border-radius: calc(18px * var(--radius-scale, 1));
  background: color-mix(in oklab, var(--glass-2) 98%, var(--canvas-1));
  box-shadow:
    0 28px 70px oklch(0 0 0 / 0.28),
    inset 0 1px 0 oklch(1 0 0 / 0.06);
  backdrop-filter: blur(28px) saturate(155%);
  -webkit-backdrop-filter: blur(28px) saturate(155%);
}

.search-overlay__field {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line-1);
}

.search-overlay__icon {
  flex-shrink: 0;
  color: var(--text-4);
}

.search-overlay__input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-1);
  font-size: 15px;
}

.search-overlay__input::placeholder {
  color: var(--text-4);
}

.search-overlay__close {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-4);
  cursor: pointer;
}

.search-overlay__close:hover,
.search-overlay__close:focus-visible {
  background: var(--hover);
  color: var(--text-2);
}

.search-overlay__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.search-overlay__results {
  overflow: auto;
  padding: 10px;
}

.search-overlay__group + .search-overlay__group {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line-1);
}

.search-overlay__group-title {
  margin-bottom: 6px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.search-overlay__result {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 0;
  border-radius: calc(12px * var(--radius-scale, 1));
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.search-overlay__result:hover,
.search-overlay__result.is-active,
.search-overlay__result:focus-visible {
  background: color-mix(in oklab, var(--accent) 16%, transparent);
}

.search-overlay__result:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--accent);
}

.search-overlay__result-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.search-overlay__result-title {
  color: var(--text-1);
  font-size: 13px;
  font-weight: 600;
}

.search-overlay__result-subtitle {
  color: var(--text-4);
  font-size: 11px;
}

.search-overlay__result-body {
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.45;
}

.search-overlay__empty {
  padding: 22px 16px;
}

.search-overlay__empty-title {
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
}

.search-overlay__empty-subtitle {
  margin-top: 4px;
  color: var(--text-4);
  font-size: 12px;
  line-height: 1.45;
}

.search-overlay__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: calc(10px * var(--radius-scale, 1));
  background: color-mix(in oklab, var(--hover) 80%, transparent);
  color: var(--text-3);
  font-size: 11.5px;
}

.search-overlay__loading--empty {
  margin-top: 0;
  padding: 0;
  background: transparent;
  color: var(--text-2);
  font-weight: 600;
}

.search-overlay__spinner {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 2px solid color-mix(in oklab, var(--accent) 18%, transparent);
  border-top-color: var(--accent);
  animation: search-overlay-spin 800ms linear infinite;
  flex: 0 0 auto;
}

@keyframes search-overlay-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .search-overlay__spinner {
    animation-duration: 1600ms;
  }
}

@media (max-width: 719px) {
  .search-overlay-backdrop {
    padding: 0;
  }

  .search-overlay {
    width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border: 0;
    border-radius: 0;
  }
}
</style>
