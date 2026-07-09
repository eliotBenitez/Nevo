<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { FileText, Folder, Inbox, RotateCcw, Search, SearchX, Trash2 } from 'lucide-vue-next'
import { ref, computed } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTreeStore } from '../../stores/tree'
import { useConfirmDialog } from '../../ui/composables/useConfirmDialog'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const treeStore = useTreeStore()
const { manifest } = storeToRefs(workspaceStore)
const { confirm } = useConfirmDialog()

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

function resolveTitle(title: string) {
  return title || t('editor.titlePlaceholder')
}

async function restoreItem(id: string) {
  await treeStore.restoreFromTrash(id)
}

async function deletePermanently(id: string) {
  if (await confirm({
    message: t('workspace.trash.deletePermanentlyConfirm'),
    confirmLabel: t('confirmDialog.delete'),
    variant: 'danger',
  })) {
    await treeStore.permanentlyDeleteFromTrash(id)
  }
}

async function emptyTrash() {
  if (await confirm({
    message: t('workspace.trash.emptyConfirm'),
    confirmLabel: t('workspace.trash.emptyAction'),
    variant: 'danger',
  })) {
    await treeStore.emptyTrash()
  }
}
</script>

<template>
  <div class="trash-shell">
    <header class="trash-header">
      <div class="trash-header__identity">
        <span class="trash-header__icon" aria-hidden="true">
          <Trash2 :size="18" />
        </span>
        <div>
          <h3>{{ t('workspace.trash.title') }}</h3>
          <p>{{ t('workspace.trash.description') }}</p>
        </div>
      </div>
      <span class="trash-count" :aria-label="t('workspace.trash.countLabel', { count: trashCount })">
        {{ trashCount }}
      </span>
    </header>

    <div class="trash-search">
      <label class="trash-search__label" for="trash-search-input">
        {{ t('workspace.trash.searchLabel') }}
      </label>
      <Search :size="14" class="trash-search__icon" aria-hidden="true" />
      <input
        id="trash-search-input"
        v-model="searchQuery"
        type="search"
        class="trash-search__input"
        :placeholder="t('workspace.context.searchPrompt')"
      />
    </div>

    <div v-if="!trashCount" class="trash-state">
      <span class="trash-state__icon" aria-hidden="true">
        <Inbox :size="34" />
      </span>
      <strong>{{ t('workspace.trash.emptyTitle') }}</strong>
      <p>{{ t('workspace.trash.emptyState') }}</p>
    </div>

    <div v-else-if="!filteredTrash.length" class="trash-state">
      <span class="trash-state__icon" aria-hidden="true">
        <SearchX :size="34" />
      </span>
      <strong>{{ t('workspace.trash.noResultsTitle') }}</strong>
      <p>{{ t('workspace.trash.noResultsDescription') }}</p>
    </div>

    <ul v-else class="trash-list" role="list">
      <li
        v-for="item in filteredTrash"
        :key="item.id"
        class="trash-item"
      >
        <span class="trash-item__icon" aria-hidden="true">
          <Folder v-if="item.type === 'folder'" :size="18" />
          <FileText v-else :size="18" />
        </span>
        <div class="trash-item__body">
          <strong :title="resolveTitle(item.title)">{{ resolveTitle(item.title) }}</strong>
          <div class="trash-item__meta">
            <span class="trash-item__type">
              {{ item.type === 'folder' ? t('workspace.trash.folderType') : t('workspace.trash.noteType') }}
            </span>
            <time :datetime="item.deletedAt">
              {{ t('workspace.trash.deletedAt', { date: formatDate(item.deletedAt) }) }}
            </time>
          </div>
        </div>
        <div
          class="trash-item__actions"
          role="group"
          :aria-label="t('workspace.trash.itemActions', { title: resolveTitle(item.title) })"
        >
          <button
            type="button"
            class="trash-action trash-action--restore"
            :title="t('workspace.trash.restoreItem', { title: resolveTitle(item.title) })"
            :aria-label="t('workspace.trash.restoreItem', { title: resolveTitle(item.title) })"
            @click="restoreItem(item.id)"
          >
            <RotateCcw :size="14" />
            <span>{{ t('workspace.trash.restore') }}</span>
          </button>
          <button
            type="button"
            class="trash-action trash-action--danger"
            :title="t('workspace.trash.deleteItem', { title: resolveTitle(item.title) })"
            :aria-label="t('workspace.trash.deleteItem', { title: resolveTitle(item.title) })"
            @click="deletePermanently(item.id)"
          >
            <Trash2 :size="14" />
            <span>{{ t('workspace.trash.deletePermanently') }}</span>
          </button>
        </div>
      </li>
    </ul>

    <footer class="trash-footer">
      <span class="trash-footer__hint">
        {{ trashCount ? t('workspace.trash.actionHint') : '' }}
      </span>
      <div class="history-modal__footer-actions">
        <button
          v-if="trashCount"
          type="button"
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
  min-height: 0;
  color: var(--text-2);
  background:
    linear-gradient(180deg, color-mix(in oklab, var(--glass-3) 62%, transparent), transparent 38%),
    var(--glass-1);
}

.trash-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--line-1);
  background: color-mix(in oklab, var(--glass-titlebar) 72%, transparent);
}

.trash-header__identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.trash-header__icon,
.trash-state__icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid color-mix(in oklab, var(--accent) 22%, transparent);
}

.trash-header__icon {
  width: 34px;
  height: 34px;
  border-radius: calc(8px * var(--radius-scale, 1));
}

.trash-header h3 {
  margin: 0;
  color: var(--text-1);
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 400;
}

.trash-header p {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.4;
}

.trash-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid color-mix(in oklab, var(--accent) 24%, transparent);
  font: 600 11px/1 var(--font-mono);
}

.trash-search {
  position: relative;
  margin: 14px 16px 10px;
}

.trash-search__label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.trash-search__icon {
  position: absolute;
  left: 13px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-3);
  pointer-events: none;
}

.trash-search__input {
  width: 100%;
  height: 36px;
  padding: 0 14px 0 36px;
  border-radius: calc(9px * var(--radius-scale, 1));
  border: 1px solid var(--line-1);
  background: color-mix(in oklab, var(--hover) 72%, transparent);
  color: var(--text-1);
  font-size: 12.5px;
  outline: none;
  transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
}

.trash-search__input::placeholder {
  color: var(--text-4);
}

.trash-search__input:focus {
  border-color: var(--accent);
  background: color-mix(in oklab, var(--glass-3) 72%, transparent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.trash-list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 6px 16px 16px;
  list-style: none;
}

.trash-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: calc(10px * var(--radius-scale, 1));
  border: 1px solid var(--line-1);
  background: color-mix(in oklab, var(--glass-2) 76%, transparent);
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.055);
  transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
}

.trash-item:hover,
.trash-item:focus-within {
  border-color: color-mix(in oklab, var(--accent) 24%, var(--line-2));
  background: color-mix(in oklab, var(--glass-3) 84%, transparent);
  box-shadow: 0 12px 28px -24px var(--accent-glow), inset 0 1px 0 oklch(1 0 0 / 0.08);
}

.trash-item__icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: calc(9px * var(--radius-scale, 1));
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid color-mix(in oklab, var(--accent) 18%, transparent);
}

.trash-item__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.trash-item__body strong {
  overflow: hidden;
  color: var(--text-1);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash-item__meta {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
  color: var(--text-4);
  font-size: 11px;
}

.trash-item__meta time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trash-item__type {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  color: var(--text-3);
  background: var(--hover);
  border: 1px solid var(--line-1);
}

.trash-item__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.trash-action {
  min-width: 0;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border-radius: calc(7px * var(--radius-scale, 1));
  border: 1px solid var(--line-1);
  background: var(--hover);
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}

.trash-action:hover {
  background: var(--hover-strong);
  color: var(--text-1);
  border-color: var(--line-2);
  transform: translateY(-1px);
}

.trash-action:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.trash-action--restore:hover,
.trash-action--restore:focus-visible {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: color-mix(in oklab, var(--accent) 28%, transparent);
}

.trash-action--danger:hover,
.trash-action--danger:focus-visible {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: var(--danger-line);
  box-shadow: 0 0 0 3px var(--danger-soft);
}

.trash-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  text-align: center;
}

.trash-state__icon {
  width: 58px;
  height: 58px;
  margin-bottom: 16px;
  border-radius: calc(14px * var(--radius-scale, 1));
  color: var(--text-3);
  background: color-mix(in oklab, var(--glass-3) 72%, transparent);
  border-color: var(--line-2);
}

.trash-state strong {
  color: var(--text-1);
  font-size: 14px;
}

.trash-state p {
  max-width: 320px;
  margin: 7px 0 0;
  color: var(--text-4);
  font-size: 12px;
  line-height: 1.45;
}

.trash-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 58px;
  padding: 12px 20px;
  border-top: 1px solid var(--line-1);
  background: color-mix(in oklab, var(--glass-titlebar) 90%, transparent);
}

.trash-footer__hint {
  min-width: 0;
  color: var(--text-4);
  font-size: 11.5px;
}

@media (max-width: 620px) {
  .trash-header {
    padding: 18px 16px 14px;
  }

  .trash-item {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: flex-start;
  }

  .trash-item__actions {
    grid-column: 1 / -1;
    width: 100%;
  }

  .trash-action {
    flex: 1;
  }

  .trash-footer {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px 16px;
  }

  .trash-footer__hint {
    min-height: 0;
  }

  .history-modal__footer-actions,
  .history-modal__footer-actions .nv-btn {
    width: 100%;
  }
}

@media (max-width: 420px) {
  .trash-header__identity {
    align-items: flex-start;
  }

  .trash-header p {
    display: none;
  }

  .trash-action span {
    font-size: 11px;
  }
}
</style>
