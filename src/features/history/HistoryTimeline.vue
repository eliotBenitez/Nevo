<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Inbox } from 'lucide-vue-next'
import NvButton from '../../ui/primitives/NvButton.vue'
import { useWorkspaceStore } from '../../stores/workspace'
import type { NoteSnapshotMeta } from '../../types/note'
import { formatHistoryTimestamp } from './formatHistoryTimestamp'

interface Props {
  snapshots: NoteSnapshotMeta[]
  selectedId: string | null
  loading: boolean
  error: string | null
  recoveryId: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [id: string]
  retry: []
}>()

const { t, locale } = useI18n()
const workspaceStore = useWorkspaceStore()

// Phase 1 has no persisted diffstat/labels per version — only what
// NoteSnapshotMeta actually carries (id, createdAt, updatedAt).
const retentionCount = computed(() => workspaceStore.settings.files.snapshotRetentionCount)

function formatTimestamp(value: string) {
  return formatHistoryTimestamp(value, locale.value, t)
}

// The bold line above already shows the absolute timestamp; this is only
// worth a second line when it says something different (relative recency).
// Falls back to null — never the same fact printed twice — when the two
// happen to read identically.
function relativeLabel(snapshot: NoteSnapshotMeta): string | null {
  const relative = workspaceStore.getRelativeTime(snapshot.createdAt)
  const absolute = formatTimestamp(snapshot.createdAt)
  return relative === absolute ? null : relative
}

function onSelect(snapshot: NoteSnapshotMeta) {
  if (snapshot.id === props.selectedId) return
  emit('select', snapshot.id)
}
</script>

<template>
  <aside class="history-timeline tw:flex tw:h-full tw:min-h-0 tw:flex-col tw:bg-[color-mix(in_oklab,var(--workspace-navigation-surface)_34%,var(--workspace-editor-surface))] tw:max-[900px]:h-auto tw:max-[900px]:max-h-[46vh] tw:max-[900px]:shrink-0" :aria-label="t('workspace.history.subtitle')">
    <div class="history-timeline__head tw:flex tw:min-h-[68px] tw:shrink-0 tw:items-center tw:pt-3 tw:pr-7 tw:pb-3 tw:pl-[38px] tw:max-[900px]:min-h-[60px]">
      <span class="history-timeline__head-label tw:grid tw:min-h-10 tw:w-[min(226px,100%)] tw:place-items-center tw:rounded-nv-md tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:text-[13px] tw:font-semibold tw:text-content-primary tw:shadow-(--shadow-raised)">{{ t('workspace.history.timeline.versions') }}</span>
    </div>
    <div v-if="loading" role="status" class="history-timeline__state tw:m-auto tw:px-5 tw:py-7 tw:text-center tw:text-[12.5px] tw:leading-[1.4] tw:text-content-muted">
      <span class="history-timeline__spinner tw:mx-auto tw:mb-2.5 tw:block tw:size-5 tw:rounded-full tw:border-2 tw:border-solid tw:border-(--accent-soft) tw:border-t-accent" aria-hidden="true" />
      <p>{{ t('workspace.history.timeline.loading') }}</p>
    </div>
    <div v-else-if="error" role="alert" class="history-timeline__state history-timeline__state--error tw:m-auto tw:px-5 tw:py-7 tw:text-center tw:text-[12.5px] tw:leading-[1.4] tw:text-danger">
      <p>{{ error }}</p>
      <NvButton class="history-timeline__retry tw:mt-3" variant="ghost" @click="emit('retry')">{{ t('workspace.history.retry') }}</NvButton>
    </div>
    <div v-else-if="!snapshots.length" class="history-timeline__state tw:m-auto tw:px-5 tw:py-7 tw:text-center tw:text-[12.5px] tw:leading-[1.4] tw:text-content-muted">
      <Inbox class="tw:mx-auto tw:mb-2.5 tw:block tw:text-accent tw:opacity-85" :size="28" aria-hidden="true" />
      <p>{{ t('workspace.history.timeline.empty') }}</p>
    </div>
    <ol v-else class="history-timeline__list tw:m-0 tw:min-h-0 tw:max-h-[calc(100%_-_148px)] tw:shrink tw:list-none tw:overflow-y-auto tw:pt-4 tw:pr-5 tw:pb-4 tw:pl-[42px] tw:max-[900px]:max-h-[31vh]">
      <li v-for="snapshot in snapshots" :key="snapshot.id" class="history-timeline__item tw:relative tw:pb-2">
        <button
          type="button"
          class="history-timeline__entry tw:group tw:flex tw:w-full tw:cursor-pointer tw:items-start tw:gap-3.5 tw:rounded-none tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:text-inherit tw:transition-colors tw:duration-[var(--dur-base)] tw:ease-[var(--ease-out)] tw:focus-visible:outline-none"
          :class="{ 'history-timeline__entry--selected': snapshot.id === selectedId }"
          :aria-pressed="snapshot.id === selectedId"
          @click="onSelect(snapshot)"
        >
          <span class="history-timeline__dot tw:relative tw:z-1 tw:mt-4 tw:grid tw:size-3.5 tw:shrink-0 tw:place-items-center tw:rounded-full tw:border-[3px] tw:border-solid tw:border-(--workspace-editor-surface) tw:bg-content-muted tw:shadow-[0_0_0_1px_var(--border-default)]" aria-hidden="true" />
          <span
            class="history-timeline__body tw:flex tw:min-h-16 tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1 tw:rounded-nv-md tw:border tw:border-solid tw:px-4 tw:py-3 tw:transition-colors tw:duration-[var(--dur-base)] tw:ease-[var(--ease-out)] tw:group-hover:bg-(--hover)"
            :class="snapshot.id === selectedId
              ? 'tw:border-[color-mix(in_oklab,var(--accent)_38%,transparent)] tw:bg-(--surface-selected) tw:shadow-(--shadow-raised)'
              : 'tw:border-transparent'"
          >
            <strong class="history-timeline__timestamp tw:text-sm tw:leading-[1.3] tw:font-[650] tw:text-content-primary">
              <time :datetime="snapshot.createdAt">{{ formatTimestamp(snapshot.createdAt) }}</time>
              <span v-if="snapshot.id === recoveryId" class="history-timeline__recovery-badge tw:ml-2 tw:inline-flex tw:items-center tw:rounded-full tw:bg-surface-subtle tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-medium tw:text-content-secondary">{{ t('workspace.history.recoveryBadge') }}</span>
            </strong>
            <span v-if="relativeLabel(snapshot)" class="history-timeline__meta tw:text-xs tw:leading-[1.35] tw:text-content-muted">
              {{ relativeLabel(snapshot) }}
            </span>
            <span v-if="snapshot.id === selectedId" class="history-timeline__comparing tw:mt-0.5 tw:text-[11px] tw:font-medium tw:text-accent">
              {{ t('workspace.history.timeline.comparingWithCurrent') }}
            </span>
          </span>
        </button>
      </li>
    </ol>
    <p class="history-timeline__footnote tw:relative tw:m-0 tw:shrink-0 tw:pt-5 tw:pr-[38px] tw:pb-[calc(22px+max(var(--safe-area-bottom),0px))] tw:pl-[38px] tw:text-[11.5px] tw:leading-normal tw:text-content-muted">
      {{ t('workspace.history.timeline.footnote', { count: retentionCount }) }}
    </p>
  </aside>
</template>

<style scoped src="../../styles/features/history/history-timeline.css"></style>
