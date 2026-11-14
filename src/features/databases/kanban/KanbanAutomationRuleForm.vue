<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { KanbanAutomation, KanbanBoard } from '../../../types/kanban'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import { createKanbanId, getBoardColumns, localizeDefaultKanbanLabel } from './kanbanFields'

const props = defineProps<{ board: KanbanBoard }>()
const emit = defineEmits<{
  save: [automation: KanbanAutomation]
  cancel: []
}>()
const { t } = useI18n()

const columns = computed(() =>
  getBoardColumns(props.board).map(option => ({ value: option.id, label: localizeDefaultKanbanLabel(option.name, key => t(key)) })))
const triggerOptions = computed(() => [
  { value: 'status_change', label: t('kanban.automations.form.triggerStatusChange') },
  { value: 'subtasks_done', label: t('kanban.automations.form.triggerSubtasksDone') },
])
const actionOptions = computed(() => [
  { value: 'move_to', label: t('kanban.automations.form.actionMoveTo') },
  { value: 'add_tag', label: t('kanban.automations.form.actionAddTag') },
  { value: 'set_progress', label: t('kanban.automations.form.actionSetProgress') },
])

const trigger = ref<string>('status_change')
const triggerColumn = ref(columns.value[0]?.value ?? '')
const action = ref<string>('move_to')
// Default to a different column than the trigger so the first rule does something.
const actionColumn = ref(columns.value.at(-1)?.value ?? '')
const tag = ref('')
const firstSelect = ref<{ focus: () => void } | null>(null)

const valid = computed(() =>
  (trigger.value !== 'status_change' || !!triggerColumn.value)
  && (action.value !== 'move_to' || !!actionColumn.value)
  && (action.value !== 'add_tag' || !!tag.value.trim()))

function submit() {
  if (!valid.value) return
  emit('save', {
    id: createKanbanId(),
    trigger: trigger.value as KanbanAutomation['trigger'],
    ...(trigger.value === 'status_change' ? { triggerValue: triggerColumn.value } : {}),
    action: action.value as KanbanAutomation['action'],
    ...(action.value === 'move_to' ? { actionValue: actionColumn.value } : {}),
    ...(action.value === 'add_tag' ? { actionValue: tag.value.trim() } : {}),
    enabled: true,
  })
}

onMounted(() => firstSelect.value?.focus())
</script>

<template>
  <form class="ka-form tw:flex tw:flex-col tw:gap-3 tw:px-3.5 tw:py-3" @submit.prevent="submit" @keydown.esc.stop="emit('cancel')">
    <div class="tw:flex tw:flex-wrap tw:items-end tw:gap-3">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <span class="tw:text-[10.5px] tw:font-semibold tw:text-content-muted">{{ t('kanban.automations.form.trigger') }}</span>
        <NvSelect ref="firstSelect" v-model="trigger" :options="triggerOptions" :aria-label="t('kanban.automations.form.trigger')" :min-width="170" />
      </div>
      <div v-if="trigger === 'status_change'" class="tw:flex tw:flex-col tw:gap-1">
        <span class="tw:text-[10.5px] tw:font-semibold tw:text-content-muted">{{ t('kanban.automations.form.column') }}</span>
        <NvSelect v-model="triggerColumn" :options="columns" :aria-label="t('kanban.automations.form.triggerColumn')" :min-width="140" />
      </div>
    </div>
    <div class="tw:flex tw:flex-wrap tw:items-end tw:gap-3">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <span class="tw:text-[10.5px] tw:font-semibold tw:text-content-muted">{{ t('kanban.automations.form.action') }}</span>
        <NvSelect v-model="action" :options="actionOptions" :aria-label="t('kanban.automations.form.action')" :min-width="170" />
      </div>
      <div v-if="action === 'move_to'" class="tw:flex tw:flex-col tw:gap-1">
        <span class="tw:text-[10.5px] tw:font-semibold tw:text-content-muted">{{ t('kanban.automations.form.column') }}</span>
        <NvSelect v-model="actionColumn" :options="columns" :aria-label="t('kanban.automations.form.actionColumn')" :min-width="140" />
      </div>
      <label v-else-if="action === 'add_tag'" class="tw:flex tw:flex-col tw:gap-1">
        <span class="tw:text-[10.5px] tw:font-semibold tw:text-content-muted">{{ t('kanban.automations.form.tag') }}</span>
        <input v-model="tag" type="text" required class="ka-form__tag tw:h-8 tw:rounded-lg tw:border-0 tw:bg-(--input-bg) tw:px-2.5 tw:text-[12.5px] tw:text-content-primary tw:focus-visible:outline-2 tw:focus-visible:outline-focus-ring" :placeholder="t('kanban.automations.form.tagPlaceholder')">
      </label>
    </div>
    <div class="tw:flex tw:gap-1.5">
      <button type="submit" class="nv-btn nv-btn--primary" :disabled="!valid">{{ t('kanban.automations.form.save') }}</button>
      <button type="button" class="nv-btn" @click="emit('cancel')">{{ t('kanban.automations.form.cancel') }}</button>
    </div>
  </form>
</template>
