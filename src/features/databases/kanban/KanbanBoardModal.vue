<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { LayoutDashboard, LoaderCircle, PencilLine, Plus, Save, Trash2 } from 'lucide-vue-next'
import { useKanbanStore } from '../../../stores/kanban'
import NvModal from '../../../ui/primitives/NvModal.vue'

type Mode = 'create' | 'rename' | 'delete'

interface Props {
  mode: Mode
  boardId?: string
  initialTitle?: string
  initialIcon?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'close': []
  'created': [boardId: string]
  'renamed': []
  'deleted': []
}>()
const { t } = useI18n()

const kanbanStore = useKanbanStore()

const title = ref(props.initialTitle ?? '')
const icon = ref(props.initialIcon ?? '🗂️')
const busy = ref(false)
const titleInputRef = ref<HTMLInputElement | null>(null)

const COMMON_ICONS = ['🗂️', '📋', '🚀', '✅', '🔥', '💡', '⚙️', '📌', '🎯', '🏗️', '📊', '🌟']
const isFormMode = computed(() => props.mode !== 'delete')
const dialogTitle = computed(() => (
  props.mode === 'create'
    ? t('kanban.boardModal.createTitle')
    : props.mode === 'rename'
      ? t('kanban.boardModal.renameTitle')
      : t('kanban.boardModal.deleteTitle')
))
const dialogDescription = computed(() => (
  props.mode === 'create' ? t('kanban.boardModal.createDescription') : undefined
))
const primaryActionLabel = computed(() => (
  props.mode === 'create'
    ? t('kanban.boardModal.create')
    : props.mode === 'rename'
      ? t('kanban.common.save')
      : t('kanban.common.delete')
))
const deleteTargetTitle = computed(() => props.initialTitle || t('kanban.boardModal.thisBoard'))

watch(() => props.initialTitle, v => { title.value = v ?? '' })
watch(() => props.initialIcon, v => { icon.value = v ?? '🗂️' })

// NvModal only runs its own focus-trap activate() on an `open` prop
// transition; this modal is instead mounted/unmounted wholesale by the
// parent's v-if, so `open` is a constant `true`. Focus the title input
// ourselves on mount instead.
void nextTick(() => {
  if (isFormMode.value) titleInputRef.value?.focus()
})

async function submit() {
  if (busy.value) return
  busy.value = true
  try {
    if (props.mode === 'create') {
      const board = await kanbanStore.createBoard(title.value.trim() || t('kanban.boardModal.newBoard'), icon.value)
      if (board) emit('created', board.id)
    } else if (props.mode === 'rename' && props.boardId) {
      await kanbanStore.updateBoard(props.boardId, { title: title.value.trim() || t('kanban.boardModal.untitled'), icon: icon.value })
      emit('renamed')
    } else if (props.mode === 'delete' && props.boardId) {
      await kanbanStore.deleteBoard(props.boardId)
      emit('deleted')
    }
  } finally {
    busy.value = false
  }
}

// Busy previously guarded every dismissal path (backdrop, Escape and the
// disabled close button), not just the backdrop — keep that via @close so
// NvModal's Escape/X/backdrop all funnel through the same guard.
function handleClose() {
  if (!busy.value) emit('close')
}
</script>

<template>
  <NvModal
    :open="true"
    size="md"
    :dismissible="!busy"
    :close-on-backdrop="!busy"
    labelled-by="kb-bm-title"
    :described-by="dialogDescription ? 'kb-bm-description' : undefined"
    :panel-class="mode === 'delete' ? 'kb-bm--delete' : undefined"
    @close="handleClose"
  >
    <template #header>
      <span class="kb-bm__header-icon tw:grid tw:size-[38px] tw:shrink-0 tw:place-items-center tw:rounded-[calc(11px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--accent-soft) tw:text-accent" aria-hidden="true">
        <LayoutDashboard v-if="mode === 'create'" :size="19" :stroke-width="1.8" />
        <PencilLine v-else-if="mode === 'rename'" :size="19" :stroke-width="1.8" />
        <Trash2 v-else :size="19" :stroke-width="1.8" />
      </span>
      <div>
        <h2 id="kb-bm-title" class="kb-bm__title tw:m-0 tw:text-base tw:leading-[1.25] tw:font-[620] tw:text-content-primary">{{ dialogTitle }}</h2>
        <p v-if="dialogDescription" id="kb-bm-description" class="kb-bm__description tw:mt-1 tw:mb-0 tw:text-[12.5px] tw:leading-[1.45] tw:text-content-muted">{{ dialogDescription }}</p>
      </div>
    </template>

    <form id="kb-bm-form" class="kb-bm__body tw:flex tw:flex-col tw:gap-[18px]" @submit.prevent="submit">
      <template v-if="mode !== 'delete'">
        <div class="kb-bm__field tw:flex tw:flex-col tw:gap-1.5">
          <label class="kb-bm__label tw:p-0 tw:text-[11px] tw:font-[620] tw:tracking-[0.04em] tw:text-content-secondary tw:uppercase" for="kb-bm-title-input">{{ t('kanban.boardModal.boardName') }}</label>
          <input
            id="kb-bm-title-input"
            ref="titleInputRef"
            v-model="title"
            class="kb-bm__input tw:box-border tw:w-full tw:h-10 tw:px-3 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:text-[13px] tw:text-content-primary tw:outline-none tw:transition-[border-color,box-shadow,background-color] tw:duration-150 tw:focus:border-accent tw:focus:shadow-[0_0_0_2px_var(--accent-soft)]"
            :placeholder="t('kanban.boardModal.boardNamePlaceholder')"
            maxlength="80"
          />
        </div>
        <fieldset class="kb-bm__field kb-bm__icon-field tw:m-0 tw:min-w-0 tw:border-0 tw:p-0 tw:flex tw:flex-col tw:gap-1.5">
          <legend class="kb-bm__label tw:p-0 tw:text-[11px] tw:font-[620] tw:tracking-[0.04em] tw:text-content-secondary tw:uppercase">{{ t('kanban.boardModal.icon') }}</legend>
          <div class="kb-bm__icons tw:grid tw:grid-cols-6 tw:gap-1.5">
            <button
              v-for="em in COMMON_ICONS"
              :key="em"
              type="button"
              class="kb-bm__icon-btn tw:grid tw:min-w-0 tw:h-[38px] tw:place-items-center tw:rounded-[calc(9px*var(--radius-scale,1))] tw:text-base tw:cursor-pointer tw:transition-[background-color,border-color,box-shadow] tw:duration-150 tw:focus-visible:outline-none tw:focus-visible:border-accent tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft)] tw:max-[480px]:min-h-11"
              :class="icon === em
                ? 'is-active tw:border tw:border-solid tw:border-accent tw:bg-(--accent-soft) tw:text-content-primary tw:shadow-[0_0_0_1px_var(--accent-soft)]'
                : 'tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:text-content-primary tw:hover:bg-(--hover-strong)'"
              :aria-label="`${t('kanban.boardModal.icon')}: ${em}`"
              :aria-pressed="icon === em"
              @click="icon = em"
            >{{ em }}</button>
          </div>
        </fieldset>
      </template>

      <template v-else>
        <p class="kb-bm__confirm-text tw:m-0 tw:text-[13px] tw:leading-[1.5] tw:text-content-secondary">
          {{ t('kanban.boardModal.deleteConfirm', { title: deleteTargetTitle }) }}
        </p>
      </template>
    </form>

    <template #footer>
      <button type="button" class="nv-btn" :disabled="busy" @click="emit('close')">{{ t('kanban.common.cancel') }}</button>
      <button
        :type="mode === 'delete' ? 'button' : 'submit'"
        :form="mode === 'delete' ? undefined : 'kb-bm-form'"
        class="nv-btn"
        :class="mode === 'delete' ? 'nv-btn--danger' : 'nv-btn--primary'"
        :disabled="busy"
        :aria-busy="busy"
        @click="mode === 'delete' && submit()"
      >
        <LoaderCircle v-if="busy" class="kb-bm__spinner" :size="14" aria-hidden="true" />
        <Plus v-else-if="mode === 'create'" :size="14" aria-hidden="true" />
        <Save v-else-if="mode === 'rename'" :size="14" aria-hidden="true" />
        <Trash2 v-else :size="14" aria-hidden="true" />
        {{ primaryActionLabel }}
      </button>
    </template>
  </NvModal>
</template>

<!-- The panel element lives inside NvModal's template and is teleported to
     <body>, so a scoped rule would not reach it. This one modifier must stay
     unscoped (NvConfirmDialog does the same for its danger variant). -->
<style>
.kb-bm--delete .kb-bm__header-icon {
  border-color: var(--danger-line);
  background: var(--danger-soft);
  color: var(--danger);
}
</style>

<style scoped>
.kb-bm__spinner {
  animation: kb-bm-spin 0.7s linear infinite;
}

@keyframes kb-bm-spin {
  to { transform: rotate(360deg); }
}
</style>
