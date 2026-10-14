<script setup lang="ts">
import { Trash2, Upload } from '../../../../ui/icons'
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
  <div class="nv-db-settings tw:flex tw:flex-col tw:gap-2.5 tw:p-1.5 tw:min-w-[200px]">
    <div class="nv-db-settings__section tw:flex tw:flex-col tw:gap-1.5 tw:pb-2 tw:last:pb-0">
      <label class="nv-db-settings__label tw:text-[11px] tw:font-semibold tw:text-content-muted tw:uppercase tw:tracking-[.02em]">{{ t('database.settings.renameView') }}</label>
      <input
        class="nv-db-settings__input tw:h-[30px] tw:px-2 tw:py-0 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-content-primary tw:text-[12.5px] tw:outline-none tw:focus:bg-(--surface-raised) tw:focus:shadow-[0_0_0_2px_var(--input-ring)]"
        type="text"
        :value="viewName"
        :placeholder="t('database.view.renamePlaceholder')"
        @input="onRename"
      />
    </div>

    <div v-if="viewType === 'table'" class="nv-db-settings__section tw:flex tw:flex-col tw:gap-1.5 tw:pb-2 tw:last:pb-0">
      <label class="nv-db-settings__label tw:text-[11px] tw:font-semibold tw:text-content-muted tw:uppercase tw:tracking-[.02em]">{{ t('database.settings.rowColorScheme') }}</label>
      <div class="nv-db-settings__scheme-grid tw:grid tw:grid-cols-[repeat(2,minmax(0,1fr))] tw:gap-[5px]" role="radiogroup" :aria-label="t('database.settings.rowColorScheme')">
        <button
          v-for="scheme in COLOR_SCHEMES"
          :key="scheme"
          type="button"
          class="nv-db-settings__scheme tw:flex tw:items-center tw:min-w-0 tw:gap-1.5 tw:h-[29px] tw:px-1.5 tw:py-0 tw:border tw:border-solid tw:rounded-[6px] tw:bg-surface-subtle tw:font-nv-ui tw:text-[10.5px] tw:font-medium tw:cursor-pointer tw:text-left tw:hover:bg-[var(--hover,var(--surface-overlay))]"
          :class="[`nv-db-settings__scheme--${scheme}`, style.rowColorScheme === scheme ? 'is-active tw:border-accent tw:shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_20%,transparent)] tw:text-content-primary' : 'tw:border-transparent tw:text-content-secondary']"
          role="radio"
          :aria-checked="style.rowColorScheme === scheme"
          @click="patch({ rowColorScheme: scheme })"
        >
          <span class="nv-db-settings__scheme-preview"><i /><i /><i /></span>
          <span>{{ t(`database.settings.rowColorSchemes.${scheme}`) }}</span>
        </button>
      </div>
    </div>

    <div class="nv-db-settings__section tw:flex tw:flex-col tw:gap-1.5 tw:pb-2 tw:last:pb-0">
      <label class="nv-db-settings__toggle-row tw:flex tw:items-center tw:gap-2 tw:text-[12.5px] tw:text-content-secondary tw:cursor-pointer">
        <NvToggle size="xs" :model-value="style.gridLines" @update:model-value="patch({ gridLines: $event })" />
        <span>{{ t('database.settings.gridLines') }}</span>
      </label>
      <label class="nv-db-settings__toggle-row tw:flex tw:items-center tw:gap-2 tw:text-[12.5px] tw:text-content-secondary tw:cursor-pointer">
        <NvToggle size="xs" :model-value="style.stripedRows" @update:model-value="patch({ stripedRows: $event })" />
        <span>{{ t('database.settings.stripedRows') }}</span>
      </label>
      <label class="nv-db-settings__toggle-row tw:flex tw:items-center tw:gap-2 tw:text-[12.5px] tw:text-content-secondary tw:cursor-pointer">
        <NvToggle size="xs" :model-value="style.compact" @update:model-value="patch({ compact: $event })" />
        <span>{{ t('database.settings.compact') }}</span>
      </label>
      <label class="nv-db-settings__toggle-row tw:flex tw:items-center tw:gap-2 tw:text-[12.5px] tw:text-content-secondary tw:cursor-pointer">
        <NvToggle size="xs" :model-value="style.showRowNumbers" @update:model-value="patch({ showRowNumbers: $event })" />
        <span>{{ t('database.settings.showRowNumbers') }}</span>
      </label>
    </div>

    <div class="nv-db-settings__section tw:flex tw:flex-col tw:gap-1.5 tw:pb-2 tw:last:pb-0">
      <button type="button" class="nv-db-settings__import tw:inline-flex tw:items-center tw:gap-1.5 tw:h-[30px] tw:px-2.5 tw:py-0 tw:border tw:border-solid tw:border-transparent tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-surface-subtle tw:text-content-secondary tw:text-[12px] tw:font-[550] tw:cursor-pointer tw:hover:border-[color-mix(in_oklab,var(--accent)_42%,var(--border-default,var(--border-subtle)))] tw:hover:text-accent" @click="onOpenCsvImport">
        <Upload :size="13" />
        {{ t('database.toolbar.importCsv') }}
      </button>
      <button type="button" class="nv-db-settings__delete tw:inline-flex tw:items-center tw:gap-1.5 tw:h-[30px] tw:px-2.5 tw:py-0 tw:border tw:border-solid tw:border-[var(--danger-line,transparent)] tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-(--danger-soft) tw:text-danger tw:text-[12px] tw:font-[550] tw:cursor-pointer tw:hover:bg-[color-mix(in_oklab,var(--danger)_20%,transparent)]" @click="onRequestDelete">
        <Trash2 :size="13" />
        {{ t('database.settings.deleteDatabase') }}
      </button>
    </div>
  </div>
</template>
