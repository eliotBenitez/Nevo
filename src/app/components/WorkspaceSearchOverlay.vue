<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Search, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useWorkspaceSearch } from '../composables/useWorkspaceSearch'
import { useFocusTrap } from '../../ui/composables/useFocusTrap'
import { useDeviceLayout } from '../../composables/useDeviceLayout'
import { useMobileBackButton } from '../../composables/useMobileBackButton'
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
const { isPhone, runtime } = useDeviceLayout()
useMobileBackButton(
  () => { emit('close') },
  computed(() => props.open && isPhone.value && runtime.value.isMobileRuntime),
)

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
    <div v-if="open" class="search-overlay-backdrop tw:fixed tw:inset-0 tw:z-[240] tw:flex tw:justify-center tw:pt-[12vh] tw:px-6 tw:pb-6 tw:bg-scrim max-[719px]:tw:p-0 max-[719px]:tw:bg-surface-canvas" @click.self="emit('close')">
      <section
        ref="dialogRef"
        class="search-overlay tw:w-[min(640px,100%)] tw:h-fit tw:max-h-[min(64vh,560px)] tw:flex tw:flex-col tw:overflow-hidden tw:border tw:border-solid tw:border-transparent tw:rounded-[calc(16px*var(--radius-scale,1))] tw:bg-surface-overlay tw:shadow-[var(--shadow-overlay)] max-[719px]:tw:w-screen max-[719px]:tw:h-[100dvh] max-[719px]:tw:max-h-[100dvh] max-[719px]:tw:border-0 max-[719px]:tw:rounded-none max-[719px]:tw:bg-surface-canvas max-[719px]:tw:shadow-none"
        role="dialog"
        aria-modal="true"
        :aria-label="t('workspace.searchOverlay.ariaLabel')"
      >
        <div class="search-overlay__field tw:flex tw:items-center tw:flex-shrink-0 tw:gap-2.5 tw:mt-2 tw:mx-2 tw:mb-0 tw:px-3 tw:py-3.5 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:bg-surface-subtle max-[719px]:tw:min-h-[calc(64px+max(var(--safe-area-top),0px))] max-[719px]:tw:m-0 max-[719px]:tw:pt-[max(var(--safe-area-top),0px)] max-[719px]:tw:pr-[calc(8px+max(var(--safe-area-right),0px))] max-[719px]:tw:pb-0 max-[719px]:tw:pl-[calc(16px+max(var(--safe-area-left),0px))] max-[719px]:tw:gap-3 max-[719px]:tw:rounded-none max-[719px]:tw:bg-transparent">
          <Search :size="16" class="search-overlay__icon tw:flex-shrink-0 tw:text-content-muted" />
          <input
            ref="inputRef"
            v-model="query"
            class="search-overlay__input tw:w-full tw:min-w-0 tw:border-0 tw:outline-none tw:bg-transparent tw:text-content-primary tw:text-[15px] tw:placeholder:text-content-muted max-[719px]:tw:min-h-11 max-[719px]:tw:text-base"
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
            class="search-overlay__close tw:grid tw:flex-shrink-0 tw:place-items-center tw:size-[26px] tw:border-0 tw:rounded-full tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:hover:bg-(--hover) tw:hover:text-content-secondary tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1 max-[719px]:tw:size-11 max-[719px]:tw:text-content-secondary"
            :aria-label="t('workspace.searchOverlay.close')"
            @click="emit('close')"
          >
            <X :size="15" />
          </button>
        </div>

        <div :id="listboxId" class="search-overlay__results tw:overflow-auto tw:p-2.5 max-[719px]:tw:flex-1 max-[719px]:tw:pt-3 max-[719px]:tw:pr-[calc(12px+max(var(--safe-area-right),0px))] max-[719px]:tw:pb-[calc(16px+max(var(--safe-area-bottom),0px))] max-[719px]:tw:pl-[calc(12px+max(var(--safe-area-left),0px))]" role="listbox">
          <template v-if="visibleGroups.length">
            <section v-for="group in visibleGroups" :key="group.id" class="search-overlay__group [&:not(:first-child)]:tw:mt-2.5">
              <div class="search-overlay__group-title tw:mb-1.5 tw:text-content-muted tw:text-[10px] tw:font-bold tw:tracking-[0.08em] tw:uppercase">{{ groupTitle(group.id) }}</div>
              <button
                v-for="result in group.items"
                :id="resultOptionId(`${result.type}:${result.id}`)"
                :key="`${result.type}:${result.id}`"
                type="button"
                role="option"
                class="search-overlay__result tw:w-full tw:flex tw:flex-col tw:gap-1 tw:px-3 tw:py-2.5 tw:border-0 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:text-inherit tw:text-left tw:cursor-pointer tw:hover:bg-surface-subtle tw:focus-visible:bg-surface-subtle tw:focus-visible:outline-none tw:focus-visible:shadow-[inset_0_0_0_2px_var(--accent)] max-[719px]:tw:min-h-14 max-[719px]:tw:p-3"
                :class="activeResultKey === `${result.type}:${result.id}` ? 'is-active tw:bg-surface-subtle' : 'tw:bg-transparent'"
                :aria-selected="activeResultKey === `${result.type}:${result.id}`"
                @mousedown.prevent
                @click="selectResult(result)"
              >
                <div class="search-overlay__result-head tw:flex tw:items-baseline tw:justify-between tw:gap-2.5">
                  <span class="search-overlay__result-title tw:text-content-primary tw:text-[13px] tw:font-semibold">{{ result.type === 'block' ? result.noteTitle : result.title }}</span>
                  <span v-if="resultSubtitle(result)" class="search-overlay__result-subtitle tw:text-content-muted tw:text-[11px]">{{ resultSubtitle(result) }}</span>
                </div>
                <div class="search-overlay__result-body tw:text-content-muted tw:text-[11.5px] tw:leading-[1.45]">{{ resultBody(result) }}</div>
              </button>
            </section>
            <div v-if="isLoadingBlocks" class="search-overlay__loading tw:flex tw:items-center tw:gap-2 tw:mt-2.5 tw:px-3 tw:py-2.5 tw:rounded-[calc(10px*var(--radius-scale,1))] tw:bg-[color-mix(in_oklab,var(--hover)_80%,transparent)] tw:text-content-muted tw:text-[11.5px]" role="status" aria-live="polite">
              <span class="search-overlay__spinner" aria-hidden="true" />
              <span>{{ t('workspace.titlebarSearch.loadingShort') }}</span>
            </div>
          </template>

          <div v-else-if="normalizedQuery" class="search-overlay__empty tw:px-4 tw:py-[22px]" role="status" aria-live="polite">
            <div v-if="isLoadingBlocks" class="search-overlay__loading search-overlay__loading--empty tw:flex tw:items-center tw:gap-2 tw:mt-0 tw:p-0 tw:bg-transparent tw:text-content-secondary tw:font-semibold">
              <span class="search-overlay__spinner" aria-hidden="true" />
              <span>{{ t('workspace.titlebarSearch.loadingTitle') }}</span>
            </div>
            <div v-else class="search-overlay__empty-title tw:text-content-secondary tw:text-[13px] tw:font-semibold">{{ t('workspace.titlebarSearch.emptyTitle') }}</div>
            <div class="search-overlay__empty-subtitle tw:mt-1 tw:text-content-muted tw:text-xs tw:leading-[1.45]">
              {{ isLoadingBlocks ? t('workspace.titlebarSearch.loading') : t('workspace.titlebarSearch.emptyDescription') }}
            </div>
          </div>

          <div v-else class="search-overlay__empty tw:px-4 tw:py-[22px]">
            <div class="search-overlay__empty-title tw:text-content-secondary tw:text-[13px] tw:font-semibold">{{ t('workspace.titlebarSearch.idleTitle') }}</div>
            <div class="search-overlay__empty-subtitle tw:mt-1 tw:text-content-muted tw:text-xs tw:leading-[1.45]">{{ t('workspace.titlebarSearch.idleDescription') }}</div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
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
</style>
