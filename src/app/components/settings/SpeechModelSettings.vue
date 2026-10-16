<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import NvButton from '../../../ui/primitives/NvButton.vue'
import { formatBytes } from '../../../utils/format-bytes'
import { useSpeechModels } from '../../composables/settings/useSpeechModels'

const { t } = useI18n()
const { models, downloadingId, progress, busy, refresh, download, cancel, select, remove } = useSpeechModels()

onMounted(refresh)
</script>

<template>
  <ul class="speech-models tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0">
    <li
      v-for="model in models"
      :key="model.id"
      class="speech-models__item tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-2 tw:rounded-[calc(10px*var(--radius-scale,1))] tw:bg-surface-subtle tw:px-3.5 tw:py-3"
    >
      <div class="tw:min-w-0 tw:flex-1 tw:basis-[220px]">
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <span class="tw:text-content-primary tw:text-[13px] tw:font-[550]">{{ t(`settings.editor.speechModel.models.${model.id}`) }}</span>
          <span class="tw:text-content-muted tw:text-[11.5px] tw:font-nv-mono">{{ formatBytes(model.bytes) }}</span>
          <span
            v-if="model.active"
            class="tw:rounded-full tw:bg-[var(--accent-soft)] tw:px-2 tw:py-px tw:text-[11px] tw:font-medium tw:text-[var(--accent)]"
          >{{ t('settings.editor.speechModel.active') }}</span>
        </div>
        <div class="tw:mt-0.5 tw:text-content-muted tw:text-xs tw:leading-[1.45]">{{ t(`settings.editor.speechModel.hints.${model.id}`) }}</div>
        <div
          v-if="downloadingId === model.id"
          class="tw:mt-2 tw:h-1.5 tw:overflow-hidden tw:rounded-full tw:bg-surface-overlay"
          role="progressbar"
          :aria-label="t('settings.editor.speechModel.models.' + model.id)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(progress * 100)"
        >
          <div class="tw:h-full tw:bg-[var(--accent)] tw:transition-[width] tw:duration-150" :style="{ width: `${progress * 100}%` }" />
        </div>
      </div>

      <div class="tw:flex tw:shrink-0 tw:items-center tw:gap-2">
        <template v-if="downloadingId === model.id">
          <NvButton size="sm" @click="cancel">{{ t('settings.editor.speechModel.cancel') }}</NvButton>
        </template>
        <template v-else-if="!model.installed">
          <NvButton size="sm" :disabled="busy" @click="download(model.id)">{{ t('settings.editor.speechModel.download') }}</NvButton>
        </template>
        <template v-else>
          <NvButton v-if="!model.active" size="sm" variant="primary" :disabled="busy" @click="select(model.id)">{{ t('settings.editor.speechModel.use') }}</NvButton>
          <NvButton v-if="!model.bundled" size="sm" variant="danger" :disabled="busy" @click="remove(model.id)">{{ t('settings.editor.speechModel.delete') }}</NvButton>
        </template>
      </div>
    </li>
  </ul>
</template>
