<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { RotateCcw } from 'lucide-vue-next'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'
import SettingsGroup from './ui/SettingsGroup.vue'
import SettingsRow from './ui/SettingsRow.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useOnboardingStore } from '../../../stores/onboarding'
import type { AppLocale, WorkspaceView } from '../../../types/workspace'
import { useTreeStore } from '../../../stores/tree'

const { t } = useI18n()
const router = useRouter()
const workspaceStore = useWorkspaceStore()
const treeStore = useTreeStore()
const onboardingStore = useOnboardingStore()
const { settings, appConfig } = storeToRefs(workspaceStore)

// Leaves the settings screen first so the tour's sidebar/Home targets are on
// screen by the time the welcome card's "Start" button reveals a spotlight step.
async function takeTourAgain() {
  await router.push('/workspace')
  onboardingStore.startTour()
}

const languageOptions = computed<Array<{ value: AppLocale; label: string }>>(() => [
  { value: 'ru', label: t('settings.options.language.ru') },
  { value: 'en', label: t('settings.options.language.en') },
  { value: 'fr', label: t('settings.options.language.fr') },
  { value: 'es', label: t('settings.options.language.es') },
  { value: 'de', label: t('settings.options.language.de') },
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
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-general-panel">
    <SettingsSectionHeader
      :title="t('settings.sections.general')"
      :description="t('settings.general.description')"
    />

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <SettingsGroup :title="t('settings.general.groups.application')">
        <SettingsRow
          :title="t('settings.general.language.title')"
          :description="t('settings.general.language.description')"
        >
          <NvSelect
            :model-value="appConfig.locale"
            :options="languageOptions"
            :min-width="140"
            @update:model-value="workspaceStore.setAppLocale($event as AppLocale)"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.general.deleteConfirmations.title')"
          :description="t('settings.general.deleteConfirmations.panelDescription')"
        >
          <NvToggle
            :aria-label="t('settings.general.deleteConfirmations.title')"
            :model-value="settings.general.confirmBeforeDelete"
            @update:model-value="v => workspaceStore.updateSettings(draft => { draft.general.confirmBeforeDelete = v })"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="t('settings.general.groups.startup')">
        <SettingsRow
          :title="t('settings.general.startupView.title')"
          :description="t('settings.general.startupView.description')"
        >
          <NvSelect
            :model-value="settings.general.defaultStartupView"
            :options="startupViewOptions"
            :min-width="140"
            @update:model-value="v => workspaceStore.updateSettings(draft => { draft.general.defaultStartupView = v as WorkspaceView })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.general.restoreLastContext.title')"
          :description="t('settings.general.restoreLastContext.description')"
        >
          <NvToggle
            :aria-label="t('settings.general.restoreLastContext.title')"
            :model-value="settings.general.restoreLastContext"
            @update:model-value="v => workspaceStore.updateSettings(draft => { draft.general.restoreLastContext = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.general.startupNote.title')"
          :description="t('settings.general.startupNote.description')"
          :disabled="settings.general.defaultStartupView !== 'specific-note'"
        >
          <NvSelect
            :model-value="settings.general.startupNoteId || ''"
            :options="noteOptions"
            :min-width="140"
            :disabled="settings.general.defaultStartupView !== 'specific-note'"
            :placeholder="t('settings.general.startupNote.placeholder')"
            @update:model-value="v => workspaceStore.updateSettings(draft => { draft.general.startupNoteId = v as string || null })"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="t('settings.general.groups.onboarding')">
        <SettingsRow
          :title="t('settings.general.productTour.title')"
          :description="t('settings.general.productTour.description')"
        >
          <button type="button" class="nv-btn nv-btn--ghost" @click="takeTourAgain">
            <RotateCcw :size="14" aria-hidden="true" />
            {{ t('settings.general.productTour.takeAgain') }}
          </button>
        </SettingsRow>

        <SettingsRow
          :title="t('settings.general.firstStepsOnHome.title')"
          :description="t('settings.general.firstStepsOnHome.description')"
        >
          <NvToggle
            :aria-label="t('settings.general.firstStepsOnHome.title')"
            :model-value="!appConfig.onboarding.firstStepsHidden"
            @update:model-value="v => onboardingStore.setFirstStepsHidden(!v)"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.general.firstUseHints.title')"
          :description="t('settings.general.firstUseHints.description')"
        >
          <NvToggle
            :aria-label="t('settings.general.firstUseHints.title')"
            :model-value="appConfig.onboarding.hintsEnabled"
            @update:model-value="v => onboardingStore.setHintsEnabled(v)"
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  </section>
</template>
