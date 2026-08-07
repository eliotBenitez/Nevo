<script setup lang="ts">
import {
  ArrowLeft,
  EllipsisVertical,
  FileText,
  Info,
  PanelsTopLeft,
  Share2,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import NvMenuItem from '../../../ui/primitives/NvMenuItem.vue'
import NvMenuSeparator from '../../../ui/primitives/NvMenuSeparator.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'

defineProps<{
  mode: 'document' | 'canvas'
  context: string
  title: string
}>()

const emit = defineEmits<{
  back: []
  export: []
  details: []
  'change-mode': [mode: 'document' | 'canvas']
}>()

const { t } = useI18n()

function onBack() {
  emit('back')
}

function onExport() {
  emit('export')
}

function onDetails() {
  emit('details')
}

function showDocument() {
  emit('change-mode', 'document')
}

function showCanvas() {
  emit('change-mode', 'canvas')
}
</script>

<template>
  <header class="mobile-editor-header" :class="`mobile-editor-header--${mode}`">
    <button
      type="button"
      class="mobile-editor-header__button"
      :aria-label="t('common.back')"
      @click="onBack"
    >
      <ArrowLeft :size="20" aria-hidden="true" />
    </button>

    <div class="mobile-editor-header__title">
      <span v-if="mode === 'canvas'" class="mobile-editor-header__canvas-title">
        {{ t('workspace.canvas.canvas') }} · {{ title }}
      </span>
      <span v-else class="mobile-editor-header__context">{{ context }}</span>
    </div>

    <div class="mobile-editor-header__actions">
      <button
        v-if="mode === 'document'"
        type="button"
        class="mobile-editor-header__button"
        :aria-label="t('workspace.mobile.editor.export')"
        @click="onExport"
      >
        <Share2 :size="18" aria-hidden="true" />
      </button>
      <NvPopupMenu placement="bottom-end" width="220px" :offset="[0, 8]">
        <template #trigger>
          <button
            type="button"
            class="mobile-editor-header__button"
            :aria-label="t('workspace.mobile.navigation.more')"
          >
            <EllipsisVertical :size="20" aria-hidden="true" />
          </button>
        </template>
        <div class="mobile-editor-header__menu" :aria-label="t('workspace.canvas.viewSwitcher')">
          <NvMenuItem
            v-if="mode === 'canvas'"
            :icon="FileText"
            :label="t('workspace.canvas.document')"
            :action="showDocument"
          />
          <NvMenuItem
            v-else
            :icon="PanelsTopLeft"
            :label="t('workspace.canvas.canvas')"
            :action="showCanvas"
          />
          <NvMenuSeparator />
          <NvMenuItem
            :icon="Info"
            :label="t('workspace.mobile.editor.noteDetails')"
            :action="onDetails"
          />
        </div>
      </NvPopupMenu>
    </div>
  </header>
</template>
