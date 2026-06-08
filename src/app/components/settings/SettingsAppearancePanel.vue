<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useThemeStore } from '../../../stores/theme'
import type { AccentPreset, ThemeMode } from '../../../types/workspace'
import { ACCENT_PRESETS } from '../../../utils/workspace-settings'
import { createDefaultAppConfig, createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvColorPicker from '../../../ui/primitives/NvColorPicker.vue'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const themeStore = useThemeStore()
const { settings, appConfig } = storeToRefs(workspaceStore)

const themeModes = computed<Array<{ id: ThemeMode; label: string; symbol: string }>>(() => [
  { id: 'light', label: t('settings.options.theme.light'), symbol: '☀' },
  { id: 'dark', label: t('settings.options.theme.dark'), symbol: '☾' },
  { id: 'system', label: t('settings.options.theme.system'), symbol: '◐' },
])

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

function opt(key: string, value: string): string {
  return t(`settings.options.${key}.${value}`)
}

function resetAppGlobal() {
  const d = createDefaultAppConfig()
  themeStore.setDensity(d.interfaceDensity)
  themeStore.setReducedMotion(d.reducedMotion)
  themeStore.setScrollbarVisibility(d.scrollbarVisibility)
  themeStore.setFocusRingStyle(d.focusRingStyle)
  themeStore.setWindowChromeStyle(d.windowChromeStyle)
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

const densityOptions = ['compact', 'comfortable'].map(v => ({ value: v, label: opt('density', v) }))
const motionOptions = ['system', 'reduce', 'full'].map(v => ({
  value: v,
  label: v === 'system' ? t('settings.options.theme.system') : opt('reducedMotion', v),
}))
const scrollbarOptions = ['hidden', 'thin', 'system'].map(v => ({ value: v, label: opt('scrollbarVisibility', v) }))
const focusRingOptions = ['accent', 'high-contrast'].map(v => ({ value: v, label: opt('focusRingStyle', v) }))
const windowChromeOptions = ['default', 'immersive', 'minimal'].map(v => ({ value: v, label: opt('windowChromeStyle', v) }))

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
    draft.appearance.accentPreset = preset ? (preset.id as AccentPreset) : color
  })
}
</script>

<template>
  <section class="panel settings-appearance-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.appearance') }}</h2>
        <p class="panel-sub">{{ t('settings.appearance.description') }}</p>
      </div>
    </header>

    <div class="panel-body">
      <!-- ── Application group ─────────────────────── -->
      <div class="group">
        <div class="group-header">
          <div class="group-label">{{ t('settings.appearance.groups.application') }}</div>
          <NvButton variant="ghost" size="xs" @click="resetAppGlobal">{{ t('settings.common.resetToDefaults') }}</NvButton>
        </div>
        <div class="settings-card">
          <!-- Theme mode -->
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.mode.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.mode.description') }}</div>
            </div>
            <div class="mode-picker">
              <button
                v-for="mode in themeModes"
                :key="mode.id"
                type="button"
                class="mode-card"
                :class="{ 'mode-card--active': themeStore.theme === mode.id }"
                @click="themeStore.setTheme(mode.id)"
              >
                <span class="mode-card__icon">{{ mode.symbol }}</span>
                <span class="mode-card__label">{{ mode.label }}</span>
              </button>
            </div>
          </div>

          <!-- Density -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.interfaceDensity.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.interfaceDensity.description') }}</div>
            </div>
            <NvSelect
              :model-value="appConfig.interfaceDensity"
              :options="densityOptions"
              @update:model-value="v => themeStore.setDensity(v as any)"
            />
          </div>

          <!-- Motion -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.reducedMotion.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.reducedMotion.description') }}</div>
            </div>
            <NvSelect
              :model-value="appConfig.reducedMotion"
              :options="motionOptions"
              @update:model-value="v => themeStore.setReducedMotion(v as any)"
            />
          </div>

          <!-- Scrollbars -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.scrollbarVisibility.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.scrollbarVisibility.description') }}</div>
            </div>
            <NvSelect
              :model-value="appConfig.scrollbarVisibility"
              :options="scrollbarOptions"
              @update:model-value="v => themeStore.setScrollbarVisibility(v as any)"
            />
          </div>

          <!-- Focus ring -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.focusRingStyle.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.focusRingStyle.description') }}</div>
            </div>
            <NvSelect
              :model-value="appConfig.focusRingStyle"
              :options="focusRingOptions"
              @update:model-value="v => themeStore.setFocusRingStyle(v as any)"
            />
          </div>

          <!-- Window chrome -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.windowChromeStyle.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.windowChromeStyle.description') }}</div>
            </div>
            <NvSelect
              :model-value="appConfig.windowChromeStyle"
              :options="windowChromeOptions"
              @update:model-value="v => themeStore.setWindowChromeStyle(v as any)"
            />
          </div>
        </div>
      </div>

      <!-- ── Shell preview ───────────────────────────── -->
      <div class="scene-preview" aria-hidden="true">
        <span class="scene-preview__label">
          {{ opt('backgroundScene', settings.appearance.backgroundScene) }} ·
          {{ opt('surfaceStyle', settings.appearance.surfaceStyle) }} ·
          {{ opt('contrastMode', settings.appearance.contrastMode) }}
        </span>
      </div>

      <!-- ── Workspace style group ─────────────────── -->
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
        </div>
      </div>
    </div>
  </section>
</template>
