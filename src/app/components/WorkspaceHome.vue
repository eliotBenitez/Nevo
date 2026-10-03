<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { FilePlus2 } from 'lucide-vue-next'
import HomeHero from './home/HomeHero.vue'
import HomeQuickActions from './home/HomeQuickActions.vue'
import HomeFavorites from './home/HomeFavorites.vue'
import HomeRecent from './home/HomeRecent.vue'
import FirstStepsChecklist from './home/FirstStepsChecklist.vue'
import type { WorkspaceHomeItem } from '../composables/useWorkspaceHome'
import type { FirstStepId } from '../../types/workspace'

withDefaults(defineProps<{
  workspaceName: string
  searchShortcut: string
  favoriteItems: WorkspaceHomeItem[]
  recentItems: WorkspaceHomeItem[]
  kanbanEnabled: boolean
  isWorkspaceEmpty: boolean
  backendKind?: 'local' | null
  noteCount?: number
  workspaceBytes?: number
  starterNoteId?: string | null
  firstStepsVisible?: boolean
  firstStepsCompleted?: FirstStepId[]
}>(), {
  firstStepsVisible: false,
  firstStepsCompleted: () => [],
})

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
  'hide-first-steps': []
  'take-tour': []
}>()

const { t } = useI18n()
</script>

<template>
  <main class="workspace-home tw:relative tw:flex-1 tw:min-w-0 tw:min-h-0 tw:overflow-auto tw:pt-10 tw:pb-16 tw:[padding-inline:clamp(20px,4vw,48px)] tw:text-content-primary tw:bg-(--island-bg) tw:rounded-(--island-radius)">
    <HomeHero
      :workspace-name="workspaceName"
      :search-shortcut="searchShortcut"
      :note-count="noteCount"
      :workspace-bytes="workspaceBytes"
      @search="emit('search')"
    />

    <HomeQuickActions
      :kanban-enabled="kanbanEnabled"
      :backend-kind="backendKind"
      @create-note="emit('create-note')"
      @create-folder="emit('create-folder')"
      @import-md="emit('import-md')"
      @import-obsidian="emit('import-obsidian')"
      @import-notion="emit('import-notion')"
      @create-board="emit('create-board')"
    />

    <section
      v-if="isWorkspaceEmpty"
      class="workspace-home__empty tw:flex tw:w-[min(var(--home-width,1040px),100%)] tw:min-h-[112px] tw:items-center tw:gap-4 tw:mx-auto tw:mt-[42px] tw:p-5 tw:border tw:border-solid tw:border-transparent tw:rounded-[17px] tw:bg-surface-subtle tw:max-[719px]:items-start tw:max-[719px]:flex-wrap tw:max-[719px]:mt-[30px] tw:max-[719px]:p-4"
    >
      <div class="workspace-home__empty-mark tw:grid tw:w-12 tw:h-12 tw:flex-none tw:place-items-center tw:rounded-[14px] tw:text-accent tw:bg-(--surface-raised)" aria-hidden="true">
        <FilePlus2 :size="22" />
      </div>
      <div class="tw:min-w-0 tw:flex-1">
        <h2 class="tw:mt-[3px] tw:mb-0 tw:text-xl tw:font-[620] tw:tracking-[-0.02em] tw:text-balance tw:max-[719px]:text-[17px]">{{ t('workspace.home.empty.title') }}</h2>
        <p class="tw:mt-1.5 tw:mb-0 tw:text-content-muted tw:text-[13px]">{{ t('workspace.home.empty.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="nv-btn nv-btn--primary tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2 tw:max-[719px]:w-full tw:max-[719px]:min-h-11"
        @click="emit('create-note')"
      >
        {{ t('workspace.home.empty.action') }}
      </button>
    </section>

    <div class="workspace-home__grid tw:grid tw:w-[min(var(--home-width,1040px),100%)] tw:mx-auto tw:mt-9 tw:items-start tw:gap-10 tw:[grid-template-columns:minmax(0,1.6fr)_minmax(0,1fr)] tw:max-[767px]:gap-0 tw:max-[767px]:[grid-template-columns:minmax(0,1fr)]">
      <HomeRecent :recent-items="recentItems" :starter-note-id="starterNoteId" @open-item="item => emit('open-item', item)" />
      <div class="tw:flex tw:min-w-0 tw:flex-col tw:gap-6">
        <FirstStepsChecklist
          :visible="firstStepsVisible"
          :completed-steps="firstStepsCompleted"
          @hide="emit('hide-first-steps')"
          @take-tour="emit('take-tour')"
        />
        <HomeFavorites
          :favorite-items="favoriteItems"
          :is-workspace-empty="isWorkspaceEmpty"
          @open-item="item => emit('open-item', item)"
          @manage-favorites="emit('manage-favorites')"
        />
      </div>
    </div>
  </main>
</template>

<style scoped src="../../styles/app/workspace-home.css"></style>
