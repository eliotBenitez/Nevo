<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Zap, Plus } from 'lucide-vue-next'
import type { KanbanBoard, KanbanAutomation, KanbanTemplate } from '../../../types/kanban'
import NvModal from '../../../ui/primitives/NvModal.vue'

interface Props {
  board: KanbanBoard
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'close': []
  'update-automations': [automations: KanbanAutomation[]]
}>()
const { t } = useI18n()

const localAutomations = ref<KanbanAutomation[]>(
  JSON.parse(JSON.stringify(props.board.automations ?? [])) as KanbanAutomation[]
)

const DEFAULT_TEMPLATES = [
  { id: 't1', key: 'engineeringTicket', icon: '✦', shortcut: '⌘1' },
  { id: 't2', key: 'designReview', icon: '◐', shortcut: '⌘2' },
  { id: 't3', key: 'weeklyRetro', icon: '◇', shortcut: '⌘3' },
  { id: 't4', key: 'bugReport', icon: '◑', shortcut: '⌘4' },
]

const templates = computed<KanbanTemplate[]>(() =>
  (props.board.templates ?? []).length
    ? props.board.templates!
    : DEFAULT_TEMPLATES.map(template => ({
      id: template.id,
      icon: template.icon,
      shortcut: template.shortcut,
      name: t(`kanban.automations.templatesData.${template.key}.name`),
      description: t(`kanban.automations.templatesData.${template.key}.description`),
    }))
)

function toggleAutomation(id: string) {
  const a = localAutomations.value.find(a => a.id === id)
  if (a) { a.enabled = !a.enabled; emit('update-automations', localAutomations.value) }
}

function triggerLabel(a: KanbanAutomation): string {
  if (a.trigger === 'subtasks_done') return t('kanban.automations.trigger.subtasksDone')
  if (a.trigger === 'status_change') return t('kanban.automations.trigger.statusChange', { value: a.triggerValue ?? '?' })
  if (a.trigger === 'due_date_near') return t('kanban.automations.trigger.dueDateNear')
  return a.trigger
}

function actionLabel(a: KanbanAutomation): string {
  if (a.action === 'move_to') return t('kanban.automations.action.moveTo', { value: a.actionValue ?? '?' })
  if (a.action === 'set_progress') return t('kanban.automations.action.setProgress')
  if (a.action === 'add_tag') return t('kanban.automations.action.addTag', { value: a.actionValue ?? 'urgent' })
  if (a.action === 'notify') return t('kanban.automations.action.notify')
  return a.action
}

const triggerHue: Record<string, string> = {
  subtasks_done: 'var(--accent)',
  status_change: 'oklch(0.7 0.10 145)',
  due_date_near: 'oklch(0.7 0.13 22)',
}

// Dependency graph nodes for illustration
const depNodes = computed(() => {
  const cards = [] as { id: string; title: string; x: number; y: number; hero?: boolean; blocker?: boolean }[]
  // No real dep data yet — show placeholder
  return cards
})

const selectedTemplate = ref<string | null>(null)
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
          <span class="ka-section__count tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">{{ t('kanban.automations.active', { n: localAutomations.filter(a => a.enabled).length }) }}</span>
          <div class="ka-section__spacer tw:flex-1" />
          <button type="button" class="nv-btn ka-section__action tw:inline-flex tw:h-6 tw:items-center tw:gap-1 tw:px-2 tw:text-[11px] tw:text-[var(--text-muted,var(--text-secondary))]">
            <Plus :size="10" /> {{ t('kanban.automations.newRule') }}
          </button>
        </div>

        <div v-if="!localAutomations.length" class="ka-empty tw:flex tw:flex-col tw:gap-1 tw:px-4 tw:py-6 tw:text-center">
          <div class="ka-empty-title tw:text-[13px] tw:font-[550] tw:text-content-secondary">{{ t('kanban.automations.noAutomations') }}</div>
          <div class="ka-empty-hint tw:mx-auto tw:max-w-[320px] tw:text-[11.5px] tw:leading-[1.5] tw:text-content-muted">{{ t('kanban.automations.noAutomationsHint') }}</div>
        </div>

        <div
          v-for="auto in localAutomations"
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
            <span v-if="auto.runCount" class="ka-rule__runs tw:shrink-0 tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">{{ t('kanban.automations.runCount', { n: auto.runCount }) }}</span>
          </div>
          <!-- Toggle -->
          <div
            class="ka-toggle tw:relative tw:h-[17px] tw:w-[30px] tw:shrink-0 tw:rounded-full tw:cursor-pointer tw:transition-colors tw:duration-200"
            :class="auto.enabled ? 'ka-toggle--on tw:bg-accent' : 'tw:bg-[var(--hover-strong,var(--surface-overlay))]'"
            @click="toggleAutomation(auto.id)"
          >
            <div
              class="ka-toggle__thumb tw:absolute tw:top-0.5 tw:size-[13px] tw:rounded-full tw:bg-white tw:shadow-(--shadow-raised) tw:transition-[left] tw:duration-200"
              :class="auto.enabled ? 'tw:left-[15px]' : 'tw:left-0.5'"
            />
          </div>
        </div>
      </div>

      <!-- Dependency graph section -->
      <div class="ka-section tw:flex tw:flex-col tw:gap-2 tw:overflow-hidden tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle">
        <div class="ka-section__head tw:flex tw:items-center tw:gap-2 tw:bg-[var(--hover,var(--surface-overlay))] tw:px-3.5 tw:py-[11px]">
          <span class="ka-section__title tw:text-[10.5px] tw:font-semibold tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ t('kanban.automations.depGraph') }}</span>
        </div>
        <div class="ka-dep-area tw:flex tw:min-h-20 tw:items-center tw:justify-center">
          <div v-if="!depNodes.length" class="ka-empty ka-empty--compact tw:flex tw:flex-col tw:gap-1 tw:p-4 tw:text-center">
            <div class="ka-empty-title tw:text-[13px] tw:font-[550] tw:text-content-secondary">{{ t('kanban.automations.noDeps') }}</div>
            <div class="ka-empty-hint tw:mx-auto tw:max-w-[320px] tw:text-[11.5px] tw:leading-[1.5] tw:text-content-muted">{{ t('kanban.automations.noDepsHint') }}</div>
          </div>
        </div>
      </div>

      <!-- Templates section -->
      <div class="ka-section tw:flex tw:flex-col tw:gap-2 tw:overflow-hidden tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle">
        <div class="ka-section__head tw:flex tw:items-center tw:gap-2 tw:bg-[var(--hover,var(--surface-overlay))] tw:px-3.5 tw:py-[11px]">
          <span class="ka-section__title tw:text-[10.5px] tw:font-semibold tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ t('kanban.automations.templates') }}</span>
          <div class="ka-section__spacer tw:flex-1" />
          <button type="button" class="nv-btn ka-section__action tw:inline-flex tw:h-6 tw:items-center tw:gap-1 tw:px-2 tw:text-[11px] tw:text-[var(--text-muted,var(--text-secondary))]">
            <Plus :size="10" /> {{ t('kanban.automations.saveAs') }}
          </button>
        </div>

        <div class="ka-templates-grid tw:grid tw:grid-cols-2 tw:gap-2 tw:px-3.5 tw:py-2.5">
          <div
            v-for="tmpl in templates"
            :key="tmpl.id"
            class="ka-template tw:flex tw:items-center tw:gap-2.5 tw:rounded-[calc(9px*var(--radius-scale,1))] tw:border tw:border-solid tw:px-3 tw:py-2.5 tw:cursor-pointer tw:transition-[border-color,background-color] tw:duration-[120ms] tw:hover:border-accent"
            :class="selectedTemplate === tmpl.id
              ? 'ka-template--selected tw:border-[color-mix(in_oklab,var(--accent)_42%,transparent)] tw:bg-[var(--accent-soft,rgb(161_98_7/0.10))]'
              : 'tw:border-transparent tw:bg-surface-subtle'"
            @click="selectedTemplate = tmpl.id"
          >
            <div
              class="ka-template__icon tw:grid tw:size-8 tw:shrink-0 tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:[font-family:var(--font-serif,Georgia,serif)] tw:text-sm tw:italic"
              :class="selectedTemplate === tmpl.id ? 'ka-template__icon--selected tw:bg-accent tw:text-white' : 'tw:bg-[var(--hover-strong,var(--surface-overlay))]'"
            >{{ tmpl.icon }}</div>
            <div class="ka-template__info tw:min-w-0 tw:flex-1">
              <div class="ka-template__name tw:text-[12.5px] tw:font-[550] tw:text-content-primary">{{ tmpl.name }}</div>
              <div class="ka-template__desc tw:mt-0.5 tw:text-[10.5px] tw:text-content-muted">{{ tmpl.description }}</div>
            </div>
            <span v-if="tmpl.shortcut" class="ka-kbd tw:shrink-0 tw:rounded-[calc(4px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-[var(--hover-strong,var(--surface-overlay))] tw:px-1 tw:py-px tw:font-nv-mono tw:text-[10px] tw:text-content-muted">{{ tmpl.shortcut }}</span>
          </div>
        </div>

        <div v-if="selectedTemplate" class="ka-template-action tw:flex tw:gap-1.5 tw:px-3.5 tw:py-2.5">
          <button type="button" class="nv-btn nv-btn--primary">
            <Plus :size="11" /> {{ t('kanban.automations.insertTemplate') }}
          </button>
          <button type="button" class="nv-btn" @click="selectedTemplate = null">
            {{ t('kanban.common.cancel') }}
          </button>
        </div>
      </div>
    </div>
  </NvModal>
</template>
