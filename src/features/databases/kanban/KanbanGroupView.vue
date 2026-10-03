<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus } from 'lucide-vue-next'
import type { KanbanBoard, KanbanCard, KanbanPropertyType } from '../../../types/kanban'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import KanbanCardVue from './KanbanCard.vue'
import type { KanbanGroupBy } from './KanbanToolbar.vue'
import { findCardField, getCardFieldDescriptors } from './kanbanFields'

interface Props {
  board: KanbanBoard
  cards: KanbanCard[]
  groupBy: KanbanGroupBy
  draggingCardId?: string | null
}

interface Group {
  key: string
  label: string
  dot?: string
  cards: KanbanCard[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'open-card': [cardId: string]
  'add-card': [groupKey: string]
}>()
const { t } = useI18n()

const selectedFieldIds = ref<Partial<Record<KanbanGroupBy, string>>>({})

const compatibleTypes = computed<KanbanPropertyType[]>(() => {
  if (props.groupBy === 'priority' || props.groupBy === 'owner') return ['select', 'multi_select']
  if (props.groupBy === 'tag') return ['multi_select']
  if (props.groupBy === 'date') return ['date']
  return []
})

const availableFields = computed(() => getCardFieldDescriptors(props.cards, compatibleTypes.value))
const selectedFieldId = computed({
  get: () => selectedFieldIds.value[props.groupBy] ?? '',
  set: value => {
    selectedFieldIds.value = { ...selectedFieldIds.value, [props.groupBy]: value }
  },
})
const selectedField = computed(() => availableFields.value.find(field => field.id === selectedFieldId.value) ?? null)
const fieldOptions = computed(() => availableFields.value.map(field => ({ value: field.id, label: field.name })))

watch(availableFields, fields => {
  if (!fields.some(field => field.id === selectedFieldId.value)) {
    selectedFieldId.value = ''
  }
}, { immediate: true })

const groups = computed<Group[]>(() => {
  if (props.groupBy === 'status') return [{ key: 'all', label: t('kanban.groups.allCards'), cards: props.cards }]
  if (!selectedField.value) return []

  if (props.groupBy === 'date') {
    const now = new Date()
    const buckets: Array<{ key: string; label: string; dot?: string; test: (date: Date) => boolean }> = [
      { key: 'overdue', label: t('kanban.groups.overdue'), dot: 'oklch(0.65 0.13 22)', test: date => date < now && date.toDateString() !== now.toDateString() },
      { key: 'today', label: t('kanban.groups.today'), dot: 'var(--accent)', test: date => date.toDateString() === now.toDateString() },
      { key: 'week', label: t('kanban.groups.thisWeek'), test: date => {
        const end = new Date(now)
        end.setDate(end.getDate() + 7)
        return date > now && date < end
      } },
      { key: 'later', label: t('kanban.groups.later'), test: date => {
        const end = new Date(now)
        end.setDate(end.getDate() + 7)
        return date >= end
      } },
    ]

    return [
      ...buckets.map(bucket => ({
        key: bucket.key,
        label: bucket.label,
        dot: bucket.dot,
        cards: props.cards.filter(card => {
          const field = findCardField(card, selectedField.value!)
          if (!field || typeof field.value !== 'string') return false
          const date = new Date(field.value)
          return !isNaN(date.getTime()) && bucket.test(date)
        }),
      })),
      {
        key: 'no-date',
        label: t('kanban.groups.noDate'),
        cards: props.cards.filter(card => {
          const field = findCardField(card, selectedField.value!)
          return !field || !field.value
        }),
      },
    ].filter(group => group.cards.length > 0)
  }

  const optionGroups = new Map<string, Group>()
  const emptyCards: KanbanCard[] = []

  for (const card of props.cards) {
    const field = findCardField(card, selectedField.value)
    if (!field) {
      emptyCards.push(card)
      continue
    }

    if (field.type === 'select') {
      const value = typeof field.value === 'string' ? field.value : ''
      const option = field.options?.find(item => item.id === value)
      if (!option) {
        emptyCards.push(card)
        continue
      }
      const key = option.name.toLowerCase()
      const existing = optionGroups.get(key) ?? { key, label: option.name, dot: option.color, cards: [] }
      existing.cards.push(card)
      optionGroups.set(key, existing)
      continue
    }

    if (field.type === 'multi_select') {
      const values = Array.isArray(field.value) ? field.value : []
      if (!values.length) {
        emptyCards.push(card)
        continue
      }

      for (const value of values) {
        const option = field.options?.find(item => item.id === value)
        if (!option) continue
        const key = option.name.toLowerCase()
        const prefix = props.groupBy === 'tag' ? '#' : ''
        const existing = optionGroups.get(key) ?? { key, label: `${prefix}${option.name}`, dot: option.color, cards: [] }
        existing.cards.push(card)
        optionGroups.set(key, existing)
      }
      continue
    }

    emptyCards.push(card)
  }

  const emptyLabel = props.groupBy === 'owner'
    ? t('kanban.groups.unassigned')
    : props.groupBy === 'tag'
      ? t('kanban.groups.untagged')
      : t('kanban.groups.noPriority')

  return [
    ...Array.from(optionGroups.values()).filter(group => group.cards.length > 0),
    ...(emptyCards.length > 0 ? [{ key: 'empty', label: emptyLabel, cards: emptyCards }] : []),
  ]
})
</script>

<template>
  <div class="kb-group tw:flex tw:flex-1 tw:flex-col tw:overflow-hidden">
    <div v-if="groupBy !== 'status'" class="kb-group__controls tw:flex tw:items-center tw:gap-2.5 tw:pt-3.5 tw:px-4">
      <span class="kb-group__controls-label tw:text-[11px] tw:text-content-muted tw:uppercase tw:tracking-[0.04em]">{{ t('kanban.groups.chooseField') }}</span>
      <NvSelect
        :model-value="selectedFieldId"
        :options="fieldOptions"
        :min-width="180"
        :placeholder="t('kanban.groups.chooseField')"
        @update:model-value="value => selectedFieldId = value as string"
      />
    </div>

    <div v-if="groupBy !== 'status' && !selectedField" class="kb-group__empty-state tw:flex tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-2.5 tw:text-[var(--text-muted,var(--text-secondary))]">
      <p>{{ t('kanban.groups.noFieldSelected') }}</p>
      <button
        v-if="availableFields.length > 0"
        type="button"
        class="nv-btn"
        @click="selectedFieldId = availableFields[0].id"
      >
        {{ t('kanban.groups.pickFirstField') }}
      </button>
    </div>

    <div v-else class="kb-group__lane tw:flex tw:flex-1 tw:items-start tw:gap-2.5 tw:overflow-x-auto tw:overflow-y-hidden tw:pt-3.5 tw:px-4 tw:pb-5">
      <div v-for="group in groups" :key="group.key" class="kb-group__col tw:flex tw:w-60 tw:min-w-60 tw:shrink-0 tw:flex-col tw:gap-1.5">
        <div class="kb-group__header tw:flex tw:items-center tw:gap-1.5 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2.5 tw:py-1.5 tw:text-[11.5px] tw:font-[550] tw:text-content-primary">
          <span v-if="group.dot" class="kb-group__dot tw:size-[7px] tw:rounded-full" :style="{ background: group.dot }" />
          <span class="kb-group__label tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ group.label }}</span>
          <span class="kb-group__count tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">{{ group.cards.length }}</span>
          <div class="kb-group__spacer tw:flex-1" />
          <button type="button" class="kb-group__add-btn tw:flex tw:size-[18px] tw:items-center tw:justify-center tw:rounded-[calc(4px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:text-content-muted tw:cursor-pointer" @click="emit('add-card', group.key)">
            <Plus :size="10" />
          </button>
        </div>

        <div class="kb-group__cards tw:flex tw:flex-col tw:gap-[5px]">
          <KanbanCardVue
            v-for="card in group.cards"
            :key="card.id"
            :card="card"
            :board="board"
            :is-dragging="draggingCardId === card.id"
            :compact="true"
            @click="emit('open-card', card.id)"
          />
          <div v-if="!group.cards.length" class="kb-group__empty tw:px-1.5 tw:py-2.5 tw:text-center tw:text-[11.5px] tw:text-content-muted">
            {{ t('kanban.board.dropCard') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
