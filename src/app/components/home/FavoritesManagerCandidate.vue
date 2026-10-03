<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Check, Plus } from 'lucide-vue-next'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { WorkspaceHomeItem } from '../../composables/useWorkspaceHome'

interface Props {
  item: WorkspaceHomeItem
  isFavorite: boolean
}

defineProps<Props>()
const emit = defineEmits<{ add: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="home-manager__candidate tw:flex tw:min-h-[56px] tw:relative tw:items-center tw:gap-2 tw:py-1 tw:px-1.5 tw:rounded-none tw:bg-transparent" :title="`${item.title} — ${t(`workspace.home.types.${item.kind}`)}`">
    <span class="home-manager__item-icon tw:grid tw:w-[34px] tw:h-[34px] tw:flex-none tw:place-items-center tw:rounded-[9px] tw:bg-(--hover)"><NvNoteIcon :value="item.icon" :size="17" /></span>
    <span class="home-manager__item-copy tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
      <strong class="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:font-[620]">{{ item.title }}</strong>
      <span class="tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-content-muted tw:text-[10px]">{{ t(`workspace.home.types.${item.kind}`) }}</span>
    </span>
    <button
      type="button"
      class="nv-btn tw:min-h-8 tw:flex-none tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-2"
      :disabled="isFavorite"
      :aria-label="isFavorite
        ? `${item.title} — ${t('workspace.home.manager.onHome')}`
        : t('workspace.home.manager.add', { title: item.title })"
      @click="emit('add')"
    >
      <Check v-if="isFavorite" :size="14" aria-hidden="true" />
      <Plus v-else :size="14" aria-hidden="true" />
      <span>{{ isFavorite ? t('workspace.home.manager.onHome') : t('workspace.home.manager.addShort') }}</span>
    </button>
  </div>
</template>
