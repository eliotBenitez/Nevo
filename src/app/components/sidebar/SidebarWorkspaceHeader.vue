<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'

interface Props {
  glyph: string
  name: string
  subtitle: string
}

defineProps<Props>()
const emit = defineEmits<{
  back: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="workspace-head tw:flex tw:items-center tw:gap-2.5 tw:p-2 tw:rounded-[calc(16px*var(--radius-scale,1))] tw:bg-transparent tw:border tw:border-solid tw:border-transparent">
    <div class="workspace-glyph tw:w-8 tw:h-8 tw:rounded-[calc(9px*var(--radius-scale,1))] tw:bg-accent tw:grid tw:place-items-center tw:text-content-on-accent tw:text-[15px] tw:font-semibold"><NvNoteIcon :value="glyph" :size="16" /></div>
    <div class="workspace-meta tw:min-w-0 tw:flex-1">
      <div class="workspace-name tw:text-content-primary tw:text-[13px] tw:font-[560] tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis">{{ name }}</div>
      <div class="workspace-subtitle tw:text-content-muted tw:text-[11px]">{{ subtitle }}</div>
    </div>
    <button
      type="button"
      class="workspace-head-back nv-btn tw:ml-auto tw:shrink-0 tw:opacity-40 tw:transition-opacity tw:duration-150 tw:hover:opacity-100 tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
      :title="t('workspace.back')"
      :aria-label="t('workspace.back')"
      @click="emit('back')"
    >
      <ArrowLeft :size="13" aria-hidden="true" />
    </button>
  </div>
</template>
