<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Trash2 } from '../../../ui/icons'
import type { KanbanBoard, KanbanCard, KanbanTemplate } from '../../../types/kanban'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import { createTemplateFromCard, templateHasContent } from './kanbanTemplates'

interface Props {
  board: KanbanBoard
  cards: KanbanCard[]
  activeCardId?: string | null
}

const props = withDefaults(defineProps<Props>(), { activeCardId: null })
const emit = defineEmits<{
  'save-template': [template: KanbanTemplate]
  'delete-template': [id: string]
  'use-template': [id: string]
}>()
const { t } = useI18n()

const templates = computed<KanbanTemplate[]>(() => props.board.templates ?? [])
const cardOptions = computed(() => props.cards.map(card => ({
  value: card.id,
  label: [card.icon, card.title].filter(Boolean).join(' '),
})))

const showForm = ref(false)
const selectedCardId = ref('')
const name = ref('')
const nameEdited = ref(false)

const selectedCard = computed(() => props.cards.find(card => card.id === selectedCardId.value) ?? null)

function toggleForm() {
  if (showForm.value) {
    showForm.value = false
    return
  }
  selectedCardId.value = props.cards.find(card => card.id === props.activeCardId)?.id ?? props.cards[0]?.id ?? ''
  nameEdited.value = false
  name.value = selectedCard.value?.title ?? ''
  showForm.value = true
}

watch(selectedCardId, () => {
  if (!nameEdited.value) name.value = selectedCard.value?.title ?? ''
})

function save() {
  const card = selectedCard.value
  const trimmed = name.value.trim()
  if (!card || !trimmed) return
  emit('save-template', createTemplateFromCard(card, trimmed))
  showForm.value = false
}

function meta(template: KanbanTemplate): string {
  const count = template.card?.fields?.length ?? 0
  const parts = [t('kanban.automations.templateSection.meta', { n: count }, count)]
  if (templateHasContent(template)) parts.push(t('kanban.automations.templateSection.withContent'))
  return parts.join(' · ')
}
</script>

<template>
  <div class="ka-section tw:flex tw:flex-col tw:gap-2 tw:overflow-hidden tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle">
    <div class="ka-section__head tw:flex tw:items-center tw:gap-2 tw:bg-[var(--hover,var(--surface-overlay))] tw:px-3.5 tw:py-[11px]">
      <span class="ka-section__title tw:text-[10.5px] tw:font-semibold tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ t('kanban.automations.templateSection.title') }}</span>
      <span class="ka-section__count tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">{{ templates.length }}</span>
      <div class="ka-section__spacer tw:flex-1" />
      <button
        type="button"
        class="nv-btn ka-templates__save-as tw:inline-flex tw:h-6 tw:items-center tw:gap-1 tw:px-2 tw:text-[11px] tw:text-[var(--text-muted,var(--text-secondary))]"
        :aria-expanded="showForm"
        :disabled="!cards.length"
        :title="cards.length ? undefined : t('kanban.automations.templateSection.saveAsDisabled')"
        @click="toggleForm"
      >
        <Plus :size="10" /> {{ t('kanban.automations.templateSection.saveAs') }}
      </button>
    </div>

    <form
      v-if="showForm"
      class="ka-templates__form tw:flex tw:flex-col tw:gap-2 tw:px-3.5 tw:pb-2.5"
      @submit.prevent="save"
      @keydown.esc.stop="showForm = false"
    >
      <span class="tw:text-[11px] tw:font-semibold tw:tracking-[0.05em] tw:text-content-muted tw:uppercase">{{ t('kanban.automations.templateSection.card') }}</span>
      <NvSelect v-model="selectedCardId" :options="cardOptions" min-width="100%" :aria-label="t('kanban.automations.templateSection.card')" />
      <label class="tw:text-[11px] tw:font-semibold tw:tracking-[0.05em] tw:text-content-muted tw:uppercase" for="ka-template-name">{{ t('kanban.automations.templateSection.name') }}</label>
      <input
        id="ka-template-name"
        v-model="name"
        type="text"
        class="ka-templates__name tw:box-border tw:h-8 tw:w-full tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:text-[13px] tw:text-content-primary tw:outline-none tw:focus:border-accent"
        @input="nameEdited = true"
        @keydown.enter.prevent="save"
      />
      <div class="tw:flex tw:gap-1.5">
        <button type="submit" class="nv-btn nv-btn--primary" :disabled="!name.trim()">{{ t('kanban.automations.templateSection.save') }}</button>
        <button type="button" class="nv-btn" @click="showForm = false">{{ t('kanban.common.cancel') }}</button>
      </div>
    </form>

    <div v-if="!templates.length && !showForm" class="ka-empty tw:flex tw:flex-col tw:gap-1 tw:px-4 tw:py-6 tw:text-center">
      <div class="ka-empty-title tw:text-[13px] tw:font-[550] tw:text-content-secondary">{{ t('kanban.automations.templateSection.empty') }}</div>
      <div class="ka-empty-hint tw:mx-auto tw:max-w-[320px] tw:text-[11.5px] tw:leading-[1.5] tw:text-content-muted">{{ t('kanban.automations.templateSection.emptyHint') }}</div>
    </div>

    <div v-if="templates.length" class="ka-templates-grid tw:grid tw:grid-cols-2 tw:gap-2 tw:px-3.5 tw:py-2.5">
      <div
        v-for="tmpl in templates"
        :key="tmpl.id"
        class="ka-template tw:flex tw:items-center tw:gap-1 tw:rounded-[calc(9px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:transition-[border-color] tw:duration-[120ms] tw:hover:border-accent"
      >
        <button
          type="button"
          class="ka-template__use tw:flex tw:min-w-0 tw:flex-1 tw:cursor-pointer tw:items-center tw:gap-2.5 tw:rounded-[calc(9px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-3 tw:py-2.5 tw:text-left tw:focus-visible:outline-2 tw:focus-visible:outline-focus-ring"
          :title="t('kanban.automations.templateSection.create')"
          @click="emit('use-template', tmpl.id)"
        >
          <span class="ka-template__icon tw:grid tw:size-8 tw:shrink-0 tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-[var(--hover-strong,var(--surface-overlay))] tw:text-sm" aria-hidden="true">{{ tmpl.icon }}</span>
          <span class="ka-template__info tw:min-w-0 tw:flex-1">
            <span class="ka-template__name tw:block tw:truncate tw:text-[12.5px] tw:font-[550] tw:text-content-primary">{{ tmpl.name }}</span>
            <span class="ka-template__desc tw:mt-0.5 tw:block tw:truncate tw:text-[10.5px] tw:text-content-muted">{{ meta(tmpl) }}</span>
          </span>
        </button>
        <button
          type="button"
          class="ka-template__delete tw:mr-1 tw:grid tw:size-7 tw:shrink-0 tw:cursor-pointer tw:place-items-center tw:rounded-md tw:border-0 tw:bg-transparent tw:text-content-muted tw:hover:bg-surface-subtle tw:focus-visible:outline-2 tw:focus-visible:outline-focus-ring"
          :aria-label="t('kanban.automations.templateSection.delete', { name: tmpl.name })"
          @click="emit('delete-template', tmpl.id)"
        >
          <Trash2 :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>
