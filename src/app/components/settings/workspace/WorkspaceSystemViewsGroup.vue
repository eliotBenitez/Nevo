<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../../stores/workspace'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'

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
  <div class="group">
    <div class="group-label">{{ t('settings.workspace.groups.systemViews') }}</div>
    <div class="settings-card">
      <div class="settings-row">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.graphEntryMode.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.graphEntryMode.description') }}</div>
        </div>
        <div class="inline-actions">
          <NvSelect
            :model-value="settings.workspace.graphEntryMode"
            :options="graphEntryOptions"
            @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.graphEntryMode = v as any })"
          />
        </div>
      </div>
    </div>
  </div>
</template>
