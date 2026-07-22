<script setup lang="ts">
import { computed, markRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ArrowUpRight,
  FilePlus2,
  FileUp,
  FolderInput,
  ArchiveRestore,
  FolderPlus,
  Import,
  Kanban,
  Search,
  Settings2,
  Sparkles,
} from 'lucide-vue-next'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
import NvPopupMenu from '../../ui/primitives/NvPopupMenu.vue'
import type { NvMenuItemDef } from '../../ui/primitives/menu-types'
import type { WorkspaceHomeItem } from '../composables/useWorkspaceHome'

interface Props {
  workspaceName: string
  searchShortcut: string
  favoriteItems: WorkspaceHomeItem[]
  recentItems: WorkspaceHomeItem[]
  kanbanEnabled: boolean
  isWorkspaceEmpty: boolean
  backendKind?: 'local' | 'cloud' | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  search: []
  'create-note': []
  'create-folder': []
  'import-md': []
  'import-obsidian': []
  'import-notion': []
  'create-board': []
  'open-item': [item: WorkspaceHomeItem]
  'manage-favorites': []
}>()

const { t, locale } = useI18n()
const hasFavorites = computed(() => props.favoriteItems.length > 0)
const hasRecent = computed(() => props.recentItems.length > 0)
const importItems = computed<NvMenuItemDef[]>(() => [
  {
    label: t('workspace.importMd'),
    icon: markRaw(FileUp),
    action: () => emit('import-md'),
  },
  {
    label: t('workspace.importObsidian'),
    icon: markRaw(FolderInput),
    action: () => emit('import-obsidian'),
  },
  {
    label: props.backendKind === 'cloud' ? t('workspace.notionImport.localOnlyShort') : t('workspace.importNotion'),
    icon: markRaw(ArchiveRestore),
    disabled: props.backendKind !== 'local',
    action: () => emit('import-notion'),
  },
])

function itemType(item: WorkspaceHomeItem) {
  return t(`workspace.home.types.${item.kind}`)
}

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(String(locale.value), {
    day: 'numeric',
    month: 'short',
  }).format(date)
}
</script>

<template>
  <main class="workspace-home">
    <div class="workspace-home__glow" aria-hidden="true" />

    <header class="workspace-home__hero">
      <div class="workspace-home__eyebrow">
        <Sparkles :size="14" aria-hidden="true" />
        <span>{{ t('workspace.home.eyebrow') }}</span>
      </div>
      <h1>{{ workspaceName }}</h1>
      <p>{{ t('workspace.home.subtitle') }}</p>
      <button type="button" class="workspace-home__search" @click="emit('search')">
        <Search :size="19" aria-hidden="true" />
        <span>{{ t('workspace.home.search') }}</span>
        <kbd>{{ searchShortcut }}</kbd>
      </button>
    </header>

    <section class="workspace-home__actions" :aria-label="t('workspace.home.quickActions')">
      <button type="button" class="workspace-home__action" @click="emit('create-note')">
        <span class="workspace-home__action-icon"><FilePlus2 :size="18" /></span>
        <span>{{ t('workspace.actions.newNote') }}</span>
      </button>
      <button type="button" class="workspace-home__action" @click="emit('create-folder')">
        <span class="workspace-home__action-icon"><FolderPlus :size="18" /></span>
        <span>{{ t('workspace.actions.newFolder') }}</span>
      </button>
      <NvPopupMenu
        class="workspace-home__import"
        :items="importItems"
        placement="bottom-start"
        width="224px"
      >
        <template #trigger>
          <button type="button" class="workspace-home__action" :aria-label="t('workspace.importMenu')">
            <span class="workspace-home__action-icon"><Import :size="18" /></span>
            <span>{{ t('workspace.importMenu') }}</span>
          </button>
        </template>
      </NvPopupMenu>
      <button
        v-if="kanbanEnabled"
        type="button"
        class="workspace-home__action"
        @click="emit('create-board')"
      >
        <span class="workspace-home__action-icon"><Kanban :size="18" /></span>
        <span>{{ t('workspace.actions.newBoard') }}</span>
      </button>
    </section>

    <section v-if="isWorkspaceEmpty" class="workspace-home__empty">
      <div class="workspace-home__empty-mark" aria-hidden="true">
        <FilePlus2 :size="22" />
      </div>
      <div>
        <h2>{{ t('workspace.home.empty.title') }}</h2>
        <p>{{ t('workspace.home.empty.subtitle') }}</p>
      </div>
      <button type="button" class="nv-btn nv-btn--primary" @click="emit('create-note')">
        {{ t('workspace.home.empty.action') }}
      </button>
    </section>

    <section v-if="hasFavorites" class="workspace-home__section">
      <div class="workspace-home__section-head">
        <div>
          <span class="workspace-home__section-kicker">{{ t('workspace.home.favorites.kicker') }}</span>
          <h2>{{ t('workspace.home.favorites.title') }}</h2>
        </div>
        <button type="button" class="nv-btn workspace-home__manage" @click="emit('manage-favorites')">
          <Settings2 :size="14" />
          <span>{{ t('workspace.home.favorites.manage') }}</span>
        </button>
      </div>

      <div class="workspace-home__favorite-grid">
        <template v-for="item in favoriteItems" :key="item.key">
          <div
            v-if="item.loading"
            class="workspace-home__favorite workspace-home__favorite--loading"
            role="status"
            :aria-label="item.title"
          >
            <span class="workspace-home__skeleton workspace-home__skeleton--icon" />
            <span class="workspace-home__skeleton workspace-home__skeleton--text" />
          </div>
          <button
            v-else
            type="button"
            class="workspace-home__favorite"
            @click="emit('open-item', item)"
          >
            <span class="workspace-home__favorite-icon">
              <NvNoteIcon :value="item.icon" :size="20" />
            </span>
            <span class="workspace-home__favorite-copy">
              <strong>{{ item.title }}</strong>
              <span>{{ itemType(item) }}</span>
            </span>
            <ArrowUpRight :size="15" class="workspace-home__favorite-arrow" aria-hidden="true" />
          </button>
        </template>
      </div>
    </section>

    <section v-else-if="!isWorkspaceEmpty" class="workspace-home__favorite-prompt">
      <div>
        <span class="workspace-home__section-kicker">{{ t('workspace.home.favorites.kicker') }}</span>
        <h2>{{ t('workspace.home.favorites.emptyTitle') }}</h2>
        <p>{{ t('workspace.home.favorites.emptySubtitle') }}</p>
      </div>
      <button type="button" class="nv-btn" @click="emit('manage-favorites')">
        {{ t('workspace.home.favorites.choose') }}
      </button>
    </section>

    <section v-if="hasRecent" class="workspace-home__section workspace-home__section--recent">
      <div class="workspace-home__section-head">
        <div>
          <span class="workspace-home__section-kicker">{{ t('workspace.home.recent.kicker') }}</span>
          <h2>{{ t('workspace.home.recent.title') }}</h2>
        </div>
      </div>
      <div class="workspace-home__recent-list">
        <button
          v-for="item in recentItems"
          :key="item.key"
          type="button"
          class="workspace-home__recent"
          @click="emit('open-item', item)"
        >
          <span class="workspace-home__recent-icon">
            <NvNoteIcon :value="item.icon" :size="17" />
          </span>
          <span class="workspace-home__recent-title">{{ item.title }}</span>
          <span class="workspace-home__recent-kind">{{ itemType(item) }}</span>
          <time v-if="item.updatedAt" :datetime="item.updatedAt">{{ formatDate(item.updatedAt) }}</time>
          <ArrowUpRight :size="14" aria-hidden="true" />
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped src="../../styles/app/workspace-home.css"></style>
