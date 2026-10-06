<script setup lang="ts">
import { computed, markRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArchiveRestore, FilePlus2, FileUp, FolderInput, FolderPlus, Import, Kanban } from '@lucide/vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import type { NvMenuItemDef } from '../../../ui/primitives/menu-types'

const props = defineProps<{
  kanbanEnabled: boolean
  backendKind?: 'local' | null
}>()
const emit = defineEmits<{
  'create-note': []
  'create-folder': []
  'import-md': []
  'import-obsidian': []
  'import-notion': []
  'create-board': []
}>()

const { t } = useI18n()
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
    label: t('workspace.importNotion'),
    icon: markRaw(ArchiveRestore),
    disabled: props.backendKind !== 'local',
    action: () => emit('import-notion'),
  },
])
</script>

<template>
  <section class="workspace-home__actions tw:flex tw:w-[min(var(--home-width,1040px),100%)] tw:mx-auto tw:mt-6 tw:gap-2 tw:overflow-x-auto tw:overflow-y-hidden tw:[scrollbar-width:none] tw:[&::-webkit-scrollbar]:hidden tw:max-[719px]:mt-3.5 tw:max-[719px]:pb-0.5" :aria-label="t('workspace.home.quickActions')">
    <button
      type="button"
      class="workspace-home__action tw:group tw:flex tw:h-8 tw:flex-none tw:items-center tw:gap-[7px] tw:px-3 tw:border-0 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:text-[12.5px] tw:font-medium tw:whitespace-nowrap tw:text-left tw:transition-colors tw:duration-[var(--dur-base)] tw:bg-accent tw:text-content-on-accent tw:hover:bg-accent-hover tw:active:translate-y-px tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2 tw:max-[719px]:h-11 tw:max-[719px]:px-4"
      @click="emit('create-note')"
    >
      <span class="workspace-home__action-icon tw:grid tw:flex-none tw:place-items-center tw:text-inherit"><FilePlus2 :size="15" aria-hidden="true" /></span>
      <span>{{ t('workspace.actions.newNote') }}</span>
    </button>
    <button
      type="button"
      class="workspace-home__action tw:group tw:flex tw:h-8 tw:flex-none tw:items-center tw:gap-[7px] tw:px-3 tw:border-0 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:text-[12.5px] tw:font-medium tw:whitespace-nowrap tw:text-left tw:transition-colors tw:duration-[var(--dur-base)] tw:text-content-secondary tw:bg-[color-mix(in_oklab,var(--island-bg)_91%,var(--text-primary))] tw:hover:bg-[color-mix(in_oklab,var(--island-bg)_84%,var(--text-primary))] tw:hover:text-content-primary tw:active:translate-y-px tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2 tw:max-[719px]:h-11 tw:max-[719px]:px-4"
      @click="emit('create-folder')"
    >
      <span class="workspace-home__action-icon tw:grid tw:flex-none tw:place-items-center tw:text-content-muted tw:group-hover:text-accent"><FolderPlus :size="15" aria-hidden="true" /></span>
      <span>{{ t('workspace.actions.newFolder') }}</span>
    </button>
    <NvPopupMenu
      class="workspace-home__import tw:flex tw:min-w-0 tw:flex-none"
      :items="importItems"
      placement="bottom-start"
      width="224px"
    >
      <template #trigger>
        <button
          type="button"
          class="workspace-home__action tw:group tw:flex tw:h-8 tw:flex-none tw:items-center tw:gap-[7px] tw:px-3 tw:border-0 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:text-[12.5px] tw:font-medium tw:whitespace-nowrap tw:text-left tw:transition-colors tw:duration-[var(--dur-base)] tw:text-content-secondary tw:bg-[color-mix(in_oklab,var(--island-bg)_91%,var(--text-primary))] tw:hover:bg-[color-mix(in_oklab,var(--island-bg)_84%,var(--text-primary))] tw:hover:text-content-primary tw:active:translate-y-px tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2 tw:max-[719px]:h-11 tw:max-[719px]:px-4"
          :aria-label="t('workspace.importMenu')"
        >
          <span class="workspace-home__action-icon tw:grid tw:flex-none tw:place-items-center tw:text-content-muted tw:group-hover:text-accent"><Import :size="15" aria-hidden="true" /></span>
          <span>{{ t('workspace.importMenu') }}</span>
        </button>
      </template>
    </NvPopupMenu>
    <button
      v-if="kanbanEnabled"
      type="button"
      class="workspace-home__action tw:group tw:flex tw:h-8 tw:flex-none tw:items-center tw:gap-[7px] tw:px-3 tw:border-0 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:text-[12.5px] tw:font-medium tw:whitespace-nowrap tw:text-left tw:transition-colors tw:duration-[var(--dur-base)] tw:text-content-secondary tw:bg-[color-mix(in_oklab,var(--island-bg)_91%,var(--text-primary))] tw:hover:bg-[color-mix(in_oklab,var(--island-bg)_84%,var(--text-primary))] tw:hover:text-content-primary tw:active:translate-y-px tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2 tw:max-[719px]:h-11 tw:max-[719px]:px-4"
      @click="emit('create-board')"
    >
      <span class="workspace-home__action-icon tw:grid tw:flex-none tw:place-items-center tw:text-content-muted tw:group-hover:text-accent"><Kanban :size="15" aria-hidden="true" /></span>
      <span>{{ t('workspace.actions.newBoard') }}</span>
    </button>
  </section>
</template>

<style scoped src="../../../styles/app/home/quick-actions.css"></style>
