<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
import type { KanbanBoard } from '../../../types/kanban'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import { getBoardColumns } from './kanbanFields'

interface Props {
  board: KanbanBoard
  defaultColumnId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'confirm': [title: string, columnId: string]
  'close': []
}>()

const { t } = useI18n()

const title = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

const columnOptions = computed(() =>
  getBoardColumns(props.board).map(opt => ({ value: opt.id, label: opt.name }))
)

const selectedColumnId = ref(
  props.defaultColumnId ?? columnOptions.value[0]?.value ?? ''
)

function confirm() {
  const t = title.value.trim()
  if (!t || !selectedColumnId.value) return
  emit('confirm', t, selectedColumnId.value)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); confirm() }
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div class="kadd-backdrop" @click.self="emit('close')">
      <div class="kadd-panel" role="dialog" :aria-label="t('kanban.modal.addCardTitle')">
        <!-- Header -->
        <div class="kadd-header">
          <span class="kadd-header__title">{{ t('kanban.modal.addCardTitle') }}</span>
          <button type="button" class="kadd-icon-btn" :aria-label="t('kanban.common.close')" @click="emit('close')">
            <X :size="13" />
          </button>
        </div>

        <!-- Body -->
        <div class="kadd-body">
          <!-- Title input -->
          <input
            ref="titleInputRef"
            v-model="title"
            type="text"
            class="kadd-title-input"
            :placeholder="t('kanban.modal.titlePlaceholder')"
            autofocus
            @keydown="onKeydown"
          />

          <!-- Column picker -->
          <div v-if="columnOptions.length > 1" class="kadd-field">
            <label class="kadd-field__label">{{ t('kanban.modal.column') }}</label>
            <NvSelect
              :model-value="selectedColumnId"
              :options="columnOptions"
              :min-width="'100%'"
              @update:model-value="selectedColumnId = $event"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="kadd-footer">
          <button type="button" class="nv-btn" @click="emit('close')">
            {{ t('kanban.common.cancel') }}
          </button>
          <button
            type="button"
            class="nv-btn nv-btn--primary"
            :disabled="!title.trim()"
            @click="confirm"
          >
            {{ t('kanban.modal.add') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.kadd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: oklch(0 0 0 / 0.30);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.kadd-panel {
  width: 420px;
  max-width: 100%;
  background: var(--glass-3, var(--surface-1));
  border: 1px solid var(--line-strong, var(--border-subtle));
  border-radius: 12px;
  box-shadow: 0 24px 64px -12px oklch(0 0 0 / 0.45);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: kadd-in 0.14s ease;
}

@keyframes kadd-in {
  from { opacity: 0; transform: scale(0.97) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.kadd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px 12px;
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  background: var(--glass-titlebar, var(--surface-2));
}

.kadd-header__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-1, var(--text-primary));
}

.kadd-icon-btn {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: none;
  background: none;
  color: var(--text-3, var(--text-secondary));
  cursor: pointer;
  transition: background 0.1s;
}
.kadd-icon-btn:hover { background: var(--hover-strong, var(--surface-2)); }

.kadd-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kadd-title-input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--glass-3, var(--surface-1));
  color: var(--text-1, var(--text-primary));
  font-size: 14px;
  outline: none;
  transition: border-color 0.12s;
  box-sizing: border-box;
}
.kadd-title-input:focus { border-color: var(--accent); }
.kadd-title-input::placeholder { color: var(--text-4, var(--text-muted)); }

.kadd-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.kadd-field__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-4, var(--text-muted));
}

.kadd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 12px 16px;
  border-top: 1px solid var(--line-1, var(--border-subtle));
  background: var(--hover, var(--surface-2));
}

.nv-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--glass-3, var(--surface-1));
  color: var(--text-2, var(--text-secondary));
  font-size: 12.5px;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
}
.nv-btn:hover { background: var(--hover-strong, var(--surface-2)); }
.nv-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.nv-btn--primary {
  background: var(--accent);
  color: white;
  border-color: transparent;
}
.nv-btn--primary:hover:not(:disabled) { opacity: 0.88; }
</style>
