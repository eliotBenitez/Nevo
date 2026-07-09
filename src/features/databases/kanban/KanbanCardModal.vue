<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2, X } from 'lucide-vue-next'
import type { KanbanBoard, KanbanCard, KanbanCardField, KanbanCardPriority } from '../../../types/kanban'
import { useKanbanStore } from '../../../stores/kanban'
import { useWorkspaceStore } from '../../../stores/workspace'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvMiniEditor from '../../../ui/primitives/NvMiniEditor.vue'
import { useConfirmDialog } from '../../../ui/composables/useConfirmDialog'
import {
  getBoardStatusProperty,
  getCardStatusValue,
  serializeCardProperties,
  computeTaskProgress,
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

onMounted(() => {
  setTimeout(() => titleInputRef.value?.focus(), 50)
})

const statusProp = computed(() => getBoardStatusProperty(props.board))
const statusOption = computed(() =>
  statusProp.value?.options?.find(option => option.id === localStatusValue.value) ?? null
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
                  :workspace-path="workspaceStore.activePath"
                  :plugin-manifests="workspaceStore.plugins"
                  :settings="workspaceStore.settings"
                  class="km-notes-editor"
                  @update:model-value="value => { localContent = value; markNotesDirty() }"
                />
              </section>

              <KanbanCardLinks :card="card" :board="board" />
            </div>
          </div>

          <aside class="km-props">
            <div class="km-props__inner">
              <KanbanCardProperties
                ref="propertiesRef"
                v-model:status-value="localStatusValue"
                :card="card"
                :board="board"
                :task-progress="taskProgress"
                :mark-dirty="markDirty"
              />

              <KanbanCardAutomations :board="board" />

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
