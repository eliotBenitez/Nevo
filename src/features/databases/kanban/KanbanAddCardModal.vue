<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { KanbanBoard } from '../../../types/kanban'
import NvModal from '../../../ui/primitives/NvModal.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import { getBoardColumns, localizeDefaultKanbanLabel } from './kanbanFields'

interface Props {
  board: KanbanBoard
  defaultColumnId?: string
  defaultTemplateId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'confirm': [title: string, columnId: string, templateId?: string]
  'close': []
}>()

const { t } = useI18n()

const title = ref('')

const columnOptions = computed(() =>
  getBoardColumns(props.board).map(opt => ({ value: opt.id, label: localizeDefaultKanbanLabel(opt.name, key => t(key)) }))
)

const selectedColumnId = ref(
  props.defaultColumnId ?? columnOptions.value[0]?.value ?? ''
)

const templateOptions = computed(() => [
  { value: '', label: t('kanban.modal.noTemplate') },
  ...(props.board.templates ?? []).map(template => ({ value: template.id, label: `${template.icon} ${template.name}`.trim() })),
])
const selectedTemplateId = ref(
  (props.board.templates ?? []).some(template => template.id === props.defaultTemplateId) ? props.defaultTemplateId! : ''
)
const selectedTemplate = computed(() => (props.board.templates ?? []).find(template => template.id === selectedTemplateId.value))
// A selected template can name the card, so the title is only required without one.
const resolvedTitle = computed(() => title.value.trim() || selectedTemplate.value?.name || '')

function confirm() {
  if (!resolvedTitle.value || !selectedColumnId.value) return
  emit('confirm', resolvedTitle.value, selectedColumnId.value, selectedTemplateId.value || undefined)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); confirm() }
}
</script>

<template>
  <NvModal :open="true" size="sm" :title="t('kanban.modal.addCardTitle')" @close="emit('close')">
    <div class="kadd-body tw:flex tw:flex-col tw:gap-3">
      <!-- Title input -->
      <input
        v-model="title"
        type="text"
        class="kadd-title-input tw:box-border tw:w-full tw:h-9 tw:px-2.5 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-content-primary tw:text-sm tw:outline-none tw:transition-colors tw:duration-[120ms] tw:focus:border-accent tw:placeholder:text-content-muted"
        :placeholder="selectedTemplate?.name ?? t('kanban.modal.titlePlaceholder')"
        autofocus
        @keydown="onKeydown"
      />

      <!-- Column picker -->
      <div v-if="columnOptions.length > 1" class="kadd-field tw:flex tw:flex-col tw:gap-[5px]">
        <label class="kadd-field__label tw:text-[11px] tw:font-semibold tw:tracking-[0.05em] tw:text-content-muted tw:uppercase">{{ t('kanban.modal.column') }}</label>
        <NvSelect
          :model-value="selectedColumnId"
          :options="columnOptions"
          :min-width="'100%'"
          @update:model-value="selectedColumnId = $event"
        />
      </div>

      <!-- Template picker -->
      <div v-if="board.templates?.length" class="kadd-field tw:flex tw:flex-col tw:gap-[5px]">
        <span class="kadd-field__label tw:text-[11px] tw:font-semibold tw:tracking-[0.05em] tw:text-content-muted tw:uppercase">{{ t('kanban.modal.template') }}</span>
        <NvSelect
          v-model="selectedTemplateId"
          :options="templateOptions"
          :min-width="'100%'"
          :aria-label="t('kanban.modal.template')"
        />
      </div>
    </div>

    <template #footer>
      <button
        type="button"
        class="kadd-btn tw:inline-flex tw:h-[30px] tw:items-center tw:gap-[5px] tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-3 tw:text-[12.5px] tw:text-content-secondary tw:cursor-pointer tw:transition-colors tw:duration-100 tw:hover:bg-[var(--hover-strong,var(--surface-overlay))]"
        @click="emit('close')"
      >
        {{ t('kanban.common.cancel') }}
      </button>
      <button
        type="button"
        class="kadd-btn kadd-btn--primary tw:inline-flex tw:h-[30px] tw:items-center tw:gap-[5px] tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-accent tw:px-3 tw:text-[12.5px] tw:text-white tw:cursor-pointer tw:transition-opacity tw:duration-100 tw:hover:opacity-88 tw:disabled:cursor-not-allowed tw:disabled:opacity-45"
        :disabled="!resolvedTitle"
        @click="confirm"
      >
        {{ t('kanban.modal.add') }}
      </button>
    </template>
  </NvModal>
</template>
