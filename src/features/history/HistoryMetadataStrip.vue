<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { HistoryDiffMetadataChange } from '../../utils/noteHistory'

/**
 * Compact strip of title/icon/cover changes, shown above the block rows in
 * the inline and side-by-side diff modes. A version that only renames the
 * note or swaps its icon has no block rows at all — without this strip the
 * pane would read as "no differences" even though something changed.
 */
interface Props {
  changes: HistoryDiffMetadataChange[]
}

const props = defineProps<Props>()
const { t } = useI18n()

function displayValue(field: HistoryDiffMetadataChange['field'], value: string | null): string {
  if (field === 'canvas') return canvasDisplay(value)
  if (value) return value
  return field === 'title' ? t('workspace.untitledNote') : '—'
}

// summarizeCanvas() encodes counts as "<elements>/<connectors>" (see
// noteHistory.ts) — decode it back into the localized sentence here rather
// than showing the raw encoding to the user.
function canvasDisplay(value: string | null): string {
  if (!value) return t('workspace.history.canvasNone')
  const [elements, connectors] = value.split('/').map(Number)
  return t('workspace.history.canvasSummary', { elements: elements ?? 0, connectors: connectors ?? 0 })
}
</script>

<template>
  <div v-if="props.changes.length" class="history-metadata-strip tw:mb-3 tw:flex tw:flex-col tw:gap-1 tw:rounded-nv-sm tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-3 tw:py-2.5">
    <p v-for="change in props.changes" :key="change.field" class="history-metadata-strip__line tw:m-0 tw:flex tw:items-baseline tw:gap-2 tw:text-xs tw:leading-normal tw:wrap-anywhere">
      <span class="history-metadata-strip__field tw:shrink-0 tw:text-[10.5px] tw:font-semibold tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ t(`workspace.history.fields.${change.field}`) }}</span>
      <span class="history-metadata-strip__value history-metadata-strip__value--before tw:text-content-muted tw:line-through tw:decoration-[color-mix(in_oklab,var(--danger)_60%,transparent)]">{{ displayValue(change.field, change.snapshotValue) }}</span>
      <span class="history-metadata-strip__arrow tw:shrink-0 tw:text-content-muted" aria-hidden="true">→</span>
      <span class="history-metadata-strip__value history-metadata-strip__value--after tw:text-content-primary">{{ displayValue(change.field, change.currentValue) }}</span>
      <span v-if="change.layoutOnly" class="history-metadata-strip__layout-only tw:text-content-muted tw:italic">({{ t('workspace.history.canvasLayoutChanged') }})</span>
    </p>
  </div>
</template>
