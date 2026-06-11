<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../../stores/workspace'
import { templateCommands } from '../../../../tauri/commands'
import { createDefaultWorkspaceSettings } from '../../../../utils/workspace-settings'
import NvButton from '../../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../../ui/primitives/NvToggle.vue'
import NvSelect from '../../../../ui/primitives/NvSelect.vue'
import NvIconPicker from '../../../../ui/primitives/NvIconPicker.vue'
import NvNoteIcon from '../../../../ui/primitives/NvNoteIcon.vue'
import NvPopupMenu from '../../../../ui/primitives/NvPopupMenu.vue'

const { t, locale } = useI18n()
const workspaceStore = useWorkspaceStore()
const { activePath, settings } = storeToRefs(workspaceStore)

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
  if (!activePath.value) return
  try {
    const templates = await templateCommands.listTemplates(activePath.value)
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
watch([activePath, locale], loadTemplateOptions)
</script>

<template>
  <div class="group">
    <div class="group-header">
      <div class="group-label">{{ t('settings.workspace.groups.creationDefaults') }}</div>
      <NvButton variant="ghost" size="xs" @click="resetCreation">{{ t('settings.common.resetToDefaults') }}</NvButton>
    </div>
    <div class="settings-card">
      <div class="settings-row">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.defaultNoteIcon.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.defaultNoteIcon.description') }}</div>
        </div>
        <NvPopupMenu v-model:open="noteIconPickerOpen" placement="bottom-end">
          <template #trigger>
            <button class="icon-trigger-btn">
              <NvNoteIcon :value="settings.workspace.defaultNoteIcon" :size="18" />
            </button>
          </template>
          <div class="settings-icon-picker-wrap">
            <NvIconPicker
              :value="settings.workspace.defaultNoteIcon"
              @select="selectNoteIcon"
              @close="noteIconPickerOpen = false"
            />
          </div>
        </NvPopupMenu>
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.defaultFolderIcon.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.defaultFolderIcon.description') }}</div>
        </div>
        <NvPopupMenu v-model:open="folderIconPickerOpen" placement="bottom-end">
          <template #trigger>
            <button class="icon-trigger-btn">
              <NvNoteIcon :value="settings.workspace.defaultFolderIcon" :size="18" />
            </button>
          </template>
          <div class="settings-icon-picker-wrap">
            <NvIconPicker
              :value="settings.workspace.defaultFolderIcon"
              @select="selectFolderIcon"
              @close="folderIconPickerOpen = false"
            />
          </div>
        </NvPopupMenu>
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.defaultNoteTitlePattern.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.defaultNoteTitlePattern.description') }}</div>
        </div>
        <NvSelect
          :model-value="settings.workspace.defaultNoteTitlePattern"
          :options="titlePatternOptions"
          @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.defaultNoteTitlePattern = v as any })"
        />
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.newNoteTemplate.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.newNoteTemplate.description') }}</div>
        </div>
        <NvSelect
          :model-value="settings.workspace.newNoteTemplate"
          :options="templateOptions"
          @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.newNoteTemplate = v as any })"
        />
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.autoCreateStarterStructure.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.autoCreateStarterStructure.description') }}</div>
        </div>
        <NvSelect
          :model-value="settings.workspace.autoCreateStarterStructure"
          :options="starterStructureOptions"
          @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.autoCreateStarterStructure = v as any })"
        />
      </div>

      <div class="settings-row settings-row--border">
        <div class="row-copy">
          <div class="row-title">{{ t('settings.workspace.newWorkspaceHomeNote.title') }}</div>
          <div class="row-sub">{{ t('settings.workspace.newWorkspaceHomeNote.description') }}</div>
        </div>
        <NvToggle
          :model-value="settings.workspace.newWorkspaceHomeNote"
          @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.newWorkspaceHomeNote = v })"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.icon-trigger-btn {
  width: 40px;
  height: 40px;
  border-radius: calc(10px * var(--radius-scale, 1));
  border: 1px solid var(--line-strong);
  background: var(--glass-1);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--text-1);
}

.icon-trigger-btn:hover {
  background: var(--glass-2);
  border-color: var(--accent);
  transform: translateY(-1px);
}

.icon-trigger-btn:active {
  transform: translateY(0);
}

.settings-icon-picker-wrap :deep(.nv-icon-picker) {
  border: none;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  padding: 4px;
  width: 320px;
}
</style>

