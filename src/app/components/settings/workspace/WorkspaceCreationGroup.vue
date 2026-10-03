<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../../stores/workspace'
import { createDefaultWorkspaceSettings } from '../../../../utils/workspace-settings'
import NvButton from '../../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../../ui/primitives/NvToggle.vue'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'
import NvIconPicker from '../../../../ui/primitives/NvIconPicker.vue'
import NvNoteIcon from '../../../../ui/primitives/NvNoteIcon.vue'
import NvPopupMenu from '../../../../ui/primitives/NvPopupMenu.vue'
import SettingsGroup from '../ui/SettingsGroup.vue'
import SettingsRow from '../ui/SettingsRow.vue'

const { t, locale } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings } = storeToRefs(workspaceStore)

const noteIconPickerOpen = ref(false)
const folderIconPickerOpen = ref(false)

function selectNoteIcon(icon: string) {
  workspaceStore.updateSettings(draft => {
    draft.workspace.defaultNoteIcon = icon
  })
  noteIconPickerOpen.value = false
}

function selectFolderIcon(icon: string) {
  workspaceStore.updateSettings(draft => {
    draft.workspace.defaultFolderIcon = icon
  })
  folderIconPickerOpen.value = false
}

const templateOptions = ref([
  { value: 'blank', label: opt('noteTemplate', 'blank') },
  { value: 'meeting', label: opt('noteTemplate', 'meeting') },
  { value: 'daily', label: opt('noteTemplate', 'daily') },
  { value: 'research', label: opt('noteTemplate', 'research') },
])

function opt(key: string, value: string): string {
  return t(`settings.options.${key}.${value}`)
}

function resetCreation() {
  const d = createDefaultWorkspaceSettings().workspace
  workspaceStore.updateSettings(draft => {
    draft.workspace.defaultNoteIcon = d.defaultNoteIcon
    draft.workspace.defaultFolderIcon = d.defaultFolderIcon
    draft.workspace.defaultNoteTitlePattern = d.defaultNoteTitlePattern
    draft.workspace.newNoteTemplate = d.newNoteTemplate
    draft.workspace.newWorkspaceHomeNote = d.newWorkspaceHomeNote
    draft.workspace.autoCreateStarterStructure = d.autoCreateStarterStructure
  })
}

const titlePatternOptions = ['untitled', 'date', 'date-time'].map(v => ({
  value: v,
  label: opt('noteTitlePattern', v),
}))

async function loadTemplateOptions() {
  const backend = workspaceStore.backend
  if (!backend) return
  try {
    const templates = await backend.listTemplates()
    templateOptions.value = templates.map(template => ({
      value: template.id,
      label: `${template.icon} ${template.name}`,
    }))
  } catch {
    // Keep built-in fallback options in web mode or if template storage is unavailable.
  }
}

const starterStructureOptions = ['off', 'light', 'structured'].map(v => ({
  value: v,
  label: opt('starterStructure', v),
}))

onMounted(loadTemplateOptions)
watch([() => workspaceStore.backend, locale], loadTemplateOptions)
</script>

<template>
  <SettingsGroup :title="t('settings.workspace.groups.creationDefaults')">
    <template #header-actions>
      <NvButton variant="ghost" size="xs" @click="resetCreation">{{ t('settings.common.resetToDefaults') }}</NvButton>
    </template>

    <SettingsRow
      :title="t('settings.workspace.defaultNoteIcon.title')"
      :description="t('settings.workspace.defaultNoteIcon.description')"
    >
      <NvPopupMenu v-model:open="noteIconPickerOpen" placement="bottom-end">
        <template #trigger>
          <NvButton class="icon-trigger-btn tw:size-10 tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-input-bg tw:flex tw:items-center tw:justify-center tw:cursor-pointer tw:transition-[background-color,box-shadow,transform] tw:duration-[160ms] tw:text-content-primary tw:hover:bg-surface-raised tw:hover:shadow-[0_0_0_2px_var(--accent)] active:tw:translate-y-0">
            <NvNoteIcon :value="settings.workspace.defaultNoteIcon" :size="18" />
          </NvButton>
        </template>
        <div class="settings-icon-picker-wrap">
          <NvIconPicker
            :value="settings.workspace.defaultNoteIcon"
            @select="selectNoteIcon"
            @close="noteIconPickerOpen = false"
          />
        </div>
      </NvPopupMenu>
    </SettingsRow>

    <SettingsRow
      :title="t('settings.workspace.defaultFolderIcon.title')"
      :description="t('settings.workspace.defaultFolderIcon.description')"
    >
      <NvPopupMenu v-model:open="folderIconPickerOpen" placement="bottom-end">
        <template #trigger>
          <NvButton class="icon-trigger-btn tw:size-10 tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-input-bg tw:flex tw:items-center tw:justify-center tw:cursor-pointer tw:transition-[background-color,box-shadow,transform] tw:duration-[160ms] tw:text-content-primary tw:hover:bg-surface-raised tw:hover:shadow-[0_0_0_2px_var(--accent)] active:tw:translate-y-0">
            <NvNoteIcon :value="settings.workspace.defaultFolderIcon" :size="18" />
          </NvButton>
        </template>
        <div class="settings-icon-picker-wrap">
          <NvIconPicker
            :value="settings.workspace.defaultFolderIcon"
            @select="selectFolderIcon"
            @close="folderIconPickerOpen = false"
          />
        </div>
      </NvPopupMenu>
    </SettingsRow>

    <SettingsRow
      :title="t('settings.workspace.defaultNoteTitlePattern.title')"
      :description="t('settings.workspace.defaultNoteTitlePattern.description')"
    >
      <NvSelect
        :model-value="settings.workspace.defaultNoteTitlePattern"
        :options="titlePatternOptions"
        @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.defaultNoteTitlePattern = v as any })"
      />
    </SettingsRow>

    <SettingsRow
      :title="t('settings.workspace.newNoteTemplate.title')"
      :description="t('settings.workspace.newNoteTemplate.description')"
    >
      <NvSelect
        :model-value="settings.workspace.newNoteTemplate"
        :options="templateOptions"
        @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.newNoteTemplate = v as any })"
      />
    </SettingsRow>

    <SettingsRow
      :title="t('settings.workspace.autoCreateStarterStructure.title')"
      :description="t('settings.workspace.autoCreateStarterStructure.description')"
    >
      <NvSelect
        :model-value="settings.workspace.autoCreateStarterStructure"
        :options="starterStructureOptions"
        @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.autoCreateStarterStructure = v as any })"
      />
    </SettingsRow>

    <SettingsRow
      :title="t('settings.workspace.newWorkspaceHomeNote.title')"
      :description="t('settings.workspace.newWorkspaceHomeNote.description')"
    >
      <NvToggle
        :aria-label="t('settings.workspace.newWorkspaceHomeNote.title')"
        :model-value="settings.workspace.newWorkspaceHomeNote"
        @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.newWorkspaceHomeNote = v })"
      />
    </SettingsRow>
  </SettingsGroup>
</template>

<style scoped>
.settings-icon-picker-wrap :deep(.nv-icon-picker) {
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 4px;
  width: 320px;
}
</style>
