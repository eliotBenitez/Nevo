<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../stores/workspace'
import { COVER_GRADIENTS } from '../../../utils/workspaceGradients'
import type { WorkspaceManifest } from '../../../types/workspace'
import WorkspaceNavigationGroup from './workspace/WorkspaceNavigationGroup.vue'
import WorkspaceStructureGroup from './workspace/WorkspaceStructureGroup.vue'
import WorkspaceCreationGroup from './workspace/WorkspaceCreationGroup.vue'
import WorkspaceSystemViewsGroup from './workspace/WorkspaceSystemViewsGroup.vue'

import NvButton from '../../../ui/primitives/NvButton.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvColorPicker from '../../../ui/primitives/NvColorPicker.vue'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { manifest, settings } = storeToRefs(workspaceStore)

const gradientOptions = COVER_GRADIENTS
const colorOptions = COVER_GRADIENTS.map(c => ({ color: c }))

const workspaceDraft = reactive({
  name: manifest.value?.name ?? '',
  glyph: manifest.value?.glyph ?? 'N',
  gradient: manifest.value?.gradient ?? gradientOptions[0],
})

function syncDraft(m: WorkspaceManifest | null) {
  workspaceDraft.name = m?.name ?? ''
  workspaceDraft.glyph = m?.glyph ?? 'N'
  workspaceDraft.gradient = m?.gradient ?? gradientOptions[0]
}

watch(manifest, syncDraft)

async function saveWorkspaceIdentity() {
  if (!manifest.value) return
  await workspaceStore.saveWorkspaceManifest({
    ...manifest.value,
    name: workspaceDraft.name.trim() || manifest.value.name,
    glyph: workspaceDraft.glyph.trim() || manifest.value.glyph,
    gradient: workspaceDraft.gradient,
  })
}

function opt(key: string, value: string): string {
  return t(`settings.options.${key}.${value}`)
}

const workspaceTypeOptions = ['general', 'research', 'writing', 'product', 'knowledge-base'].map(v => ({
  value: v,
  label: opt('workspaceType', v),
}))

const statusOptions = ['active', 'archived', 'draft'].map(v => ({
  value: v,
  label: opt('workspaceStatus', v),
}))
</script>

<template>
  <section class="panel settings-workspace-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.workspace') }}</h2>
        <p class="panel-sub">{{ t('settings.workspace.description') }}</p>
      </div>
    </header>

    <div class="panel-body">
      <!-- ── Identity ────────────────────────────────── -->
      <div class="group">
        <div class="group-label">{{ t('settings.workspace.groups.identity') }}</div>
        <div class="settings-card">
          <div class="settings-row settings-row--stack">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.workspace.identity.title') }}</div>
              <div class="row-sub">{{ t('settings.workspace.identity.panelDescription') }}</div>
            </div>
            <div class="workspace-inputs">
              <input v-model="workspaceDraft.name" class="ui-input" :placeholder="t('settings.workspace.identity.namePlaceholder')">
              <input v-model="workspaceDraft.glyph" class="ui-input ui-input--glyph" maxlength="2" placeholder="N">
            </div>
            <NvColorPicker
              v-model="workspaceDraft.gradient"
              :colors="colorOptions"
              display="inline"
            />
            <div class="card-actions">
              <NvButton variant="primary" @click="saveWorkspaceIdentity">{{ t('settings.workspace.identity.save') }}</NvButton>
            </div>
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.workspace.workspaceType.title') }}</div>
              <div class="row-sub">{{ t('settings.workspace.workspaceType.description') }}</div>
            </div>
            <div class="inline-actions">
              <NvSelect
                :model-value="settings.workspace.workspaceType"
                :options="workspaceTypeOptions"
                disabled
              />
              <span class="status-chip status-chip--coming">{{ t('settings.state.coming') }}</span>
            </div>
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.workspace.workspaceStatus.title') }}</div>
              <div class="row-sub">{{ t('settings.workspace.workspaceStatus.description') }}</div>
            </div>
            <div class="inline-actions">
              <NvSelect
                :model-value="settings.workspace.status"
                :options="statusOptions"
                disabled
              />
              <span class="status-chip status-chip--coming">{{ t('settings.state.coming') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Navigation ─────────────────────────────── -->
      <WorkspaceNavigationGroup />

      <!-- ── Structure ──────────────────────────────── -->
      <WorkspaceStructureGroup />

      <!-- ── Creation Defaults ──────────────────────── -->
      <WorkspaceCreationGroup />

      <!-- ── System Views ───────────────────────────── -->
      <WorkspaceSystemViewsGroup />

    </div>
  </section>
</template>
