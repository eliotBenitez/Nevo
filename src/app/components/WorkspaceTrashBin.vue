<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Trash2, RotateCcw, Trash, Search } from 'lucide-vue-next'
import { ref, computed } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTreeStore } from '../../stores/tree'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const treeStore = useTreeStore()
const { manifest } = storeToRefs(workspaceStore)

const searchQuery = ref('')

const filteredTrash = computed(() => {
  if (!manifest.value?.trash) return []
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return manifest.value.trash
  return manifest.value.trash.filter(item => item.title.toLowerCase().includes(query))
})
const trashCount = computed(() => manifest.value?.trash?.length ?? 0)

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}

async function restoreItem(id: string) {
  await treeStore.restoreFromTrash(id)
}

async function deletePermanently(id: string) {
  if (confirm(t('workspace.trash.deletePermanentlyConfirm'))) {
    await treeStore.permanentlyDeleteFromTrash(id)
  }
}

async function emptyTrash() {
  if (confirm(t('workspace.trash.emptyConfirm'))) {
    await treeStore.emptyTrash()
  }
}
</script>

<template>
  <div class="trash-shell">
    <section class="history-column">
      <div class="history-column__header">
        <h3>{{ t('workspace.trash.title') }}</h3>
        <span>{{ trashCount }}</span>
      </div>
      
      <div class="search-field history-search">
        <Search :size="12" class="sidebar-icon--muted" />
        <input
          v-model="searchQuery"
          type="search"
          class="search-input"
          :placeholder="t('workspace.context.searchPrompt')"
        />
      </div>

      <div v-if="!trashCount" class="history-state">
        <Trash2 :size="32" style="opacity: 0.2; margin-bottom: 12px" />
        <p>{{ t('workspace.trash.emptyState') }}</p>
      </div>
      
      <div v-else-if="!filteredTrash.length" class="history-state">
        {{ t('workspace.context.searchNoResults') }}
      </div>

      <div v-else class="history-list">
        <div
          v-for="item in filteredTrash"
          :key="item.id"
          class="history-list__item trash-list-item"
        >
          <div class="history-list__icon">{{ item.type === 'folder' ? '📁' : '📄' }}</div>
          <div class="history-list__body">
            <strong>{{ item.title || t('editor.titlePlaceholder') }}</strong>
            <span>{{ t('workspace.trash.deletedAt', { date: formatDate(item.deletedAt) }) }}</span>
          </div>
          <div class="trash-item-actions">
            <button class="trash-action-btn" :title="t('workspace.trash.restore')" @click="restoreItem(item.id)">
              <RotateCcw :size="14" />
            </button>
            <button class="trash-action-btn trash-action-btn--danger" :title="t('workspace.trash.deletePermanently')" @click="deletePermanently(item.id)">
              <Trash :size="14" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Empty right column to match history modal 3-column look if we wanted, 
         but for trash 1-2 columns might be enough. 
         Let's keep it simple with 1 main column for now. -->

    <footer class="history-modal__footer trash-footer">
      <div />
      <div class="history-modal__footer-actions">
        <button 
          v-if="trashCount" 
          class="nv-btn nv-btn--danger" 
          @click="emptyTrash"
        >
          {{ t('workspace.trash.emptyAction') }}
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.trash-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.history-column {
  flex: 1;
  border-right: none;
}

.trash-list-item {
  cursor: default;
  display: flex;
  align-items: center;
}

.trash-list-item:hover {
  background: transparent; /* Disable hover since it's not clickable as a whole */
}

.trash-item-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.trash-list-item:hover .trash-item-actions {
  opacity: 1;
}

.trash-action-btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: calc(6px * var(--radius-scale, 1));
  border: none;
  background: var(--hover);
  color: var(--text-3);
  cursor: pointer;
  transition: all 0.15s ease;
}

.trash-action-btn:hover {
  background: var(--hover-strong);
  color: var(--text-1);
}

.trash-action-btn--danger:hover {
  background: var(--status-danger-soft);
  color: var(--status-danger);
}

.trash-footer {
  background: var(--glass-titlebar);
  margin-top: auto;
}
</style>
