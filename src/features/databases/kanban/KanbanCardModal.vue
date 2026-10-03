<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2 } from 'lucide-vue-next'
// Loaded here (not main.ts) so this modal's CSS ships only when a card opens.
import '../../../styles/features/kanban-modal.css'
import type { KanbanBoard, KanbanCard, KanbanCardField, KanbanCardPriority } from '../../../types/kanban'
import { useKanbanStore } from '../../../stores/kanban'
import { useWorkspaceStore } from '../../../stores/workspace'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvMiniEditor from '../../../ui/primitives/NvMiniEditor.vue'
import NvModal from '../../../ui/primitives/NvModal.vue'
import { useConfirmDialog } from '../../../ui/composables/useConfirmDialog'
import {
  getBoardStatusProperty,
  getCardStatusValue,
  serializeCardProperties,
  computeTaskProgress,
  localizeDefaultKanbanLabel,
} from './kanbanFields'
import KanbanCardProperties from './KanbanCardProperties.vue'
import KanbanCardLinks from './KanbanCardLinks.vue'
import KanbanCardAutomations from './KanbanCardAutomations.vue'

interface Props {
  card: KanbanCard
  board: KanbanBoard
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'close': [] }>()

const { t, locale } = useI18n()
const kanbanStore = useKanbanStore()
const workspaceStore = useWorkspaceStore()
const { confirm } = useConfirmDialog()

const localTitle = ref(props.card.title)
const localContent = ref<unknown>(props.card.content ?? { type: 'doc', content: [] })
const localStatusValue = ref(getCardStatusValue(props.card, props.board))
const isDirty = ref(false)
const notesDirty = ref(false)
const titleInputRef = ref<HTMLInputElement | null>(null)
const propertiesRef = ref<{ collect: () => { fields: KanbanCardField[]; priority: KanbanCardPriority } } | null>(null)

watch(() => props.card, card => {
  localTitle.value = card.title
  localContent.value = card.content ?? { type: 'doc', content: [] }
  localStatusValue.value = getCardStatusValue(card, props.board)
  isDirty.value = false
  notesDirty.value = false
})

// NvModal only calls its own activate()/deactivate() when its `open` prop
// transitions — this modal is instead mounted/unmounted wholesale by the
// parent's v-if (see KanbanView.vue), so `open` is a constant `true` and that
// transition never fires. Restore-focus-on-close previously came from this
// component's own onBeforeUnmount, so it is kept here rather than assumed to
// come from NvModal.
let previousFocus: HTMLElement | null = null

onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null
  setTimeout(() => titleInputRef.value?.focus(), 50)
  window.addEventListener('keydown', onWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  previousFocus?.focus()
})

const statusProp = computed(() => getBoardStatusProperty(props.board))
const statusOption = computed(() =>
  statusProp.value?.options?.find(option => option.id === localStatusValue.value) ?? null
)
const statusOptionLabel = computed(() =>
  statusOption.value
    ? localizeDefaultKanbanLabel(statusOption.value.name, key => t(key))
    : ''
)

const taskProgress = computed(() => computeTaskProgress(localContent.value))

function markDirty() {
  isDirty.value = true
}

function markNotesDirty() {
  isDirty.value = true
  notesDirty.value = true
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return iso
  return date.toLocaleDateString(locale.value, { month: 'short', day: 'numeric', year: 'numeric' })
}

async function save() {
  const { fields, priority } = propertiesRef.value?.collect()
    ?? { fields: [] as KanbanCardField[], priority: 'none' as KanbanCardPriority }
  await kanbanStore.updateCard(props.board.id, props.card.id, {
    title: localTitle.value,
    content: notesDirty.value ? localContent.value : props.card.content,
    properties: serializeCardProperties(props.board, props.card, fields, localStatusValue.value),
    fields: fields.map((field, index) => ({ ...field, order: index })),
    progress: taskProgress.value?.pct,
    priority: priority !== 'none' ? priority : undefined,
  })
  isDirty.value = false
  notesDirty.value = false
}

async function handleClose() {
  if (isDirty.value && !await confirm({
    message: t('kanban.card.unsavedChanges'),
    confirmLabel: t('confirmDialog.discard'),
  })) return
  emit('close')
}

async function deleteCard() {
  if (!await confirm({
    message: t('kanban.card.deleteConfirm'),
    confirmLabel: t('confirmDialog.delete'),
    variant: 'danger',
  })) return
  await kanbanStore.deleteCard(props.board.id, props.card.id)
  emit('close')
}

// Escape is now NvModal's job (routed back to handleClose via @close). Only
// the save shortcut remains component-owned, since NvModal has no concept of it.
function onWindowKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && isDirty.value) {
    event.preventDefault()
    void save()
  }
}
</script>

<template>
  <NvModal :open="true" size="lg" panel-class="km-card-modal" labelled-by="km-modal-title" @close="handleClose">
    <template #header>
      <div class="km-header__left tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-3">
        <h2 id="km-modal-title" class="tw:sr-only">{{ t('kanban.card.dialogLabel') }}</h2>
        <label class="tw:sr-only" for="km-card-title">{{ t('kanban.card.titlePlaceholder') }}</label>
        <input
          id="km-card-title"
          ref="titleInputRef"
          v-model="localTitle"
          class="km-title-input tw:box-border tw:min-w-0 tw:flex-1 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-2 tw:py-1.5 tw:text-[17px] tw:leading-tight tw:font-[620] tw:tracking-[-0.01em] tw:text-content-primary tw:outline-none tw:transition-[background-color,box-shadow] tw:duration-150 tw:hover:bg-surface-subtle tw:focus:bg-surface-subtle tw:focus:shadow-[0_0_0_2px_var(--focus-ring)]"
          :placeholder="t('kanban.card.titlePlaceholder')"
          @input="markDirty"
        />
        <span
          v-if="statusOption"
          class="km-status tw:inline-flex tw:h-7 tw:shrink-0 tw:items-center tw:gap-[5px] tw:rounded-full tw:bg-[var(--hover-strong,var(--surface-overlay))] tw:px-2.5 tw:text-[11px] tw:font-semibold"
          :style="statusOption.color ? { background: `${statusOption.color}28`, color: 'var(--text-primary)' } : {}"
        >
          <span class="km-status__dot tw:size-1.5 tw:rounded-full tw:bg-current" :style="statusOption.color ? { background: statusOption.color } : {}" />
          {{ statusOptionLabel }}
        </span>
      </div>
    </template>

    <template #header-actions>
      <NvButton
        variant="danger"
        size="xs"
        icon
        class="km-header-btn tw:shrink-0"
        :title="t('kanban.common.delete')"
        :aria-label="t('kanban.common.delete')"
        @click="deleteCard"
      >
        <Trash2 :size="11" />
      </NvButton>
    </template>

    <div class="km-body tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] tw:overflow-hidden tw:max-[980px]:grid-cols-1 tw:max-[720px]:block tw:max-[720px]:overflow-x-hidden tw:max-[720px]:overflow-y-auto tw:max-[720px]:[overscroll-behavior:contain]">
      <div class="km-content tw:min-h-0 tw:min-w-0 tw:overflow-auto tw:max-[720px]:overflow-visible">
        <div class="km-content__inner tw:flex tw:min-h-full tw:min-w-0 tw:flex-col tw:pt-6 tw:pr-[clamp(20px,4vw,34px)] tw:pb-7 tw:pl-[clamp(20px,4vw,34px)] tw:max-[720px]:min-h-0">
          <section class="km-section tw:min-w-0">
            <div class="km-section-label tw:m-0 tw:mb-2.5 tw:text-[11px] tw:font-bold tw:tracking-[0.04em] tw:text-content-muted tw:uppercase">{{ t('kanban.card.notes') }}</div>
            <NvMiniEditor
              :model-value="localContent"
              :placeholder="t('kanban.card.notesPlaceholder')"
              :workspace-path="workspaceStore.activePath"
              :plugin-manifests="workspaceStore.plugins"
              :settings="workspaceStore.settings"
              class="km-notes-editor tw:h-[clamp(200px,30vh,250px)] tw:min-h-[200px] tw:min-w-0 tw:w-full tw:max-[720px]:h-[clamp(180px,28vh,240px)] tw:max-[720px]:min-h-[180px]"
              @update:model-value="value => { localContent = value; markNotesDirty() }"
            />
          </section>

          <KanbanCardLinks :card="card" :board="board" />
        </div>
      </div>

      <aside class="km-props tw:min-h-0 tw:min-w-0 tw:w-full tw:max-h-full tw:self-start tw:overflow-auto tw:bg-surface-subtle tw:max-[720px]:overflow-visible">
        <div class="km-props__inner tw:flex tw:flex-col tw:gap-3 tw:pt-[18px] tw:pr-4 tw:pb-5 tw:pl-4">
          <KanbanCardProperties
            ref="propertiesRef"
            v-model:status-value="localStatusValue"
            :card="card"
            :board="board"
            :task-progress="taskProgress"
            :mark-dirty="markDirty"
          />

          <KanbanCardAutomations :board="board" />
        </div>
      </aside>
    </div>

    <template #footer>
      <div class="km-metadata tw:mr-auto tw:min-w-0 tw:text-[10px] tw:leading-4 tw:text-content-muted tw:max-[720px]:hidden">
        {{ t('kanban.card.createdAt') }} {{ formatDate(card.createdAt) }}
        <span aria-hidden="true"> · </span>
        {{ t('kanban.card.updatedAt') }} {{ formatDate(card.updatedAt) }}
      </div>
      <span v-if="isDirty" class="km-footer__hint tw:text-[11px] tw:text-[var(--text-muted,var(--text-secondary))] tw:max-[720px]:hidden">{{ t('kanban.card.saveHint') }}</span>
      <div class="km-footer__spacer tw:flex-1" />
      <NvButton @click="handleClose">{{ t('kanban.common.cancel') }}</NvButton>
      <NvButton variant="primary" :disabled="!isDirty" @click="save">{{ t('kanban.common.save') }}</NvButton>
    </template>
  </NvModal>
</template>
