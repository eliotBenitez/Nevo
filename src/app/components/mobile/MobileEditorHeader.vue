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

withDefaults(defineProps<{
  mode: 'document' | 'canvas'
  context: string
  title: string
  showViewSwitcher?: boolean
  showExport?: boolean
}>(), { showViewSwitcher: true, showExport: true })

const emit = defineEmits<{
  back: []
  export: []
  details: []
  'change-mode': [mode: 'document' | 'canvas']
}>()

const { t } = useI18n()

const headerButtonClass = 'tw:grid tw:size-11 tw:place-items-center tw:rounded-[calc(14px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-0 tw:text-content-secondary tw:shadow-[0_12px_30px_-22px_var(--shadow)] tw:pointer-events-auto tw:active:scale-[0.97] tw:active:bg-(--press) tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent'

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
  <header class="mobile-editor-header tw:z-[44] tw:grid tw:min-h-[calc(58px+max(var(--safe-area-top),0px))] tw:flex-[0_0_auto] tw:grid-cols-[44px_minmax(0,1fr)_auto] tw:items-end tw:gap-2 tw:border-b-0 tw:pt-[max(var(--safe-area-top),0px)] tw:pr-[calc(12px+max(var(--safe-area-right),0px))] tw:pb-[7px] tw:pl-[calc(12px+max(var(--safe-area-left),0px))]" :class="mode === 'canvas' ? 'mobile-editor-header--canvas tw:absolute tw:inset-x-0 tw:top-0 tw:bg-transparent tw:pointer-events-none' : 'mobile-editor-header--document tw:relative tw:bg-(--frame-bg)'">
    <button
      type="button"
      class="mobile-editor-header__button" :class="headerButtonClass"
      :aria-label="t('common.back')"
      @click="onBack"
    >
      <ArrowLeft :size="20" aria-hidden="true" />
    </button>

    <div class="mobile-editor-header__title tw:flex tw:h-11 tw:min-w-0 tw:items-center tw:justify-center">
      <span v-if="mode === 'canvas'" class="mobile-editor-header__canvas-title tw:max-w-full tw:truncate tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:px-3 tw:py-[9px] tw:text-[11px] tw:text-content-muted tw:shadow-[0_12px_30px_-22px_var(--shadow)] tw:pointer-events-auto">
        {{ t('workspace.canvas.canvas') }} · {{ title }}
      </span>
      <span v-else class="mobile-editor-header__context tw:max-w-full tw:truncate tw:text-[11px] tw:font-[560] tw:text-content-muted">{{ context }}</span>
    </div>

    <div class="mobile-editor-header__actions tw:flex tw:items-center tw:gap-1">
      <button
        v-if="mode === 'document' && showExport"
        type="button"
        class="mobile-editor-header__button" :class="headerButtonClass"
        :aria-label="t('workspace.mobile.editor.export')"
        @click="onExport"
      >
        <Share2 :size="18" aria-hidden="true" />
      </button>
      <NvPopupMenu placement="bottom-end" width="220px" :offset="[0, 8]">
        <template #trigger>
          <button
            type="button"
            class="mobile-editor-header__button" :class="headerButtonClass"
            :aria-label="t('workspace.mobile.navigation.more')"
          >
            <EllipsisVertical :size="20" aria-hidden="true" />
          </button>
        </template>
        <div class="mobile-editor-header__menu tw:flex tw:w-full tw:flex-col" :aria-label="t('workspace.canvas.viewSwitcher')">
          <NvMenuItem
            v-if="showViewSwitcher && mode === 'canvas'"
            :icon="FileText"
            :label="t('workspace.canvas.document')"
            :action="showDocument"
          />
          <NvMenuItem
            v-else-if="showViewSwitcher"
            :icon="PanelsTopLeft"
            :label="t('workspace.canvas.canvas')"
            :action="showCanvas"
          />
          <NvMenuSeparator v-if="showViewSwitcher" />
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
