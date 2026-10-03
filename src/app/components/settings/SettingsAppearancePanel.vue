<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useThemeStore } from '../../../stores/theme'
import { useOnboardingStore } from '../../../stores/onboarding'
import type { ContrastMode, InterfaceDensity, InterfaceRoundness, ThemeMode } from '../../../types/workspace'
import { ACCENT_PRESETS, createDefaultAppConfig } from '../../../utils/workspace-settings'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import NvColorPicker from '../../../ui/primitives/NvColorPicker.vue'
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'
import SettingsGroup from './ui/SettingsGroup.vue'
import SettingsRow from './ui/SettingsRow.vue'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const themeStore = useThemeStore()
const onboardingStore = useOnboardingStore()
const { appConfig, settings } = storeToRefs(workspaceStore)

function onThemeModeClick(mode: ThemeMode) {
  themeStore.setTheme(mode)
  void onboardingStore.markFirstStep('chooseAppearance')
}

const themeModes = computed<Array<{ id: ThemeMode; label: string }>>(() => [
  { id: 'system', label: t('settings.options.theme.system') },
  { id: 'light', label: t('settings.options.theme.light') },
  { id: 'dark', label: t('settings.options.theme.dark') },
])

const contrastModes = computed<Array<{ id: ContrastMode; label: string }>>(() => [
  { id: 'soft', label: t('settings.options.contrastMode.soft') },
  { id: 'balanced', label: t('settings.options.contrastMode.balanced') },
  { id: 'high', label: t('settings.options.contrastMode.high') },
])

const densityModes = computed<Array<{ id: InterfaceDensity; label: string }>>(() => [
  { id: 'comfortable', label: t('settings.options.density.comfortable') },
  { id: 'compact', label: t('settings.options.density.compact') },
])

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
  if (preset) {
    workspaceStore.updateSettings((draft) => {
      draft.appearance.accentPreset = preset.id as any
    })
    void onboardingStore.markFirstStep('chooseAppearance')
  }
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
  themeStore.setInterfaceZoom(d.interfaceZoom)
  themeStore.setInterfaceRoundness(d.interfaceRoundness)
  themeStore.setThemeSchedule(d.themeSchedule)
}

const motionOptions = ['system', 'reduce', 'full'].map(v => ({
  value: v,
  label: v === 'system' ? t('settings.options.theme.system') : opt('reducedMotion', v),
}))
const scrollbarOptions = ['hidden', 'thin', 'system'].map(v => ({ value: v, label: opt('scrollbarVisibility', v) }))

const fontOptions = [
  { value: 'ui', label: 'Geist' },
  { value: 'serif', label: 'Instrument Serif' },
  { value: 'mono', label: 'Geist Mono' },
]

const roundnessLevels: InterfaceRoundness[] = ['sharp', 'default', 'soft']
const roundnessLabels: Record<InterfaceRoundness, string> = {
  sharp: '× 0,7',
  default: '× 1,0',
  soft: '× 1,3',
}

const roundnessIndex = computed({
  get: () => Math.max(0, roundnessLevels.indexOf(appConfig.value.interfaceRoundness)),
  set: (idx: number) => {
    const next = roundnessLevels[idx] ?? 'default'
    themeStore.setInterfaceRoundness(next)
  },
})
</script>

<template>
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-appearance-panel">
    <SettingsSectionHeader
      :title="t('settings.sections.appearance')"
      :description="t('settings.appearance.description')"
    >
      <template #actions>
        <NvButton variant="ghost" size="xs" @click="resetAppGlobal">
          {{ t('settings.common.resetToDefaults') }}
        </NvButton>
      </template>
    </SettingsSectionHeader>

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <!-- ── Theme group ─────────────────────────────── -->
      <SettingsGroup :title="t('settings.appearance.groups.application')">
        <!-- Theme Mode -->
        <SettingsRow
          :title="t('settings.appearance.mode.title')"
          :description="t('settings.appearance.mode.description')"
        >
          <div class="segmented" role="group" :aria-label="t('settings.appearance.mode.title')">
            <button
              v-for="mode in themeModes"
              :key="mode.id"
              type="button"
              class="segmented__item"
              :class="{ 'is-active': themeStore.theme === mode.id }"
              :aria-pressed="themeStore.theme === mode.id"
              @click="onThemeModeClick(mode.id)"
            >
              {{ mode.label }}
            </button>
          </div>
        </SettingsRow>

        <!-- Accent Color -->
        <SettingsRow
          :title="t('settings.appearance.accent.title')"
          :description="t('settings.appearance.accent.description')"
        >
          <NvColorPicker
            class="accent-picker tw:flex tw:items-center tw:gap-2"
            :model-value="currentAccentColor"
            :colors="accentColors"
            display="inline"
            hide-custom
            @update:model-value="onAccentChange"
          />
        </SettingsRow>

        <!-- Contrast Mode -->
        <SettingsRow
          :title="t('settings.appearance.contrastMode.title')"
          :description="t('settings.appearance.contrastMode.description')"
        >
          <div class="segmented" role="group" :aria-label="t('settings.appearance.contrastMode.title')">
            <button
              v-for="mode in contrastModes"
              :key="mode.id"
              type="button"
              class="segmented__item"
              :class="{ 'is-active': settings.appearance.contrastMode === mode.id }"
              :aria-pressed="settings.appearance.contrastMode === mode.id"
              @click="workspaceStore.updateSettings(draft => { draft.appearance.contrastMode = mode.id })"
            >
              {{ mode.label }}
            </button>
          </div>
        </SettingsRow>

        <!-- Theme schedule -->
        <SettingsRow
          :title="t('settings.appearance.themeSchedule.title')"
          :description="t('settings.appearance.themeSchedule.description')"
        >
          <NvToggle
            :aria-label="t('settings.appearance.themeSchedule.title')"
            :model-value="appConfig.themeSchedule.enabled"
            @update:model-value="v => themeStore.setThemeSchedule({ enabled: v })"
          />
        </SettingsRow>

        <SettingsRow
          v-if="appConfig.themeSchedule.enabled"
          :title="t('settings.appearance.themeSchedule.lightLabel')"
        >
          <input
            class="ui-input ui-input--time"
            type="time"
            :value="appConfig.themeSchedule.lightTime"
            @change="themeStore.setThemeSchedule({ lightTime: ($event.target as HTMLInputElement).value })"
          >
        </SettingsRow>

        <SettingsRow
          v-if="appConfig.themeSchedule.enabled"
          :title="t('settings.appearance.themeSchedule.darkLabel')"
        >
          <input
            class="ui-input ui-input--time"
            type="time"
            :value="appConfig.themeSchedule.darkTime"
            @change="themeStore.setThemeSchedule({ darkTime: ($event.target as HTMLInputElement).value })"
          >
        </SettingsRow>
      </SettingsGroup>

      <!-- ── Density & shape group ───────────────────── -->
      <SettingsGroup :title="t('settings.appearance.groups.comfort')">
        <!-- Density -->
        <SettingsRow
          :title="t('settings.appearance.interfaceDensity.title')"
          :description="t('settings.appearance.interfaceDensity.description')"
        >
          <div class="segmented" role="group" :aria-label="t('settings.appearance.interfaceDensity.title')">
            <button
              v-for="density in densityModes"
              :key="density.id"
              type="button"
              class="segmented__item"
              :class="{ 'is-active': appConfig.interfaceDensity === density.id }"
              :aria-pressed="appConfig.interfaceDensity === density.id"
              @click="themeStore.setDensity(density.id)"
            >
              {{ density.label }}
            </button>
          </div>
        </SettingsRow>

        <!-- Roundness -->
        <SettingsRow
          :title="t('settings.appearance.interfaceRoundness.title')"
        >
          <template #description>
            <span class="mono">{{ roundnessLabels[appConfig.interfaceRoundness] ?? '× 1,0' }}</span>
          </template>
          <div class="slider-wrap tw:flex tw:items-center tw:gap-2.5">
            <input
              class="ui-range tw:w-[190px] tw:accent-[var(--accent)]"
              type="range"
              min="0"
              max="2"
              step="1"
              :value="roundnessIndex"
              :aria-label="t('settings.appearance.interfaceRoundness.title')"
              @input="roundnessIndex = Number(($event.target as HTMLInputElement).value)"
            >
          </div>
        </SettingsRow>

        <!-- Document Font -->
        <SettingsRow
          :title="t('settings.editor.font.title')"
          :description="t('settings.editor.font.description')"
        >
          <NvSelect
            :model-value="settings.appearance.editorFontFamily || 'ui'"
            :options="fontOptions"
            :min-width="150"
            @update:model-value="v => workspaceStore.updateSettings(draft => { draft.appearance.editorFontFamily = v as any })"
          />
        </SettingsRow>

        <!-- Animations / Motion -->
        <SettingsRow
          :title="t('settings.appearance.reducedMotion.title')"
          :description="t('settings.appearance.reducedMotion.description')"
        >
          <NvSelect
            :model-value="appConfig.reducedMotion"
            :options="motionOptions"
            :min-width="150"
            @update:model-value="v => themeStore.setReducedMotion(v as any)"
          />
        </SettingsRow>

        <!-- Interface zoom -->
        <SettingsRow
          :title="t('settings.appearance.interfaceZoom.title')"
        >
          <template #description>
            <span class="mono">{{ appConfig.interfaceZoom }} %</span>
          </template>
          <div class="slider-wrap tw:flex tw:items-center tw:gap-2.5">
            <input
              class="ui-range tw:w-[190px] tw:accent-[var(--accent)]"
              type="range"
              min="80"
              max="120"
              step="5"
              :value="appConfig.interfaceZoom"
              :aria-label="t('settings.appearance.interfaceZoom.title')"
              @input="themeStore.setInterfaceZoom(Number(($event.target as HTMLInputElement).value))"
            >
          </div>
        </SettingsRow>

        <!-- Scrollbars -->
        <SettingsRow
          :title="t('settings.appearance.scrollbarVisibility.title')"
          :description="t('settings.appearance.scrollbarVisibility.description')"
        >
          <NvSelect
            :model-value="appConfig.scrollbarVisibility"
            :options="scrollbarOptions"
            :min-width="150"
            @update:model-value="v => themeStore.setScrollbarVisibility(v as any)"
          />
        </SettingsRow>

      </SettingsGroup>
    </div>
  </section>
</template>
