<script setup lang="ts">
import { reactive, watch, computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../stores/workspace'
import { COVER_GRADIENTS } from '../../../utils/workspaceGradients'
import type { WorkspaceManifest } from '../../../types/workspace'
import { ACCENT_PRESETS, createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'
import WorkspaceNavigationGroup from './workspace/WorkspaceNavigationGroup.vue'
import WorkspaceStructureGroup from './workspace/WorkspaceStructureGroup.vue'
import WorkspaceCreationGroup from './workspace/WorkspaceCreationGroup.vue'
import WorkspaceSystemViewsGroup from './workspace/WorkspaceSystemViewsGroup.vue'

import NvButton from '../../../ui/primitives/NvButton.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import NvColorPicker from '../../../ui/primitives/NvColorPicker.vue'
import NvIconPicker from '../../../ui/primitives/NvIconPicker.vue'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'

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

const glyphPickerRef = ref<HTMLElement | null>(null)
const glyphPickerOpen = ref(false)

function toggleGlyphPicker() {
  glyphPickerOpen.value = !glyphPickerOpen.value
}

function selectGlyph(value: string) {
  workspaceDraft.glyph = value
  glyphPickerOpen.value = false
}

function onGlyphDocumentMouseDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (glyphPickerOpen.value && !(glyphPickerRef.value?.contains(target) ?? false)) {
    glyphPickerOpen.value = false
  }
}

onMounted(() => { document.addEventListener('mousedown', onGlyphDocumentMouseDown) })
onBeforeUnmount(() => { document.removeEventListener('mousedown', onGlyphDocumentMouseDown) })

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

// Appearance Settings
const accentLabelKeys: Record<string, string> = {
  violet: 'settings.options.accent.violet',
  ember: 'settings.options.accent.ember',
  sage: 'settings.options.accent.sage',
  ocean: 'settings.options.accent.ocean',
  rose: 'settings.options.accent.rose',
}

function accentLabel(preset: string): string {
  return accentLabelKeys[preset] ? t(accentLabelKeys[preset]) : preset
}

const backgroundSceneOptions = ['aurora', 'paper', 'studio', 'plain'].map(v => ({ value: v, label: opt('backgroundScene', v) }))
const surfaceStyleOptions = ['glass', 'solid', 'tinted'].map(v => ({ value: v, label: opt('surfaceStyle', v) }))
const contrastModeOptions = ['soft', 'balanced', 'high'].map(v => ({ value: v, label: opt('contrastMode', v) }))
const sidebarStyleOptions = ['floating', 'solid', 'minimal'].map(v => ({ value: v, label: opt('sidebarStyle', v) }))

const accentColors = Object.entries(ACCENT_PRESETS).map(([id, tokens]) => ({
  color: tokens.accent,
  label: accentLabel(id),
  id,
}))

const currentAccentColor = computed(() => {
  const preset = ACCENT_PRESETS[settings.value.appearance.accentPreset]
  return preset ? preset.accent : settings.value.appearance.accentPreset
})

function onAccentChange(color: string | null) {
  if (!color) return
  const preset = accentColors.find(c => c.color === color)
  workspaceStore.updateSettings(draft => {
    draft.appearance.accentPreset = preset ? (preset.id as any) : color
  })
}

function resetWorkspaceStyle() {
  const d = createDefaultWorkspaceSettings().appearance
  workspaceStore.updateSettings(draft => {
    draft.appearance.accentPreset = d.accentPreset
    draft.appearance.backgroundScene = d.backgroundScene
    draft.appearance.surfaceStyle = d.surfaceStyle
    draft.appearance.contrastMode = d.contrastMode
    draft.appearance.sidebarStyle = d.sidebarStyle
  })
}


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
              <div ref="glyphPickerRef" class="glyph-field">
                <button
                  type="button"
                  class="glyph-trigger"
                  :class="{ 'is-active': glyphPickerOpen }"
                  :title="t('settings.workspace.identity.glyphLabel')"
                  @click="toggleGlyphPicker"
                >
                  <NvNoteIcon :value="workspaceDraft.glyph" :size="20" />
                </button>
                <NvIconPicker
                  v-if="glyphPickerOpen"
                  class="glyph-picker-popover"
                  :value="workspaceDraft.glyph"
                  @select="selectGlyph"
                  @close="glyphPickerOpen = false"
                />
              </div>
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
                @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.workspaceType = v as any })"
              />
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
                @update:model-value="v => workspaceStore.updateSettings(draft => { draft.workspace.status = v as any })"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ── Appearance ─────────────────────────────── -->
      <div class="group">
        <div class="group-header">
          <div class="group-label">{{ t('settings.appearance.groups.workspaceStyle') }}</div>
          <NvButton variant="ghost" size="xs" @click="resetWorkspaceStyle">{{ t('settings.common.resetToDefaults') }}</NvButton>
        </div>
        <div class="settings-card">
          <!-- Accent -->
          <div class="settings-row settings-row--stack">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.accent.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.accent.description') }}</div>
            </div>
            <div class="accent-picker">
              <NvColorPicker
                :model-value="currentAccentColor"
                :colors="accentColors"
                display="inline"
                @update:model-value="onAccentChange"
              />
              <span class="accent-label">{{ accentLabel(settings.appearance.accentPreset) }}</span>
            </div>
          </div>

          <!-- Background scene -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.backgroundScene.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.backgroundScene.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.appearance.backgroundScene"
              :options="backgroundSceneOptions"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.appearance.backgroundScene = v as any })"
            />
          </div>

          <!-- Surface style -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.surfaceStyle.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.surfaceStyle.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.appearance.surfaceStyle"
              :options="surfaceStyleOptions"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.appearance.surfaceStyle = v as any })"
            />
          </div>

          <!-- Contrast mode -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.contrastMode.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.contrastMode.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.appearance.contrastMode"
              :options="contrastModeOptions"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.appearance.contrastMode = v as any })"
            />
          </div>

          <!-- Sidebar style -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.sidebarStyle.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.sidebarStyle.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.appearance.sidebarStyle"
              :options="sidebarStyleOptions"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.appearance.sidebarStyle = v as any })"
            />
          </div>

          <!-- Custom CSS Toggle -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.workspace.customCss.title') }}</div>
              <div class="row-sub">{{ t('settings.workspace.customCss.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.appearance.customCssEnabled"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.appearance.customCssEnabled = v })"
            />
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
