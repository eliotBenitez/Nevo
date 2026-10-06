<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { EditorLineWidth, SlashMenuLayout, WorkspaceSettings } from '../../../types/workspace'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'
import SettingsGroup from './ui/SettingsGroup.vue'
import SettingsRow from './ui/SettingsRow.vue'
import { useEditorFontOptions } from '../../composables/useEditorFontOptions'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings } = storeToRefs(workspaceStore)
const u = (fn: (draft: WorkspaceSettings) => void) => workspaceStore.updateSettings(fn)

const fontOptions = useEditorFontOptions()

function opt(key: string, value: string): string {
  return t(`settings.options.${key}.${value}`)
}

const lineWidthOptions = [
  { id: 'narrow' as EditorLineWidth, label: opt('lineWidth', 'narrow') },
  { id: 'medium' as EditorLineWidth, label: opt('lineWidth', 'medium') },
  { id: 'wide' as EditorLineWidth, label: opt('lineWidth', 'wide') },
]

const slashMenuLayoutOptions = [
  { id: 'list' as SlashMenuLayout, label: opt('slashMenuLayout', 'list') },
  { id: 'grid' as SlashMenuLayout, label: opt('slashMenuLayout', 'grid') },
  { id: 'preview' as SlashMenuLayout, label: opt('slashMenuLayout', 'preview') },
]

const focusModeOptions = ['off', 'soft'].map(v => ({ value: v, label: opt('focusMode', v) }))
const typewriterPositionOptions = ['upper', 'center', 'lower'].map(v => ({ value: v, label: opt('typewriterPosition', v) }))
const caretAnimationOptions = ['system', 'steady', 'blink'].map(v => ({ value: v, label: opt('caretAnimation', v) }))
const tabKeyBehaviorOptions = ['indent', 'focus'].map(v => ({ value: v, label: opt('tabKeyBehavior', v) }))
const autosavePolicyOptions = ['immediate', 'window-idle'].map(v => ({ value: v, label: opt('autosavePolicy', v) }))
const pasteBehaviorOptions = ['smart', 'plain-text'].map(v => ({ value: v, label: opt('pasteBehavior', v) }))
const editorStatsOptions = ['off', 'corner'].map(v => ({ value: v, label: opt('editorStats', v) }))
</script>

<template>
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-editor-panel">
    <SettingsSectionHeader
      :title="t('settings.sections.editor')"
      :description="t('settings.editor.description')"
    />

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <!-- Live preview block -->
      <div class="preview-card tw:relative tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:px-6 tw:py-5">
        <div class="preview-label tw:absolute tw:top-3 tw:right-[14px] tw:text-content-muted tw:text-[10px] tw:font-nv-mono tw:tracking-[0.06em] tw:uppercase">{{ t('settings.editor.preview.label') }}</div>
        <h3 class="preview-heading tw:mt-0 tw:mb-2 tw:text-content-primary tw:text-lg tw:font-semibold">{{ t('settings.editor.preview.heading') }}</h3>
        <p class="preview-body tw:m-0 tw:text-content-secondary tw:leading-[1.7]" :style="{ fontSize: `${settings.appearance.editorFontSize}px` }">
          {{ t('settings.editor.preview.body') }}
        </p>
      </div>

      <!-- Layout -->
      <SettingsGroup :title="t('settings.editor.groups.layout')">
        <!-- Width segmented -->
        <SettingsRow
          :title="t('settings.editor.documentWidth.title')"
          :description="t('settings.editor.documentWidth.panelDescription')"
        >
          <div class="segmented" role="group" :aria-label="t('settings.editor.documentWidth.title')">
            <button
              v-for="optItem in lineWidthOptions"
              :key="optItem.id"
              type="button"
              class="segmented__item"
              :class="{ 'is-active': settings.appearance.editorLineWidth === optItem.id }"
              :aria-pressed="settings.appearance.editorLineWidth === optItem.id"
              @click="u(d => { d.appearance.editorLineWidth = optItem.id })"
            >
              {{ optItem.label }}
            </button>
          </div>
        </SettingsRow>

        <!-- Font size range with mono value -->
        <SettingsRow
          :title="t('settings.editor.fontSize.title')"
          :description="t('settings.editor.fontSize.panelDescription')"
        >
          <div class="slider-wrap tw:flex tw:items-center tw:gap-2.5">
            <input
              class="ui-range tw:w-[190px] tw:accent-[var(--accent)]"
              :value="settings.appearance.editorFontSize"
              min="12"
              max="22"
              type="range"
              :aria-label="t('settings.editor.fontSize.title')"
              @input="u(d => { d.appearance.editorFontSize = Number(($event.target as HTMLInputElement).value) })"
            >
            <span class="mono slider-value tw:text-content-muted tw:text-[11.5px] tw:font-nv-mono">{{ settings.appearance.editorFontSize }} px</span>
          </div>
        </SettingsRow>

        <!-- Editor font -->
        <SettingsRow
          :title="t('settings.appearance.editorFont.title')"
          :description="t('settings.appearance.editorFont.description')"
        >
          <NvSelect
            :model-value="settings.appearance.editorFontFamily"
            :options="fontOptions"
            :min-width="200"
            @update:model-value="u(d => { d.appearance.editorFontFamily = $event })"
          />
        </SettingsRow>

        <!-- Colored headings -->
        <SettingsRow
          :title="t('settings.editor.accentColoredHeadings.title')"
          :description="t('settings.editor.accentColoredHeadings.description')"
        >
          <NvToggle
            :aria-label="t('settings.editor.accentColoredHeadings.title')"
            :model-value="settings.appearance.accentColoredHeadings"
            @update:model-value="v => u(d => { d.appearance.accentColoredHeadings = v })"
          />
        </SettingsRow>
      </SettingsGroup>

      <!-- Focus & Flow -->
      <SettingsGroup :title="t('settings.editor.groups.focusFlow')">
        <SettingsRow
          :title="t('settings.editor.focusMode.title')"
          :description="t('settings.editor.focusMode.description')"
        >
          <NvSelect
            :model-value="settings.editor.focusMode"
            :options="focusModeOptions"
            @update:model-value="v => u(d => { d.editor.focusMode = v as any })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.typewriterScrolling.title')"
          :description="t('settings.editor.typewriterScrolling.description')"
        >
          <NvToggle
            :aria-label="t('settings.editor.typewriterScrolling.title')"
            :model-value="settings.editor.typewriterScrolling"
            @update:model-value="v => u(d => { d.editor.typewriterScrolling = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.typewriterPosition.title')"
          :description="t('settings.editor.typewriterPosition.description')"
          :disabled="!settings.editor.typewriterScrolling"
        >
          <NvSelect
            :disabled="!settings.editor.typewriterScrolling"
            :model-value="settings.editor.typewriterPosition"
            :options="typewriterPositionOptions"
            @update:model-value="v => u(d => { d.editor.typewriterPosition = v as any })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.activeBlockEmphasis.title')"
          :description="t('settings.editor.activeBlockEmphasis.description')"
        >
          <NvToggle
            :aria-label="t('settings.editor.activeBlockEmphasis.title')"
            :model-value="settings.editor.activeBlockEmphasis"
            @update:model-value="v => u(d => { d.editor.activeBlockEmphasis = v })"
          />
        </SettingsRow>
      </SettingsGroup>

      <!-- Behaviour -->
      <SettingsGroup :title="t('settings.editor.groups.behaviour')">
        <SettingsRow
          :title="t('settings.editor.slashCommands.title')"
          :description="t('settings.editor.slashCommands.panelDescription')"
        >
          <NvToggle
            :aria-label="t('settings.editor.slashCommands.title')"
            :model-value="settings.editor.slashCommands"
            @update:model-value="v => u(d => { d.editor.slashCommands = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.slashMenuLayout.title')"
          :description="t('settings.editor.slashMenuLayout.description')"
          :disabled="!settings.editor.slashCommands"
        >
          <div class="segmented" role="group" :aria-label="t('settings.editor.slashMenuLayout.title')">
            <button
              v-for="optItem in slashMenuLayoutOptions"
              :key="optItem.id"
              type="button"
              class="segmented__item"
              :class="{ 'is-active': settings.editor.slashMenuLayout === optItem.id }"
              :aria-pressed="settings.editor.slashMenuLayout === optItem.id"
              :disabled="!settings.editor.slashCommands"
              @click="u(d => { d.editor.slashMenuLayout = optItem.id })"
            >
              {{ optItem.label }}
            </button>
          </div>
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.spellcheck.title')"
          :description="t('settings.editor.spellcheck.description')"
        >
          <NvToggle
            :aria-label="t('settings.editor.spellcheck.title')"
            :model-value="settings.editor.spellCheck"
            @update:model-value="v => u(d => { d.editor.spellCheck = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.smoothScrolling.title')"
          :description="t('settings.editor.smoothScrolling.panelDescription')"
        >
          <NvToggle
            :aria-label="t('settings.editor.smoothScrolling.title')"
            :model-value="settings.editor.smoothScrolling"
            @update:model-value="v => u(d => { d.editor.smoothScrolling = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.markdownShortcuts.title')"
          :description="t('settings.editor.markdownShortcuts.description')"
        >
          <NvToggle
            :aria-label="t('settings.editor.markdownShortcuts.title')"
            :model-value="settings.editor.markdownShortcuts"
            @update:model-value="v => u(d => { d.editor.markdownShortcuts = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.caretAnimation.title')"
          :description="t('settings.editor.caretAnimation.description')"
        >
          <NvSelect
            :model-value="settings.editor.caretAnimation"
            :options="caretAnimationOptions"
            @update:model-value="v => u(d => { d.editor.caretAnimation = v as any })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.tabKeyBehavior.title')"
          :description="t('settings.editor.tabKeyBehavior.description')"
        >
          <NvSelect
            :model-value="settings.editor.tabKeyBehavior"
            :options="tabKeyBehaviorOptions"
            @update:model-value="v => u(d => { d.editor.tabKeyBehavior = v as any })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.autosavePolicy.title')"
          :description="t('settings.editor.autosavePolicy.description')"
        >
          <NvSelect
            :model-value="settings.editor.autosavePolicy"
            :options="autosavePolicyOptions"
            @update:model-value="v => u(d => { d.editor.autosavePolicy = v as any })"
          />
        </SettingsRow>
      </SettingsGroup>

      <!-- Workflow -->
      <SettingsGroup :title="t('settings.editor.groups.workflow')">
        <SettingsRow
          :title="t('settings.editor.pasteBehavior.title')"
          :description="t('settings.editor.pasteBehavior.description')"
        >
          <NvSelect
            :model-value="settings.editor.pasteBehavior"
            :options="pasteBehaviorOptions"
            @update:model-value="v => u(d => { d.editor.pasteBehavior = v as any })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.slashMenuHints.title')"
          :description="t('settings.editor.slashMenuHints.description')"
        >
          <NvToggle
            :aria-label="t('settings.editor.slashMenuHints.title')"
            :model-value="settings.editor.slashMenuHints"
            @update:model-value="v => u(d => { d.editor.slashMenuHints = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.editor.editorStats.title')"
          :description="t('settings.editor.editorStats.description')"
        >
          <NvSelect
            :model-value="settings.editor.editorStatsVisibility"
            :options="editorStatsOptions"
            @update:model-value="v => u(d => { d.editor.editorStatsVisibility = v as any })"
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  </section>
</template>
