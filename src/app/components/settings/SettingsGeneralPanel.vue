<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { AppLocale, WorkspaceView } from '../../../types/workspace'

import { useTreeStore } from '../../../stores/tree'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const treeStore = useTreeStore()
const { settings, appConfig } = storeToRefs(workspaceStore)

const languageOptions = computed<Array<{ value: AppLocale; label: string }>>(() => [
  { value: 'ru', label: t('settings.options.language.ru') },
  { value: 'en', label: t('settings.options.language.en') },
])

const startupViewOptions = computed<Array<{ value: WorkspaceView; label: string }>>(() => [
  { value: 'editor', label: t('settings.options.startupView.editor') },
  { value: 'last-note', label: t('settings.options.startupView.lastNote') },
  { value: 'specific-note', label: t('settings.options.startupView.specificNote') },
  { value: 'graph', label: t('settings.options.startupView.graph') },
  { value: 'kanban', label: t('settings.options.startupView.kanban') },
])

const noteOptions = computed(() => {
  const options: Array<{ value: string; label: string }> = []
  for (const [id, meta] of treeStore.noteById.entries()) {
    options.push({
      value: id,
      label: (meta.icon ? `${meta.icon} ` : '') + (meta.title || t('workspace.untitledNote')),
    })
  }
  return options
})
</script>

<template>
  <section class="panel settings-general-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.general') }}</h2>
        <p class="panel-sub">{{ t('settings.general.description') }}</p>
      </div>
    </header>

    <div class="panel-body">
      <div class="group">
        <div class="group-label">{{ t('settings.general.groups.application') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.general.language.title') }}</div>
              <div class="row-sub">{{ t('settings.general.language.description') }}</div>
            </div>
            <NvSelect
              :model-value="appConfig.locale"
              :options="languageOptions"
              :min-width="140"
              @update:model-value="workspaceStore.setAppLocale($event as AppLocale)"
            />
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">{{ t('settings.general.groups.startup') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.general.startupView.title') }}</div>
              <div class="row-sub">{{ t('settings.general.startupView.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.general.defaultStartupView"
              :options="startupViewOptions"
              :min-width="140"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.general.defaultStartupView = v as WorkspaceView })"
            />
          </div>

          <div v-if="settings.general.defaultStartupView === 'specific-note'" class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.general.startupNote.title') }}</div>
              <div class="row-sub">{{ t('settings.general.startupNote.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.general.startupNoteId || ''"
              :options="noteOptions"
              :min-width="140"
              :placeholder="t('settings.general.startupNote.placeholder')"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.general.startupNoteId = v as string || null })"
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.general.restoreLastContext.title') }}</div>
              <div class="row-sub">{{ t('settings.general.restoreLastContext.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.general.restoreLastContext"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.general.restoreLastContext = v })"
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.general.deleteConfirmations.title') }}</div>
              <div class="row-sub">{{ t('settings.general.deleteConfirmations.panelDescription') }}</div>
            </div>
            <NvToggle
              :model-value="settings.general.confirmBeforeDelete"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.general.confirmBeforeDelete = v })"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
