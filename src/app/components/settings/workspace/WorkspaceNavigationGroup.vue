<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../../stores/workspace'
import { createDefaultWorkspaceSettings } from '../../../../utils/workspace-settings'
import NvButton from '../../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../../ui/primitives/NvToggle.vue'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'
import SettingsGroup from '../ui/SettingsGroup.vue'
import SettingsRow from '../ui/SettingsRow.vue'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings } = storeToRefs(workspaceStore)

function opt(key: string, value: string): string {
  return t(`settings.options.${key}.${value}`)
}

function resetNavigation() {
  const d = createDefaultWorkspaceSettings().workspace
  workspaceStore.updateSettings(draft => {
    draft.workspace.rememberExpandedFolders = d.rememberExpandedFolders
    draft.workspace.sidebarDefaultState = d.sidebarDefaultState
    draft.workspace.rootNotesVisible = d.rootNotesVisible
    draft.workspace.showGraphLabels = d.showGraphLabels
  })
}

const sidebarStateOptions = ['expanded', 'collapsed'].map(v => ({
  value: v,
  label: opt('sidebarDefaultState', v),
}))
</script>

<template>
  <SettingsGroup :title="t('settings.workspace.groups.navigation')">
    <template #header-actions>
      <NvButton variant="ghost" size="xs" @click="resetNavigation">{{ t('settings.common.resetToDefaults') }}</NvButton>
    </template>

    <SettingsRow
      :title="t('settings.workspace.rememberExpandedFolders.title')"
      :description="t('settings.workspace.rememberExpandedFolders.description')"
    >
      <NvToggle
        :aria-label="t('settings.workspace.rememberExpandedFolders.title')"
        :model-value="settings.workspace.rememberExpandedFolders"
        @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.rememberExpandedFolders = v })"
      />
    </SettingsRow>

    <SettingsRow
      :title="t('settings.workspace.sidebarDefaultState.title')"
      :description="t('settings.workspace.sidebarDefaultState.description')"
    >
      <NvSelect
        :model-value="settings.workspace.sidebarDefaultState"
        :options="sidebarStateOptions"
        @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.sidebarDefaultState = v as any })"
      />
    </SettingsRow>

    <SettingsRow
      :title="t('settings.workspace.rootNotesVisible.title')"
      :description="t('settings.workspace.rootNotesVisible.description')"
    >
      <NvToggle
        :aria-label="t('settings.workspace.rootNotesVisible.title')"
        :model-value="settings.workspace.rootNotesVisible"
        @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.rootNotesVisible = v })"
      />
    </SettingsRow>

    <SettingsRow
      :title="t('settings.workspace.graphLabels.title')"
      :description="t('settings.workspace.graphLabels.description')"
    >
      <NvToggle
        :aria-label="t('settings.workspace.graphLabels.title')"
        :model-value="settings.workspace.showGraphLabels"
        @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.showGraphLabels = v })"
      />
    </SettingsRow>
  </SettingsGroup>
</template>
