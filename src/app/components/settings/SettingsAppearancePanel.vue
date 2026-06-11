<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useThemeStore } from '../../../stores/theme'
import type { ThemeMode } from '../../../types/workspace'
import { createDefaultAppConfig } from '../../../utils/workspace-settings'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const themeStore = useThemeStore()
const { appConfig } = storeToRefs(workspaceStore)

const themeModes = computed<Array<{ id: ThemeMode; label: string; symbol: string }>>(() => [
  { id: 'light', label: t('settings.options.theme.light'), symbol: '☀' },
  { id: 'dark', label: t('settings.options.theme.dark'), symbol: '☾' },
  { id: 'system', label: t('settings.options.theme.system'), symbol: '◐' },
])

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
  themeStore.setReduceTransparency(d.reduceTransparency)
  themeStore.setInterfaceRoundness(d.interfaceRoundness)
  themeStore.setThemeSchedule(d.themeSchedule)
}

const densityOptions = ['compact', 'comfortable'].map(v => ({ value: v, label: opt('density', v) }))
const motionOptions = ['system', 'reduce', 'full'].map(v => ({
  value: v,
  label: v === 'system' ? t('settings.options.theme.system') : opt('reducedMotion', v),
}))
const scrollbarOptions = ['hidden', 'thin', 'system'].map(v => ({ value: v, label: opt('scrollbarVisibility', v) }))
const focusRingOptions = ['accent', 'high-contrast'].map(v => ({ value: v, label: opt('focusRingStyle', v) }))
const windowChromeOptions = ['default', 'immersive', 'minimal'].map(v => ({ value: v, label: opt('windowChromeStyle', v) }))
const roundnessOptions = ['sharp', 'default', 'soft'].map(v => ({ value: v, label: opt('roundness', v) }))
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

          <!-- Theme schedule -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.themeSchedule.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.themeSchedule.description') }}</div>
            </div>
            <NvToggle
              :model-value="appConfig.themeSchedule.enabled"
              @update:model-value="v => themeStore.setThemeSchedule({ enabled: v })"
            />
          </div>
          <div
            v-if="appConfig.themeSchedule.enabled"
            class="settings-row settings-row--border"
          >
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.themeSchedule.lightLabel') }}</div>
            </div>
            <input
              class="ui-input ui-input--time"
              type="time"
              :value="appConfig.themeSchedule.lightTime"
              @change="themeStore.setThemeSchedule({ lightTime: ($event.target as HTMLInputElement).value })"
            >
          </div>
          <div
            v-if="appConfig.themeSchedule.enabled"
            class="settings-row settings-row--border"
          >
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.themeSchedule.darkLabel') }}</div>
            </div>
            <input
              class="ui-input ui-input--time"
              type="time"
              :value="appConfig.themeSchedule.darkTime"
              @change="themeStore.setThemeSchedule({ darkTime: ($event.target as HTMLInputElement).value })"
            >
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

      <!-- ── Comfort & accessibility group ─────────── -->
      <div class="group">
        <div class="group-header">
          <div class="group-label">{{ t('settings.appearance.groups.comfort') }}</div>
        </div>
        <div class="settings-card">
          <!-- Interface zoom -->
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.interfaceZoom.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.interfaceZoom.description') }}</div>
            </div>
            <div class="slider-wrap">
              <input
                class="ui-range"
                type="range"
                min="80"
                max="120"
                step="5"
                :value="appConfig.interfaceZoom"
                @input="themeStore.setInterfaceZoom(Number(($event.target as HTMLInputElement).value))"
              >
              <span class="slider-value">{{ appConfig.interfaceZoom }} %</span>
            </div>
          </div>

          <!-- Reduce transparency -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.reduceTransparency.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.reduceTransparency.description') }}</div>
            </div>
            <NvToggle
              :model-value="appConfig.reduceTransparency"
              @update:model-value="v => themeStore.setReduceTransparency(v)"
            />
          </div>

          <!-- Roundness -->
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.interfaceRoundness.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.interfaceRoundness.description') }}</div>
            </div>
            <NvSelect
              :model-value="appConfig.interfaceRoundness"
              :options="roundnessOptions"
              @update:model-value="v => themeStore.setInterfaceRoundness(v as any)"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
