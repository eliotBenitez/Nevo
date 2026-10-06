<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Archive, Folder, Plus, Search, Pin, Trash2, ArrowLeft, ArrowRight } from '@lucide/vue'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import NevoMark from './NevoMark.vue'
import PrivacyBadge from './PrivacyBadge.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useRecentWorkspaceNoteCounts } from '../composables/useRecentWorkspaceNoteCounts'
import { useDeviceLayout } from '../../../composables/useDeviceLayout'
import { useConfirmDialog } from '../../../ui/composables/useConfirmDialog'
import { useWorkspaceTransfer } from '../../../composables/useWorkspaceTransfer'
import { useWindowKeydown } from '../../../composables/useWindowKeydown'
import { formatModShortcut, isModShortcut, usesCommandKey } from '../../../utils/modShortcut'
import type { RecentWorkspace } from '../../../types/workspace'
import { systemCommands } from '../../../tauri/commands'
import { isWorkspaceSchemaTooNewError } from '../../../utils/workspaceSchemaError'

const emit = defineEmits<{
  back: []
  create: []
  done: []
}>()

const { t, locale } = useI18n()
const workspaceStore = useWorkspaceStore()
const { isPhone, isTouch, runtime } = useDeviceLayout()
const { confirm } = useConfirmDialog()
const { importAsNewWorkspace } = useWorkspaceTransfer()

const filterQuery = ref('')
const importingArchive = ref(false)
const isDragOver = ref(false)
const deletingWorkspaceKey = ref<string | null>(null)
// Covers the whole `openWorkspace()` call, including the one-time legacy
// note-data migration it may run — see `useWorkspaceStore.openWorkspace`.
const browsingFolder = ref(false)
const openingWorkspaceId = ref<string | null>(null)
const isOpeningWorkspace = computed(() => browsingFolder.value || openingWorkspaceId.value !== null)
const allowWorkspaceDrop = computed(() => runtime.value.isDesktopRuntime && !isTouch.value && !isOpeningWorkspace.value)

const allWorkspaces = computed<RecentWorkspace[]>(() => workspaceStore.recents)
const { noteCountLabel } = useRecentWorkspaceNoteCounts(allWorkspaces)

type SortOrder = 'recent' | 'name'
const sortOrder = ref<SortOrder>('recent')
const filterInput = ref<HTMLInputElement | null>(null)
const useCommand = computed(() => usesCommandKey(runtime.value.platform))
const filterShortcut = computed(() => formatModShortcut('F', useCommand.value))

const filteredRecents = computed(() => {
  const query = filterQuery.value.toLowerCase()
  const matches = allWorkspaces.value.filter(w => !query || w.name.toLowerCase().includes(query))
  if (sortOrder.value === 'recent') return matches
  return [...matches].sort((a, b) => a.name.localeCompare(b.name, locale.value, { sensitivity: 'base' }))
})

const sortLabel = computed(() =>
  t(sortOrder.value === 'name' ? 'onboarding.open.sortName' : 'onboarding.open.recent')
)

function toggleSortOrder() {
  sortOrder.value = sortOrder.value === 'recent' ? 'name' : 'recent'
}

useWindowKeydown((event) => {
  if (event.defaultPrevented || !isModShortcut(event, 'F', useCommand.value)) return
  if (!filterInput.value) return
  event.preventDefault()
  filterInput.value.focus()
  filterInput.value.select()
})

async function browseFolder() {
  if (isOpeningWorkspace.value) return
  try {
    const selected = await systemCommands.pickWorkspaceDirectory()
    if (selected) {
      browsingFolder.value = true
      await workspaceStore.openWorkspace(selected)
      emit('done')
    }
  } catch (error) {
    if (isWorkspaceSchemaTooNewError(error)) {
      await alertDialog(t('workspace.errors.schemaTooNew'))
      return
    }
    // dev/web fallback
  } finally {
    browsingFolder.value = false
  }
}

async function importFromArchive() {
  if (importingArchive.value) return
  importingArchive.value = true
  try {
    const opened = await importAsNewWorkspace()
    if (opened) emit('done')
  } finally {
    importingArchive.value = false
  }
}

async function openWorkspace(id: string) {
  if (isOpeningWorkspace.value) return
  const ws = allWorkspaces.value.find(w => w.id === id)
  if (!ws) return
  openingWorkspaceId.value = id
  try {
    await workspaceStore.openWorkspace(ws.path)
    emit('done')
  } catch (error) {
    if (isWorkspaceSchemaTooNewError(error)) {
      await alertDialog(t('workspace.errors.schemaTooNew'))
      return
    }
    throw error
  } finally {
    openingWorkspaceId.value = null
  }
}

function workspaceKey(ws: RecentWorkspace): string {
  return `local:${ws.path}`
}

function deleteWorkspaceLabel(): string {
  return t('onboarding.open.removeRecent')
}

async function alertDialog(message: string): Promise<void> {
  const isTauriRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  if (!isTauriRuntime) {
    window.alert(message)
    return
  }

  try {
    const { message: showMessage } = await import('@tauri-apps/plugin-dialog')
    await showMessage(message)
  } catch {
    // The dialog plugin is unavailable; avoid calling Tauri's async window.alert shim.
  }
}

async function deleteWorkspace(ws: RecentWorkspace) {
  if (!await confirm({
    message: t('onboarding.open.removeRecentConfirm', { name: ws.name }),
    confirmLabel: deleteWorkspaceLabel(),
    variant: 'default',
  })) return

  deletingWorkspaceKey.value = workspaceKey(ws)
  try {
    await workspaceStore.removeRecentWorkspace(ws)
  } catch {
    await alertDialog(t('onboarding.open.deleteFailed'))
  } finally {
    deletingWorkspaceKey.value = null
  }
}

function onDragOver(e: DragEvent) {
  if (!allowWorkspaceDrop.value) return
  e.preventDefault()
  isDragOver.value = true
}
function onDragLeave() { isDragOver.value = false }
async function onDrop(e: DragEvent) {
  if (!allowWorkspaceDrop.value) return
  e.preventDefault()
  isDragOver.value = false
  const file = e.dataTransfer?.files[0]
  const path = file ? (file as File & { path?: string }).path ?? file.name : undefined
  if (path && !isOpeningWorkspace.value) {
    browsingFolder.value = true
    try {
      await workspaceStore.openWorkspace(path)
      emit('done')
    } catch (error) {
      if (isWorkspaceSchemaTooNewError(error)) {
        await alertDialog(t('workspace.errors.schemaTooNew'))
        return
      }
      // path is not a valid nevo workspace — ignore
    } finally {
      browsingFolder.value = false
    }
  }
}
</script>

<template>
  <div
    class="open-root tw:max-[719px]:overflow-x-hidden tw:max-[719px]:overflow-y-auto tw:max-[719px]:overscroll-contain tw:max-[719px]:pb-[calc(20px+max(var(--safe-area-bottom),0px))] tw:relative tw:flex tw:flex-1 tw:flex-col tw:overflow-hidden"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="open-nav tw:max-[959px]:pt-3.5 tw:max-[959px]:px-4 tw:max-[719px]:pt-3 tw:max-[719px]:pr-[calc(10px+max(var(--safe-area-right),0px))] tw:max-[719px]:pl-[calc(10px+max(var(--safe-area-left),0px))] tw:relative tw:z-1 tw:pt-[18px] tw:px-12 tw:pb-0">
      <button type="button" class="nv-btn nv-btn--ghost open-back-btn tw:max-[719px]:min-h-11 tw:h-[30px] tw:gap-1.5 tw:px-2.5 tw:text-[13px]" @click="emit('back')">
        <ArrowLeft :size="12" /> {{ t('common.back') }}
      </button>
    </div>

    <!-- Header -->
    <div class="open-header tw:max-[959px]:flex-wrap tw:max-[959px]:items-start tw:max-[959px]:px-6 tw:max-[959px]:pt-3 tw:max-[959px]:pb-4 tw:max-[719px]:grid tw:max-[719px]:grid-cols-1 tw:max-[719px]:gap-3.5 tw:max-[719px]:pt-2 tw:max-[719px]:pr-[calc(18px+max(var(--safe-area-right),0px))] tw:max-[719px]:pl-[calc(18px+max(var(--safe-area-left),0px))] tw:max-[719px]:[&>.nevo-mark]:hidden tw:relative tw:z-1 tw:flex tw:items-end tw:gap-[18px] tw:py-[18px] tw:px-14">
      <NevoMark :size="42" />
      <div class="header-text tw:flex-1">
        <h1 class="header-title tw:max-[719px]:text-[clamp(29px,9vw,34px)] tw:m-0 tw:mb-1 tw:[font-family:var(--font-serif)] tw:text-[32px] tw:leading-[1.1] tw:font-normal tw:tracking-[-0.018em] tw:text-content-primary">{{ t('onboarding.open.title') }}</h1>
        <div class="header-sub tw:text-[13px] tw:leading-normal tw:text-content-muted">{{ t(isPhone ? 'onboarding.open.mobileSubtitle' : 'onboarding.open.subtitle') }}</div>
      </div>
      <div class="open-header__actions tw:max-[719px]:block tw:max-[719px]:w-full tw:flex tw:items-center tw:gap-2">
        <button
          v-if="!runtime.isMobileRuntime"
          type="button"
          class="nv-btn nv-btn--primary open-header-btn tw:max-[719px]:border-transparent tw:max-[719px]:bg-accent tw:max-[719px]:text-content-on-accent tw:max-[719px]:min-h-12 tw:max-[719px]:w-full tw:max-[719px]:min-w-full tw:max-[719px]:justify-center tw:max-[719px]:[&:not(:first-child)]:mt-2 tw:h-[30px] tw:gap-1.5 tw:px-3 tw:text-[13px]"
          :class="{ 'nv-btn--loading': browsingFolder }"
          :disabled="isOpeningWorkspace || importingArchive"
          @click="browseFolder"
        >
          <span v-if="browsingFolder" class="nv-btn__spinner" aria-hidden="true" />
          <Folder v-else :size="12" /> {{ t('onboarding.open.browse') }}
        </button>
        <button
          v-if="!runtime.isMobileRuntime"
          type="button"
          class="nv-btn nv-btn--ghost open-header-btn open-header-btn--import tw:max-[719px]:hidden tw:max-[719px]:min-h-12 tw:max-[719px]:w-full tw:max-[719px]:min-w-full tw:max-[719px]:justify-center tw:max-[719px]:[&:not(:first-child)]:mt-2 tw:h-[30px] tw:gap-1.5 tw:px-3 tw:text-[13px]"
          :disabled="importingArchive || isOpeningWorkspace"
          @click="importFromArchive"
        >
          <Archive :size="12" /> {{ t('onboarding.open.importArchive') }}
        </button>
        <button
          type="button"
          class="nv-btn open-header-btn open-header-btn--create tw:max-[719px]:first:border-transparent tw:max-[719px]:first:bg-accent tw:max-[719px]:first:text-content-on-accent tw:max-[719px]:min-h-12 tw:max-[719px]:w-full tw:max-[719px]:min-w-full tw:max-[719px]:justify-center tw:max-[719px]:[&:not(:first-child)]:mt-2 tw:h-[30px] tw:gap-1.5 tw:px-3 tw:text-[13px]"
          :class="runtime.isMobileRuntime ? 'nv-btn--primary' : 'nv-btn--ghost'"
          :disabled="isOpeningWorkspace"
          @click="emit('create')"
        >
          <Plus :size="12" /> {{ t('onboarding.open.new') }}
        </button>
      </div>
    </div>

    <!-- Search -->
    <div class="search-row tw:max-[959px]:flex-wrap tw:max-[959px]:px-6 tw:max-[959px]:pb-3.5 tw:max-[719px]:hidden tw:relative tw:z-1 tw:flex tw:items-center tw:gap-2.5 tw:pt-0 tw:px-14 tw:pb-4">
      <div class="search-field tw:flex tw:h-8 tw:flex-1 tw:items-center tw:gap-2.5 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--input-bg)] tw:px-3">
        <Search :size="13" class="search-icon tw:shrink-0 tw:text-content-muted" />
        <input
          ref="filterInput"
          v-model="filterQuery"
          class="search-input tw:flex-1 tw:border-0 tw:bg-transparent tw:font-nv-ui tw:text-[13px] tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted"
          :placeholder="t('onboarding.open.filter')"
          :aria-label="t('onboarding.open.filter')"
          :aria-keyshortcuts="useCommand ? 'Meta+F' : 'Control+F'"
        />
        <span v-if="!isTouch" class="nv-kbd" aria-hidden="true">{{ filterShortcut }}</span>
      </div>
      <button
        type="button"
        class="nv-btn sort-btn tw:h-8 tw:px-2.5 tw:text-[12.5px]"
        :aria-label="t('onboarding.open.sortBy', { order: sortLabel })"
        @click="toggleSortOrder"
      >
        ↕ {{ sortLabel }}
      </button>
    </div>

    <!-- List -->
    <div class="list-area tw:max-[959px]:px-[18px] tw:max-[959px]:pb-6 tw:max-[719px]:overflow-visible tw:max-[719px]:pt-[26px] tw:max-[719px]:pr-[calc(18px+max(var(--safe-area-right),0px))] tw:max-[719px]:pb-[calc(24px+max(var(--safe-area-bottom),0px))] tw:max-[719px]:pl-[calc(18px+max(var(--safe-area-left),0px))] tw:relative tw:z-1 tw:flex-1 tw:overflow-hidden tw:pt-0 tw:px-10 tw:pb-10">
      <div class="workspaces-list tw:max-[719px]:overflow-visible tw:max-[719px]:rounded-none tw:max-[719px]:border-0 tw:overflow-hidden tw:rounded-[calc(14px*var(--radius-scale,1))] tw:bg-transparent" role="listbox" :aria-label="t('onboarding.open.title')">
        <div
          v-for="(ws, i) in filteredRecents"
          :key="ws.id"
          role="option"
          :aria-selected="i === 0"
          :aria-disabled="isOpeningWorkspace"
          tabindex="0"
          class="ws-row tw:max-[959px]:grid tw:max-[959px]:grid-cols-[36px_minmax(0,1fr)] tw:max-[959px]:items-start tw:max-[719px]:min-h-[68px] tw:max-[719px]:grid-cols-[44px_minmax(0,1fr)] tw:max-[719px]:gap-x-3 tw:max-[719px]:gap-y-2.5 tw:max-[719px]:rounded-[calc(8px*var(--radius-scale,1))] tw:max-[719px]:bg-transparent tw:max-[719px]:px-0.5 tw:max-[719px]:py-2.5 tw:max-[719px]:border-b-0! tw:relative tw:flex tw:cursor-default tw:items-center tw:gap-3.5 tw:rounded-nv-md tw:px-4 tw:py-3 tw:transition-colors tw:duration-[120ms]"
          :class="i === 0 ? 'ws-row--first tw:bg-(--surface-selected) tw:hover:bg-[color-mix(in_oklab,var(--surface-selected)_82%,var(--text-primary))]' : 'tw:bg-transparent tw:hover:bg-(--hover)'"
          :style="{ borderBottom: i === filteredRecents.length - 1 ? 'none' : '1px solid var(--border-subtle)' }"
          @click="openWorkspace(ws.id)"
          @keydown.enter="openWorkspace(ws.id)"
          @keydown.space.prevent="openWorkspace(ws.id)"
        >
          <div class="ws-icon tw:max-[719px]:size-11 tw:grid tw:h-9 tw:w-9 tw:shrink-0 tw:place-items-center tw:rounded-[calc(9px*var(--radius-scale,1))] tw:[font-family:var(--font-serif)] tw:text-[17px] tw:font-semibold tw:italic tw:text-white" :style="{ background: ws.gradient }">
            <NvNoteIcon :value="ws.glyph" :size="17" />
          </div>
          <div class="ws-info tw:min-w-0 tw:flex-1">
            <div class="ws-name-row tw:flex tw:items-center tw:gap-1.5">
              <span class="ws-name tw:text-sm tw:font-[550] tw:text-content-primary">{{ ws.name }}</span>
              <Pin v-if="ws.pinned" :size="10" class="ws-pin tw:shrink-0 tw:text-accent" />
              <span v-if="ws.unreadCount" class="nv-chip ws-unread tw:h-[17px] tw:text-[10px] tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]">
                {{ ws.unreadCount }} {{ t('onboarding.open.unread') }}
              </span>
            </div>
            <div class="ws-path tw:mt-0.5 tw:truncate tw:font-nv-mono tw:text-xs tw:text-content-muted">
              {{ isPhone ? t('workspace.mobile.more.onDevice') : ws.path }}
            </div>
          </div>
          <div class="ws-meta tw:max-[959px]:col-start-2 tw:max-[959px]:text-left tw:text-right">
            <div class="ws-date tw:text-xs tw:text-content-secondary">{{ workspaceStore.getRelativeTime(ws.lastOpened) }}</div>
            <div v-if="noteCountLabel(ws.path) !== null" class="ws-pages tw:mt-0.5 tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">{{ noteCountLabel(ws.path) }}</div>
          </div>
          <div class="ws-actions tw:max-[959px]:col-start-2 tw:max-[959px]:text-left tw:max-[719px]:hidden tw:flex tw:items-center tw:gap-2">
            <button
              class="nv-btn ws-open-btn tw:h-[26px] tw:px-2.5 tw:text-xs"
              :class="[i === 0 ? 'nv-btn--primary' : '', { 'nv-btn--loading': openingWorkspaceId === ws.id }]"
              :disabled="isOpeningWorkspace"
              @keydown.enter.stop
              @keydown.space.stop
              @click.stop="openWorkspace(ws.id)"
            >
              <span v-if="openingWorkspaceId === ws.id" class="nv-btn__spinner" aria-hidden="true" />
              {{ t('onboarding.open.open') }}
              <ArrowRight v-if="i === 0 && openingWorkspaceId !== ws.id" :size="11" />
            </button>
            <button
              class="nv-btn nv-btn--ghost ws-delete-btn tw:h-[26px] tw:w-[26px] tw:justify-center tw:p-0 tw:text-content-muted tw:enabled:hover:border-transparent tw:enabled:hover:bg-[var(--surface-danger)] tw:enabled:hover:text-danger tw:focus-visible:border-transparent tw:focus-visible:bg-[var(--surface-danger)] tw:focus-visible:text-danger"
              :aria-label="deleteWorkspaceLabel()"
              :title="deleteWorkspaceLabel()"
              :disabled="deletingWorkspaceKey === workspaceKey(ws) || isOpeningWorkspace"
              @keydown.enter.stop
              @keydown.space.stop
              @click.stop="deleteWorkspace(ws)"
            >
              <Trash2 :size="13" />
            </button>
          </div>
        </div>
        <div v-if="filteredRecents.length === 0" class="open-empty-state tw:max-[719px]:min-h-[190px] tw:max-[719px]:rounded-[calc(18px*var(--radius-scale,1))] tw:max-[719px]:border-transparent tw:max-[719px]:bg-surface-subtle tw:max-[719px]:p-6 tw:flex tw:min-h-[220px] tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:px-6 tw:py-8 tw:text-center tw:text-content-muted">
          <Folder :size="22" aria-hidden="true" />
          <strong class="tw:max-[719px]:text-sm tw:text-[15px] tw:font-semibold tw:text-content-secondary">{{ t('onboarding.open.emptyTitle') }}</strong>
          <p class="tw:max-[719px]:max-w-[250px] tw:max-[719px]:text-xs tw:m-0 tw:max-w-[340px] tw:text-[13px] tw:leading-normal tw:text-content-muted">{{ t('onboarding.open.emptySubtitle') }}</p>
          <button
            v-if="!runtime.isMobileRuntime"
            type="button"
            class="nv-btn open-empty-state__action tw:max-[719px]:min-h-11 tw:mt-2 tw:h-8 tw:gap-1.5 tw:px-3.5 tw:text-[13px]"
            @click="browseFolder"
          >
            <Folder :size="12" /> {{ t('onboarding.open.browse') }}
          </button>
        </div>
      </div>

      <div v-if="allowWorkspaceDrop" class="drop-hint tw:mt-3.5 tw:text-center tw:text-[11.5px] tw:text-content-muted">{{ t('onboarding.open.dropHint') }}</div>
    </div>

    <!-- Drag overlay -->
    <Transition name="drop">
      <div v-if="allowWorkspaceDrop && isDragOver" class="drop-overlay tw:absolute tw:inset-0 tw:z-10 tw:grid tw:place-items-center">
        <div class="drop-target tw:absolute tw:inset-5 tw:rounded-[calc(18px*var(--radius-scale,1))] tw:border-2 tw:border-dashed tw:border-accent tw:bg-[color-mix(in_oklab,var(--accent)_7%,transparent)] tw:pointer-events-none" />
        <div class="drop-card tw:relative tw:z-1 tw:flex tw:flex-col tw:items-center tw:gap-[14px] tw:py-[22px] tw:px-7 tw:bg-surface-overlay tw:border-transparent tw:rounded-[calc(14px*var(--radius-scale,1))] tw:shadow-[var(--shadow-overlay)]">
          <div class="drop-icon tw:w-14 tw:h-14 tw:rounded-[calc(14px*var(--radius-scale,1))] tw:bg-[var(--accent-soft)] tw:text-accent tw:grid tw:place-items-center">
            <Folder :size="26" />
          </div>
          <div class="drop-text">
            <div class="drop-title tw:text-[17px] tw:font-semibold tw:text-content-primary">{{ t('onboarding.open.dropTitle') }}</div>
          </div>
        </div>
      </div>
    </Transition>

    <PrivacyBadge />
    <div class="version-badge tw:absolute tw:right-[18px] tw:bottom-[14px] tw:z-2 tw:text-[11px] tw:text-content-muted tw:font-nv-mono">{{ t('version', { version: workspaceStore.appMetadata?.version ?? '0.1.9' }) }}</div>
  </div>
</template>
