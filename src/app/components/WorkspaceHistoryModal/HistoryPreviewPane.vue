<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { FileText, GitCompare, Image, Inbox } from 'lucide-vue-next'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { NoteDocument } from '../../../types/note'
import type { HistoryComparableBlock, NoteHistoryDiff } from '../../../utils/noteHistory'

type HistoryPaneMode = 'preview' | 'compare'

interface Props {
  paneMode: HistoryPaneMode
  paneLoading: boolean
  selectedSnapshotId: string | null
  previewError: string | null
  compareError: string | null
  previewBlocks: HistoryComparableBlock[]
  selectedSnapshot: NoteDocument | null
  compareDiff: NoteHistoryDiff | null
}

defineProps<Props>()
const emit = defineEmits<{
  'update:paneMode': [value: HistoryPaneMode]
}>()

const { t } = useI18n()

function formatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
</script>

<template>
  <section class="history-column history-column--wide">
    <div class="history-column__header">
      <div>
        <h3>{{ t('workspace.history.previewCompare') }}</h3>
        <p>{{ t('workspace.history.previewCompareHint') }}</p>
      </div>
      <div class="segmented">
        <button
          type="button"
          class="segmented__item"
          :class="{ 'is-active': paneMode === 'preview' }"
          @click="emit('update:paneMode', 'preview')"
        >
          {{ t('workspace.history.preview') }}
        </button>
        <button
          type="button"
          class="segmented__item"
          :class="{ 'is-active': paneMode === 'compare' }"
          @click="emit('update:paneMode', 'compare')"
        >
          {{ t('workspace.history.compare') }}
        </button>
      </div>
    </div>

    <div v-if="!selectedSnapshotId" class="history-state">
      <FileText :size="34" aria-hidden="true" />
      <strong>{{ t('workspace.history.states.noSnapshotSelectedTitle') }}</strong>
      <p>{{ t('workspace.history.states.noSnapshotSelected') }}</p>
    </div>
    <div v-else-if="paneLoading" class="history-state">
      <span class="history-state__spinner" aria-hidden="true" />
      <strong>{{ t('workspace.history.states.loadingPreviewTitle') }}</strong>
      <p>{{ t('workspace.history.states.loadingPreview') }}</p>
    </div>
    <div v-else-if="paneMode === 'preview' && previewError" class="history-state history-state--error">{{ previewError }}</div>
    <div v-else-if="paneMode === 'compare' && compareError" class="history-state history-state--error">{{ compareError }}</div>
    <div v-else-if="paneMode === 'preview' && selectedSnapshot" class="history-preview">
      <div class="history-preview__card">
        <div class="history-preview__meta">
          <div class="history-preview__icon">
            <NvNoteIcon :value="selectedSnapshot.icon || '📄'" :size="32" />
          </div>
          <div>
            <h4>{{ selectedSnapshot.title }}</h4>
            <span>{{ t('workspace.history.updatedAt', { value: formatTimestamp(selectedSnapshot.updatedAt) }) }}</span>
          </div>
        </div>
        <div v-if="selectedSnapshot.cover" class="history-preview__cover">
          <Image :size="13" aria-hidden="true" />
          {{ t('workspace.history.coverValue', { value: selectedSnapshot.cover }) }}
        </div>
      </div>
      <div v-if="previewBlocks.length" class="history-preview__blocks">
        <article v-for="(block, index) in previewBlocks" :key="`${block.signature}-${index}`" class="history-preview__block">
          <span class="history-preview__block-index">{{ index + 1 }}</span>
          {{ block.label }}
        </article>
      </div>
      <div v-else class="history-state">
        <Inbox :size="32" aria-hidden="true" />
        <strong>{{ t('workspace.history.states.emptySnapshotTitle') }}</strong>
        <p>{{ t('workspace.history.states.emptySnapshot') }}</p>
      </div>
    </div>
    <div v-else-if="paneMode === 'compare' && compareDiff" class="history-compare">
      <div v-if="compareDiff.metadata.length" class="history-compare__meta">
        <div v-for="change in compareDiff.metadata" :key="change.field" class="history-compare__meta-row">
          <strong>{{ t(`workspace.history.fields.${change.field}`) }}</strong>
          <div class="history-compare__meta-values">
            <span>{{ change.snapshotValue ?? '—' }}</span>
            <span aria-hidden="true">→</span>
            <span>{{ change.currentValue ?? '—' }}</span>
          </div>
        </div>
      </div>
      <div v-if="compareDiff.rows.length" class="history-compare__rows">
        <article v-for="(row, index) in compareDiff.rows" :key="`${row.kind}-${index}`" class="history-diff-row">
          <div class="history-diff-row__head">
            <span class="history-diff-row__badge" :class="`history-diff-row__badge--${row.kind}`">
              {{ t(`workspace.history.rowKinds.${row.kind}`) }}
            </span>
            <GitCompare :size="14" aria-hidden="true" />
          </div>
          <div class="history-diff-row__grid">
            <div class="history-diff-row__surface history-diff-row__surface--snapshot">
              <div class="history-diff-row__label">{{ t('workspace.history.snapshotVersion') }}</div>
              <div>{{ row.snapshot?.label ?? '—' }}</div>
            </div>
            <div class="history-diff-row__surface history-diff-row__surface--current">
              <div class="history-diff-row__label">{{ t('workspace.history.currentVersion') }}</div>
              <div>{{ row.current?.label ?? '—' }}</div>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="history-state">
        <Inbox :size="32" aria-hidden="true" />
        <strong>{{ t('workspace.history.states.noDiffTitle') }}</strong>
        <p>{{ t('workspace.history.states.noDiff') }}</p>
      </div>
    </div>
  </section>
</template>
