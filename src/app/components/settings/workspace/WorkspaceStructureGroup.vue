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

function resetStructure() {
  const d = createDefaultWorkspaceSettings().workspace
  workspaceStore.updateSettings(draft => {
    draft.workspace.newNotePlacement = d.newNotePlacement
    draft.workspace.newFolderPlacement = d.newFolderPlacement
  })
}

const placementOptions = ['current-folder', 'root'].map(v => ({
  value: v,
  label: opt('itemPlacement', v),
}))

const sortOptions = ['manual', 'title-asc', 'updated-desc'].map(v => ({
  value: v,
  label: opt('defaultChildSort', v),
}))
</script>

<template>
  <div class="group">
    <div class="group-header">
      <div class="group-label">{{ t('settings.workspace.groups.structure') }}</div>
      <NvButton variant="ghost" size="xs" @click="resetStructure">{{ t('settings.common.resetToDefaults') }}</NvButton>
    </div>
    <div class="settings-card">
      <div class="settings-row">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.newNotePlacement.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.newNotePlacement.description') }}</div>
        </div>
        <NvSelect
          :model-value="settings.workspace.newNotePlacement"
          :options="placementOptions"
          @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.newNotePlacement = v as any })"
        />
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.newFolderPlacement.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.newFolderPlacement.description') }}</div>
        </div>
        <NvSelect
          :model-value="settings.workspace.newFolderPlacement"
          :options="placementOptions"
          @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.newFolderPlacement = v as any })"
        />
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.defaultChildSort.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.defaultChildSort.description') }}</div>
        </div>
        <div class="inline-actions">
          <NvSelect
            :model-value="settings.workspace.defaultChildSort"
            :options="sortOptions"
            disabled
          />
          <span class="status-chip status-chip--coming">{{ t('settings.state.coming') }}</span>
        </div>
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.showEmptyFolders.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.showEmptyFolders.description') }}</div>
        </div>
        <NvToggle
          :model-value="settings.workspace.showEmptyFolders"
          disabled
        />
        <span class="status-chip status-chip--coming">{{ t('settings.state.coming') }}</span>
      </div>
    </div>
  </div>
</template>
