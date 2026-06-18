<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Folder, Plus, Search, Pin, Trash2, ArrowRight, Cloud } from 'lucide-vue-next'
import AmbientBackdrop from '../../../ui/glass/AmbientBackdrop.vue'
import NevoMark from './NevoMark.vue'
import PrivacyBadge from './PrivacyBadge.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useSharedStorageStore } from '../../../stores/sharedStorage'
import { useAuthStore } from '../../../stores/auth'
import { useDeviceLayout } from '../../../composables/useDeviceLayout'
import type { RecentWorkspace } from '../../../types/workspace'

const emit = defineEmits<{
  back: []
  create: []
  done: []
}>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const shared = useSharedStorageStore()
const auth = useAuthStore()
const { isTouch, runtime } = useDeviceLayout()

const filterQuery = ref('')
const isDragOver = ref(false)
const deletingWorkspaceKey = ref<string | null>(null)
const allowWorkspaceDrop = computed(() => runtime.value.isDesktopRuntime && !isTouch.value)

// Pull the user's cloud storages so they show alongside local workspaces.
onMounted(async () => {
  if (auth.isAuthenticated) {
    try { await shared.loadStorages() } catch { /* offline */ }
  }
})

const signingIn = ref(false)
async function signIn() {
  signingIn.value = true
  try {
    await auth.login('github')
    await shared.loadStorages()
  } catch { /* cancelled or failed */ } finally {
    signingIn.value = false
  }
}

// Local recents + any cloud storages the user belongs to (deduped by storageId).
const allWorkspaces = computed<RecentWorkspace[]>(() => {
  const recents = workspaceStore.recents
  const seenStorages = new Set(
    recents.map(r => r.storageId).filter(Boolean) as string[]
  )
  const seenCloudPaths = new Set(
    recents
      .filter(r => !r.storageId && r.path?.startsWith('cloud:'))
      .map(r => r.path.replace('cloud:', ''))
  )
  const cloudOnly: RecentWorkspace[] = shared.storages
    .filter(s => !seenStorages.has(s.id) && !seenCloudPaths.has(s.id))
    .map(s => ({
      id: s.id, name: s.name, glyph: s.glyph || '🗂️', gradient: s.gradient || '',
      path: `cloud:${s.id}`, lastOpened: s.createdAt, pageCount: 0,
      kind: 'cloud', storageId: s.id,
    }))
  return [...recents, ...cloudOnly]
})

const filteredRecents = computed(() =>
  allWorkspaces.value.filter(w =>
    !filterQuery.value || w.name.toLowerCase().includes(filterQuery.value.toLowerCase())
  )
)

async function browseFolder() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({ directory: true })
    if (typeof selected === 'string') {
      await workspaceStore.openWorkspace(selected)
      emit('done')
    }
  } catch {
    // dev/web fallback
  }
}

async function openWorkspace(id: string) {
  const ws = allWorkspaces.value.find(w => w.id === id)
  if (!ws) return
  if (ws.kind === 'cloud' && ws.storageId) {
    await workspaceStore.openCloudWorkspace(ws.storageId, ws.serverUrl)
  } else {
    await workspaceStore.openWorkspace(ws.path)
  }
  emit('done')
}

function workspaceKey(ws: RecentWorkspace): string {
  return ws.storageId ? `cloud:${ws.storageId}` : `local:${ws.path}`
}

function sharedStorageExists(ws: RecentWorkspace): boolean {
  return !!ws.storageId && shared.storages.some(storage => storage.id === ws.storageId)
}

function deleteWorkspaceLabel(ws: RecentWorkspace): string {
  return ws.kind === 'cloud' && sharedStorageExists(ws)
    ? t('onboarding.open.deleteStorage')
    : t('onboarding.open.removeRecent')
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function confirmDialog(message: string): Promise<boolean> {
  if (!isTauriRuntime()) return window.confirm(message)

  try {
    const { confirm } = await import('@tauri-apps/plugin-dialog')
    return await confirm(message)
  } catch {
    return false
  }
}

async function alertDialog(message: string): Promise<void> {
  if (!isTauriRuntime()) {
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
  const storageId = ws.kind === 'cloud' ? ws.storageId : undefined
  const deletesCloudStorage = !!storageId && sharedStorageExists(ws)
  const confirmKey = deletesCloudStorage
    ? 'onboarding.open.deleteStorageConfirm'
    : 'onboarding.open.removeRecentConfirm'

  if (!await confirmDialog(t(confirmKey, { name: ws.name }))) return

  deletingWorkspaceKey.value = workspaceKey(ws)
  try {
    if (deletesCloudStorage && storageId) {
      await shared.deleteStorage(storageId)
    }
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
  if (path) {
    try {
      await workspaceStore.openWorkspace(path)
      emit('done')
    } catch {
      // path is not a valid nevo workspace — ignore
    }
  }
}
</script>

<template>
  <div
    class="open-root"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <AmbientBackdrop />

    <!-- Header -->
    <div class="open-header">
      <NevoMark :size="42" />
      <div class="header-text">
        <h1 class="header-title">{{ t('onboarding.open.title') }}</h1>
        <div class="header-sub">{{ t('onboarding.open.subtitle') }}</div>
      </div>
      <button v-if="!auth.isAuthenticated" class="nv-btn nv-btn--ghost open-header-btn" :disabled="signingIn" @click="signIn">
        <Cloud :size="12" /> {{ t('cloud.account.signIn') }}
      </button>
      <button class="nv-btn nv-btn--ghost open-header-btn" @click="browseFolder">
        <Folder :size="12" /> {{ t('onboarding.open.browse') }}
      </button>
      <button class="nv-btn nv-btn--primary open-header-btn" @click="emit('create')">
        <Plus :size="12" /> {{ t('onboarding.open.new') }}
      </button>
    </div>

    <!-- Search -->
    <div class="search-row">
      <div class="search-field">
        <Search :size="13" class="search-icon" />
        <input
          v-model="filterQuery"
          class="search-input"
          :placeholder="t('onboarding.open.filter')"
        />
        <span class="nv-kbd">⌘F</span>
      </div>
      <button class="nv-btn sort-btn">
        ↕ {{ t('onboarding.open.recent') }}
      </button>
    </div>

    <!-- List -->
    <div class="list-area">
      <div class="workspaces-list" role="listbox" :aria-label="t('onboarding.open.title')">
        <div
          v-for="(ws, i) in filteredRecents"
          :key="ws.id"
          role="option"
          :aria-selected="i === 0"
          tabindex="0"
          class="ws-row"
          :class="{ 'ws-row--first': i === 0 }"
          :style="{ borderBottom: i === filteredRecents.length - 1 ? 'none' : '1px solid var(--line-1)' }"
          @keydown.enter="openWorkspace(ws.id)"
          @keydown.space.prevent="openWorkspace(ws.id)"
        >
          <div class="ws-icon" :style="{ background: ws.gradient }">{{ ws.glyph }}</div>
          <div class="ws-info">
            <div class="ws-name-row">
              <span class="ws-name">{{ ws.name }}</span>
              <Cloud v-if="ws.kind === 'cloud'" :size="11" class="ws-pin" />
              <Pin v-if="ws.pinned" :size="10" class="ws-pin" />
              <span v-if="ws.unreadCount" class="nv-chip ws-unread">
                {{ ws.unreadCount }} {{ t('onboarding.open.unread') }}
              </span>
            </div>
            <div class="ws-path">{{ ws.kind === 'cloud' ? t('workspace.cloudWorkspace') : ws.path }}</div>
          </div>
          <div class="ws-meta">
            <div class="ws-date">{{ workspaceStore.getRelativeTime(ws.lastOpened) }}</div>
            <div class="ws-pages">{{ ws.pageCount.toLocaleString() }} {{ t('onboarding.open.pages') }}</div>
          </div>
          <button
            class="nv-btn ws-open-btn"
            :class="i === 0 ? 'nv-btn--primary' : ''"
            @keydown.enter.stop
            @keydown.space.stop
            @click="openWorkspace(ws.id)"
          >
            {{ t('onboarding.open.open') }} <ArrowRight v-if="i === 0" :size="11" />
          </button>
          <button
            class="nv-btn nv-btn--ghost ws-delete-btn"
            :aria-label="deleteWorkspaceLabel(ws)"
            :title="deleteWorkspaceLabel(ws)"
            :disabled="deletingWorkspaceKey === workspaceKey(ws)"
            @keydown.enter.stop
            @keydown.space.stop
            @click.stop="deleteWorkspace(ws)"
          >
            <Trash2 :size="13" />
          </button>
        </div>
      </div>

      <div v-if="allowWorkspaceDrop" class="drop-hint">{{ t('onboarding.open.dropHint') }}</div>
    </div>

    <!-- Drag overlay -->
    <Transition name="drop">
      <div v-if="allowWorkspaceDrop && isDragOver" class="drop-overlay">
        <div class="drop-target" />
        <div class="drop-card">
          <div class="drop-icon">
            <Folder :size="26" />
          </div>
          <div class="drop-text">
            <div class="drop-title">{{ t('onboarding.open.dropTitle') }}</div>
          </div>
        </div>
      </div>
    </Transition>

    <PrivacyBadge />
    <div class="version-badge">{{ t('version') }}</div>
  </div>
</template>
