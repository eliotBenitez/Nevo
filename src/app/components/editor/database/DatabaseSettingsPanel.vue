<script setup lang="ts">
import { Trash2, Upload } from 'lucide-vue-next'
import NvToggle from '../../../../ui/primitives/NvToggle.vue'
import type { DbTableColorScheme, DbViewStyle, DbViewType } from '../../../../types/database-block'

const props = defineProps<{
  style: DbViewStyle
  viewName: string
  t: (key: string) => string
  onRequestDelete: () => void
  onOpenCsvImport: () => void
  viewType: DbViewType
}>()

const emit = defineEmits<{
  'update:style': [style: DbViewStyle]
  'update:viewName': [name: string]
}>()

function patch(next: Partial<DbViewStyle>) {
  emit('update:style', { ...props.style, ...next })
}

function onRename(event: Event) {
  emit('update:viewName', (event.target as HTMLInputElement).value)
}

const COLOR_SCHEMES: DbTableColorScheme[] = ['neutral', 'blue', 'green', 'amber', 'lavender']
</script>

<template>
  <div class="nv-db-settings">
    <div class="nv-db-settings__section">
      <label class="nv-db-settings__label">{{ t('database.settings.renameView') }}</label>
      <input
        class="nv-db-settings__input"
        type="text"
        :value="viewName"
        :placeholder="t('database.view.renamePlaceholder')"
        @input="onRename"
      />
    </div>

    <div v-if="viewType === 'table'" class="nv-db-settings__section">
      <label class="nv-db-settings__label">{{ t('database.settings.rowColorScheme') }}</label>
      <div class="nv-db-settings__scheme-grid" role="radiogroup" :aria-label="t('database.settings.rowColorScheme')">
        <button
          v-for="scheme in COLOR_SCHEMES"
          :key="scheme"
          type="button"
          class="nv-db-settings__scheme"
          :class="[`nv-db-settings__scheme--${scheme}`, { 'is-active': style.rowColorScheme === scheme }]"
          role="radio"
          :aria-checked="style.rowColorScheme === scheme"
          @click="patch({ rowColorScheme: scheme })"
        >
          <span class="nv-db-settings__scheme-preview"><i /><i /><i /></span>
          <span>{{ t(`database.settings.rowColorSchemes.${scheme}`) }}</span>
        </button>
      </div>
    </div>

    <div class="nv-db-settings__section">
      <label class="nv-db-settings__toggle-row">
        <NvToggle size="xs" :model-value="style.gridLines" @update:model-value="patch({ gridLines: $event })" />
        <span>{{ t('database.settings.gridLines') }}</span>
      </label>
      <label class="nv-db-settings__toggle-row">
        <NvToggle size="xs" :model-value="style.stripedRows" @update:model-value="patch({ stripedRows: $event })" />
        <span>{{ t('database.settings.stripedRows') }}</span>
      </label>
      <label class="nv-db-settings__toggle-row">
        <NvToggle size="xs" :model-value="style.compact" @update:model-value="patch({ compact: $event })" />
        <span>{{ t('database.settings.compact') }}</span>
      </label>
      <label class="nv-db-settings__toggle-row">
        <NvToggle size="xs" :model-value="style.showRowNumbers" @update:model-value="patch({ showRowNumbers: $event })" />
        <span>{{ t('database.settings.showRowNumbers') }}</span>
      </label>
    </div>

    <div class="nv-db-settings__section">
      <button type="button" class="nv-db-settings__import" @click="onOpenCsvImport">
        <Upload :size="13" />
        {{ t('database.toolbar.importCsv') }}
      </button>
      <button type="button" class="nv-db-settings__delete" @click="onRequestDelete">
        <Trash2 :size="13" />
        {{ t('database.settings.deleteDatabase') }}
      </button>
    </div>
  </div>
</template>
