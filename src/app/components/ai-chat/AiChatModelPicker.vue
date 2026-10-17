<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAiModels } from '../../../composables/useAiModels'
import { Check, ChevronDown, Cloud, HardDrive, Settings } from '../../../ui/icons'
import type { NvMenuItemDef } from '../../../ui/primitives/menu-types'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'

const props = defineProps<{
  model: string
  local: boolean
  host: string
}>()
const emit = defineEmits<{ 'open-settings': [] }>()

const { t } = useI18n()
const { models, status, load, select } = useAiModels()

const items = computed<NvMenuItemDef[]>(() => {
  const list: NvMenuItemDef[] = status.value === 'checking' && !models.value.length
    ? [{ type: 'label', label: t('aiChat.composer.modelsLoading') }]
    : status.value === 'error'
      ? [{ type: 'label', label: t('aiChat.composer.modelsError') }]
      : models.value.length
        ? models.value.map(m => ({
            label: m,
            icon: m === props.model ? Check : undefined,
            action: () => { void select(m) },
          }))
        : [{ type: 'label', label: t('aiChat.composer.modelsEmpty') }]
  return [
    ...list,
    { type: 'separator' },
    { label: t('aiChat.error.openSettings'), icon: Settings, action: () => emit('open-settings') },
  ]
})

function onOpen(open: boolean) {
  if (open) void load()
}
</script>

<template>
  <NvPopupMenu :items="items" placement="top-start" width="300px" @update:open="onOpen">
    <template #trigger>
      <button
        type="button"
        class="ai-model"
        aria-haspopup="menu"
        :aria-label="t('aiChat.composer.modelAria', { model, where: local ? t('aiChat.composer.local') : host })"
      >
        <span class="ai-model__name">{{ model }}</span>
        <span class="ai-model__where" :class="{ 'ai-model__where--cloud': !local }">
          <component :is="local ? HardDrive : Cloud" :size="14" aria-hidden="true" />
          {{ local ? t('aiChat.composer.local') : host }}
        </span>
        <ChevronDown :size="14" aria-hidden="true" />
      </button>
    </template>
  </NvPopupMenu>
</template>
