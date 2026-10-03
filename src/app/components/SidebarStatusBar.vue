<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useNoteStore } from '../../stores/note'
import { useWorkspaceStore } from '../../stores/workspace'
import { formatBytes } from '../../utils/format-bytes'

const { t, locale } = useI18n()
const { saveStatus, lastSavedAt } = storeToRefs(useNoteStore())
const { diagnostics } = storeToRefs(useWorkspaceStore())

const label = computed(() => t(`workspace.statusBar.${saveStatus.value}`))

// Only a real commit sets lastSavedAt, so an absent time means "nothing saved this
// session" rather than "saved at an unknown moment" — render the state alone.
const savedTime = computed(() => {
  if (saveStatus.value !== 'saved' || !lastSavedAt.value) return null
  const date = new Date(lastSavedAt.value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(String(locale.value), { hour: '2-digit', minute: '2-digit' }).format(date)
})

const size = computed(() => {
  const bytes = diagnostics.value?.workspaceBytes
  return typeof bytes === 'number' ? formatBytes(bytes) : null
})
</script>

<template>
  <div class="sidebar-status tw:flex tw:min-h-[30px] tw:flex-none tw:items-center tw:justify-between tw:gap-2.5 tw:px-3 tw:border-t-0 tw:text-content-muted tw:text-[11px]" role="status" aria-live="polite">
    <span class="sidebar-status__state tw:flex tw:min-w-0 tw:items-center tw:gap-1.5" :class="`sidebar-status__state--${saveStatus}`">
      <span class="sidebar-status__dot tw:w-1.5 tw:h-1.5 tw:flex-none tw:rounded-full tw:bg-current" aria-hidden="true" />
      <span class="sidebar-status__label tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ label }}</span>
      <template v-if="savedTime">
        <span class="sidebar-status__sep tw:opacity-60" aria-hidden="true">·</span>
        <time class="sidebar-status__time tw:flex-none tw:[font-variant-numeric:tabular-nums]" :datetime="lastSavedAt ?? undefined">{{ savedTime }}</time>
      </template>
    </span>
    <span v-if="size" class="sidebar-status__size tw:flex-none tw:[font-variant-numeric:tabular-nums] tw:text-content-muted">{{ size }}</span>
  </div>
</template>

<style scoped src="../../styles/app/sidebar-status-bar.css"></style>
