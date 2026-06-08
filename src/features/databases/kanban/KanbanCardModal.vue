<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { confirm } from '@tauri-apps/plugin-dialog'
import { useI18n } from 'vue-i18n'
import { Trash2, X, Zap, Plus, Link } from 'lucide-vue-next'
import type { KanbanBoard, KanbanCard, KanbanCardPriority, KanbanPropertyType } from '../../../types/kanban'
import { useKanbanStore } from '../../../stores/kanban'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvCheckbox from '../../../ui/primitives/NvCheckbox.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvDatePicker from '../../../ui/primitives/NvDatePicker.vue'
import NvMiniEditor from '../../../ui/primitives/NvMiniEditor.vue'
import NvNumberInput from '../../../ui/primitives/NvNumberInput.vue'
import type { NvMenuItemDef } from '../../../ui/primitives/menu-types'
import {
  getBoardStatusProperty,
  getCardStatusValue,
  serializeCardProperties,
  computeTaskProgress,
} from './kanbanFields'
import { useCardFieldsEditor } from './composables/useCardFieldsEditor'

interface Props {
  card: KanbanCard
  board: KanbanBoard
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'close': [] }>()

const { t, locale } = useI18n()
const kanbanStore = useKanbanStore()

const localTitle = ref(props.card.title)
const localContent = ref<unknown>(props.card.content ?? { type: 'doc', content: [] })
const {
  localFields,
  resetFields,
  numberFieldModelValue,
  numberFieldIsNull,
  updateNumberFieldValue,
  clearNumberFieldValue,
  createField,
  updateFieldType,
  updateFieldValue,
  updateFieldName,
  removeField,
  addFieldOption,
  updateFieldOption,
  removeFieldOption,
  toggleMultiSelect,
  selectOptions,
  optionLabel,
  hasFieldOptions,
} = useCardFieldsEditor(props.card, markDirty)
const localStatusValue = ref(getCardStatusValue(props.card, props.board))
const localEstimate = ref(props.card.estimate ?? '')
const localSprint = ref(props.card.sprint ?? '')
const localPriority = ref<KanbanCardPriority>(props.card.priority ?? 'none')
const isDirty = ref(false)
const notesDirty = ref(false)
const showLinkPicker = ref(false)
const linkSearch = ref('')
const showFieldMenu = ref(false)
const titleInputRef = ref<HTMLInputElement | null>(null)

watch(() => props.card, card => {
  localTitle.value = card.title
  localContent.value = card.content ?? { type: 'doc', content: [] }
  resetFields(card)
  localStatusValue.value = getCardStatusValue(card, props.board)
  localEstimate.value = card.estimate ?? ''
  localSprint.value = card.sprint ?? ''
  localPriority.value = card.priority ?? 'none'
  isDirty.value = false
  notesDirty.value = false
  showFieldMenu.value = false
})

onMounted(() => {
  setTimeout(() => titleInputRef.value?.focus(), 50)
})

const statusProp = computed(() => getBoardStatusProperty(props.board))
const statusOption = computed(() =>
  statusProp.value?.options?.find(option => option.id === localStatusValue.value) ?? null
)


const taskProgress = computed(() => computeTaskProgress(localContent.value))

const statusPickerOptions = computed(() =>
  statusProp.value?.options?.map(opt => ({
    value: opt.id,
    label: opt.name,
    color: opt.color ?? null,
  })) ?? []
)

const PRIORITY_COLORS: Record<KanbanCardPriority, string | null> = {
  none: null,
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#f97316',
  urgent: '#ef4444',
}

const priorityOptions = computed<{ value: KanbanCardPriority; label: string }[]>(() => [
  { value: 'none', label: t('kanban.card.priorityLevels.none') },
  { value: 'low', label: t('kanban.card.priorityLevels.low') },
  { value: 'medium', label: t('kanban.card.priorityLevels.medium') },
  { value: 'high', label: t('kanban.card.priorityLevels.high') },
  { value: 'urgent', label: t('kanban.card.priorityLevels.urgent') },
])

const fieldTypeOptions = computed<{ value: KanbanPropertyType; label: string }[]>(() => [
  { value: 'text', label: t('kanban.card.fieldTypes.text') },
  { value: 'number', label: t('kanban.card.fieldTypes.number') },
  { value: 'date', label: t('kanban.card.fieldTypes.date') },
  { value: 'checkbox', label: t('kanban.card.fieldTypes.checkbox') },
  { value: 'select', label: t('kanban.card.fieldTypes.select') },
  { value: 'multi_select', label: t('kanban.card.fieldTypes.multiSelect') },
])

const fieldTypeMenuItems = computed<NvMenuItemDef[]>(() =>
  fieldTypeOptions.value.map(option => ({
    label: option.label,
    action: () => createFieldFromMenu(option.value),
  })),
)

const linkedCards = computed(() =>
  (props.card.links ?? []).map(link => {
    const cards = kanbanStore.cards.get(props.board.id) ?? []
    const target = cards.find(card => card.id === link.cardId)
    return { ...link, title: target?.title ?? t('kanban.card.unknownCard'), found: !!target }
  })
)

const boardAutomations = computed(() =>
  (props.board.automations ?? []).filter(automation => automation.enabled).slice(0, 3)
)

const linkableCards = computed(() => {
  const query = linkSearch.value.toLowerCase()
  const allCards = kanbanStore.cards.get(props.board.id) ?? []
  return allCards
    .filter(card => card.id !== props.card.id && card.title.toLowerCase().includes(query))
    .slice(0, 8)
})

function markDirty() {
  isDirty.value = true
}

function markNotesDirty() {
  isDirty.value = true
  notesDirty.value = true
}

function createFieldFromMenu(type: KanbanPropertyType) {
  createField(type)
  showFieldMenu.value = false
}

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

function pickLink(targetId: string) {
  kanbanStore.linkCards(props.board.id, props.card.id, targetId, 'related')
  showLinkPicker.value = false
  linkSearch.value = ''
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return iso
  return date.toLocaleDateString(locale.value, { month: 'short', day: 'numeric', year: 'numeric' })
}

async function save() {
  await kanbanStore.updateCard(props.board.id, props.card.id, {
    title: localTitle.value,
    content: notesDirty.value ? localContent.value : props.card.content,
    properties: serializeCardProperties(props.board, props.card, localFields.value, localStatusValue.value),
    fields: localFields.value.map((field, index) => ({ ...field, order: index })),
    estimate: localEstimate.value || undefined,
    sprint: localSprint.value || undefined,
    progress: taskProgress.value?.pct,
    priority: localPriority.value !== 'none' ? localPriority.value : undefined,
  })
  isDirty.value = false
  notesDirty.value = false
}

async function handleClose() {
  if (isDirty.value && !await confirm(t('kanban.card.unsavedChanges'))) return
  emit('close')
}

async function deleteCard() {
  if (!await confirm(t('kanban.card.deleteConfirm'))) return
  await kanbanStore.deleteCard(props.board.id, props.card.id)
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void handleClose()
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && isDirty.value) {
    event.preventDefault()
    void save()
  }
}

</script>

<template>
  <Teleport to="body">
    <div class="km-backdrop" @click.self="handleClose">
      <div
        class="km-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="t('kanban.card.dialogLabel')"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <div class="km-header">
          <div class="km-header__left">
            <span
              v-if="statusOption"
              class="km-status"
              :style="statusOption.color ? { background: `${statusOption.color}28`, color: statusOption.color } : {}"
            >
              <span class="km-status__dot" :style="statusOption.color ? { background: statusOption.color } : {}" />
              {{ statusOption.name }}
            </span>
          </div>
          <div class="km-header__right">
            <NvButton
              variant="danger"
              size="xs"
              icon
              class="km-header-btn"
              :title="t('kanban.common.delete')"
              :aria-label="t('kanban.common.delete')"
              @click="deleteCard"
            >
              <Trash2 :size="11" />
            </NvButton>
            <NvButton
              variant="ghost"
              size="xs"
              icon
              class="km-header-btn"
              :aria-label="t('kanban.common.close')"
              @click="handleClose"
            >
              <X :size="13" />
            </NvButton>
          </div>
        </div>

        <div class="km-body">
          <div class="km-content">
            <div class="km-content__inner">
              <input
                ref="titleInputRef"
                v-model="localTitle"
                class="km-title-input"
                :placeholder="t('kanban.card.titlePlaceholder')"
                @input="markDirty"
              />

              <section class="km-section">
                <div class="km-section-label">{{ t('kanban.card.notes') }}</div>
                <NvMiniEditor
                  :model-value="localContent"
                  :placeholder="t('kanban.card.notesPlaceholder')"
                  class="km-notes-editor"
                  @update:model-value="value => { localContent = value; markNotesDirty() }"
                />
              </section>

              <section class="km-section">
                <div class="km-section-label">
                  {{ t('kanban.card.linked') }}
                  <span class="km-section-count">{{ linkedCards.length }}</span>
                </div>
                <div class="km-links">
                  <div v-for="link in linkedCards" :key="link.cardId" class="km-link-row">
                    <span class="km-link-kind">
                      {{ link.kind === 'blocked-by'
                        ? `↘ ${t('kanban.card.blocked')}`
                        : link.kind === 'blocks'
                          ? `↗ ${t('kanban.card.blocks')}`
                          : `↔ ${t('kanban.card.related')}` }}
                    </span>
                    <span class="km-link-title" :class="{ 'km-link-title--missing': !link.found }">
                      {{ link.title }}
                    </span>
                  </div>
                  <div v-if="!linkedCards.length" class="km-links-empty">
                    {{ t('kanban.card.linkedEmpty') }}
                  </div>
                  <NvButton class="km-add-link-btn" variant="ghost" @click="showLinkPicker = !showLinkPicker">
                    <Link :size="10" /> {{ t('kanban.card.linkCard') }}
                  </NvButton>
                  <div v-if="showLinkPicker" class="km-link-picker">
                    <input
                      v-model="linkSearch"
                      class="km-link-search"
                      :placeholder="t('kanban.card.searchCards')"
                      autofocus
                    />
                    <div class="km-link-results">
                      <button
                        v-for="card in linkableCards"
                        :key="card.id"
                        type="button"
                        class="km-link-result"
                        @click="pickLink(card.id)"
                      >
                        {{ card.title || t('kanban.card.untitled') }}
                      </button>
                      <div v-if="!linkableCards.length" class="km-link-empty">{{ t('kanban.card.noCardsFound') }}</div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <aside class="km-props">
            <div class="km-props__inner">
              <div class="km-props__header">{{ t('kanban.card.properties') }}</div>

              <div v-if="statusProp" class="km-prop-col">
                <span class="km-prop-label">{{ statusProp.name }}</span>
                <div class="km-picker">
                  <button
                    v-for="opt in statusPickerOptions"
                    :key="opt.value"
                    type="button"
                    class="km-picker__btn"
                    :class="{ 'is-active': localStatusValue === opt.value }"
                    :style="opt.color && localStatusValue === opt.value
                      ? { background: opt.color + '28', color: opt.color, borderColor: opt.color + '60' }
                      : opt.color ? { borderColor: opt.color + '40' } : {}"
                    @click="localStatusValue = opt.value; markDirty()"
                  >
                    <span
                      class="km-picker__dot"
                      :style="opt.color ? { background: opt.color } : {}"
                    />
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <div class="km-prop-row">
                <span class="km-prop-label">{{ t('kanban.card.estimate') }}</span>
                <input
                  class="km-prop-input"
                  :value="localEstimate"
                  :placeholder="t('kanban.card.estimatePlaceholder')"
                  @input="e => { localEstimate = (e.target as HTMLInputElement).value; markDirty() }"
                />
              </div>

              <div class="km-prop-row">
                <span class="km-prop-label">{{ t('kanban.card.sprint') }}</span>
                <input
                  class="km-prop-input"
                  :value="localSprint"
                  :placeholder="t('kanban.card.sprintPlaceholder')"
                  @input="e => { localSprint = (e.target as HTMLInputElement).value; markDirty() }"
                />
              </div>

              <div class="km-prop-col">
                <span class="km-prop-label">{{ t('kanban.card.priority') }}</span>
                <div class="km-picker">
                  <button
                    v-for="opt in priorityOptions"
                    :key="opt.value"
                    type="button"
                    class="km-picker__btn"
                    :class="{ 'is-active': localPriority === opt.value }"
                    :style="PRIORITY_COLORS[opt.value] && localPriority === opt.value
                      ? { background: PRIORITY_COLORS[opt.value]! + '28', color: PRIORITY_COLORS[opt.value]!, borderColor: PRIORITY_COLORS[opt.value]! + '60' }
                      : {}"
                    @click="localPriority = opt.value; markDirty()"
                  >
                    <span
                      v-if="PRIORITY_COLORS[opt.value]"
                      class="km-picker__dot"
                      :style="{ background: PRIORITY_COLORS[opt.value]! }"
                    />
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <div class="km-prop-row">
                <span class="km-prop-label">{{ t('kanban.card.progress') }}</span>
                <div v-if="taskProgress" class="km-task-progress">
                  <div class="km-task-progress__bar">
                    <div class="km-task-progress__fill" :style="{ width: taskProgress.pct + '%' }" />
                  </div>
                  <span class="km-task-progress__label">
                    {{ t('kanban.card.progressTasks', { done: taskProgress.done, total: taskProgress.total, pct: taskProgress.pct }) }}
                  </span>
                </div>
                <span v-else class="km-task-progress__empty">{{ t('kanban.card.progressNoTasks') }}</span>
              </div>

              <div v-for="field in localFields" :key="field.id" class="km-field-card">
                <div class="km-field-card__header">
                  <input
                    class="km-prop-input km-field-card__name"
                    :value="field.name"
                    :placeholder="t('kanban.card.fieldNamePlaceholder')"
                    @input="updateFieldName(field.id, ($event.target as HTMLInputElement).value)"
                  />
                  <NvSelect
                    :model-value="field.type"
                    :options="fieldTypeOptions"
                    :min-width="112"
                    @update:model-value="value => updateFieldType(field.id, value as KanbanPropertyType)"
                  />
                  <NvButton
                    variant="ghost"
                    size="xs"
                    icon
                    class="km-field-card__delete"
                    :aria-label="t('kanban.common.delete')"
                    @click="removeField(field.id)"
                  >
                    <Trash2 :size="11" />
                  </NvButton>
                </div>

                <div class="km-field-card__body">
                  <input
                    v-if="field.type === 'text'"
                    class="km-prop-input"
                    :value="typeof field.value === 'string' ? field.value : ''"
                    @input="updateFieldValue(field.id, ($event.target as HTMLInputElement).value)"
                  />
                  <div v-else-if="field.type === 'number'" class="km-number-field">
                    <NvNumberInput
                      class="km-number-input"
                      :model-value="numberFieldModelValue(field.id)"
                      @update:model-value="value => updateNumberFieldValue(field.id, value)"
                    />
                    <NvButton
                      variant="ghost"
                      size="xs"
                      class="km-number-clear"
                      :disabled="numberFieldIsNull(field.id)"
                      @click="clearNumberFieldValue(field.id)"
                    >
                      {{ t('kanban.common.clear') }}
                    </NvButton>
                  </div>
                  <NvDatePicker
                    v-else-if="field.type === 'date'"
                    :model-value="typeof field.value === 'string' ? field.value : null"
                    @update:model-value="value => updateFieldValue(field.id, value)"
                  />
                  <NvCheckbox
                    v-else-if="field.type === 'checkbox'"
                    class="km-checkbox-row"
                    :model-value="field.value === true"
                    @update:model-value="value => updateFieldValue(field.id, value)"
                  >
                    {{ t('kanban.card.checkboxLabel') }}
                  </NvCheckbox>
                  <NvSelect
                    v-else-if="field.type === 'select'"
                    :model-value="typeof field.value === 'string' ? field.value : ''"
                    :options="selectOptions(field)"
                    :min-width="'100%'"
                    placeholder="—"
                    @update:model-value="value => updateFieldValue(field.id, value as string)"
                  />
                  <div v-else class="km-prop-multiselect">
                    <NvCheckbox
                      v-for="option in (field.options ?? [])"
                      :key="option.id"
                      class="km-prop-ms-opt"
                      :model-value="Array.isArray(field.value) && field.value.includes(option.id)"
                      @update:model-value="checked => toggleMultiSelect(field, option.id, checked)"
                    >
                      {{ optionLabel(field, option.id) }}
                    </NvCheckbox>
                  </div>
                </div>

                <div v-if="hasFieldOptions(field)" class="km-field-card__options">
                  <div class="km-field-card__options-label">{{ t('kanban.card.fieldOptions') }}</div>
                  <div v-for="option in (field.options ?? [])" :key="option.id" class="km-field-card__option">
                    <input
                      class="km-prop-input"
                      :value="option.name"
                      :placeholder="t('kanban.card.optionPlaceholder')"
                      @input="updateFieldOption(field.id, option.id, ($event.target as HTMLInputElement).value)"
                    />
                    <NvButton
                      variant="ghost"
                      size="xs"
                      icon
                      :aria-label="t('kanban.common.delete')"
                      @click="removeFieldOption(field.id, option.id)"
                    >
                      <Trash2 :size="10" />
                    </NvButton>
                  </div>
                  <NvButton variant="ghost" size="xs" class="km-inline-btn" @click="addFieldOption(field.id)">
                    <Plus :size="10" /> {{ t('kanban.card.addOption') }}
                  </NvButton>
                </div>
              </div>

              <div class="km-field-actions">
                <NvPopupMenu
                  v-model:open="showFieldMenu"
                  :items="fieldTypeMenuItems"
                  placement="auto"
                  :offset="[0, 8]"
                  width="220px"
                >
                  <template #trigger>
                    <NvButton variant="ghost" class="km-add-prop-btn">
                      <Plus :size="10" /> {{ t('kanban.card.addField') }}
                    </NvButton>
                  </template>
                </NvPopupMenu>
              </div>

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

              <div class="km-props__footer">
                <div>{{ t('kanban.card.createdAt') }} {{ formatDate(card.createdAt) }}</div>
                <div>{{ t('kanban.card.updatedAt') }} {{ formatDate(card.updatedAt) }}</div>
              </div>
            </div>
          </aside>
        </div>

        <div class="km-footer">
          <span v-if="isDirty" class="km-footer__hint">{{ t('kanban.card.saveHint') }}</span>
          <div class="km-footer__spacer" />
          <NvButton @click="handleClose">{{ t('kanban.common.cancel') }}</NvButton>
          <NvButton variant="primary" :disabled="!isDirty" @click="save">{{ t('kanban.common.save') }}</NvButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.km-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: oklch(0 0 0 / 0.45);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.km-modal {
  display: flex;
  flex-direction: column;
  width: 1040px;
  max-width: 100%;
  max-height: calc(100vh - 40px);
  background: color-mix(in oklab, var(--glass-3, var(--surface-1)) 94%, transparent);
  border: 1px solid var(--line-strong, var(--border-subtle));
  border-radius: 12px;
  box-shadow:
    0 40px 100px -16px oklch(0 0 0 / 0.55),
    0 0 0 1px oklch(1 0 0 / 0.04) inset;
  overflow: hidden;
}

.km-header,
.km-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  background: color-mix(in oklab, var(--glass-titlebar, var(--surface-2)) 82%, transparent);
  flex-shrink: 0;
}

.km-footer {
  border-bottom: none;
  border-top: 1px solid var(--line-1, var(--border-subtle));
}

.km-header__left,
.km-header__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.km-header__left {
  flex: 1;
  min-width: 0;
}

.km-header-btn {
  flex-shrink: 0;
}

.km-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: var(--hover-strong, var(--surface-2));
}

.km-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.km-footer__hint,
.km-props__footer {
  color: var(--text-3, var(--text-secondary));
  font-size: 11px;
}

.km-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.km-content,
.km-props {
  min-width: 0;
  min-height: 0;
}

.km-content {
  overflow: auto;
}

.km-content__inner {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 100%;
  padding: 24px clamp(20px, 4vw, 34px) 28px;
}

.km-props {
  overflow: auto;
  border-left: 1px solid var(--line-1, var(--border-subtle));
  background: color-mix(in oklab, var(--glass-2, var(--surface-2)) 72%, transparent);
}

.km-props__inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
  padding: 18px 16px 20px;
}

.km-title-input,
.km-prop-input,
.km-link-search {
  width: 100%;
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--glass-3, var(--surface-1));
  color: var(--text-1, var(--text-primary));
  border-radius: 8px;
  outline: none;
  box-sizing: border-box;
}

.km-title-input {
  min-height: 54px;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 30px;
  font-weight: 650;
  line-height: 1.12;
}

.km-title-input:focus {
  box-shadow: none;
}

.km-prop-input,
.km-link-search {
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
}

.km-section {
  min-width: 0;
}

.km-section + .km-section {
  margin-top: 34px;
}

.km-notes-editor {
  width: 100%;
  height: clamp(260px, 38vh, 420px);
  min-height: 260px;
  min-width: 0;
}

.km-section-label,
.km-props__header,
.km-field-card__options-label {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-4, var(--text-muted));
}

.km-section-count {
  margin-left: 6px;
}

.km-links,
.km-link-picker,
.km-auto-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.km-links {
  min-width: 0;
}

.km-link-row,
.km-auto-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2, var(--text-secondary));
}

.km-link-kind {
  flex-shrink: 0;
  color: var(--text-3, var(--text-secondary));
}

.km-link-title--missing,
.km-links-empty,
.km-link-empty {
  color: var(--text-4, var(--text-muted));
}

.km-link-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.km-link-result,
.km-inline-btn {
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--glass-3, var(--surface-1));
  color: var(--text-2, var(--text-secondary));
  border-radius: 8px;
  cursor: pointer;
}

.km-link-result {
  text-align: left;
  padding: 8px 10px;
}

.km-prop-row,
.km-checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.km-prop-row {
  display: grid;
  grid-template-columns: minmax(84px, 104px) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.km-prop-label {
  width: auto;
  font-size: 12px;
  color: var(--text-2, var(--text-secondary));
}

.km-field-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--line-1, var(--border-subtle));
  background: color-mix(in oklab, var(--glass-3, var(--surface-1)) 82%, transparent);
}

.km-field-card__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px 22px;
  align-items: center;
  gap: 8px;
}

.km-field-card__name {
  min-width: 0;
}

.km-field-card__body,
.km-field-card__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.km-field-card__options {
  padding-top: 8px;
  border-top: 1px solid var(--line-1, var(--border-subtle));
}

.km-field-card__option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 22px;
  align-items: center;
  gap: 8px;
}

.km-prop-multiselect {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.km-prop-ms-opt,
.km-checkbox-row {
  font-size: 12px;
  color: var(--text-2, var(--text-secondary));
}

.km-prop-ms-opt {
  width: 100%;
}

.km-prop-col {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.km-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.km-picker__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--line-2, var(--border-subtle));
  background: transparent;
  color: var(--text-2, var(--text-secondary));
  font-size: 11.5px;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}

.km-picker__btn:hover {
  background: var(--hover, var(--surface-1));
}

.km-picker__btn.is-active {
  background: var(--hover-strong, var(--surface-2));
  color: var(--text-1, var(--text-primary));
  border-color: var(--line-strong, var(--border-muted));
  font-weight: 550;
}

.km-picker__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--text-3, currentColor);
}

.km-task-progress {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
}

.km-task-progress__bar {
  height: 5px;
  border-radius: 999px;
  background: var(--line-2, var(--border-subtle));
  overflow: hidden;
}

.km-task-progress__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent, #3b82f6);
  transition: width 0.2s ease;
}

.km-task-progress__label {
  font-size: 11px;
  color: var(--text-3, var(--text-secondary));
}

.km-task-progress__empty {
  font-size: 11px;
  color: var(--text-4, var(--text-muted));
}

.km-number-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.km-number-input {
  width: 100%;
  flex: 1;
  min-width: 0;
}

.km-number-clear {
  flex-shrink: 0;
}

.km-field-actions {
  position: relative;
}

.km-add-prop-btn,
.km-inline-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.km-add-prop-btn {
  width: 100%;
  justify-content: flex-start;
}

.km-add-link-btn,
.km-inline-btn {
  align-self: flex-start;
}

.km-auto-icon {
  color: var(--accent);
}

.km-auto-text {
  font-size: 12px;
  color: var(--text-2, var(--text-secondary));
}

.km-props__footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 8px;
}

.km-footer__spacer {
  flex: 1;
}

@media (max-width: 980px) {
  .km-modal {
    width: 100%;
  }

  .km-body {
    grid-template-columns: 1fr;
  }

  .km-props {
    border-left: none;
    border-top: 1px solid var(--line-1, var(--border-subtle));
  }

  .km-content__inner,
  .km-props__inner {
    padding: 18px 20px 20px;
  }
}

@media (max-width: 720px) {
  .km-backdrop {
    padding: 12px;
  }

  .km-header,
  .km-footer {
    padding: 10px 12px;
    flex-wrap: wrap;
  }

  .km-header__right {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .km-content__inner,
  .km-props__inner {
    padding: 16px;
  }

  .km-prop-row,
  .km-field-card__header,
  .km-field-card__option {
    grid-template-columns: 1fr;
  }
}
</style>
