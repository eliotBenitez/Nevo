<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
import { useKanbanStore } from '../../../stores/kanban'

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
const dialogTitle = computed(() => (
  props.mode === 'create'
    ? t('kanban.boardModal.createTitle')
    : props.mode === 'rename'
      ? t('kanban.boardModal.renameTitle')
      : t('kanban.boardModal.deleteTitle')
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

onMounted(() => {
  if (props.mode !== 'delete') {
    setTimeout(() => titleInputRef.value?.focus(), 60)
  }
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

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'Enter' && props.mode !== 'delete') { e.preventDefault(); void submit() }
}
</script>

<template>
  <Teleport to="body">
    <div class="kb-bm-backdrop" @click.self="emit('close')" @keydown="onKeydown">
      <div class="kb-bm" role="dialog" :aria-label="dialogTitle">
        <div class="kb-bm__header">
          <span class="kb-bm__title">{{ dialogTitle }}</span>
          <button type="button" class="nv-btn" :aria-label="t('kanban.common.close')" @click="emit('close')"><X :size="14" /></button>
        </div>

        <div class="kb-bm__body">
          <template v-if="mode !== 'delete'">
            <div class="kb-bm__field">
              <label class="kb-bm__label">{{ t('kanban.boardModal.boardName') }}</label>
              <input
                ref="titleInputRef"
                v-model="title"
                class="kb-bm__input"
                :placeholder="t('kanban.boardModal.boardNamePlaceholder')"
                maxlength="80"
              />
            </div>
            <div class="kb-bm__field">
              <label class="kb-bm__label">{{ t('kanban.boardModal.icon') }}</label>
              <div class="kb-bm__icons">
                <button
                  v-for="em in COMMON_ICONS"
                  :key="em"
                  type="button"
                  class="kb-bm__icon-btn"
                  :class="{ 'is-active': icon === em }"
                  @click="icon = em"
                >{{ em }}</button>
              </div>
            </div>
          </template>

          <template v-else>
            <p class="kb-bm__confirm-text">
              {{ t('kanban.boardModal.deleteConfirm', { title: deleteTargetTitle }) }}
            </p>
          </template>
        </div>

        <div class="kb-bm__footer">
          <button type="button" class="nv-btn" @click="emit('close')">{{ t('kanban.common.cancel') }}</button>
          <button
            type="button"
            class="nv-btn"
            :class="mode === 'delete' ? 'nv-btn--danger' : 'nv-btn--primary'"
            :disabled="busy"
            @click="submit"
          >
            {{ primaryActionLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.kb-bm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: oklch(0 0 0 / 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.kb-bm {
  width: 360px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: 0 16px 48px var(--shadow-strong);
  overflow: hidden;
  animation: kb-bm-in 0.15s ease;
}

@keyframes kb-bm-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}

.kb-bm__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.kb-bm__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.kb-bm__body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.kb-bm__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kb-bm__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.kb-bm__input {
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.1s;
}

.kb-bm__input:focus {
  border-color: var(--accent);
}

.kb-bm__icons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.kb-bm__icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: var(--surface-2);
  font-size: 16px;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kb-bm__icon-btn:hover {
  background: var(--surface-3);
}

.kb-bm__icon-btn.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.kb-bm__confirm-text {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
}

.kb-bm__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle);
}

</style>
