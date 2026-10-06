<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2, X, Plus } from '@lucide/vue'
import type { KanbanBoard, KanbanCard, KanbanCardField, KanbanCardPriority, KanbanPropertyType } from '../../../types/kanban'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvCheckbox from '../../../ui/primitives/NvCheckbox.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvDatePicker from '../../../ui/primitives/NvDatePicker.vue'
import NvNumberInput from '../../../ui/primitives/NvNumberInput.vue'
import type { NvMenuItemDef } from '../../../ui/primitives/menu-types'
import {
  getBoardStatusProperty,
  createKanbanId,
  localizeDefaultKanbanLabel,
} from './kanbanFields'
import { useCardFieldsEditor } from './composables/useCardFieldsEditor'

interface TaskProgress {
  done: number
  total: number
  pct: number
}

interface Props {
  card: KanbanCard
  board: KanbanBoard
  statusValue: string | null
  taskProgress: TaskProgress | null
  markDirty: () => void
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'update:statusValue': [value: string | null] }>()

const { t } = useI18n()

// Idle vs. active utilities for the status/priority pill pickers are mutually
// exclusive: the active branch must fully replace the idle background/text/
// border/hover set (not layer on top of it), since both live in
// `@layer utilities` at equal specificity and Tailwind's generated order
// does not preserve which one "wins" the way plain CSS source order did.
const PICKER_BTN_BASE = 'tw:inline-flex tw:items-center tw:gap-[5px] tw:h-8 tw:px-3 tw:rounded-full tw:border tw:border-solid tw:text-[11.5px] tw:cursor-pointer tw:transition-[background-color,border-color,color,transform] tw:duration-100 tw:active:scale-[0.98] tw:max-[720px]:h-11 tw:max-[720px]:touch-manipulation'
const PICKER_BTN_IDLE = 'tw:border-transparent tw:bg-(--surface-raised) tw:text-content-secondary tw:hover:bg-(--surface-overlay)'
const PICKER_BTN_ACTIVE = 'is-active tw:border-transparent tw:bg-(--surface-selected) tw:text-content-primary tw:font-[550] tw:shadow-[inset_0_0_0_1px_var(--accent-line)]'
function pickerBtnClass(active: boolean) {
  return `${PICKER_BTN_BASE} ${active ? PICKER_BTN_ACTIVE : PICKER_BTN_IDLE}`
}

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
} = useCardFieldsEditor(props.card, props.markDirty)

const localPriority = ref<KanbanCardPriority>(props.card.priority ?? 'none')
const showFieldMenu = ref(false)

watch(() => props.card, card => {
  resetFields(card)
  localPriority.value = card.priority ?? 'none'
  showFieldMenu.value = false
  showTagDropdown.value = false
})

const statusProp = computed(() => getBoardStatusProperty(props.board))

const statusPickerOptions = computed(() =>
  statusProp.value?.options?.map(opt => ({
    value: opt.id,
    label: localizeDefaultKanbanLabel(opt.name, key => t(key)),
    color: opt.color ?? null,
  })) ?? []
)
const statusPropertyLabel = computed(() =>
  statusProp.value
    ? localizeDefaultKanbanLabel(statusProp.value.name, key => t(key))
    : ''
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

function createFieldFromMenu(type: KanbanPropertyType) {
  createField(type)
  showFieldMenu.value = false
}

function selectStatus(value: string) {
  emit('update:statusValue', value)
  props.markDirty()
}

function selectPriority(value: KanbanCardPriority) {
  localPriority.value = value
  props.markDirty()
}

// ── Tags ──────────────────────────────────────────────────────────────
const TAG_COLORS = [
  { text: '#3b82f6', bg: '#3b82f618', border: '#3b82f630' },
  { text: '#10b981', bg: '#10b98118', border: '#10b98130' },
  { text: '#f59e0b', bg: '#f59e0b18', border: '#f59e0b30' },
  { text: '#ef4444', bg: '#ef444418', border: '#ef444430' },
  { text: '#8b5cf6', bg: '#8b5cf618', border: '#8b5cf630' },
  { text: '#ec4899', bg: '#ec489918', border: '#ec489930' },
  { text: '#06b6d4', bg: '#06b6d418', border: '#06b6d430' },
  { text: '#f97316', bg: '#f9731618', border: '#f9731630' },
]

const showTagDropdown = ref(false)
const newTagInput = ref('')
const tagInputRef = ref<HTMLInputElement | null>(null)

const tagsField = computed(() => {
  return localFields.value.find(field => {
    const name = field.name.toLowerCase().trim()
    return field.type === 'multi_select' && (name === 'tags' || name === 'теги')
  }) ?? null
})

const selectedTagIds = computed(() => {
  if (!tagsField.value) return []
  return Array.isArray(tagsField.value.value) ? (tagsField.value.value as string[]) : []
})

const filteredTagOptions = computed(() => {
  if (!tagsField.value) return []
  const query = newTagInput.value.toLowerCase().trim()
  const opts = tagsField.value.options ?? []
  if (!query) return opts
  return opts.filter(opt => opt.name.toLowerCase().includes(query))
})

function getTagColorStyle(optionId: string) {
  if (!tagsField.value) return {}
  const opt = tagsField.value.options?.find(o => o.id === optionId)
  if (opt?.color) {
    return {
      color: opt.color,
      background: opt.color + '18',
      borderColor: opt.color + '30',
    }
  }
  let hash = 0
  const name = opt?.name ?? optionId
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % TAG_COLORS.length
  return {
    color: TAG_COLORS[index].text,
    background: TAG_COLORS[index].bg,
    borderColor: TAG_COLORS[index].border,
  }
}

function getTagLabel(optionId: string): string {
  if (!tagsField.value) return ''
  return tagsField.value.options?.find(opt => opt.id === optionId)?.name ?? optionId
}

function toggleTag(optionId: string, checked: boolean) {
  if (!tagsField.value) return
  toggleMultiSelect(tagsField.value, optionId, checked)
}

function createNewTag() {
  const name = newTagInput.value.trim()
  if (!name || !tagsField.value) return

  const existing = tagsField.value.options?.find(opt => opt.name.toLowerCase() === name.toLowerCase())
  if (existing) {
    if (!selectedTagIds.value.includes(existing.id)) {
      toggleTag(existing.id, true)
    }
    newTagInput.value = ''
    return
  }

  const optionId = createKanbanId()
  const randomColor = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)].text

  const fieldId = tagsField.value.id
  localFields.value = localFields.value.map(field => {
    if (field.id !== fieldId) return field
    const opts = field.options ?? []
    return {
      ...field,
      options: [...opts, { id: optionId, name, color: randomColor }],
    }
  })

  toggleTag(optionId, true)
  newTagInput.value = ''
}

function enableTagsField() {
  const type = 'multi_select'
  const name = t('kanban.defaultTags.fieldName')
  const options = [
    { id: createKanbanId(), name: t('kanban.defaultTags.urgent'), color: '#ef4444' },
    { id: createKanbanId(), name: t('kanban.defaultTags.feature'), color: '#3b82f6' },
  ]
  const field: KanbanCardField = {
    id: createKanbanId(),
    name,
    type,
    value: [],
    options,
    order: localFields.value.length,
  }
  localFields.value = [...localFields.value, field]
  props.markDirty()
}

watch(showTagDropdown, isOpen => {
  if (isOpen) {
    void nextTick(() => tagInputRef.value?.focus())
  }
})

function collect(): { fields: KanbanCardField[]; priority: KanbanCardPriority } {
  return { fields: localFields.value, priority: localPriority.value }
}

defineExpose({ collect })
</script>

<template>
  <div class="km-props__header tw:m-0 tw:mb-2.5 tw:text-[11px] tw:font-bold tw:tracking-[0.04em] tw:text-content-muted tw:uppercase">{{ t('kanban.card.properties') }}</div>

  <div v-if="statusProp" class="km-prop-col tw:flex tw:flex-col tw:gap-[7px]">
    <span class="km-prop-label tw:w-auto tw:text-xs tw:text-content-secondary">{{ statusPropertyLabel }}</span>
    <div class="km-picker tw:flex tw:flex-wrap tw:gap-[5px]">
      <button
        v-for="opt in statusPickerOptions"
        :key="opt.value"
        type="button"
        class="km-picker__btn"
        :class="pickerBtnClass(statusValue === opt.value)"
        :aria-pressed="statusValue === opt.value"
        :style="opt.color && statusValue === opt.value
          ? { background: opt.color + '28', color: 'var(--text-primary)', borderColor: opt.color + '60' }
          : opt.color ? { borderColor: opt.color + '40' } : {}"
        @click="selectStatus(opt.value)"
      >
        <span
          class="km-picker__dot tw:size-[7px] tw:shrink-0 tw:rounded-full tw:bg-[var(--text-muted,currentColor)]"
          :style="opt.color ? { background: opt.color } : {}"
        />
        {{ opt.label }}
      </button>
    </div>
  </div>

  <div class="km-prop-col tw:flex tw:flex-col tw:gap-[7px]">
    <span class="km-prop-label tw:w-auto tw:text-xs tw:text-content-secondary">{{ t('kanban.card.priority') }}</span>
    <div class="km-picker tw:flex tw:flex-wrap tw:gap-[5px]">
      <button
        v-for="opt in priorityOptions"
        :key="opt.value"
        type="button"
        class="km-picker__btn"
        :class="pickerBtnClass(localPriority === opt.value)"
        :aria-pressed="localPriority === opt.value"
        :style="PRIORITY_COLORS[opt.value] && localPriority === opt.value
          ? { background: PRIORITY_COLORS[opt.value]! + '28', color: 'var(--text-primary)', borderColor: PRIORITY_COLORS[opt.value]! + '60' }
          : {}"
        @click="selectPriority(opt.value)"
      >
        <span
          v-if="PRIORITY_COLORS[opt.value]"
          class="km-picker__dot tw:size-[7px] tw:shrink-0 tw:rounded-full tw:bg-[var(--text-muted,currentColor)]"
          :style="{ background: PRIORITY_COLORS[opt.value]! }"
        />
        {{ opt.label }}
      </button>
    </div>
  </div>

  <div class="km-prop-col km-prop-tags-col tw:relative tw:flex tw:flex-col tw:gap-[7px]">
    <span class="km-prop-label tw:w-auto tw:text-xs tw:text-content-secondary">{{ t('kanban.groups.tag') }}</span>
    <div v-if="tagsField" class="km-tags-selector tw:mt-1">
      <div class="km-tags-list tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
        <span
          v-for="valId in selectedTagIds"
          :key="valId"
          class="km-tag-pill tw:inline-flex tw:items-center tw:gap-1 tw:rounded-full tw:border tw:border-solid tw:border-transparent tw:px-2 tw:py-0.5 tw:text-[11px] tw:leading-[1.2] tw:font-medium"
          :style="getTagColorStyle(valId)"
        >
          {{ getTagLabel(valId) }}
          <button type="button" class="km-tag-remove tw:flex tw:items-center tw:justify-center tw:border-none tw:bg-transparent tw:p-0 tw:text-inherit tw:opacity-60 tw:transition-opacity tw:duration-100 tw:cursor-pointer tw:hover:opacity-100" :aria-label="t('kanban.common.delete')" @click="toggleTag(valId, false)">
            <X :size="10" />
          </button>
        </span>

        <NvPopupMenu v-model:open="showTagDropdown" placement="auto" width="220px">
          <template #trigger>
            <NvButton variant="ghost" size="xs" class="km-add-tag-pill-btn tw:h-[22px] tw:rounded-full tw:px-2 tw:text-[10.5px] tw:max-[720px]:min-h-11 tw:max-[720px]:touch-manipulation">
              <Plus :size="10" /> {{ t('kanban.card.addTag') }}
            </NvButton>
          </template>
          <div class="km-tags-dropdown tw:flex tw:flex-col tw:overflow-hidden">
            <div class="km-tags-dropdown__search tw:p-1.5">
              <input
                ref="tagInputRef"
                v-model="newTagInput"
                class="km-prop-input tw:box-border tw:w-full tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-content-primary tw:outline-none tw:h-7 tw:px-2.5 tw:text-[11.5px]"
                :placeholder="t('kanban.card.optionPlaceholder')"
                @keydown.enter.prevent="createNewTag"
              />
            </div>
            <div class="km-tags-dropdown__list tw:max-h-[180px] tw:overflow-y-auto tw:py-1">
              <button
                v-for="opt in filteredTagOptions"
                :key="opt.id"
                type="button"
                class="km-tags-dropdown__item tw:flex tw:w-full tw:items-center tw:gap-2 tw:border-none tw:bg-transparent tw:px-2.5 tw:py-1.5 tw:text-left tw:text-[11.5px] tw:text-content-secondary tw:cursor-pointer tw:transition-colors tw:duration-100 tw:hover:bg-[var(--hover,rgba(255,255,255,0.05))] tw:hover:text-content-primary"
                :class="{ 'is-selected': selectedTagIds.includes(opt.id) }"
                @click="toggleTag(opt.id, !selectedTagIds.includes(opt.id))"
              >
                <span
                  class="km-tags-dropdown__checkbox tw:flex tw:size-3.5 tw:items-center tw:justify-center tw:rounded-[3px] tw:border tw:border-solid tw:text-[9px] tw:font-bold tw:text-accent"
                  :class="selectedTagIds.includes(opt.id) ? 'tw:border-accent tw:bg-(--accent-soft)' : 'tw:border-[var(--border-strong,var(--border-default))]'"
                >
                  <span v-if="selectedTagIds.includes(opt.id)">✓</span>
                </span>
                <span>{{ opt.name }}</span>
              </button>
              <div v-if="filteredTagOptions.length === 0 && newTagInput.trim()" class="km-tags-dropdown__create tw:px-1.5 tw:py-1">
                <button type="button" class="km-tags-dropdown__create-btn tw:flex tw:w-full tw:items-center tw:gap-1.5 tw:border-none tw:bg-transparent tw:rounded-[calc(4px*var(--radius-scale,1))] tw:p-1.5 tw:text-left tw:text-[11px] tw:text-accent tw:cursor-pointer tw:hover:bg-(--accent-soft)" @click="createNewTag">
                  <Plus :size="10" /> {{ t('kanban.card.addOption') }} "{{ newTagInput }}"
                </button>
              </div>
            </div>
          </div>
        </NvPopupMenu>
      </div>
    </div>
    <div v-else class="km-tags-empty tw:mt-1">
      <NvButton variant="ghost" size="xs" class="km-enable-tags-btn tw:h-6 tw:px-2.5 tw:text-[11px]" @click="enableTagsField">
        <Plus :size="10" /> {{ t('kanban.card.enableTags') }}
      </NvButton>
    </div>
  </div>

  <div class="km-prop-row tw:grid tw:grid-cols-[minmax(84px,104px)_minmax(0,1fr)] tw:items-center tw:gap-2.5 tw:max-[720px]:grid-cols-1">
    <span class="km-prop-label tw:w-auto tw:text-xs tw:text-content-secondary">{{ t('kanban.card.progress') }}</span>
    <div v-if="taskProgress" class="km-task-progress tw:flex tw:w-full tw:flex-col tw:gap-[5px]">
      <div class="km-task-progress__bar tw:h-[5px] tw:overflow-hidden tw:rounded-full tw:bg-[var(--border-default,var(--border-subtle))]">
        <div class="km-task-progress__fill tw:h-full tw:rounded-full tw:bg-[var(--accent,#3b82f6)] tw:transition-[width] tw:duration-200" :style="{ width: taskProgress.pct + '%' }" />
      </div>
      <span class="km-task-progress__label tw:text-[11px] tw:text-[var(--text-muted,var(--text-secondary))]">
        {{ t('kanban.card.progressTasks', { done: taskProgress.done, total: taskProgress.total, pct: taskProgress.pct }) }}
      </span>
    </div>
    <span v-else class="km-task-progress__empty tw:text-[11px] tw:text-[var(--text-muted,var(--text-muted))]">{{ t('kanban.card.progressNoTasks') }}</span>
  </div>

  <div v-for="field in localFields.filter(f => f.name.toLowerCase().trim() !== 'tags' && f.name.toLowerCase().trim() !== 'теги')" :key="field.id" class="km-field-card tw:flex tw:flex-col tw:gap-2 tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--surface-raised) tw:p-2.5 tw:shadow-(--shadow-raised)">
    <div class="km-field-card__header tw:grid tw:grid-cols-[minmax(0,1fr)_112px_22px] tw:items-center tw:gap-2 tw:max-[720px]:grid-cols-1">
      <input
        class="km-prop-input km-field-card__name tw:box-border tw:w-full tw:min-w-0 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-content-primary tw:outline-none tw:h-[34px] tw:px-2.5 tw:text-[13px]"
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

    <div class="km-field-card__body tw:flex tw:flex-col tw:gap-2">
      <input
        v-if="field.type === 'text'"
        class="km-prop-input tw:box-border tw:w-full tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-content-primary tw:outline-none tw:h-[34px] tw:px-2.5 tw:text-[13px]"
        :value="typeof field.value === 'string' ? field.value : ''"
        @input="updateFieldValue(field.id, ($event.target as HTMLInputElement).value)"
      />
      <div v-else-if="field.type === 'number'" class="km-number-field tw:flex tw:items-center tw:gap-2">
        <NvNumberInput
          class="km-number-input tw:w-full tw:flex-1 tw:min-w-0"
          :model-value="numberFieldModelValue(field.id)"
          @update:model-value="value => updateNumberFieldValue(field.id, value)"
        />
        <NvButton
          variant="ghost"
          size="xs"
          class="km-number-clear tw:shrink-0"
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
        class="km-checkbox-row tw:flex tw:items-center tw:gap-2.5 tw:text-xs tw:text-content-secondary"
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
      <div v-else class="km-prop-multiselect tw:flex tw:flex-col tw:gap-1.5">
        <NvCheckbox
          v-for="option in (field.options ?? [])"
          :key="option.id"
          class="km-prop-ms-opt tw:w-full tw:text-xs tw:text-content-secondary"
          :model-value="Array.isArray(field.value) && field.value.includes(option.id)"
          @update:model-value="checked => toggleMultiSelect(field, option.id, checked)"
        >
          {{ optionLabel(field, option.id) }}
        </NvCheckbox>
      </div>
    </div>

    <div v-if="hasFieldOptions(field)" class="km-field-card__options tw:flex tw:flex-col tw:gap-2 tw:pt-2">
      <div class="km-field-card__options-label tw:m-0 tw:mb-2.5 tw:text-[11px] tw:font-bold tw:tracking-[0.04em] tw:text-content-muted tw:uppercase">{{ t('kanban.card.fieldOptions') }}</div>
      <div v-for="option in (field.options ?? [])" :key="option.id" class="km-field-card__option tw:grid tw:grid-cols-[minmax(0,1fr)_22px] tw:items-center tw:gap-2 tw:max-[720px]:grid-cols-1">
        <input
          class="km-prop-input tw:box-border tw:w-full tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-content-primary tw:outline-none tw:h-[34px] tw:px-2.5 tw:text-[13px]"
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
      <NvButton variant="ghost" size="xs" class="km-inline-btn tw:inline-flex tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:text-content-secondary tw:cursor-pointer" @click="addFieldOption(field.id)">
        <Plus :size="10" /> {{ t('kanban.card.addOption') }}
      </NvButton>
    </div>
  </div>

  <div class="km-field-actions tw:relative">
    <NvPopupMenu
      v-model:open="showFieldMenu"
      :items="fieldTypeMenuItems"
      placement="auto"
      :offset="[0, 8]"
      width="220px"
    >
      <template #trigger>
        <NvButton variant="ghost" class="km-add-prop-btn tw:inline-flex tw:w-full tw:items-center tw:justify-start tw:gap-1.5">
          <Plus :size="10" /> {{ t('kanban.card.addField') }}
        </NvButton>
      </template>
    </NvPopupMenu>
  </div>
</template>
