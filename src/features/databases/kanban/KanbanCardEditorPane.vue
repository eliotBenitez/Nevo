<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ChevronDown, MoreHorizontal, Settings2, Trash2 } from 'lucide-vue-next'
import type { KanbanBoard, KanbanCard, KanbanCardField, KanbanCardPriority } from '../../../types/kanban'
import { useKanbanStore } from '../../../stores/kanban'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useConfirmDialog } from '../../../ui/composables/useConfirmDialog'
import NvMiniEditor from '../../../ui/primitives/NvMiniEditor.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import { computeTaskProgress, getCardStatusValue, getBoardStatusProperty, localizeDefaultKanbanLabel, serializeCardProperties } from './kanbanFields'
import KanbanCardProperties from './KanbanCardProperties.vue'
import KanbanCardLinks from './KanbanCardLinks.vue'

const props = defineProps<{ card: KanbanCard; board: KanbanBoard }>()
const emit = defineEmits<{ back: [] }>()
const { t } = useI18n()
const store = useKanbanStore()
const workspace = useWorkspaceStore()
const { confirm } = useConfirmDialog()

const title = ref(props.card.title)
const content = ref<unknown>(props.card.content ?? { type: 'doc', content: [] })
const status = ref(getCardStatusValue(props.card, props.board))
const dirty = ref(false)
const saving = ref(false)
const saveError = ref('')
const titleInput = ref<HTMLInputElement | null>(null)
const paneRef = ref<HTMLElement | null>(null)
const propertiesDetails = ref<HTMLDetailsElement | null>(null)
const propertiesRef = ref<{ collect: () => { fields: KanbanCardField[]; priority: KanbanCardPriority } } | null>(null)
const propertiesCard = ref(props.card)
let timer: ReturnType<typeof setTimeout> | undefined
let version = 0
let saveChain = Promise.resolve()
let flushPromise: Promise<boolean> | null = null

const taskProgress = computed(() => computeTaskProgress(content.value))
const statusOption = computed(() => {
  const property = getBoardStatusProperty(props.board)
  return property?.options?.find(option => option.id === status.value)
})
const statusLabel = computed(() => statusOption.value ? localizeDefaultKanbanLabel(statusOption.value.name, key => t(key)) : '')
const priorityLabel = computed(() => t(`kanban.card.priorityLevels.${props.card.priority ?? 'none'}`))
let replayingLinkClick = false

function changed() {
  dirty.value = true
  version++
  saveError.value = ''
  clearTimeout(timer)
  timer = setTimeout(() => { void flush() }, 650)
}

function queueSnapshot() {
  const savedVersion = version
  const { fields, priority } = propertiesRef.value?.collect() ?? { fields: props.card.fields ?? [], priority: (props.card.priority ?? 'none') as KanbanCardPriority }
  const snapshot = {
    title: title.value,
    content: content.value,
    properties: serializeCardProperties(props.board, props.card, fields, status.value),
    fields: fields.map((field, index) => ({ ...field, order: index })),
    progress: taskProgress.value?.pct,
    priority,
  }
  saving.value = true
  const request = saveChain.then(() => store.updateCard(props.board.id, props.card.id, snapshot))
  saveChain = request.catch(() => undefined)
  return request.then(() => {
    if (version === savedVersion) {
      dirty.value = false
      saveError.value = ''
    }
  }).catch(error => {
    saveError.value = String(error)
    throw error
  }).finally(() => { saving.value = false })
}

function flush() {
  if (flushPromise) return flushPromise
  clearTimeout(timer)
  flushPromise = (async () => {
    try {
      while (dirty.value) await queueSnapshot()
      await saveChain
      return !saveError.value
    } catch {
      return false
    } finally {
      flushPromise = null
    }
  })()
  return flushPromise
}

async function goBack() {
  if (!await flush()) return
  emit('back')
}

async function deleteCard() {
  if (!await confirm({ message: t('kanban.card.deleteConfirm'), confirmLabel: t('confirmDialog.delete'), variant: 'danger' })) return
  if (!await flush()) return
  await store.deleteCard(props.board.id, props.card.id)
  emit('back')
}

async function guardLinkedCardAction(event: MouseEvent) {
  if (replayingLinkClick || !dirty.value) return
  event.preventDefault()
  event.stopPropagation()
  const target = event.target
  if (!(target instanceof HTMLElement) || !await flush()) return
  replayingLinkClick = true
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  replayingLinkClick = false
}

function onKeydown(event: KeyboardEvent) {
  const pane = event.currentTarget as HTMLElement
  if (event.key === 'Escape') {
    if (event.defaultPrevented) return
    const popover = pane.querySelector<HTMLDetailsElement>('.kb-editor-properties[open]')
    if (popover) {
      popover.open = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const target = event.target
    if (target instanceof Element && target.closest('.nv-prosemirror') && document.querySelector('.editor-overlay, .note-embed-picker')) return
    event.preventDefault()
    event.stopPropagation()
    void goBack()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && pane.contains(event.target as Node)) {
    event.preventDefault()
    void flush()
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  const target = event.target
  if (target instanceof Node && paneRef.value?.contains(target)) return

  const popover = propertiesDetails.value
  if (popover?.open) {
    popover.open = false
    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (document.querySelector('.editor-overlay, .note-embed-picker, .nv-popup-menu__panel, .nv-select__menu')) return
  event.preventDefault()
  event.stopPropagation()
  void goBack()
}

function onDocumentPointerDown(event: PointerEvent) {
  const details = propertiesDetails.value
  if (!details?.open) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (target instanceof Element && target.closest('.nv-select__menu')) return
  if (target instanceof Element && target.closest('.nv-popup-menu__panel')) return
  if (!details.contains(target)) details.open = false
}

watch(() => props.card.id, () => {
  title.value = props.card.title
  content.value = props.card.content ?? { type: 'doc', content: [] }
  status.value = getCardStatusValue(props.card, props.board)
  propertiesCard.value = props.card
  dirty.value = false
  saveError.value = ''
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
  clearTimeout(timer)
  void flush()
})
defineExpose({ flush })
</script>

<template>
  <section ref="paneRef" class="kb-editor-pane tw:box-border tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:border-0 tw:border-l tw:border-solid tw:border-[var(--border-subtle)] tw:bg-(--island-bg)" :aria-label="t('kanban.card.dialogLabel')" @keydown.capture="onKeydown">
    <header class="kb-editor-header tw:relative tw:flex tw:shrink-0 tw:flex-col tw:gap-2.5 tw:border-0 tw:px-7 tw:pt-5 tw:pb-4">
      <div class="kb-editor-header__top tw:flex tw:min-h-7 tw:min-w-0 tw:items-center tw:gap-2">
        <button type="button" class="kb-editor-back nv-btn tw:hidden tw:h-10 tw:shrink-0 tw:items-center tw:gap-1.5 tw:px-3" :aria-label="t('kanban.common.back')" @click="goBack"><ArrowLeft :size="15" /><span>{{ t('kanban.common.back') }}</span></button>
        <NvNoteIcon :value="board.icon" :size="14" class="kb-editor-breadcrumb-icon tw:shrink-0 tw:text-content-muted" />
        <span class="kb-editor-breadcrumb tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:text-content-muted">{{ board.title }}</span>
        <details ref="propertiesDetails" class="kb-editor-properties kb-editor-properties--popover">
          <summary class="kb-editor-properties-trigger tw:inline-flex tw:min-h-8 tw:cursor-pointer tw:list-none tw:items-center tw:gap-1.5 tw:rounded-md tw:bg-transparent tw:px-2.5 tw:text-xs tw:text-content-secondary tw:hover:bg-surface-subtle"><Settings2 :size="13" /><span>{{ t('kanban.card.properties') }}</span><ChevronDown :size="12" class="kb-editor-properties-chevron" /></summary>
          <div class="kb-editor-properties-popover"><KanbanCardProperties ref="propertiesRef" v-model:status-value="status" :card="propertiesCard" :board="board" :task-progress="taskProgress" :mark-dirty="changed" /></div>
        </details>
        <NvPopupMenu placement="bottom-end" width="180px">
          <template #trigger><button type="button" class="kb-editor-more tw:grid tw:size-8 tw:place-items-center tw:rounded-md tw:border-0 tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:hover:bg-surface-subtle" :aria-label="t('kanban.common.moreActions')"><MoreHorizontal :size="17" /></button></template>
          <button type="button" class="kb-editor-delete-menu tw:flex tw:w-full tw:items-center tw:gap-2 tw:rounded-md tw:border-0 tw:bg-transparent tw:px-2.5 tw:py-2 tw:text-left tw:text-sm tw:text-content-danger tw:cursor-pointer tw:hover:bg-surface-subtle" @click="deleteCard"><Trash2 :size="14" />{{ t('kanban.common.delete') }}</button>
        </NvPopupMenu>
      </div>
      <input ref="titleInput" v-model="title" class="kb-editor-title tw:box-border tw:w-full tw:min-w-0 tw:border-0 tw:bg-transparent tw:px-0 tw:text-[28px] tw:font-[650] tw:text-content-primary tw:outline-none" :placeholder="t('kanban.card.titlePlaceholder')" @input="changed">
      <div class="kb-editor-meta tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <span v-if="statusOption" class="kb-editor-chip tw:inline-flex tw:min-h-8 tw:items-center tw:rounded-full tw:bg-surface-subtle tw:px-3 tw:text-xs">{{ statusLabel }}</span>
        <span class="kb-editor-chip kb-editor-chip--priority tw:inline-flex tw:min-h-8 tw:items-center tw:gap-1.5 tw:rounded-full tw:bg-surface-subtle tw:px-3 tw:text-xs"><span class="kb-editor-priority-dot" :data-priority="card.priority ?? 'none'" />{{ priorityLabel }}</span>
      </div>
      <div class="kb-editor-header__separator" />
    </header>
    <div class="kb-editor-body tw:min-h-0 tw:flex-1 tw:overflow-auto tw:px-7 tw:py-5">
      <NvMiniEditor :model-value="content" :placeholder="t('kanban.card.notesPlaceholder')" :workspace-path="workspace.activePath" :plugin-manifests="workspace.plugins" :settings="workspace.settings" :show-block-handle="false" class="kb-editor-content tw:min-h-[320px] tw:w-full" @update:model-value="value => { content = value; changed() }" />
      <div class="kb-editor-links" @click.capture="guardLinkedCardAction"><KanbanCardLinks :card="card" :board="board" /></div>
    </div>
    <footer class="tw:flex tw:shrink-0 tw:items-center tw:gap-3 tw:border-t tw:border-solid tw:border-[var(--border-subtle)] tw:px-6 tw:py-2.5 tw:text-xs tw:text-content-muted" aria-live="polite">
      <span v-if="saveError" class="tw:text-content-danger">{{ t('kanban.card.saveFailed') }} <button class="tw:underline" @click="flush">{{ t('kanban.common.retry') }}</button></span>
      <span v-else-if="saving">{{ t('kanban.common.saving') }}</span>
      <span v-else-if="dirty">{{ t('kanban.card.saveHint') }}</span>
      <span v-else>{{ t('kanban.common.saved') }}</span>
      <span class="tw:ml-auto tw:hidden tw:sm:inline">{{ t('kanban.card.saveHint') }}</span>
    </footer>
  </section>
</template>

<style scoped>
.kb-editor-pane { border: 0; border-left: 1px solid var(--border-subtle); }
.kb-editor-header { border: 0; }
.kb-editor-pane footer { border: 0; border-top: 1px solid var(--border-subtle); }
.kb-editor-content { display: block; min-height: 55vh; border: 0; border-radius: 0; background: transparent; padding: 0; }
.kb-editor-content :deep(.editor-surface--compact) { min-height: 55vh; max-height: none; overflow: visible; }
.kb-editor-content :deep(.editor-surface__editor),
.kb-editor-content :deep(.nv-prosemirror) { min-height: 55vh; }
.kb-editor-content :deep(.doc-editor .nv-prosemirror .nv-active-block::before) { display: none; }
.kb-editor-header__separator { height: 1px; margin: 0 -8px; background: var(--border-subtle); }
.kb-editor-properties { position: relative; }
.kb-editor-properties summary { list-style: none; }
.kb-editor-properties summary::-webkit-details-marker { display: none; }
.kb-editor-properties-trigger { box-sizing: border-box; border: 1px solid var(--border-subtle); }
.kb-editor-properties-popover { position: absolute; top: calc(100% + 8px); right: 0; z-index: 20; width: min(360px, calc(100vw - 32px)); max-height: min(70vh, 620px); overflow: auto; padding: 14px; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--surface-raised); box-shadow: var(--shadow-pop); }
.kb-editor-properties:not([open]) .kb-editor-properties-popover { display: none; }
.kb-editor-title:focus-visible,
.kb-editor-properties summary:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 4px; border-radius: 4px; }
.kb-editor-properties[open] .kb-editor-properties-chevron { transform: rotate(180deg); }
.kb-editor-priority-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); }
.kb-editor-priority-dot[data-priority='low'] { background: #3b82f6; }
.kb-editor-priority-dot[data-priority='medium'] { background: #f59e0b; }
.kb-editor-priority-dot[data-priority='high'] { background: #f97316; }
.kb-editor-priority-dot[data-priority='urgent'] { background: #ef4444; }
@media (min-width: 1301px) {
  .kb-editor-meta { margin-top: 10px; }
  .kb-editor-header__separator { margin-top: 22px; }
}
@media (max-width: 1300px) {
  .kb-editor-back { display: inline-flex; min-width: 44px; min-height: 44px; }
}
@media (max-width: 760px) {
  .kb-editor-header { gap: 10px; padding: 12px 14px; }
  .kb-editor-header__top { gap: 8px; }
  .kb-editor-title { font-size: 25px; line-height: 1.2; }
  .kb-editor-body { padding: 14px; }
  .kb-editor-properties-trigger { min-height: 44px; }
  .kb-editor-properties-popover { right: -40px; }
}
</style>
