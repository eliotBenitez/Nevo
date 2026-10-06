<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Keyboard, RotateCcw, Search } from '@lucide/vue'
import { useSettingsHotkeys } from '../../composables/useSettingsHotkeys'
import NvButton from '../../../ui/primitives/NvButton.vue'
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'

const { t } = useI18n()
const {
  capturingBindingId,
  hotkeyQuery,
  hotkeyConflicts,
  filteredHotkeys,
  isEditableHotkey,
  hotkeyLabel,
  hotkeyScopeLabel,
  displayChordSegments,
  onHotkeyCapture,
  resetHotkey,
  resetAllHotkeys,
} = useSettingsHotkeys()

const editableHotkeyCount = computed(() => filteredHotkeys.value.filter(binding => isEditableHotkey(binding)).length)
const fixedHotkeyCount = computed(() => filteredHotkeys.value.length - editableHotkeyCount.value)
const conflictCount = computed(() => Object.keys(hotkeyConflicts.value).length)
</script>

<template>
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-hotkeys-panel">
    <SettingsSectionHeader
      :title="t('settings.sections.hotkeys')"
      :description="t('settings.hotkeys.description')"
    >
      <template #actions>
        <div class="panel-summary tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2 tw:max-[980px]:justify-start">
          <span class="panel-summary__item tw:inline-flex tw:min-h-[26px] tw:items-center tw:gap-1.5 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:px-[10px] tw:text-[11.5px] tw:whitespace-nowrap tw:text-content-muted">
            <Keyboard :size="13" aria-hidden="true" />
            <strong class="tw:text-content-primary tw:font-[650]">{{ editableHotkeyCount }}</strong>
            {{ t('settings.hotkeys.editable') }}
          </span>
          <span class="panel-summary__item tw:inline-flex tw:min-h-[26px] tw:items-center tw:gap-1.5 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:px-[10px] tw:text-[11.5px] tw:whitespace-nowrap tw:text-content-muted">
            <strong class="tw:text-content-primary tw:font-[650]">{{ fixedHotkeyCount }}</strong>
            {{ t('settings.hotkeys.fixed') }}
          </span>
          <span
            class="panel-summary__item tw:inline-flex tw:min-h-[26px] tw:items-center tw:gap-1.5 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-transparent tw:px-[10px] tw:text-[11.5px] tw:whitespace-nowrap"
            :class="conflictCount ? 'panel-summary__item--warning tw:border-transparent tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]' : 'tw:bg-surface-subtle tw:text-content-muted'"
          >
            <strong class="tw:text-content-primary tw:font-[650]">{{ conflictCount }}</strong>
            {{ t('settings.hotkeys.conflictSummary') }}
          </span>
          <NvButton variant="ghost" size="xs" @click="resetAllHotkeys">
            <RotateCcw :size="13" />
            {{ t('settings.hotkeys.resetAll') }}
          </NvButton>
        </div>
      </template>
    </SettingsSectionHeader>

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <div class="search-row tw:flex tw:flex-none tw:items-center tw:gap-2.5">
        <label class="tw:sr-only" for="settings-hotkeys-search">{{ t('settings.hotkeys.searchLabel') }}</label>
        <div class="search-field" :class="{ 'search-field--active': hotkeyQuery }">
          <Search :size="12" class="search-icon--accent tw:text-accent" />
          <input
            id="settings-hotkeys-search"
            v-model="hotkeyQuery"
            class="search-input"
            type="search"
            :aria-label="t('settings.hotkeys.searchLabel')"
            :placeholder="t('settings.hotkeys.searchPlaceholder')"
            autocomplete="off"
          >
          <span class="nv-chip">{{ t('settings.hotkeys.matches', { count: filteredHotkeys.length }) }}</span>
        </div>
      </div>

      <div class="shortcuts-table tw:min-h-0 tw:flex-1 tw:overflow-auto tw:overscroll-contain tw:rounded-none tw:border tw:border-transparent tw:bg-transparent tw:[contain:paint]">
        <div class="shortcuts-table__head tw:sticky tw:top-0 tw:z-1 tw:grid tw:grid-cols-[minmax(0,1fr)_auto_minmax(154px,auto)] tw:gap-[14px] tw:border-b-0 tw:bg-[var(--island-bg)] tw:px-[14px] tw:py-[9px] tw:text-content-muted tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.08em] tw:uppercase tw:max-[719px]:hidden" aria-hidden="true">
          <span>{{ t('settings.hotkeys.table.command') }}</span>
          <span>{{ t('settings.hotkeys.table.state') }}</span>
          <span>{{ t('settings.hotkeys.table.shortcut') }}</span>
        </div>
        <article
          v-for="binding in filteredHotkeys"
          :key="binding.commandId"
          class="shortcut-row tw:flex tw:items-center tw:gap-[14px] tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-b-0 tw:px-[14px] tw:py-[10px] tw:max-[719px]:flex-col tw:max-[719px]:items-stretch"
          :class="{ 'shortcut-row--focused': capturingBindingId === binding.commandId }"
        >
          <div class="shortcut-row__copy tw:min-w-0 tw:flex-1">
            <div class="shortcut-row__title tw:text-content-primary tw:text-[13px]">{{ hotkeyLabel(binding) }}</div>
            <div class="shortcut-row__sub tw:mt-0.5 tw:text-content-muted tw:text-[11.5px]">{{ binding.commandId }} · {{ hotkeyScopeLabel(binding.scope) }}</div>
          </div>
          <span v-if="!isEditableHotkey(binding)" class="nv-chip shortcut-chip tw:flex-none tw:text-content-muted">
            {{ t('settings.hotkeys.fixed') }}
          </span>
          <span v-if="hotkeyConflicts[binding.commandId]" class="nv-chip conflict-chip tw:bg-[var(--surface-danger)] tw:text-danger">
            {{ t('settings.hotkeys.conflicts', { count: hotkeyConflicts[binding.commandId].length }) }}
          </span>
          <div class="shortcut-row__actions tw:flex tw:items-center tw:justify-end tw:gap-2 tw:max-[719px]:justify-start">
            <button
              type="button"
              class="hotkey-input"
              :class="{ 'is-capturing': capturingBindingId === binding.commandId, 'is-conflict': hotkeyConflicts[binding.commandId], 'is-fixed': !isEditableHotkey(binding) }"
              :disabled="!isEditableHotkey(binding)"
              @click="capturingBindingId = isEditableHotkey(binding) ? binding.commandId : null"
              @keydown="onHotkeyCapture($event, binding.commandId)"
            >
              <template v-if="capturingBindingId === binding.commandId">
                {{ t('settings.hotkeys.pressKeys') }}
              </template>
              <span v-else class="hotkey-chord tw:inline-flex tw:flex-wrap tw:items-center tw:gap-1.5">
                <kbd
                  v-for="segment in displayChordSegments(binding.customChord || binding.defaultChord)"
                  :key="`${binding.commandId}-${segment}`"
                  class="nv-kbd hotkey-chord__key tw:min-w-[22px] tw:px-[7px]"
                >{{ segment }}</kbd>
              </span>
            </button>
            <NvButton
              variant="ghost"
              size="xs"
              icon
              :disabled="!isEditableHotkey(binding)"
              :aria-label="t('settings.hotkeys.resetOne', { command: hotkeyLabel(binding) })"
              @click="resetHotkey(binding.commandId)"
            >
              <RotateCcw :size="12" />
            </NvButton>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
