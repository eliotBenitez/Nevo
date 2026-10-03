<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import EditorPopupPanel from './EditorPopupPanel.vue'
import NvCheckbox from '../../../ui/primitives/NvCheckbox.vue'
import NvDatePicker from '../../../ui/primitives/NvDatePicker.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvTextInput from '../../../ui/primitives/NvTextInput.vue'
import NvMenuItem from '../../../ui/primitives/NvMenuItem.vue'
import NvMenuSeparator from '../../../ui/primitives/NvMenuSeparator.vue'
import NvMenuLabel from '../../../ui/primitives/NvMenuLabel.vue'
import type { QueryBlockData, QueryBlockView } from '../../../features/query/queryBlockData'
import type { NoteSortDirection, NoteSortField, NoteSortRule } from '../../../types/note-query'

const props = defineProps<{
  open: boolean
  data: QueryBlockData
  popoverStyle: Record<string, string>
}>()

const emit = defineEmits<{
  'update:data': [value: QueryBlockData]
  apply: []
  remove: []
  keydown: [event: KeyboardEvent]
}>()

const { t } = useI18n()

const NONE = ''
const queryFieldClass = 'tw:flex tw:min-w-0 tw:flex-col tw:gap-1'
const queryLabelClass = 'tw:text-[10.5px] tw:font-semibold tw:tracking-[0.02em] tw:text-content-muted tw:uppercase'
const queryControlClass = 'tw:min-w-0 tw:w-full'
const SORT_FIELDS: NoteSortField[] = ['title', 'date', 'updatedAt', 'createdAt']

function patch(next: Partial<QueryBlockData['filters']>) {
  emit('update:data', { ...props.data, filters: { ...props.data.filters, ...next } })
}

function parseTagList(value: string): string[] {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean)
}

const tagsAnyText = computed({
  get: () => props.data.filters.tagsAny.join(', '),
  set: (value: string) => patch({ tagsAny: parseTagList(value) }),
})
const tagsAllText = computed({
  get: () => props.data.filters.tagsAll.join(', '),
  set: (value: string) => patch({ tagsAll: parseTagList(value) }),
})

const statusOptions = computed(() => [
  { value: NONE, label: t('editor.queryBlock.filters.any') },
  { value: 'none', label: t('workspace.rightPanel.properties.statuses.none') },
  { value: 'draft', label: t('workspace.rightPanel.properties.statuses.draft') },
  { value: 'active', label: t('workspace.rightPanel.properties.statuses.active') },
  { value: 'waiting', label: t('workspace.rightPanel.properties.statuses.waiting') },
  { value: 'done', label: t('workspace.rightPanel.properties.statuses.done') },
])
const typeOptions = computed(() => [
  { value: NONE, label: t('editor.queryBlock.filters.any') },
  { value: 'note', label: t('workspace.rightPanel.properties.types.note') },
  { value: 'task', label: t('workspace.rightPanel.properties.types.task') },
  { value: 'idea', label: t('workspace.rightPanel.properties.types.idea') },
  { value: 'meeting', label: t('workspace.rightPanel.properties.types.meeting') },
  { value: 'project', label: t('workspace.rightPanel.properties.types.project') },
  { value: 'research', label: t('workspace.rightPanel.properties.types.research') },
])
const viewOptions = computed(() => [
  { value: 'list', label: t('editor.queryBlock.views.list') },
  { value: 'table', label: t('editor.queryBlock.views.table') },
  { value: 'cards', label: t('editor.queryBlock.views.cards') },
])
const sortFieldOptions = computed(() => SORT_FIELDS.map((field) => ({ value: field, label: t(`editor.queryBlock.sortFields.${field}`) })))
const sortDirectionOptions = computed(() => [
  { value: 'asc', label: t('database.sort.asc') },
  { value: 'desc', label: t('database.sort.desc') },
])

function addSortRule() {
  const used = new Set(props.data.sorts.map((rule) => rule.field))
  const field = SORT_FIELDS.find((candidate) => !used.has(candidate)) ?? SORT_FIELDS[0]
  const nextRule: NoteSortRule = { field, direction: 'asc' }
  emit('update:data', { ...props.data, sorts: [...props.data.sorts, nextRule] })
}

function patchSortRule(index: number, next: Partial<NoteSortRule>) {
  const sorts = props.data.sorts.map((rule, i) => (i === index ? { ...rule, ...next } : rule))
  emit('update:data', { ...props.data, sorts })
}

function removeSortRule(index: number) {
  emit('update:data', { ...props.data, sorts: props.data.sorts.filter((_, i) => i !== index) })
}

function setView(view: string) {
  emit('update:data', { ...props.data, view: view as QueryBlockView })
}
</script>

<template>
  <EditorPopupPanel
    :open="open"
    :popover-style="popoverStyle"
    class-name="query-popover"
    :label="t('editor.queryBlock.label')"
    input-id="query-tags-any"
    :shortcut-text="t('common.keyboard.ctrlCmdEnter')"
    :hint="t('editor.queryBlock.applyHint')"
    :apply-label="t('editor.queryBlock.apply')"
    :remove-label="t('editor.queryBlock.delete')"
    @apply="emit('apply')"
    @remove="emit('remove')"
    @keydown="emit('keydown', $event)"
  >
    <div class="query-popover__grid tw:grid tw:grid-cols-[repeat(auto-fit,minmax(min(168px,100%),1fr))] tw:gap-2">
      <div class="query-popover__field" :class="queryFieldClass" role="group" :aria-label="t('editor.queryBlock.filters.tagsAny')">
        <span class="query-popover__field-label" :class="queryLabelClass">{{ t('editor.queryBlock.filters.tagsAny') }}</span>
        <NvTextInput
          id="query-tags-any"
          v-model="tagsAnyText"
          class="query-popover__control" :class="queryControlClass"
          :aria-label="t('editor.queryBlock.filters.tagsAny')"
          :placeholder="t('editor.queryBlock.filters.tagsPlaceholder')"
        />
      </div>

      <div class="query-popover__field" :class="queryFieldClass" role="group" :aria-label="t('editor.queryBlock.filters.tagsAll')">
        <span class="query-popover__field-label" :class="queryLabelClass">{{ t('editor.queryBlock.filters.tagsAll') }}</span>
        <NvTextInput
          v-model="tagsAllText"
          class="query-popover__control" :class="queryControlClass"
          :aria-label="t('editor.queryBlock.filters.tagsAll')"
          :placeholder="t('editor.queryBlock.filters.tagsPlaceholder')"
        />
      </div>

      <div class="query-popover__field" :class="queryFieldClass" role="group" :aria-label="t('editor.queryBlock.filters.status')">
        <span class="query-popover__field-label" :class="queryLabelClass">{{ t('editor.queryBlock.filters.status') }}</span>
        <NvSelect
          class="query-popover__control" :class="queryControlClass"
          :model-value="data.filters.status ?? NONE"
          :options="statusOptions"
          :min-width="'100%'"
          @update:model-value="(value) => patch({ status: (value || null) as QueryBlockData['filters']['status'] })"
        />
      </div>

      <div class="query-popover__field" :class="queryFieldClass" role="group" :aria-label="t('editor.queryBlock.filters.type')">
        <span class="query-popover__field-label" :class="queryLabelClass">{{ t('editor.queryBlock.filters.type') }}</span>
        <NvSelect
          class="query-popover__control" :class="queryControlClass"
          :model-value="data.filters.noteType ?? NONE"
          :options="typeOptions"
          :min-width="'100%'"
          @update:model-value="(value) => patch({ noteType: (value || null) as QueryBlockData['filters']['noteType'] })"
        />
      </div>

      <div class="query-popover__field" :class="queryFieldClass" role="group" :aria-label="t('editor.queryBlock.filters.dateFrom')">
        <span class="query-popover__field-label" :class="queryLabelClass">{{ t('editor.queryBlock.filters.dateFrom') }}</span>
        <NvDatePicker
          class="query-popover__control" :class="queryControlClass"
          :model-value="data.filters.dateFrom"
          :placeholder="t('editor.queryBlock.filters.dateFrom')"
          @update:model-value="patch({ dateFrom: $event })"
        />
      </div>

      <div class="query-popover__field" :class="queryFieldClass" role="group" :aria-label="t('editor.queryBlock.filters.dateTo')">
        <span class="query-popover__field-label" :class="queryLabelClass">{{ t('editor.queryBlock.filters.dateTo') }}</span>
        <NvDatePicker
          class="query-popover__control" :class="queryControlClass"
          :model-value="data.filters.dateTo"
          :placeholder="t('editor.queryBlock.filters.dateTo')"
          @update:model-value="patch({ dateTo: $event })"
        />
      </div>

      <div
        class="query-popover__field query-popover__field--wide tw:col-[1/-1]" :class="queryFieldClass"
        role="group"
        :aria-label="t('editor.queryBlock.filters.folder')"
      >
        <span class="query-popover__field-label" :class="queryLabelClass">{{ t('editor.queryBlock.filters.folder') }}</span>
        <NvTextInput
          class="query-popover__control" :class="queryControlClass"
          :model-value="data.filters.folderPathPrefix ?? ''"
          :aria-label="t('editor.queryBlock.filters.folder')"
          :placeholder="t('editor.queryBlock.filters.folderPlaceholder')"
          @update:model-value="patch({ folderPathPrefix: $event || null })"
        />
      </div>

      <NvCheckbox
        class="query-popover__checkbox tw:col-[1/-1] tw:text-xs tw:text-content-secondary"
        size="sm"
        :label="t('editor.queryBlock.filters.includeSubtree')"
        :model-value="data.filters.includeSubtree"
        @update:model-value="patch({ includeSubtree: $event })"
      />

      <div class="query-popover__field" :class="queryFieldClass" role="group" :aria-label="t('editor.queryBlock.view')">
        <span class="query-popover__field-label" :class="queryLabelClass">{{ t('editor.queryBlock.view') }}</span>
        <NvSelect
          class="query-popover__control" :class="queryControlClass"
          :model-value="data.view"
          :options="viewOptions"
          :min-width="'100%'"
          @update:model-value="setView"
        />
      </div>
    </div>

    <NvMenuSeparator />

    <div class="query-popover__sorts tw:flex tw:flex-col tw:gap-1.5">
      <NvMenuLabel :label="t('editor.queryBlock.sort')" />
      <div v-for="(rule, index) in data.sorts" :key="`${rule.field}-${index}`" class="nv-db-sort__rule">
        <NvSelect
          class="nv-db-sort__select"
          :model-value="rule.field"
          :options="sortFieldOptions"
          :min-width="120"
          @update:model-value="(value) => patchSortRule(index, { field: value as NoteSortField })"
        />
        <NvSelect
          :model-value="rule.direction"
          :options="sortDirectionOptions"
          :min-width="98"
          @update:model-value="(value) => patchSortRule(index, { direction: value as NoteSortDirection })"
        />
        <button type="button" class="nv-db-sort__remove" :aria-label="t('database.sort.removeRule')" @click="removeSortRule(index)">
          <Trash2 :size="13" />
        </button>
      </div>
      <NvMenuItem
        :icon="Plus"
        :label="t('database.sort.addRule')"
        :disabled="data.sorts.length >= SORT_FIELDS.length"
        @select="addSortRule"
      />
    </div>
  </EditorPopupPanel>
</template>
