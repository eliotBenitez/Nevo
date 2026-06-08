<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { WorkspaceSettings } from '../../../types/workspace'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import { useSystemFonts } from '../../../composables/useSystemFonts'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings } = storeToRefs(workspaceStore)
const u = (fn: (draft: WorkspaceSettings) => void) => workspaceStore.updateSettings(fn)

const { fonts: systemFonts } = useSystemFonts()

const PRESET_OPTIONS = [
  { value: 'ui',    label: 'Geist',           description: 'Sans-serif · App default' },
  { value: 'serif', label: 'Instrument Serif', description: 'Serif · Editorial' },
  { value: 'mono',  label: 'Geist Mono',       description: 'Monospace · Code-style' },
]

const fontOptions = computed(() => {
  const presetValues = new Set(['ui', 'serif', 'mono'])
  const system = systemFonts.value
    .filter(f => !presetValues.has(f))
    .map(f => ({ value: f, label: f, description: 'System font' }))
  return [...PRESET_OPTIONS, ...system]
})

function opt(key: string, value: string): string {
  return t(`settings.options.${key}.${value}`)
}

const lineWidthOptions = ['narrow', 'medium', 'wide'].map(v => ({ value: v, label: opt('lineWidth', v) }))
const focusModeOptions = ['off', 'soft'].map(v => ({ value: v, label: opt('focusMode', v) }))
const typewriterPositionOptions = ['upper', 'center', 'lower'].map(v => ({ value: v, label: opt('typewriterPosition', v) }))
const caretAnimationOptions = ['system', 'steady', 'blink'].map(v => ({ value: v, label: opt('caretAnimation', v) }))
const tabKeyBehaviorOptions = ['indent', 'focus'].map(v => ({ value: v, label: opt('tabKeyBehavior', v) }))
const autosavePolicyOptions = ['immediate', 'window-idle'].map(v => ({ value: v, label: opt('autosavePolicy', v) }))
const pasteBehaviorOptions = ['smart', 'plain-text'].map(v => ({ value: v, label: opt('pasteBehavior', v) }))
const editorStatsOptions = ['off', 'corner'].map(v => ({ value: v, label: opt('editorStats', v) }))
</script>

<template>
  <section class="panel settings-editor-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.editor') }}</h2>
        <p class="panel-sub">{{ t('settings.editor.description') }}</p>
      </div>
    </header>

    <div class="panel-body">
      <div class="preview-card">
        <div class="preview-label">{{ t('settings.editor.preview.label') }}</div>
        <h3 class="preview-heading">{{ t('settings.editor.preview.heading') }}</h3>
        <p class="preview-body" :style="{ fontSize: `${settings.appearance.editorFontSize}px` }">
          {{ t('settings.editor.preview.body') }}
        </p>
      </div>

      <!-- Layout -->
      <div class="group">
        <div class="group-label">{{ t('settings.editor.groups.layout') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.documentWidth.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.documentWidth.panelDescription') }}</div>
            </div>
            <NvSelect
              :model-value="settings.appearance.editorLineWidth"
              :options="lineWidthOptions"
              @update:model-value="v => u(d => { d.appearance.editorLineWidth = v as any })"
            />
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.fontSize.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.fontSize.panelDescription') }}</div>
            </div>
            <div class="slider-wrap">
              <input class="ui-range" :value="settings.appearance.editorFontSize" min="12" max="22" type="range" @input="u(d => { d.appearance.editorFontSize = Number(($event.target as HTMLInputElement).value) })">
              <span class="slider-value">{{ settings.appearance.editorFontSize }} px</span>
            </div>
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.appearance.editorFont.title') }}</div>
              <div class="row-sub">{{ t('settings.appearance.editorFont.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.appearance.editorFontFamily"
              :options="fontOptions"
              :min-width="200"
              @update:model-value="u(d => { d.appearance.editorFontFamily = $event })"
            />
          </div>
        </div>
      </div>

      <!-- Focus & Flow -->
      <div class="group">
        <div class="group-label">{{ t('settings.editor.groups.focusFlow') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.focusMode.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.focusMode.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.editor.focusMode"
              :options="focusModeOptions"
              @update:model-value="v => u(d => { d.editor.focusMode = v as any })"
            />
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.typewriterScrolling.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.typewriterScrolling.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.editor.typewriterScrolling"
              @update:model-value="v => u(d => { d.editor.typewriterScrolling = v })"
            />
          </div>
          <div class="settings-row settings-row--border" :class="{ 'settings-row--muted': !settings.editor.typewriterScrolling }">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.typewriterPosition.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.typewriterPosition.description') }}</div>
            </div>
            <NvSelect
              :disabled="!settings.editor.typewriterScrolling"
              :model-value="settings.editor.typewriterPosition"
              :options="typewriterPositionOptions"
              @update:model-value="v => u(d => { d.editor.typewriterPosition = v as any })"
            />
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.activeBlockEmphasis.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.activeBlockEmphasis.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.editor.activeBlockEmphasis"
              @update:model-value="v => u(d => { d.editor.activeBlockEmphasis = v })"
            />
          </div>
        </div>
      </div>

      <!-- Behaviour -->
      <div class="group">
        <div class="group-label">{{ t('settings.editor.groups.behaviour') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.slashCommands.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.slashCommands.panelDescription') }}</div>
            </div>
            <NvToggle
              :model-value="settings.editor.slashCommands"
              @update:model-value="v => u(d => { d.editor.slashCommands = v })"
            />
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.spellcheck.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.spellcheck.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.editor.spellCheck"
              @update:model-value="v => u(d => { d.editor.spellCheck = v })"
            />
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.smoothScrolling.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.smoothScrolling.panelDescription') }}</div>
            </div>
            <NvToggle
              :model-value="settings.editor.smoothScrolling"
              @update:model-value="v => u(d => { d.editor.smoothScrolling = v })"
            />
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.markdownShortcuts.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.markdownShortcuts.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.editor.markdownShortcuts"
              @update:model-value="v => u(d => { d.editor.markdownShortcuts = v })"
            />
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.caretAnimation.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.caretAnimation.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.editor.caretAnimation"
              :options="caretAnimationOptions"
              @update:model-value="v => u(d => { d.editor.caretAnimation = v as any })"
            />
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.tabKeyBehavior.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.tabKeyBehavior.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.editor.tabKeyBehavior"
              :options="tabKeyBehaviorOptions"
              @update:model-value="v => u(d => { d.editor.tabKeyBehavior = v as any })"
            />
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.autosavePolicy.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.autosavePolicy.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.editor.autosavePolicy"
              :options="autosavePolicyOptions"
              @update:model-value="v => u(d => { d.editor.autosavePolicy = v as any })"
            />
          </div>
        </div>
      </div>

      <!-- Workflow -->
      <div class="group">
        <div class="group-label">{{ t('settings.editor.groups.workflow') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.pasteBehavior.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.pasteBehavior.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.editor.pasteBehavior"
              :options="pasteBehaviorOptions"
              @update:model-value="v => u(d => { d.editor.pasteBehavior = v as any })"
            />
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.slashMenuHints.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.slashMenuHints.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.editor.slashMenuHints"
              @update:model-value="v => u(d => { d.editor.slashMenuHints = v })"
            />
          </div>
          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.editor.editorStats.title') }}</div>
              <div class="row-sub">{{ t('settings.editor.editorStats.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.editor.editorStatsVisibility"
              :options="editorStatsOptions"
              @update:model-value="v => u(d => { d.editor.editorStatsVisibility = v as any })"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
