<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Search } from '@lucide/vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { resolveBindingChord } from '../../../utils/workspace-settings'
import type { SettingsSectionId } from '../../../types/workspace'
import type { SectionMeta } from '../../composables/useSettingsSections'

interface Props {
  sections: SectionMeta[]
  activeSection: SettingsSectionId
  searchQuery: string
}

defineProps<Props>()
const emit = defineEmits<{
  select: [sectionId: SettingsSectionId]
  back: []
  'update:search': [value: string]
}>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { manifest, settings, appMetadata } = storeToRefs(workspaceStore)

const settingsBinding = computed(() =>
  settings.value.hotkeys?.bindings?.find(b => b.commandId === 'app.open-settings'),
)

const shortcutChord = computed(() =>
  settingsBinding.value ? resolveBindingChord(settingsBinding.value) : 'Ctrl+,',
)

const workspaceName = computed(() => manifest.value?.name || t('workspace.noWorkspace'))
</script>

<template>
  <aside class="settings-nav-col tw:flex tw:min-h-0 tw:flex-col tw:gap-px tw:overflow-y-auto tw:px-2 tw:py-[14px] tw:bg-[color-mix(in_oklab,var(--workspace-navigation-surface)_34%,var(--workspace-editor-surface))]">
    <div class="settings-nav-col__head tw:flex tw:flex-col tw:gap-1 tw:px-2 tw:pb-3">
      <button
        type="button"
        class="nv-btn nv-btn--ghost nv-btn--sm settings-nav-col__back-btn tw:mb-1 tw:-ml-2 tw:self-start"
        @click="emit('back')"
      >
        <ArrowLeft :size="14" aria-hidden="true" />
        <span>{{ t('workspace.systemView.backToWorkspace') }}</span>
      </button>
      <b id="workspace-settings-heading" class="settings-nav-col__title tw:text-sm tw:font-semibold tw:text-content-primary">{{ t('settings.title') }}</b>
      <span class="settings-nav-col__meta tw:text-xs tw:text-content-muted">{{ workspaceName }}<span class="settings-nav-col__chord tw:[@media(hover:none)_and_(pointer:coarse)]:hidden"> · {{ shortcutChord }}</span></span>
    </div>

    <div class="settings-nav-col__search tw:mx-1 tw:mb-[10px]">
      <label class="tw:sr-only" for="workspace-settings-search">
        {{ t('settings.search.label') }}
      </label>
      <div class="settings-search-field tw:flex tw:h-[30px] tw:items-center tw:gap-2 tw:rounded-[var(--r-sm,6px)] tw:border tw:border-transparent tw:bg-[var(--input-bg)] tw:px-2 tw:transition-[background,box-shadow] tw:duration-120 tw:focus-within:bg-[var(--surface-raised)] tw:focus-within:shadow-[0_0_0_2px_var(--input-ring)]" :class="{ 'is-active': searchQuery }">
        <Search :size="13" class="settings-search-icon tw:flex-none tw:text-content-muted" aria-hidden="true" />
        <input
          id="workspace-settings-search"
          :value="searchQuery"
          type="search"
          class="settings-search-input tw:min-w-0 tw:flex-1 tw:border-0 tw:bg-transparent tw:font-nv-ui tw:text-[12.5px] tw:font-medium tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted"
          :placeholder="t('settings.search.placeholder')"
          :aria-label="t('settings.search.label')"
          autocomplete="off"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
        >
      </div>
    </div>

    <nav class="settings-nav-col__list tw:flex tw:flex-1 tw:flex-col tw:gap-px" :aria-label="t('settings.navigationLabel')">
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        class="settings-nav-item tw:group tw:flex tw:h-8 tw:w-full tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-transparent tw:bg-transparent tw:px-[10px] tw:text-left tw:text-[13px] tw:text-content-secondary tw:outline-none tw:transition-[background,color] tw:duration-100 tw:hover:bg-[var(--hover)] tw:hover:text-content-primary tw:focus-visible:shadow-[0_0_0_2px_var(--focus-ring)] tw:[&.is-active]:bg-surface-overlay tw:[&.is-active]:font-medium tw:[&.is-active]:text-content-primary tw:[&.is-active]:shadow-[var(--shadow-raised)]"
        :class="{ 'is-active': !searchQuery && activeSection === section.id }"
        :aria-current="!searchQuery && activeSection === section.id ? 'page' : undefined"
        @click="emit('select', section.id)"
      >
        <component :is="section.icon" :size="14" class="settings-nav-item__icon tw:flex-none tw:text-content-muted tw:group-[.is-active]:text-accent" aria-hidden="true" />
        <span class="settings-nav-item__label tw:min-w-0 tw:flex-1 tw:truncate">{{ section.label }}</span>
        <span v-if="section.count" class="settings-nav-item__count tw:flex-none tw:rounded-[10px] tw:bg-surface-subtle tw:px-[6px] tw:py-px tw:font-nv-mono tw:text-[11px] tw:text-content-muted">{{ section.count }}</span>
      </button>
    </nav>

    <div class="settings-nav-col__foot tw:mt-auto tw:px-2 tw:pt-3 tw:pb-1 tw:text-[11.5px] tw:text-content-muted">
      Nevo · v{{ appMetadata?.version ?? '0.1.0' }} · {{ appMetadata?.platform ?? t('settings.common.desktop') }}
    </div>
  </aside>
</template>
