<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, Columns3 } from 'lucide-vue-next'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import type { KanbanBoard, KanbanCard, KanbanPropertyOption } from '../../../types/kanban'
import { findCardField, getBoardStatusProperty, getCardFieldDescriptors, getCardStatusValue } from './kanbanFields'

interface Props {
  board: KanbanBoard
  cards: KanbanCard[]
  searchQuery?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'open-card': [cardId: string] }>()
const { t, locale } = useI18n()

const selectedCardId = ref<string | null>(null)
const collapsedGroups = ref<Set<string>>(new Set())
const selectedFieldIds = ref<string[]>([])
const showProgressColumn = ref(localStorage.getItem('kanban_table_show_progress') !== 'false')
watch(showProgressColumn, value => {
  localStorage.setItem('kanban_table_show_progress', String(value))
})

const statusProp = computed(() => getBoardStatusProperty(props.board))

const availableFields = computed(() => getCardFieldDescriptors(props.cards))
const visibleColumns = computed(() =>
  availableFields.value.filter(field => selectedFieldIds.value.includes(field.id))
)

watch(availableFields, fields => {
  const nextIds = selectedFieldIds.value.filter(id => fields.some(field => field.id === id))
  if (nextIds.length === 0 && fields.length > 0) {
    selectedFieldIds.value = fields.slice(0, 4).map(field => field.id)
    return
  }
  if (nextIds.length !== selectedFieldIds.value.length) selectedFieldIds.value = nextIds
}, { immediate: true })

const filteredCards = computed(() => {
  const query = (props.searchQuery ?? '').toLowerCase().trim()
  if (!query) return props.cards
  return props.cards.filter(card => card.title.toLowerCase().includes(query))
})

const groups = computed(() => {
  const options = statusProp.value?.options ?? []
  if (!options.length) {
    return [{ id: '', name: t('kanban.groups.allCards'), dot: undefined, cards: filteredCards.value }]
  }

  return options.map(option => ({
    id: option.id,
    name: option.name,
    dot: option.color,
    cards: filteredCards.value.filter(card => getCardStatusValue(card, props.board) === option.id),
  })).filter(group => group.cards.length > 0)
})

const avgProgress = computed(() => {
  const numericValues = filteredCards.value.flatMap(card => {
    if (typeof card.progress === 'number') return [card.progress]

    const progressField = card.fields.find(field =>
      field.type === 'number' && field.name.toLowerCase().includes('progress'),
    ) ?? card.fields.find(field => field.type === 'number')

    return typeof progressField?.value === 'number' ? [progressField.value] : []
  })

  if (!numericValues.length) return null
  return Math.round(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length)
})

function toggleGroup(id: string) {
  if (collapsedGroups.value.has(id)) collapsedGroups.value.delete(id)
  else collapsedGroups.value.add(id)
}

function toggleVisibleField(fieldId: string) {
  if (selectedFieldIds.value.includes(fieldId)) {
    selectedFieldIds.value = selectedFieldIds.value.filter(id => id !== fieldId)
    return
  }
  selectedFieldIds.value = [...selectedFieldIds.value, fieldId]
}

function getFieldValue(card: KanbanCard, descriptorId: string): string {
  const field = findCardField(card, { id: descriptorId })
  if (!field) return '—'
  if (field.value === null || field.value === undefined || field.value === '') return '—'
  if (field.type === 'select' && typeof field.value === 'string') {
    return field.options?.find(option => option.id === field.value)?.name ?? field.value
  }
  if (field.type === 'multi_select' && Array.isArray(field.value)) {
    return field.value.map(optionId => field.options?.find(option => option.id === optionId)?.name ?? optionId).join(', ') || '—'
  }
  if (field.type === 'date' && typeof field.value === 'string') {
    const date = new Date(field.value)
    if (isNaN(date.getTime())) return field.value
    return date.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
  }
  if (field.type === 'checkbox') return field.value ? '✓' : '—'
  return String(field.value)
}

function getFieldColor(card: KanbanCard, descriptorId: string): string | undefined {
  const field = findCardField(card, { id: descriptorId })
  if (!field) return undefined
  if (field.type === 'select' && typeof field.value === 'string') {
    return field.options?.find(option => option.id === field.value)?.color
  }
  if (field.type === 'date' && typeof field.value === 'string' && new Date(field.value) < new Date()) {
    return 'oklch(0.55 0.13 22)'
  }
  return undefined
}

function getStatusOption(card: KanbanCard) {
  const value = getCardStatusValue(card, props.board)
  return statusProp.value?.options?.find(option => option.id === value) ?? null
}

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

function getTagColorStyle(tag: KanbanPropertyOption) {
  if (tag.color) {
    return {
      color: tag.color,
      background: tag.color + '18',
      borderColor: tag.color + '30',
    }
  }
  let hash = 0
  const name = tag.name
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

function isTagsColumn(col: { name: string; type: string }): boolean {
  const name = col.name.toLowerCase().trim()
  return col.type === 'multi_select' && (name === 'tags' || name === 'теги')
}

function getCardTags(card: KanbanCard, colId: string): KanbanPropertyOption[] {
  const field = findCardField(card, { id: colId })
  if (!field || !Array.isArray(field.value)) return []
  return field.value
    .map(valId => field.options?.find(opt => opt.id === valId))
    .filter((opt): opt is KanbanPropertyOption => !!opt)
}
</script>

<template>
  <div class="kb-table tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden">
    <div class="kb-table__toolbar tw:flex tw:justify-end tw:px-5 tw:pt-3">
      <NvPopupMenu placement="bottom-end" width="240px">
        <template #trigger>
          <button type="button" class="kb-table__field-btn tw:inline-flex tw:h-[30px] tw:items-center tw:gap-1.5 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-3 tw:text-content-secondary tw:cursor-pointer">
            <Columns3 :size="12" />
            {{ t('kanban.table.chooseFields') }}
          </button>
        </template>
        <div class="kb-table__field-content tw:flex tw:flex-col tw:gap-1.5 tw:px-0.5 tw:py-1">
          <label class="kb-table__field-option tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-content-secondary">
            <input
              type="checkbox"
              v-model="showProgressColumn"
            />
            <span>{{ t('kanban.card.progress') }}</span>
            <span class="kb-table__field-type tw:ml-auto tw:text-[11px] tw:text-content-muted">progress</span>
          </label>
          <div v-if="availableFields.length" class="kb-table__field-separator tw:my-1 tw:h-px tw:bg-[var(--border-subtle,var(--border-subtle))]" />
          <label v-for="field in availableFields" :key="field.id" class="kb-table__field-option tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-content-secondary">
            <input
              type="checkbox"
              :checked="selectedFieldIds.includes(field.id)"
              @change="toggleVisibleField(field.id)"
            />
            <span>{{ field.name }}</span>
            <span class="kb-table__field-type tw:ml-auto tw:text-[11px] tw:text-content-muted">{{ field.type }}</span>
          </label>
          <div v-if="!availableFields.length" class="kb-table__field-empty tw:ml-auto tw:text-[11px] tw:text-content-muted">
            {{ t('kanban.table.noFields') }}
          </div>
        </div>
      </NvPopupMenu>
    </div>

    <div class="kb-table__scroll tw:flex-1 tw:overflow-auto tw:px-5 tw:pt-3.5 tw:pb-6">
      <table class="kb-table__el tw:w-full tw:border-collapse tw:overflow-hidden tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-[var(--border-default,var(--border-subtle))] tw:bg-surface-raised">
        <thead>
          <tr class="kb-table__head-row tw:border-b tw:border-solid tw:border-[var(--border-default,var(--border-subtle))] tw:bg-[var(--hover,var(--surface-overlay))]">
            <th class="kb-table__th kb-table__th--check tw:w-7 tw:px-3 tw:py-0 tw:text-left tw:text-[10.5px] tw:font-semibold tw:tracking-[0.04em] tw:text-content-muted tw:whitespace-nowrap tw:uppercase" />
            <th class="kb-table__th kb-table__th--title tw:min-w-[220px] tw:px-[13px] tw:py-2.5 tw:text-left tw:text-[10.5px] tw:font-semibold tw:tracking-[0.04em] tw:text-content-muted tw:whitespace-nowrap tw:uppercase">{{ t('kanban.table.title') }}</th>
            <th class="kb-table__th kb-table__th--status tw:w-[120px] tw:px-[13px] tw:py-2.5 tw:text-left tw:text-[10.5px] tw:font-semibold tw:tracking-[0.04em] tw:text-content-muted tw:whitespace-nowrap tw:uppercase">{{ statusProp?.name ?? t('kanban.table.status') }}</th>
            <th v-if="showProgressColumn" class="kb-table__th kb-table__th--progress tw:px-[13px] tw:py-2.5 tw:text-left tw:text-[10.5px] tw:font-semibold tw:tracking-[0.04em] tw:text-content-muted tw:whitespace-nowrap tw:uppercase">
              {{ t('kanban.card.progress') }}
            </th>
            <th v-for="col in visibleColumns" :key="col.id" class="kb-table__th tw:px-[13px] tw:py-2.5 tw:text-left tw:text-[10.5px] tw:font-semibold tw:tracking-[0.04em] tw:text-content-muted tw:whitespace-nowrap tw:uppercase">
              {{ col.name }}
            </th>
          </tr>
        </thead>

        <tbody>
          <template v-for="group in groups" :key="group.id">
            <tr class="kb-table__group-row tw:cursor-pointer tw:select-none" @click="toggleGroup(group.id)">
              <td :colspan="(showProgressColumn ? 4 : 3) + visibleColumns.length" class="kb-table__group-cell tw:border-t tw:border-b tw:border-x-0 tw:border-solid tw:border-t-[var(--border-default,var(--border-subtle))] tw:border-b-[var(--border-subtle,var(--border-subtle))] tw:bg-[var(--hover-strong,var(--surface-overlay))] tw:p-0">
                <div class="kb-table__group-inner tw:flex tw:items-center tw:gap-[7px] tw:px-[13px] tw:py-1.5">
                  <ChevronDown
                    :size="10"
                    class="kb-table__group-chevron tw:text-[var(--text-muted,var(--text-secondary))] tw:transition-transform tw:duration-150"
                    :class="collapsedGroups.has(group.id) ? 'kb-table__group-chevron--collapsed tw:-rotate-90' : ''"
                  />
                  <span v-if="group.dot" class="kb-table__group-dot tw:size-1.5 tw:rounded-full" :style="{ background: group.dot }" />
                  <span class="kb-table__group-name tw:text-[11.5px] tw:font-[550] tw:text-content-secondary">{{ group.name }}</span>
                  <span class="kb-table__group-count tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">{{ group.cards.length }}</span>
                </div>
              </td>
            </tr>

            <template v-if="!collapsedGroups.has(group.id)">
              <tr
                v-for="card in group.cards"
                :key="card.id"
                class="kb-table__row tw:border-b tw:border-solid tw:border-[var(--border-subtle,var(--border-subtle))] tw:cursor-pointer tw:hover:bg-[var(--hover,var(--surface-raised))]"
                :class="selectedCardId === card.id ? 'kb-table__row--selected tw:bg-[var(--accent-soft,rgb(161_98_7/0.10))] tw:outline tw:outline-1 tw:outline-solid tw:-outline-offset-1 tw:outline-[color-mix(in_oklab,var(--accent)_34%,transparent)]' : ''"
                @click="selectedCardId = card.id; emit('open-card', card.id)"
              >
                <td class="kb-table__td kb-table__td--check tw:w-7 tw:px-3 tw:py-2.5 tw:text-[12.5px] tw:text-content-secondary tw:align-middle tw:whitespace-nowrap">
                  <span class="kb-table__check-dot tw:inline-block tw:size-1 tw:bg-content-muted" />
                </td>
                <td class="kb-table__td kb-table__td--title tw:flex tw:min-w-[220px] tw:items-center tw:gap-1.5 tw:max-w-[220px] tw:overflow-hidden tw:px-[13px] tw:py-2.5 tw:text-[13px] tw:font-[450] tw:text-ellipsis tw:whitespace-nowrap tw:text-content-primary tw:align-middle">
                  <span v-if="card.icon" class="kb-table__icon">{{ card.icon }}</span>
                  {{ card.title || t('kanban.table.noTitle') }}
                  <span v-if="selectedCardId === card.id" class="kb-table__caret tw:h-3.5 tw:w-[1.5px] tw:rounded-[calc(1px*var(--radius-scale,1))] tw:bg-accent" />
                </td>
                <td class="kb-table__td kb-table__td--status tw:max-w-[220px] tw:overflow-hidden tw:px-[13px] tw:py-2.5 tw:text-[12.5px] tw:text-content-secondary tw:text-ellipsis tw:whitespace-nowrap tw:align-middle">
                  <span
                    v-if="getStatusOption(card)"
                    class="kb-table__status tw:inline-flex tw:h-[18px] tw:items-center tw:gap-[5px] tw:rounded-full tw:bg-[var(--hover-strong,var(--surface-overlay))] tw:px-[7px] tw:text-[10.5px] tw:font-medium"
                    :style="getStatusOption(card)?.color
                      ? { background: `${getStatusOption(card)?.color}28`, color: getStatusOption(card)?.color }
                      : {}"
                  >
                    <span
                      class="kb-table__status-dot tw:size-1.5 tw:rounded-full tw:bg-current"
                      :style="getStatusOption(card)?.color ? { background: getStatusOption(card)?.color } : {}"
                    />
                    {{ getStatusOption(card)?.name }}
                  </span>
                </td>
                <td v-if="showProgressColumn" class="kb-table__td kb-table__td--progress tw:max-w-[220px] tw:overflow-hidden tw:px-[13px] tw:py-2.5 tw:text-[12.5px] tw:text-content-secondary tw:text-ellipsis tw:whitespace-nowrap tw:align-middle">
                  <div v-if="typeof card.progress === 'number'" class="kb-table__progress-wrapper tw:flex tw:w-full tw:max-w-[120px] tw:items-center tw:gap-2">
                    <div class="kb-table__progress-bar tw:h-1 tw:flex-1 tw:overflow-hidden tw:rounded-full tw:bg-[var(--border-default,var(--border-subtle))]">
                      <div class="kb-table__progress-fill tw:h-full tw:rounded-full tw:bg-[var(--accent,#3b82f6)]" :style="{ width: card.progress + '%' }" />
                    </div>
                    <span class="kb-table__progress-text tw:shrink-0 tw:text-[10.5px] tw:font-medium tw:text-[var(--text-muted,var(--text-secondary))]">{{ card.progress }}%</span>
                  </div>
                  <span v-else class="kb-table__progress-empty tw:text-content-muted">—</span>
                </td>
                <td
                  v-for="col in visibleColumns"
                  :key="col.id"
                  class="kb-table__td tw:max-w-[220px] tw:overflow-hidden tw:px-[13px] tw:py-2.5 tw:text-[12.5px] tw:text-content-secondary tw:text-ellipsis tw:whitespace-nowrap tw:align-middle"
                  :style="(!isTagsColumn(col) && getFieldColor(card, col.id)) ? { color: getFieldColor(card, col.id) } : {}"
                >
                  <template v-if="isTagsColumn(col)">
                    <div v-if="getCardTags(card, col.id).length" class="kb-table__tags tw:flex tw:flex-nowrap tw:gap-1 tw:overflow-hidden">
                      <span
                        v-for="tag in getCardTags(card, col.id)"
                        :key="tag.id"
                        class="kb-table__tag tw:inline-flex tw:shrink-0 tw:items-center tw:rounded-full tw:border tw:border-solid tw:border-transparent tw:px-1.5 tw:py-px tw:text-[10px] tw:leading-[1.2] tw:font-medium tw:whitespace-nowrap"
                        :style="getTagColorStyle(tag)"
                      >
                        {{ tag.name }}
                      </span>
                    </div>
                    <span v-else>—</span>
                  </template>
                  <template v-else>
                    {{ getFieldValue(card, col.id) }}
                  </template>
                </td>
              </tr>
            </template>
          </template>
        </tbody>

        <tfoot>
          <tr class="kb-table__sum-row tw:border-t tw:border-solid tw:border-[var(--border-default,var(--border-subtle))] tw:bg-[var(--hover,var(--surface-raised))]">
            <td class="kb-table__td tw:max-w-[220px] tw:overflow-hidden tw:px-[13px] tw:py-2.5 tw:text-[12.5px] tw:text-content-secondary tw:text-ellipsis tw:whitespace-nowrap tw:align-middle" />
            <td class="kb-table__td kb-table__td--sum tw:max-w-[220px] tw:overflow-hidden tw:px-[13px] tw:py-2.5 tw:text-[11px] tw:text-content-muted tw:text-ellipsis tw:whitespace-nowrap tw:align-middle">
              {{ t('kanban.table.items', { n: filteredCards.length, g: groups.length }) }}
            </td>
            <td v-for="_ in ((showProgressColumn ? 2 : 1) + visibleColumns.length)" :key="_" class="kb-table__td tw:max-w-[220px] tw:overflow-hidden tw:px-[13px] tw:py-2.5 tw:text-[12.5px] tw:text-content-secondary tw:text-ellipsis tw:whitespace-nowrap tw:align-middle">
              <span v-if="(_ === (showProgressColumn ? 2 : 1)) && avgProgress !== null" class="kb-table__sum-prog tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">
                {{ t('kanban.table.avgProgress', { n: avgProgress }) }}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
.kb-table__caret {
  animation: kb-blink 1s step-start infinite;
}

@keyframes kb-blink {
  50% {
    opacity: 0;
  }
}
</style>
