<script setup lang="ts">
import { Columns3 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import type { KanbanFieldDescriptor } from './kanbanFields'

interface Props {
  fields: KanbanFieldDescriptor[]
  selectedFieldIds: string[]
  triggerClass?: string
}

defineProps<Props>()
const showProgress = defineModel<boolean>('showProgress', { required: true })
const emit = defineEmits<{ 'toggle-field': [fieldId: string] }>()
const { t } = useI18n()
</script>

<template>
  <NvPopupMenu placement="bottom-end" width="240px">
    <template #trigger>
      <button type="button" :class="triggerClass">
        <Columns3 :size="12" />
        {{ t('kanban.table.chooseFields') }}
      </button>
    </template>
    <div class="kb-table__field-content tw:flex tw:flex-col tw:gap-1.5 tw:px-0.5 tw:py-1">
      <label class="kb-table__field-option tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-content-secondary">
        <input v-model="showProgress" type="checkbox" />
        <span>{{ t('kanban.card.progress') }}</span>
        <span class="kb-table__field-type tw:ml-auto tw:text-[11px] tw:text-content-muted">progress</span>
      </label>
      <div v-if="fields.length" class="kb-table__field-separator tw:my-1 tw:h-px tw:bg-[var(--border-subtle,var(--border-subtle))]" />
      <label v-for="field in fields" :key="field.id" class="kb-table__field-option tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-content-secondary">
        <input
          type="checkbox"
          :checked="selectedFieldIds.includes(field.id)"
          @change="emit('toggle-field', field.id)"
        />
        <span>{{ field.name }}</span>
        <span class="kb-table__field-type tw:ml-auto tw:text-[11px] tw:text-content-muted">{{ field.type }}</span>
      </label>
      <div v-if="!fields.length" class="kb-table__field-empty tw:ml-auto tw:text-[11px] tw:text-content-muted">
        {{ t('kanban.table.noFields') }}
      </div>
    </div>
  </NvPopupMenu>
</template>
