<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from '@lucide/vue'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { WorkspaceHomeItem } from '../../composables/useWorkspaceHome'

interface Props {
  item: WorkspaceHomeItem
  index: number
  total: number
  dragging: boolean
  dropBefore: boolean
  dropAfter: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'move-up': []
  'move-down': []
  remove: []
  'pointer-down': [event: PointerEvent]
}>()

const { t } = useI18n()
const unavailable = computed(() => !props.item.available && !props.item.loading)
const statusLabel = computed(() => (
  props.item.loading
    ? t('workspace.home.favorites.loadingPlugin')
    : !props.item.available
      ? t('workspace.home.manager.unavailable')
      : props.item.typeLabel
))
</script>

<template>
  <div
    class="home-manager__favorite tw:flex tw:min-h-[56px] tw:relative tw:items-center tw:gap-1 tw:py-1 tw:px-1 tw:rounded-none tw:bg-transparent tw:transition-[border-color,background-color,box-shadow,opacity] tw:duration-[160ms] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
    :title="`${item.title} — ${statusLabel}`"
    :class="{
      'home-manager__favorite--unavailable': unavailable,
      'home-manager__favorite--dragging': dragging,
      'home-manager__favorite--drop-before': dropBefore,
      'home-manager__favorite--drop-after': dropAfter,
    }"
    :data-favorite-index="index"
    tabindex="0"
    @keydown.alt.up.prevent="emit('move-up')"
    @keydown.alt.down.prevent="emit('move-down')"
  >
    <button
      type="button"
      class="home-manager__drag tw:grid tw:w-8 tw:h-8 tw:flex-none tw:place-items-center tw:border-0 tw:rounded-lg tw:text-content-muted tw:bg-transparent tw:cursor-grab tw:touch-none tw:active:cursor-grabbing tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
      :aria-label="t('workspace.home.manager.reorder', { title: item.title })"
      @pointerdown.stop="emit('pointer-down', $event)"
      @keydown.alt.up.prevent="emit('move-up')"
      @keydown.alt.down.prevent="emit('move-down')"
    >
      <GripVertical :size="16" />
    </button>
    <span class="home-manager__item-icon tw:grid tw:w-[34px] tw:h-[34px] tw:flex-none tw:place-items-center tw:rounded-[9px] tw:bg-(--hover)"><NvNoteIcon :value="item.icon" :size="17" /></span>
    <span class="home-manager__item-copy tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
      <strong class="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:font-[620]">{{ item.title }}</strong>
      <span class="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-content-muted tw:text-[10px]">{{ statusLabel }}</span>
    </span>
    <div class="home-manager__move-buttons tw:flex">
      <button
        type="button"
        class="tw:grid tw:w-8 tw:h-8 tw:flex-none tw:place-items-center tw:border-0 tw:rounded-lg tw:text-content-muted tw:bg-transparent tw:disabled:opacity-30 tw:enabled:cursor-pointer tw:enabled:transition-[color,background-color,transform] tw:enabled:duration-[140ms] tw:enabled:hover:text-accent tw:enabled:hover:bg-(--accent-soft) tw:enabled:hover:-translate-y-px tw:enabled:active:translate-y-0 tw:enabled:active:scale-[0.94] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
        :disabled="index === 0"
        :aria-label="t('workspace.home.manager.moveUp')"
        @click="emit('move-up')"
      >
        <ArrowUp :size="14" />
      </button>
      <button
        type="button"
        class="tw:grid tw:w-8 tw:h-8 tw:flex-none tw:place-items-center tw:border-0 tw:rounded-lg tw:text-content-muted tw:bg-transparent tw:disabled:opacity-30 tw:enabled:cursor-pointer tw:enabled:transition-[color,background-color,transform] tw:enabled:duration-[140ms] tw:enabled:hover:text-accent tw:enabled:hover:bg-(--accent-soft) tw:enabled:hover:-translate-y-px tw:enabled:active:translate-y-0 tw:enabled:active:scale-[0.94] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
        :disabled="index === total - 1"
        :aria-label="t('workspace.home.manager.moveDown')"
        @click="emit('move-down')"
      >
        <ArrowDown :size="14" />
      </button>
    </div>
    <button
      type="button"
      class="home-manager__remove tw:grid tw:w-8 tw:h-8 tw:flex-none tw:place-items-center tw:border-0 tw:rounded-lg tw:text-content-muted tw:bg-transparent tw:hover:text-danger tw:hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
      :aria-label="t('workspace.home.manager.remove', { title: item.title })"
      @click="emit('remove')"
    >
      <Trash2 :size="15" />
    </button>
  </div>
</template>
