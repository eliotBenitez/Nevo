<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { NotebookPageHistoryChange } from '../../utils/noteHistory'

defineProps<{ changes: NotebookPageHistoryChange[] }>()
const { t } = useI18n()

function changeLabel(kind: NotebookPageHistoryChange['kind']): string {
  if (kind === 'added') return t('workspace.history.row.added')
  if (kind === 'removed') return t('workspace.history.row.removed')
  return t('workspace.history.row.changed')
}
</script>

<template>
  <section v-if="changes.length" class="history-notebook-pages" :aria-label="t('notebook.pages.label')">
    <div v-for="change in changes" :key="change.pageId" class="history-notebook-pages__row">
      <code>{{ change.pageId }}</code>
      <span>{{ changeLabel(change.kind) }}</span>
      <span v-if="change.snapshotIndex !== undefined && change.currentIndex !== undefined" class="history-notebook-pages__position">
        {{ change.snapshotIndex + 1 }} → {{ change.currentIndex + 1 }}
      </span>
    </div>
  </section>
</template>

<style scoped>
.history-notebook-pages { display:flex; flex-direction:column; gap:6px; }
.history-notebook-pages__row { display:flex; min-height:34px; align-items:center; gap:10px; border:1px solid var(--border-subtle); border-radius:8px; padding:6px 10px; color:var(--text-secondary); font-size:12px; }
.history-notebook-pages__row code { overflow:hidden; color:var(--text-primary); font:11px/1.35 var(--font-mono); text-overflow:ellipsis; }
.history-notebook-pages__position { margin-left:auto; color:var(--text-tertiary); font:11px/1.35 var(--font-mono); }
</style>
