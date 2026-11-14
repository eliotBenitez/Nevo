<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Zap } from '../../../ui/icons'
import type { KanbanBoard } from '../../../types/kanban'
import { formatAutomationAction, formatAutomationTrigger } from './kanbanAutomationLabels'

interface Props {
  board: KanbanBoard
}

const props = defineProps<Props>()
const { t } = useI18n()

const boardAutomations = computed(() =>
  (props.board.automations ?? []).filter(automation => automation.enabled).slice(0, 3)
)
</script>

<template>
  <div v-if="boardAutomations.length" class="km-auto-section tw:flex tw:flex-col tw:gap-2">
    <div class="km-props__header tw:m-0 tw:mb-2.5 tw:text-[11px] tw:font-bold tw:tracking-[0.04em] tw:text-content-muted tw:uppercase">{{ t('kanban.card.automation') }}</div>
    <div v-for="auto in boardAutomations" :key="auto.id" class="km-auto-row tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-content-secondary">
      <Zap :size="11" class="km-auto-icon tw:text-accent" />
      <span class="km-auto-text tw:text-xs tw:text-content-secondary">
        {{ t('kanban.automations.triggerPrefix') }} <strong>{{ formatAutomationTrigger(board, auto, t) }}</strong>
        <span class="km-auto-then"> → </span>
        {{ formatAutomationAction(board, auto, t) }}
      </span>
    </div>
  </div>
</template>
