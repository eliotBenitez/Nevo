<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Bold,
  CheckSquare,
  Code2,
  Ellipsis,
  Image as ImageIcon,
  Italic,
  Link2,
  Pilcrow,
  Plus,
  Strikethrough,
  Underline,
} from 'lucide-vue-next'
import { useMobileKeyboardInset } from '../../composables/editor/useMobileKeyboardInset'
import MobileEditorHeadingMenu from './MobileEditorHeadingMenu.vue'

const emit = defineEmits<{
  command: [id: string]
  'open-block-menu': []
  'open-link': []
  'request-image': []
}>()

const { t } = useI18n()
const overflowOpen = ref(false)
const headingMenuOpen = ref(false)
useMobileKeyboardInset()

function closeMenus() {
  overflowOpen.value = false
  headingMenuOpen.value = false
}

function runCommand(id: string) {
  closeMenus()
  emit('command', id)
}

function requestImage() {
  closeMenus()
  emit('request-image')
}

function openBlockMenu() {
  closeMenus()
  emit('open-block-menu')
}

function openLink() {
  closeMenus()
  emit('open-link')
}

function toggleHeadingMenu() {
  overflowOpen.value = false
  headingMenuOpen.value = !headingMenuOpen.value
}

function toggleOverflow() {
  headingMenuOpen.value = false
  overflowOpen.value = !overflowOpen.value
}

function selectHeading(level: number) {
  runCommand(`core.heading.${level}`)
}
</script>

<template>
  <div
    class="mobile-editor-tab-bar tw:absolute tw:z-[42] tw:right-[calc(12px+max(var(--safe-area-right),0px))] tw:bottom-[calc(20px+max(var(--safe-area-bottom),0px)+var(--mobile-keyboard-inset,0px))] tw:left-[calc(12px+max(var(--safe-area-left),0px))] tw:flex tw:min-h-14 tw:items-center tw:justify-between tw:gap-0 tw:p-1.5 tw:overflow-x-auto tw:overflow-y-visible tw:border tw:border-solid tw:border-transparent tw:rounded-[calc(18px*var(--radius-scale,1))] tw:bg-(--menu-bg) tw:shadow-[0_18px_44px_-16px_var(--shadow)] tw:scrollbar-none [&::-webkit-scrollbar]:tw:hidden max-[719px]:tw:flex min-[720px]:tw:hidden"
    role="toolbar"
    :aria-label="t('editor.toolbar.mobile')"
    @pointerdown.prevent
    @keydown.esc.stop="closeMenus"
  >
    <button
      type="button"
      class="mobile-editor-tab-bar__button tw:grid tw:size-11 tw:min-w-11 tw:p-0 tw:place-items-center tw:border-0 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:text-content-muted tw:bg-transparent tw:font-inherit tw:active:bg-(--press) tw:active:scale-[0.96] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1 tw:motion-reduce:transition-none"
      :aria-label="t('editor.toolbar.insertBlock')"
      :title="t('editor.toolbar.insertBlock')"
      @click="openBlockMenu"
    >
      <Plus :size="20" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mobile-editor-tab-bar__button mobile-editor-tab-bar__button--text tw:grid tw:size-11 tw:min-w-11 tw:p-0 tw:place-items-center tw:border-0 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:text-content-muted tw:bg-transparent tw:font-inherit tw:text-[13px] tw:font-[720] tw:tracking-[-0.02em] tw:active:bg-(--press) tw:active:scale-[0.96] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1 tw:motion-reduce:transition-none"
      :aria-label="t('slashMenu.items.h1')"
      :title="t('slashMenu.items.h1')"
      aria-haspopup="menu"
      :aria-expanded="headingMenuOpen"
      aria-controls="mobile-editor-heading-menu"
      @click="toggleHeadingMenu"
    >
      H1
    </button>
    <button
      type="button"
      class="mobile-editor-tab-bar__button tw:grid tw:size-11 tw:min-w-11 tw:p-0 tw:place-items-center tw:border-0 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:text-content-muted tw:bg-transparent tw:font-inherit tw:active:bg-(--press) tw:active:scale-[0.96] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1 tw:motion-reduce:transition-none"
      :aria-label="t('editor.toolbar.bold')"
      :title="t('editor.toolbar.bold')"
      @click="runCommand('core.bold')"
    >
      <Bold :size="19" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mobile-editor-tab-bar__button tw:grid tw:size-11 tw:min-w-11 tw:p-0 tw:place-items-center tw:border-0 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:text-content-muted tw:bg-transparent tw:font-inherit tw:active:bg-(--press) tw:active:scale-[0.96] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1 tw:motion-reduce:transition-none"
      :aria-label="t('editor.toolbar.italic')"
      :title="t('editor.toolbar.italic')"
      @click="runCommand('core.italic')"
    >
      <Italic :size="19" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mobile-editor-tab-bar__button tw:grid tw:size-11 tw:min-w-11 tw:p-0 tw:place-items-center tw:border-0 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:text-content-muted tw:bg-transparent tw:font-inherit tw:active:bg-(--press) tw:active:scale-[0.96] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1 tw:motion-reduce:transition-none"
      :aria-label="t('slashMenu.items.checklist')"
      :title="t('slashMenu.items.checklist')"
      @click="runCommand('core.checklistItem')"
    >
      <CheckSquare :size="19" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mobile-editor-tab-bar__button tw:grid tw:size-11 tw:min-w-11 tw:p-0 tw:place-items-center tw:border-0 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:text-content-muted tw:bg-transparent tw:font-inherit tw:active:bg-(--press) tw:active:scale-[0.96] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1 tw:motion-reduce:transition-none"
      :aria-label="t('editor.toolbar.link')"
      :title="t('editor.toolbar.link')"
      @click="openLink"
    >
      <Link2 :size="19" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mobile-editor-tab-bar__button tw:grid tw:size-11 tw:min-w-11 tw:p-0 tw:place-items-center tw:border-0 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:text-content-muted tw:bg-transparent tw:font-inherit tw:active:bg-(--press) tw:active:scale-[0.96] tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1 tw:motion-reduce:transition-none"
      :aria-label="t('editor.toolbar.moreFormatting')"
      :title="t('editor.toolbar.moreFormatting')"
      :aria-expanded="overflowOpen"
      aria-controls="mobile-editor-tab-bar-overflow"
      @click="toggleOverflow"
    >
      <Ellipsis :size="20" aria-hidden="true" />
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="headingMenuOpen || overflowOpen"
      class="mobile-editor-tab-bar__dismiss-layer tw:fixed tw:inset-0 tw:z-[41]"
      aria-hidden="true"
      @pointerdown="closeMenus"
    />
    <div
      v-if="overflowOpen"
      id="mobile-editor-tab-bar-overflow"
      class="mobile-editor-tab-bar__overflow tw:fixed tw:z-[43] tw:right-[calc(12px+max(var(--safe-area-right),0px))] tw:bottom-[calc(88px+max(var(--safe-area-bottom),0px)+var(--mobile-keyboard-inset,0px))] tw:grid tw:w-[min(286px,calc(100vw-24px))] tw:grid-cols-2 tw:gap-1 tw:p-2 tw:border tw:border-solid tw:border-transparent tw:rounded-[calc(18px*var(--radius-scale,1))] tw:bg-(--menu-bg) tw:shadow-[var(--shadow-overlay)]"
      role="menu"
      @pointerdown.prevent
      @keydown.esc.stop="closeMenus"
    >
      <button type="button" role="menuitem" class="tw:flex tw:min-w-0 tw:min-h-11 tw:items-center tw:gap-[9px] tw:px-2.5 tw:py-2 tw:border-0 tw:rounded-[calc(11px*var(--radius-scale,1))] tw:text-content-secondary tw:bg-transparent tw:font-inherit tw:text-[11px] tw:text-left tw:active:bg-(--press) tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1" @click="runCommand('core.paragraph')">
        <Pilcrow :size="17" aria-hidden="true" />
        <span class="tw:min-w-0 tw:truncate">{{ t('slashMenu.items.paragraph') }}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        class="tw:flex tw:min-w-0 tw:min-h-11 tw:items-center tw:gap-[9px] tw:px-2.5 tw:py-2 tw:border-0 tw:rounded-[calc(11px*var(--radius-scale,1))] tw:text-content-secondary tw:bg-transparent tw:font-inherit tw:text-[11px] tw:text-left tw:active:bg-(--press) tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1"
        @click="runCommand('core.strikethrough')"
      >
        <Strikethrough :size="17" aria-hidden="true" />
        <span class="tw:min-w-0 tw:truncate">{{ t('editor.toolbar.strikethrough') }}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        class="tw:flex tw:min-w-0 tw:min-h-11 tw:items-center tw:gap-[9px] tw:px-2.5 tw:py-2 tw:border-0 tw:rounded-[calc(11px*var(--radius-scale,1))] tw:text-content-secondary tw:bg-transparent tw:font-inherit tw:text-[11px] tw:text-left tw:active:bg-(--press) tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1"
        @click="runCommand('core.underline')"
      >
        <Underline :size="17" aria-hidden="true" />
        <span class="tw:min-w-0 tw:truncate">{{ t('editor.toolbar.underline') }}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        class="tw:flex tw:min-w-0 tw:min-h-11 tw:items-center tw:gap-[9px] tw:px-2.5 tw:py-2 tw:border-0 tw:rounded-[calc(11px*var(--radius-scale,1))] tw:text-content-secondary tw:bg-transparent tw:font-inherit tw:text-[11px] tw:text-left tw:active:bg-(--press) tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1"
        @click="runCommand('core.code')"
      >
        <Code2 :size="17" aria-hidden="true" />
        <span class="tw:min-w-0 tw:truncate">{{ t('editor.toolbar.code') }}</span>
      </button>
      <button type="button" role="menuitem" class="tw:flex tw:min-w-0 tw:min-h-11 tw:items-center tw:gap-[9px] tw:px-2.5 tw:py-2 tw:border-0 tw:rounded-[calc(11px*var(--radius-scale,1))] tw:text-content-secondary tw:bg-transparent tw:font-inherit tw:text-[11px] tw:text-left tw:active:bg-(--press) tw:focus-visible:outline-2 tw:focus-visible:outline-accent tw:focus-visible:outline-offset-1" @click="requestImage">
        <ImageIcon :size="17" aria-hidden="true" />
        <span class="tw:min-w-0 tw:truncate">{{ t('editor.toolbar.image') }}</span>
      </button>
    </div>
  </Teleport>

  <MobileEditorHeadingMenu
    :open="headingMenuOpen"
    @close="closeMenus"
    @select="selectHeading"
  />
</template>
