<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Zap, Plus, Trash2 } from '../../../ui/icons'
import type { KanbanBoard, KanbanAutomation, KanbanCard, KanbanTemplate } from '../../../types/kanban'
import NvModal from '../../../ui/primitives/NvModal.vue'
import KanbanAutomationRuleForm from './KanbanAutomationRuleForm.vue'
import KanbanDependencyList from './KanbanDependencyList.vue'
import KanbanTemplatesSection from './KanbanTemplatesSection.vue'
import { formatAutomationAction, formatAutomationTrigger } from './kanbanAutomationLabels'
import { weeklyRunCount } from './kanbanAutomations'

interface Props {
  board: KanbanBoard
  cards?: KanbanCard[]
  activeCardId?: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'close': []
  'toggle-automation': [id: string, enabled: boolean]
  'add-automation': [automation: KanbanAutomation]
  'delete-automation': [id: string]
  'save-template': [template: KanbanTemplate]
  'delete-template': [id: string]
  'use-template': [id: string]
}>()
const { t } = useI18n()

const automations = computed<KanbanAutomation[]>(() => props.board.automations ?? [])

function toggleAutomation(automation: KanbanAutomation) {
  emit('toggle-automation', automation.id, !automation.enabled)
}

const showForm = ref(false)
const now = new Date()

function triggerLabel(a: KanbanAutomation): string {
  return formatAutomationTrigger(props.board, a, t)
}

function actionLabel(a: KanbanAutomation): string {
  return formatAutomationAction(props.board, a, t)
}

function saveRule(automation: KanbanAutomation) {
  emit('add-automation', automation)
  showForm.value = false
}

const triggerHue: Record<string, string> = {
  subtasks_done: 'var(--accent)',
  status_change: 'oklch(0.7 0.10 145)',
  due_date_near: 'oklch(0.7 0.13 22)',
}
</script>

<template>
  <NvModal :open="true" size="md" labelled-by="ka-automations-title" @close="emit('close')">
    <template #header>
      <Zap :size="14" class="ka-header-icon tw:text-accent" aria-hidden="true" />
      <h2 id="ka-automations-title" class="ka-header-title tw:m-0 tw:text-sm tw:font-semibold tw:text-content-primary">{{ t('kanban.automations.title') }}</h2>
    </template>

    <div class="ka-body tw:flex tw:flex-col tw:gap-6">
      <!-- Automations section -->
      <div class="ka-section tw:flex tw:flex-col tw:gap-2 tw:overflow-hidden tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle">
        <div class="ka-section__head tw:flex tw:items-center tw:gap-2 tw:bg-[var(--hover,var(--surface-overlay))] tw:px-3.5 tw:py-[11px]">
          <span class="ka-section__title tw:text-[10.5px] tw:font-semibold tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ t('kanban.automations.sectionAutomations') }}</span>
          <span class="ka-section__count tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">{{ t('kanban.automations.active', { n: automations.filter(a => a.enabled).length }) }}</span>
          <div class="ka-section__spacer tw:flex-1" />
          <button type="button" class="nv-btn ka-section__action tw:inline-flex tw:h-6 tw:items-center tw:gap-1 tw:px-2 tw:text-[11px] tw:text-[var(--text-muted,var(--text-secondary))]" :aria-expanded="showForm" @click="showForm = !showForm">
            <Plus :size="10" /> {{ t('kanban.automations.newRule') }}
          </button>
        </div>

        <KanbanAutomationRuleForm v-if="showForm" :board="board" :cards="cards" @save="saveRule" @cancel="showForm = false" />

        <div v-if="!automations.length && !showForm" class="ka-empty tw:flex tw:flex-col tw:gap-1 tw:px-4 tw:py-6 tw:text-center">
          <div class="ka-empty-title tw:text-[13px] tw:font-[550] tw:text-content-secondary">{{ t('kanban.automations.noAutomations') }}</div>
          <div class="ka-empty-hint tw:mx-auto tw:max-w-[320px] tw:text-[11.5px] tw:leading-[1.5] tw:text-content-muted">{{ t('kanban.automations.noAutomationsHint') }}</div>
        </div>

        <div
          v-for="auto in automations"
          :key="auto.id"
          class="ka-rule tw:flex tw:items-center tw:gap-3 tw:bg-[var(--hover,var(--surface-raised))] tw:px-3.5 tw:py-[11px] tw:transition-opacity tw:duration-150"
          :class="{ 'ka-rule--off tw:opacity-55': !auto.enabled }"
        >
          <span
            class="ka-rule__dot tw:size-2 tw:shrink-0 tw:rounded-full"
            :style="{ background: auto.enabled ? (triggerHue[auto.trigger] ?? 'var(--accent)') : 'var(--text-muted)', boxShadow: auto.enabled ? `0 0 7px ${triggerHue[auto.trigger] ?? 'var(--accent)'}` : 'none' }"
          />
          <div class="ka-rule__body tw:flex tw:min-w-0 tw:flex-1 tw:flex-wrap tw:items-center tw:gap-3">
            <span class="ka-rule__text tw:text-[13px] tw:leading-[1.4] tw:text-content-secondary">
              {{ t('kanban.automations.triggerPrefix') }} <strong>{{ triggerLabel(auto) }}</strong>
              <span class="ka-rule__then tw:text-content-muted"> → </span>
              {{ actionLabel(auto) }}
            </span>
            <span v-if="weeklyRunCount(auto, now)" class="ka-rule__runs tw:shrink-0 tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">{{ t('kanban.automations.runCount', { n: weeklyRunCount(auto, now) }) }}</span>
          </div>
          <button
            type="button"
            class="ka-rule__delete tw:grid tw:size-7 tw:shrink-0 tw:place-items-center tw:rounded-md tw:border-0 tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:hover:bg-surface-subtle tw:focus-visible:outline-2 tw:focus-visible:outline-focus-ring"
            :aria-label="t('kanban.automations.deleteRule', { rule: `${triggerLabel(auto)} → ${actionLabel(auto)}` })"
            @click="emit('delete-automation', auto.id)"
          >
            <Trash2 :size="13" />
          </button>
          <!-- Toggle -->
          <button
            type="button"
            role="switch"
            :aria-checked="auto.enabled"
            :aria-label="`${triggerLabel(auto)} → ${actionLabel(auto)}`"
            class="ka-toggle tw:relative tw:h-[17px] tw:w-[30px] tw:shrink-0 tw:rounded-full tw:border-none tw:p-0 tw:cursor-pointer tw:transition-colors tw:duration-200"
            :class="auto.enabled ? 'ka-toggle--on tw:bg-accent' : 'tw:bg-[var(--hover-strong,var(--surface-overlay))]'"
            @click="toggleAutomation(auto)"
          >
            <span
              class="ka-toggle__thumb tw:absolute tw:top-0.5 tw:size-[13px] tw:rounded-full tw:bg-white tw:shadow-(--shadow-raised) tw:transition-[left] tw:duration-200"
              :class="auto.enabled ? 'tw:left-[15px]' : 'tw:left-0.5'"
            />
          </button>
        </div>
      </div>

      <KanbanDependencyList :cards="cards ?? []" />

      <KanbanTemplatesSection
        :board="board"
        :cards="cards ?? []"
        :active-card-id="activeCardId"
        @save-template="emit('save-template', $event)"
        @delete-template="emit('delete-template', $event)"
        @use-template="emit('use-template', $event)"
      />
    </div>
  </NvModal>
</template>
