<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Search } from 'lucide-vue-next'
import { useSettingsHotkeys } from '../../composables/useSettingsHotkeys'
import NvButton from '../../../ui/primitives/NvButton.vue'

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
</script>

<template>
  <section class="panel settings-hotkeys-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.hotkeys') }}</h2>
        <p class="panel-sub">{{ t('settings.hotkeys.description') }}</p>
      </div>
      <NvButton variant="ghost" size="xs" @click="resetAllHotkeys">{{ t('settings.hotkeys.resetAll') }}</NvButton>
    </header>

    <div class="panel-body">
      <div class="search-row">
        <div class="search-field" :class="{ 'search-field--active': hotkeyQuery }">
          <Search :size="12" class="search-icon--accent" />
          <input v-model="hotkeyQuery" class="search-input" :placeholder="t('settings.hotkeys.searchPlaceholder')" />
          <span class="nv-chip">{{ t('settings.hotkeys.matches', { count: filteredHotkeys.length }) }}</span>
        </div>
      </div>

      <div class="shortcuts-table">
        <article
          v-for="binding in filteredHotkeys"
          :key="binding.commandId"
          class="shortcut-row"
          :class="{ 'shortcut-row--focused': capturingBindingId === binding.commandId }"
        >
          <div class="shortcut-row__copy">
            <div class="shortcut-row__title">{{ hotkeyLabel(binding) }}</div>
            <div class="shortcut-row__sub">{{ binding.commandId }} · {{ hotkeyScopeLabel(binding.scope) }}</div>
          </div>
          <span v-if="!isEditableHotkey(binding)" class="nv-chip shortcut-chip">
            {{ t('settings.hotkeys.fixed') }}
          </span>
          <span v-if="hotkeyConflicts[binding.commandId]" class="nv-chip conflict-chip">
            {{ t('settings.hotkeys.conflicts', { count: hotkeyConflicts[binding.commandId].length }) }}
          </span>
          <div class="shortcut-row__actions">
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
              <span v-else class="hotkey-chord">
                <kbd
                  v-for="segment in displayChordSegments(binding.customChord || binding.defaultChord)"
                  :key="`${binding.commandId}-${segment}`"
                  class="nv-kbd hotkey-chord__key"
                >{{ segment }}</kbd>
              </span>
            </button>
            <NvButton variant="ghost" size="xs" icon :disabled="!isEditableHotkey(binding)" @click="resetHotkey(binding.commandId)">×</NvButton>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>
