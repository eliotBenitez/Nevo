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
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'confirm': [title: string, columnId: string]
  'close': []
}>()

const { t } = useI18n()

const title = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

const columnOptions = computed(() =>
  getBoardColumns(props.board).map(opt => ({ value: opt.id, label: localizeDefaultKanbanLabel(opt.name, key => t(key)) }))
)

const selectedColumnId = ref(
  props.defaultColumnId ?? columnOptions.value[0]?.value ?? ''
)

function confirm() {
  const t = title.value.trim()
  if (!t || !selectedColumnId.value) return
  emit('confirm', t, selectedColumnId.value)
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
        ref="titleInputRef"
        v-model="title"
        type="text"
        class="kadd-title-input tw:box-border tw:w-full tw:h-9 tw:px-2.5 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-content-primary tw:text-sm tw:outline-none tw:transition-colors tw:duration-[120ms] tw:focus:border-accent tw:placeholder:text-content-muted"
        :placeholder="t('kanban.modal.titlePlaceholder')"
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
        :disabled="!title.trim()"
        @click="confirm"
      >
        {{ t('kanban.modal.add') }}
      </button>
    </template>
  </NvModal>
</template>
