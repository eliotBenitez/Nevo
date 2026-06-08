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

const scopeOptions = ['workspace', 'current-folder'].map(v => ({
  value: v,
  label: opt('graphScope', v),
}))

const searchScopeOptions = ['workspace', 'current-folder'].map(v => ({
  value: v,
  label: opt('searchScope', v),
}))

const historyRangeOptions = ['7d', '30d', 'all'].map(v => ({
  value: v,
  label: opt('historyRange', v),
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
            disabled
          />
          <span class="status-chip status-chip--coming">{{ t('settings.state.coming') }}</span>
        </div>
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.graphScopeDefault.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.graphScopeDefault.description') }}</div>
        </div>
        <div class="inline-actions">
          <NvSelect
            :model-value="settings.workspace.graphScopeDefault"
            :options="scopeOptions"
            disabled
          />
          <span class="status-chip status-chip--coming">{{ t('settings.state.coming') }}</span>
        </div>
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.searchStartScope.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.searchStartScope.description') }}</div>
        </div>
        <div class="inline-actions">
          <NvSelect
            :model-value="settings.workspace.searchStartScope"
            :options="searchScopeOptions"
            disabled
          />
          <span class="status-chip status-chip--coming">{{ t('settings.state.coming') }}</span>
        </div>
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.historyDefaultRange.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.historyDefaultRange.description') }}</div>
        </div>
        <div class="inline-actions">
          <NvSelect
            :model-value="settings.workspace.historyDefaultRange"
            :options="historyRangeOptions"
            disabled
          />
          <span class="status-chip status-chip--coming">{{ t('settings.state.coming') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
