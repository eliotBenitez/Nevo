<script setup lang="ts">
import { reactive, watch, computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Save } from '@lucide/vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { COVER_GRADIENTS } from '../../../utils/workspaceGradients'
import type { SidebarLayout, WorkspaceManifest } from '../../../types/workspace'
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
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'
import SettingsGroup from './ui/SettingsGroup.vue'
import SettingsRow from './ui/SettingsRow.vue'

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
  mineral: 'settings.options.accent.mineral',
  azure: 'settings.options.accent.azure',
  violet: 'settings.options.accent.violet',
  ember: 'settings.options.accent.ember',
  sage: 'settings.options.accent.sage',
  ocean: 'settings.options.accent.ocean',
  rose: 'settings.options.accent.rose',
}

function accentLabel(preset: string): string {
  return accentLabelKeys[preset] ? t(accentLabelKeys[preset]) : preset
}

const contrastModeOptions = ['soft', 'balanced', 'high'].map(v => ({ value: v, label: opt('contrastMode', v) }))
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
    draft.appearance.contrastMode = d.contrastMode
  })
}


function setSidebarLayout(mode: SidebarLayout) {
  workspaceStore.updateSettings(draft => {
    draft.workspace.sidebarLayout = mode
  })
}


</script>

<template>
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-workspace-panel">
    <SettingsSectionHeader
      :title="t('settings.sections.workspace')"
      :description="t('settings.workspace.description')"
    />

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <!-- ── Workspace identity ─────────────────────── -->
      <SettingsGroup :title="t('settings.workspace.groups.identity')">
        <SettingsRow
          :title="t('settings.workspace.identity.title')"
          :description="t('settings.workspace.identity.panelDescription')"
          layout="stacked"
        >
          <div class="workspace-inputs tw:grid tw:grid-cols-[1fr_72px] tw:items-stretch tw:gap-2.5 tw:max-[980px]:grid-cols-1">
            <input v-model="workspaceDraft.name" class="ui-input" :placeholder="t('settings.workspace.identity.namePlaceholder')">
            <div ref="glyphPickerRef" class="glyph-field tw:relative">
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
          <div class="workspace-identity-strip tw:mt-2.5 tw:flex tw:min-w-0 tw:min-h-12 tw:items-center tw:gap-2.5 tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-2.5">
            <span class="workspace-identity-strip__mark tw:grid tw:size-[30px] tw:flex-none tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-[var(--accent-soft)] tw:text-accent">
              <NvNoteIcon :value="workspaceDraft.glyph" :size="20" />
            </span>
            <span class="workspace-identity-strip__copy tw:grid tw:min-w-0 tw:gap-0.5">
              <strong class="tw:text-content-primary tw:text-[13px] tw:[overflow-wrap:anywhere]">{{ workspaceDraft.name || manifest?.name || t('settings.workspace.identity.namePlaceholder') }}</strong>
              <span class="tw:text-content-muted tw:text-[11.5px]">{{ t('settings.workspace.identity.preview') }}</span>
            </span>
          </div>
          <div class="card-actions tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <NvButton variant="primary" @click="saveWorkspaceIdentity">
              <Save :size="14" />
              {{ t('settings.workspace.identity.save') }}
            </NvButton>
          </div>
        </SettingsRow>
      </SettingsGroup>


      <!-- ── Sidebar layout ───────────────────────────── -->
      <SettingsGroup :title="t('settings.workspace.groups.sidebarLayout')">
        <SettingsRow
          :title="t('settings.workspace.sidebarLayout.title')"
          :description="t('settings.workspace.sidebarLayout.description')"
          layout="stacked"
        >
          <div class="sidebar-mode-grid tw:grid tw:grid-cols-2 tw:gap-2.5 tw:max-[980px]:grid-cols-1">
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
        </SettingsRow>
      </SettingsGroup>

      <!-- ── Appearance ─────────────────────────────── -->
      <SettingsGroup :title="t('settings.appearance.groups.workspaceStyle')">
        <template #header-actions>
          <NvButton variant="ghost" size="xs" @click="resetWorkspaceStyle">{{ t('settings.common.resetToDefaults') }}</NvButton>
        </template>

        <!-- Accent -->
        <SettingsRow
          :title="t('settings.appearance.accent.title')"
          :description="t('settings.appearance.accent.description')"
          layout="stacked"
        >
          <div class="accent-picker tw:flex tw:items-center tw:gap-2">
            <NvColorPicker
              :model-value="currentAccentColor"
              :colors="accentColors"
              display="inline"
              @update:model-value="onAccentChange"
            />
            <span class="accent-label tw:ml-1 tw:text-content-muted tw:text-xs">{{ accentLabel(settings.appearance.accentPreset) }}</span>
          </div>
        </SettingsRow>

        <!-- Contrast mode -->
        <SettingsRow
          :title="t('settings.appearance.contrastMode.title')"
          :description="t('settings.appearance.contrastMode.description')"
        >
          <NvSelect
            :model-value="settings.appearance.contrastMode"
            :options="contrastModeOptions"
            @update:model-value="v => workspaceStore.updateSettings(draft => { draft.appearance.contrastMode = v as any })"
          />
        </SettingsRow>

        <!-- Custom CSS Toggle -->
        <SettingsRow
          :title="t('settings.workspace.customCss.title')"
          :description="t('settings.workspace.customCss.description')"
        >
          <NvToggle
            :aria-label="t('settings.workspace.customCss.title')"
            :model-value="settings.appearance.customCssEnabled"
            @update:model-value="v => workspaceStore.updateSettings(draft => { draft.appearance.customCssEnabled = v })"
          />
        </SettingsRow>
      </SettingsGroup>

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
