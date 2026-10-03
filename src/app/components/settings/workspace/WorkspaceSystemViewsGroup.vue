<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../../stores/workspace'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'
import SettingsGroup from '../ui/SettingsGroup.vue'
import SettingsRow from '../ui/SettingsRow.vue'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings } = storeToRefs(workspaceStore)

function opt(key: string, value: string): string {
  return t(`settings.options.${key}.${value}`)
}

const graphEntryOptions = ['global', 'from-current-note'].map(v => ({
  value: v,
  label: opt('graphEntryMode', v),
}))
</script>

<template>
  <SettingsGroup :title="t('settings.workspace.groups.systemViews')">
    <SettingsRow
      :title="t('settings.workspace.graphEntryMode.title')"
      :description="t('settings.workspace.graphEntryMode.description')"
    >
      <div class="inline-actions tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <NvSelect
          :model-value="settings.workspace.graphEntryMode"
          :options="graphEntryOptions"
          @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.graphEntryMode = v as any })"
        />
      </div>
    </SettingsRow>
  </SettingsGroup>
</template>
