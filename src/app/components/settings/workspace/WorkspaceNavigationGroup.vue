<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../../stores/workspace'
import { createDefaultWorkspaceSettings } from '../../../../utils/workspace-settings'
import NvButton from '../../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../../ui/primitives/NvToggle.vue'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'

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
    draft.workspace.showBacklinksByDefault = d.showBacklinksByDefault
    draft.workspace.showGraphLabels = d.showGraphLabels
  })
}

const sidebarStateOptions = ['expanded', 'collapsed'].map(v => ({
  value: v,
  label: opt('sidebarDefaultState', v),
}))
</script>

<template>
  <div class="group">
    <div class="group-header">
      <div class="group-label">{{ t('settings.workspace.groups.navigation') }}</div>
      <NvButton variant="ghost" size="xs" @click="resetNavigation">{{ t('settings.common.resetToDefaults') }}</NvButton>
    </div>
    <div class="settings-card">
      <div class="settings-row">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.rememberExpandedFolders.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.rememberExpandedFolders.description') }}</div>
        </div>
        <NvToggle
          :model-value="settings.workspace.rememberExpandedFolders"
          @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.rememberExpandedFolders = v })"
        />
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.sidebarDefaultState.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.sidebarDefaultState.description') }}</div>
        </div>
        <div class="inline-actions">
          <NvSelect
            :model-value="settings.workspace.sidebarDefaultState"
            :options="sidebarStateOptions"
            @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.sidebarDefaultState = v as any })"
          />
        </div>
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.rootNotesVisible.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.rootNotesVisible.description') }}</div>
        </div>
        <NvToggle
          :model-value="settings.workspace.rootNotesVisible"
          @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.rootNotesVisible = v })"
        />
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.backlinksVisibility.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.backlinksVisibility.description') }}</div>
        </div>
        <NvToggle
          :model-value="settings.workspace.showBacklinksByDefault"
          @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.showBacklinksByDefault = v })"
        />
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.graphLabels.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.graphLabels.description') }}</div>
        </div>
        <NvToggle
          :model-value="settings.workspace.showGraphLabels"
          @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.showGraphLabels = v })"
        />
      </div>
    </div>
  </div>
</template>
