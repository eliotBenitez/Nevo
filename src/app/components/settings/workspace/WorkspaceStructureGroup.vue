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

function resetStructure() {
  const d = createDefaultWorkspaceSettings().workspace
  workspaceStore.updateSettings(draft => {
    draft.workspace.newNotePlacement = d.newNotePlacement
    draft.workspace.newFolderPlacement = d.newFolderPlacement
    draft.workspace.showEmptyFolders = d.showEmptyFolders
  })
}

const placementOptions = ['current-folder', 'root'].map(v => ({
  value: v,
  label: opt('itemPlacement', v),
}))
</script>

<template>
  <SettingsGroup :title="t('settings.workspace.groups.structure')">
    <template #header-actions>
      <NvButton variant="ghost" size="xs" @click="resetStructure">{{ t('settings.common.resetToDefaults') }}</NvButton>
    </template>

    <SettingsRow
      :title="t('settings.workspace.newNotePlacement.title')"
      :description="t('settings.workspace.newNotePlacement.description')"
    >
      <NvSelect
        :model-value="settings.workspace.newNotePlacement"
        :options="placementOptions"
        @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.newNotePlacement = v as any })"
      />
    </SettingsRow>

    <SettingsRow
      :title="t('settings.workspace.newFolderPlacement.title')"
      :description="t('settings.workspace.newFolderPlacement.description')"
    >
      <NvSelect
        :model-value="settings.workspace.newFolderPlacement"
        :options="placementOptions"
        @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.newFolderPlacement = v as any })"
      />
    </SettingsRow>

    <SettingsRow
      :title="t('settings.workspace.showEmptyFolders.title')"
      :description="t('settings.workspace.showEmptyFolders.description')"
    >
      <NvToggle
        :aria-label="t('settings.workspace.showEmptyFolders.title')"
        :model-value="settings.workspace.showEmptyFolders"
        @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.showEmptyFolders = v })"
      />
    </SettingsRow>
  </SettingsGroup>
</template>
