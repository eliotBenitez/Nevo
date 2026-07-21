<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { LayoutDashboard, LoaderCircle, PencilLine, Plus, Save, Trash2, X } from 'lucide-vue-next'
import { useKanbanStore } from '../../../stores/kanban'
import { useFocusTrap } from '../../../ui/composables/useFocusTrap'

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
const dialogRef = ref<HTMLElement | null>(null)
const titleInputRef = ref<HTMLInputElement | null>(null)
const active = ref(true)

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
const { activate, deactivate } = useFocusTrap(dialogRef, active)

watch(() => props.initialTitle, v => { title.value = v ?? '' })
watch(() => props.initialIcon, v => { icon.value = v ?? '🗂️' })

onMounted(async () => {
  await nextTick()
  activate()
  if (isFormMode.value) titleInputRef.value?.focus()
})

onBeforeUnmount(() => {
  active.value = false
  deactivate()
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

function closeOnEscape() {
  if (!busy.value) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="kb-bm-backdrop" @click.self="!busy && emit('close')">
      <form
        ref="dialogRef"
        class="kb-bm"
        :class="{ 'kb-bm--delete': mode === 'delete' }"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-bm-title"
        :aria-describedby="dialogDescription ? 'kb-bm-description' : undefined"
        @submit.prevent="submit"
        @keydown.esc.prevent.stop="closeOnEscape"
      >
        <header class="kb-bm__header">
          <div class="kb-bm__heading">
            <span class="kb-bm__header-icon" aria-hidden="true">
              <LayoutDashboard v-if="mode === 'create'" :size="19" :stroke-width="1.8" />
              <PencilLine v-else-if="mode === 'rename'" :size="19" :stroke-width="1.8" />
              <Trash2 v-else :size="19" :stroke-width="1.8" />
            </span>
            <div>
              <h2 id="kb-bm-title" class="kb-bm__title">{{ dialogTitle }}</h2>
              <p v-if="dialogDescription" id="kb-bm-description" class="kb-bm__description">{{ dialogDescription }}</p>
            </div>
          </div>
          <button type="button" class="nv-btn nv-btn--icon kb-bm__close" :aria-label="t('kanban.common.close')" :disabled="busy" @click="emit('close')"><X :size="16" /></button>
        </header>

        <div class="kb-bm__body">
          <template v-if="mode !== 'delete'">
            <div class="kb-bm__field">
              <label class="kb-bm__label" for="kb-bm-title-input">{{ t('kanban.boardModal.boardName') }}</label>
              <input
                id="kb-bm-title-input"
                ref="titleInputRef"
                v-model="title"
                class="kb-bm__input"
                :placeholder="t('kanban.boardModal.boardNamePlaceholder')"
                maxlength="80"
              />
            </div>
            <fieldset class="kb-bm__field kb-bm__icon-field">
              <legend class="kb-bm__label">{{ t('kanban.boardModal.icon') }}</legend>
              <div class="kb-bm__icons">
                <button
                  v-for="em in COMMON_ICONS"
                  :key="em"
                  type="button"
                  class="kb-bm__icon-btn"
                  :class="{ 'is-active': icon === em }"
                  :aria-label="`${t('kanban.boardModal.icon')}: ${em}`"
                  :aria-pressed="icon === em"
                  @click="icon = em"
                >{{ em }}</button>
              </div>
            </fieldset>
          </template>

          <template v-else>
            <p class="kb-bm__confirm-text">
              {{ t('kanban.boardModal.deleteConfirm', { title: deleteTargetTitle }) }}
            </p>
          </template>
        </div>

        <footer class="kb-bm__footer">
          <button type="button" class="nv-btn" :disabled="busy" @click="emit('close')">{{ t('kanban.common.cancel') }}</button>
          <button
            :type="mode === 'delete' ? 'button' : 'submit'"
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
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.kb-bm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  padding: max(16px, var(--safe-area-top)) max(16px, var(--safe-area-right)) max(16px, var(--safe-area-bottom)) max(16px, var(--safe-area-left));
  place-items: center;
  background: oklch(0 0 0 / 0.48);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
}

.kb-bm {
  width: min(456px, 100%);
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: calc(18px * var(--radius-scale, 1));
  background: var(--glass-3);
  box-shadow: var(--shadow-pop);
}

.kb-bm__header,
.kb-bm__heading,
.kb-bm__footer {
  display: flex;
  align-items: center;
}

.kb-bm__header {
  justify-content: space-between;
  gap: 16px;
  padding: 20px 20px 0;
}

.kb-bm__heading {
  min-width: 0;
  gap: 12px;
}

.kb-bm__header-icon {
  display: grid;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid color-mix(in oklab, var(--accent) 24%, var(--line-2));
  border-radius: calc(11px * var(--radius-scale, 1));
  background: var(--accent-soft);
  color: var(--accent);
}

.kb-bm--delete .kb-bm__header-icon {
  border-color: var(--danger-line);
  background: var(--danger-soft);
  color: var(--danger);
}

.kb-bm__close {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
}

.kb-bm__title {
  margin: 0;
  color: var(--text-1);
  font-size: 16px;
  font-weight: 620;
  line-height: 1.25;
}

.kb-bm__description {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.45;
}

.kb-bm__body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.kb-bm__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kb-bm__icon-field {
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.kb-bm__label {
  padding: 0;
  color: var(--text-2);
  font-size: 11px;
  font-weight: 620;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.kb-bm__input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--line-2);
  border-radius: calc(8px * var(--radius-scale, 1));
  background: var(--glass-2);
  font-size: 13px;
  color: var(--text-1);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.kb-bm__input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.kb-bm__icons {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}

.kb-bm__icon-btn {
  display: grid;
  min-width: 0;
  height: 38px;
  place-items: center;
  border: 1px solid var(--line-2);
  border-radius: calc(9px * var(--radius-scale, 1));
  background: var(--glass-2);
  color: var(--text-1);
  font-size: 16px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.kb-bm__icon-btn:hover {
  background: var(--hover-strong);
}

.kb-bm__icon-btn:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.kb-bm__icon-btn.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 1px var(--accent-soft);
}

.kb-bm__confirm-text {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
}

.kb-bm__footer {
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px 20px;
  border-top: 1px solid var(--line-1);
}

.kb-bm__footer .nv-btn {
  min-height: 34px;
  padding-inline: 13px;
}

.kb-bm__spinner {
  animation: kb-bm-spin 0.7s linear infinite;
}

@keyframes kb-bm-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: no-preference) {
  .kb-bm {
    animation: kb-bm-in 0.18s ease-out;
  }
}

@keyframes kb-bm-in {
  from { opacity: 0; transform: translateY(6px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (max-width: 480px) {
  .kb-bm__header,
  .kb-bm__body,
  .kb-bm__footer {
    padding-inline: 18px;
  }

  .kb-bm__header { padding-top: 18px; }
  .kb-bm__body { padding-block: 18px; }
  .kb-bm__close,
  .kb-bm__icon-btn { min-height: 44px; }
  .kb-bm__footer {
    flex-direction: column-reverse;
    padding-bottom: 18px;
  }

  .kb-bm__footer .nv-btn {
    width: 100%;
    min-height: 44px;
    justify-content: center;
  }
}
</style>
