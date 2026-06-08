<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Zap, Plus, X } from 'lucide-vue-next'
import type { KanbanBoard, KanbanAutomation, KanbanTemplate } from '../../../types/kanban'

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
  <Teleport to="body">
    <div class="ka-backdrop" @click.self="emit('close')">
      <div class="ka-panel" role="dialog" :aria-label="t('kanban.automations.title')">
        <!-- Header -->
        <div class="ka-header">
          <Zap :size="14" class="ka-header-icon" />
          <span class="ka-header-title">{{ t('kanban.automations.title') }}</span>
          <div class="ka-header-spacer" />
          <button type="button" class="nv-btn ka-close-btn" :aria-label="t('kanban.common.close')" @click="emit('close')">
            <X :size="13" />
          </button>
        </div>

        <div class="ka-body">
          <!-- Automations section -->
          <div class="ka-section">
            <div class="ka-section__head">
              <span class="ka-section__title">{{ t('kanban.automations.sectionAutomations') }}</span>
              <span class="ka-section__count">{{ t('kanban.automations.active', { n: localAutomations.filter(a => a.enabled).length }) }}</span>
              <div class="ka-section__spacer" />
              <button type="button" class="nv-btn ka-section__action">
                <Plus :size="10" /> {{ t('kanban.automations.newRule') }}
              </button>
            </div>

            <div v-if="!localAutomations.length" class="ka-empty">
              <div class="ka-empty-title">{{ t('kanban.automations.noAutomations') }}</div>
              <div class="ka-empty-hint">{{ t('kanban.automations.noAutomationsHint') }}</div>
            </div>

            <div
              v-for="auto in localAutomations"
              :key="auto.id"
              class="ka-rule"
              :class="{ 'ka-rule--off': !auto.enabled }"
            >
              <span
                class="ka-rule__dot"
                :style="{ background: auto.enabled ? (triggerHue[auto.trigger] ?? 'var(--accent)') : 'var(--text-4)', boxShadow: auto.enabled ? `0 0 7px ${triggerHue[auto.trigger] ?? 'var(--accent)'}` : 'none' }"
              />
              <div class="ka-rule__body">
                <span class="ka-rule__text">
                  {{ t('kanban.automations.triggerPrefix') }} <strong>{{ triggerLabel(auto) }}</strong>
                  <span class="ka-rule__then"> → </span>
                  {{ actionLabel(auto) }}
                </span>
                <span v-if="auto.runCount" class="ka-rule__runs">{{ t('kanban.automations.runCount', { n: auto.runCount }) }}</span>
              </div>
              <!-- Toggle -->
              <div
                class="ka-toggle"
                :class="{ 'ka-toggle--on': auto.enabled }"
                @click="toggleAutomation(auto.id)"
              >
                <div class="ka-toggle__thumb" />
              </div>
            </div>
          </div>

          <!-- Dependency graph section -->
          <div class="ka-section">
            <div class="ka-section__head">
              <span class="ka-section__title">{{ t('kanban.automations.depGraph') }}</span>
            </div>
            <div class="ka-dep-area">
              <div v-if="!depNodes.length" class="ka-empty ka-empty--compact">
                <div class="ka-empty-title">{{ t('kanban.automations.noDeps') }}</div>
                <div class="ka-empty-hint">{{ t('kanban.automations.noDepsHint') }}</div>
              </div>
            </div>
          </div>

          <!-- Templates section -->
          <div class="ka-section">
            <div class="ka-section__head">
              <span class="ka-section__title">{{ t('kanban.automations.templates') }}</span>
              <div class="ka-section__spacer" />
              <button type="button" class="nv-btn ka-section__action">
                <Plus :size="10" /> {{ t('kanban.automations.saveAs') }}
              </button>
            </div>

            <div class="ka-templates-grid">
              <div
                v-for="tmpl in templates"
                :key="tmpl.id"
                class="ka-template"
                :class="{ 'ka-template--selected': selectedTemplate === tmpl.id }"
                @click="selectedTemplate = tmpl.id"
              >
                <div
                  class="ka-template__icon"
                  :class="{ 'ka-template__icon--selected': selectedTemplate === tmpl.id }"
                >{{ tmpl.icon }}</div>
                <div class="ka-template__info">
                  <div class="ka-template__name">{{ tmpl.name }}</div>
                  <div class="ka-template__desc">{{ tmpl.description }}</div>
                </div>
                <span v-if="tmpl.shortcut" class="ka-kbd">{{ tmpl.shortcut }}</span>
              </div>
            </div>

            <div v-if="selectedTemplate" class="ka-template-action">
              <button type="button" class="nv-btn nv-btn--primary">
                <Plus :size="11" /> {{ t('kanban.automations.insertTemplate') }}
              </button>
              <button type="button" class="nv-btn" @click="selectedTemplate = null">
                {{ t('kanban.common.cancel') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ka-backdrop {
  position: fixed;
  inset: 0;
  z-index: 180;
  background: oklch(0 0 0 / 0.35);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.ka-panel {
  width: 680px;
  max-width: 100%;
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  background: var(--glass-3, var(--surface-1));
  border: 1px solid var(--line-strong, var(--border-subtle));
  border-radius: 14px;
  box-shadow: 0 32px 80px -12px oklch(0 0 0 / 0.5);
  overflow: hidden;
  animation: ka-in 0.16s ease;
}

@keyframes ka-in {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}

.ka-header {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  background: var(--glass-titlebar, var(--surface-2));
  flex-shrink: 0;
}

.ka-header-icon { color: var(--accent); }

.ka-header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1, var(--text-primary));
}

.ka-header-spacer { flex: 1; }

.ka-close-btn { color: var(--text-3, var(--text-secondary)); }

.ka-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Section */
.ka-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--glass-2, var(--surface-1));
  border: 1px solid var(--line-2, var(--border-subtle));
  border-radius: 12px;
  overflow: hidden;
}

.ka-section__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  background: var(--hover, var(--surface-2));
}

.ka-section__title {
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-4, var(--text-muted));
}

.ka-section__count {
  font-size: 10.5px;
  color: var(--text-4, var(--text-muted));
  font-family: var(--font-mono, monospace);
}

.ka-section__spacer { flex: 1; }

.ka-section__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  font-size: 11px;
  color: var(--text-3, var(--text-secondary));
}

/* Empty state */
.ka-empty {
  padding: 24px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ka-empty--compact { padding: 16px; }

.ka-empty-title {
  font-size: 13px;
  font-weight: 550;
  color: var(--text-2, var(--text-secondary));
}

.ka-empty-hint {
  font-size: 11.5px;
  color: var(--text-4, var(--text-muted));
  max-width: 320px;
  margin: 0 auto;
  line-height: 1.5;
}

/* Automation rule row */
.ka-rule {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  background: var(--hover, var(--surface-1));
  transition: opacity 0.15s;
}

.ka-rule:last-of-type { border-bottom: none; }

.ka-rule--off { opacity: 0.55; }

.ka-rule__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ka-rule__body {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ka-rule__text {
  font-size: 13px;
  color: var(--text-2, var(--text-secondary));
  line-height: 1.4;
}

.ka-rule__then { color: var(--text-4, var(--text-muted)); }

.ka-rule__runs {
  font-size: 10.5px;
  color: var(--text-4, var(--text-muted));
  font-family: var(--font-mono, monospace);
  flex-shrink: 0;
}

/* Toggle switch */
.ka-toggle {
  width: 30px;
  height: 17px;
  border-radius: 999px;
  background: var(--hover-strong, var(--surface-2));
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
}

.ka-toggle--on { background: var(--accent); }

.ka-toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px oklch(0 0 0 / 0.25);
  transition: left 0.2s;
}

.ka-toggle--on .ka-toggle__thumb { left: 15px; }

/* Dep area */
.ka-dep-area {
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Templates */
.ka-templates-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 10px 14px;
}

.ka-template {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--glass-3, var(--surface-2));
  border: 1px solid var(--line-1, var(--border-subtle));
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}

.ka-template:hover { border-color: var(--accent); }

.ka-template--selected {
  background: var(--accent-soft, oklch(0.66 0.10 258 / 0.10));
  border-color: oklch(0.66 0.10 258 / 0.35);
}

.ka-template__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--hover-strong, var(--surface-2));
  display: grid;
  place-items: center;
  font-size: 14px;
  flex-shrink: 0;
  font-family: var(--font-serif, Georgia, serif);
  font-style: italic;
}

.ka-template__icon--selected {
  background: var(--accent);
  color: white;
}

.ka-template__info { flex: 1; min-width: 0; }

.ka-template__name {
  font-size: 12.5px;
  font-weight: 550;
  color: var(--text-1, var(--text-primary));
}

.ka-template__desc {
  font-size: 10.5px;
  color: var(--text-4, var(--text-muted));
  margin-top: 2px;
}

.ka-kbd {
  font-size: 10px;
  color: var(--text-4, var(--text-muted));
  background: var(--hover-strong, var(--surface-2));
  border: 1px solid var(--line-2, var(--border-subtle));
  border-radius: 4px;
  padding: 1px 4px;
  font-family: var(--font-mono, monospace);
  flex-shrink: 0;
}

.ka-template-action {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid var(--line-1, var(--border-subtle));
}
</style>
