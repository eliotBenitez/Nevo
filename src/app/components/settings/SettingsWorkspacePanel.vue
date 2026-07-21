<script setup lang="ts">
import { reactive, watch, computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Save } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../../stores/workspace'
import { COVER_GRADIENTS } from '../../../utils/workspaceGradients'
import type { SidebarContentMode, SidebarLayout, WorkspaceManifest } from '../../../types/workspace'
import { ACCENT_PRESETS, createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'
import WorkspaceNavigationGroup from './workspace/WorkspaceNavigationGroup.vue'
import WorkspaceStructureGroup from './workspace/WorkspaceStructureGroup.vue'
import WorkspaceCreationGroup from './workspace/WorkspaceCreationGroup.vue'
import WorkspaceSystemViewsGroup from './workspace/WorkspaceSystemViewsGroup.vue'

import NvButton from '../../../ui/primitives/NvButton.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import NvColorPicker from '../../../ui/primitives/NvColorPicker.vue'
import NvGlyphPicker from '../../../ui/primitives/NvGlyphPicker.vue'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { manifest, settings } = storeToRefs(workspaceStore)

const gradientOptions = COVER_GRADIENTS

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
const sidebarContentModeOptions: Array<{ value: SidebarContentMode; label: string; description: string }> = [
  {
    value: 'tree',
    label: opt('sidebarContentMode', 'tree'),
    description: t('settings.workspace.sidebarContentMode.treeDescription'),
  },
  {
    value: 'tag-preview',
    label: opt('sidebarContentMode', 'tag-preview'),
    description: t('settings.workspace.sidebarContentMode.tagPreviewDescription'),
  },
]
const sidebarLayoutOptions: Array<{ value: SidebarLayout; label: string; description: string }> = [
  {
    value: 'docked',
    label: opt('sidebarLayout', 'docked'),
    description: t('settings.workspace.sidebarLayout.dockedDescription'),
  },
  {
    value: 'floating',
    label: opt('sidebarLayout', 'floating'),
    description: t('settings.workspace.sidebarLayout.floatingDescription'),
  },
]

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

function setSidebarContentMode(mode: SidebarContentMode) {
  workspaceStore.updateSettings(draft => {
    draft.workspace.sidebarContentMode = mode
  })
}

function setSidebarLayout(mode: SidebarLayout) {
  workspaceStore.updateSettings(draft => {
    draft.workspace.sidebarLayout = mode
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
      <!-- ── Workspace identity ─────────────────────── -->
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
                <NvButton
                  class="glyph-trigger"
                  :class="{ 'is-active': glyphPickerOpen }"
                  :title="t('settings.workspace.identity.glyphLabel')"
                  @click="toggleGlyphPicker"
                >
                  <NvNoteIcon :value="workspaceDraft.glyph" :size="20" />
                </NvButton>
                <NvGlyphPicker
                  v-if="glyphPickerOpen"
                  class="glyph-picker-popover"
                  :value="workspaceDraft.glyph"
                  @select="selectGlyph"
                  @close="glyphPickerOpen = false"
                />
              </div>
            </div>
            <div class="workspace-identity-strip">
              <span class="workspace-identity-strip__mark">
                <NvNoteIcon :value="workspaceDraft.glyph" :size="20" />
              </span>
              <span class="workspace-identity-strip__copy">
                <strong>{{ workspaceDraft.name || manifest?.name || t('settings.workspace.identity.namePlaceholder') }}</strong>
                <span>{{ t('settings.workspace.identity.preview') }}</span>
              </span>
            </div>
            <div class="card-actions">
              <NvButton variant="primary" @click="saveWorkspaceIdentity">
                <Save :size="14" />
                {{ t('settings.workspace.identity.save') }}
              </NvButton>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Sidebar content ─────────────────────────── -->
      <div class="group">
        <div class="group-label">{{ t('settings.workspace.groups.sidebarMode') }}</div>
        <div class="settings-card">
          <div class="settings-row settings-row--stack">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.workspace.sidebarContentMode.title') }}</div>
              <div class="row-sub">{{ t('settings.workspace.sidebarContentMode.description') }}</div>
            </div>
            <div class="sidebar-mode-grid">
              <button
                v-for="mode in sidebarContentModeOptions"
                :key="mode.value"
                type="button"
                class="sidebar-mode-card"
                :class="{ 'sidebar-mode-card--active': settings.workspace.sidebarContentMode === mode.value }"
                :aria-pressed="settings.workspace.sidebarContentMode === mode.value"
                @click="setSidebarContentMode(mode.value)"
              >
                <span class="sidebar-mode-card__preview" :class="`sidebar-mode-card__preview--${mode.value}`">
                  <span class="sidebar-mode-card__rail">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span class="sidebar-mode-card__body">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
                <span class="sidebar-mode-card__copy">
                  <span class="sidebar-mode-card__title">{{ mode.label }}</span>
                  <span class="sidebar-mode-card__description">{{ mode.description }}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Sidebar layout ───────────────────────────── -->
      <div class="group">
        <div class="group-label">{{ t('settings.workspace.groups.sidebarLayout') }}</div>
        <div class="settings-card">
          <div class="settings-row settings-row--stack">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.workspace.sidebarLayout.title') }}</div>
              <div class="row-sub">{{ t('settings.workspace.sidebarLayout.description') }}</div>
            </div>
            <div class="sidebar-mode-grid">
              <button
                v-for="mode in sidebarLayoutOptions"
                :key="mode.value"
                type="button"
                class="sidebar-mode-card"
                :class="{ 'sidebar-mode-card--active': settings.workspace.sidebarLayout === mode.value }"
                :aria-pressed="settings.workspace.sidebarLayout === mode.value"
                @click="setSidebarLayout(mode.value)"
              >
                <span class="sidebar-mode-card__preview" :class="`sidebar-mode-card__preview--${mode.value}`">
                  <span class="sidebar-mode-card__rail">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span class="sidebar-mode-card__body">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
                <span class="sidebar-mode-card__copy">
                  <span class="sidebar-mode-card__title">{{ mode.label }}</span>
                  <span class="sidebar-mode-card__description">{{ mode.description }}</span>
                </span>
              </button>
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
