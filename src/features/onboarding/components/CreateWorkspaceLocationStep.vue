<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { FolderOpen, HardDrive } from 'lucide-vue-next'

defineProps<{
  path: string
  displayName: string
}>()

const emit = defineEmits<{ browse: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="cw-field tw:flex tw:min-w-0 tw:flex-col tw:gap-1.5 tw:min-[1200px]:gap-2">
    <label for="workspace-location" class="tw:text-[12.5px] tw:font-semibold tw:text-content-primary tw:min-[1200px]:text-sm tw:min-[1600px]:text-[15px]">{{ t('onboarding.create.locationLabel') }}</label>
    <div class="cw-input-row tw:flex tw:flex-nowrap tw:gap-2 tw:min-[1200px]:gap-2.5">
      <input id="workspace-location" class="cw-input cw-input--mono tw:h-[34px] tw:w-full tw:min-w-0 tw:flex-1 tw:cursor-default tw:rounded-lg tw:border-0 tw:bg-[var(--input-bg)] tw:px-2.5 tw:font-nv-mono tw:text-xs tw:text-content-primary tw:min-[1200px]:h-11 tw:min-[1200px]:rounded-[10px] tw:min-[1200px]:px-3.5 tw:min-[1200px]:text-sm tw:min-[1600px]:h-12 tw:min-[1600px]:px-4 tw:min-[1600px]:text-[15px]" type="text" readonly :value="path" />
      <button type="button" class="nv-btn browse-btn tw:shrink-0 tw:whitespace-nowrap tw:min-[1200px]:h-11 tw:min-[1200px]:px-4 tw:min-[1200px]:text-sm tw:min-[1600px]:h-12 tw:min-[1600px]:px-[18px] tw:min-[1600px]:text-[15px]" @click="emit('browse')">
        <FolderOpen :size="14" />
        {{ t('onboarding.create.locationBrowse') }}
      </button>
    </div>
    <p class="cw-help tw:m-0 tw:text-[11.5px] tw:text-content-muted tw:min-[1200px]:text-[13px] tw:min-[1200px]:leading-[1.5] tw:min-[1600px]:text-sm">{{ t('onboarding.create.locationHint') }}</p>
  </div>

  <div class="cw-note tw:flex tw:items-start tw:gap-2 tw:rounded-[10px] tw:bg-surface-subtle tw:px-3 tw:py-2.5 tw:text-[12.5px] tw:text-content-secondary tw:min-[1200px]:gap-2.5 tw:min-[1200px]:rounded-[12px] tw:min-[1200px]:px-4 tw:min-[1200px]:py-3.5 tw:min-[1200px]:text-sm tw:min-[1600px]:px-[18px] tw:min-[1600px]:py-4 tw:min-[1600px]:text-[15px]">
    <HardDrive :size="14" class="tw:mt-0.5 tw:shrink-0 tw:text-content-muted tw:min-[1200px]:size-4" />
    <span>
      {{ t('onboarding.create.locationNote.lead') }}
      <code class="cw-mono tw:font-nv-mono tw:tabular-nums tw:text-content-primary">{{ displayName }}/notes</code>,
      <code class="cw-mono tw:font-nv-mono tw:tabular-nums tw:text-content-primary">folders</code>
      {{ t('onboarding.create.locationNote.and') }}
      <code class="cw-mono tw:font-nv-mono tw:tabular-nums tw:text-content-primary">.nevo</code>
    </span>
  </div>
</template>
