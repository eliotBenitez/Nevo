<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Zap } from 'lucide-vue-next'
import type { KanbanBoard } from '../../../types/kanban'

interface Props {
  board: KanbanBoard
}

const props = defineProps<Props>()
const { t } = useI18n()

const boardAutomations = computed(() =>
  (props.board.automations ?? []).filter(automation => automation.enabled).slice(0, 3)
)

function formatTrigger(automation: { trigger: string; triggerValue?: string }): string {
  if (automation.trigger === 'subtasks_done') return t('kanban.automations.trigger.subtasksDone')
  if (automation.trigger === 'status_change') return t('kanban.automations.trigger.statusChange', { value: automation.triggerValue ?? '?' })
  if (automation.trigger === 'due_date_near') return t('kanban.automations.trigger.dueDateNear')
  return automation.trigger
}

function formatAction(automation: { action: string; actionValue?: string }): string {
  if (automation.action === 'move_to') return t('kanban.automations.action.moveTo', { value: automation.actionValue ?? '?' })
  if (automation.action === 'set_progress') return t('kanban.automations.action.setProgress')
  if (automation.action === 'add_tag') return t('kanban.automations.action.addTag', { value: automation.actionValue ?? 'urgent' })
  if (automation.action === 'notify') return t('kanban.automations.action.notify')
  return automation.action
}
</script>

<template>
  <div v-if="boardAutomations.length" class="km-auto-section">
    <div class="km-props__header">{{ t('kanban.card.automation') }}</div>
    <div v-for="auto in boardAutomations" :key="auto.id" class="km-auto-row">
      <Zap :size="11" class="km-auto-icon" />
      <span class="km-auto-text">
        {{ t('kanban.automations.triggerPrefix') }} <strong>{{ formatTrigger(auto) }}</strong>
        <span class="km-auto-then"> → </span>
        {{ formatAction(auto) }}
      </span>
    </div>
  </div>
</template>
