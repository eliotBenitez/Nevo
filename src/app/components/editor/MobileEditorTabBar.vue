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
    class="mobile-editor-tab-bar"
    role="toolbar"
    :aria-label="t('editor.toolbar.mobile')"
    @pointerdown.prevent
    @keydown.esc.stop="closeMenus"
  >
    <button
      type="button"
      class="mobile-editor-tab-bar__button"
      :aria-label="t('editor.toolbar.insertBlock')"
      :title="t('editor.toolbar.insertBlock')"
      @click="openBlockMenu"
    >
      <Plus :size="20" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mobile-editor-tab-bar__button mobile-editor-tab-bar__button--text"
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
      class="mobile-editor-tab-bar__button"
      :aria-label="t('editor.toolbar.bold')"
      :title="t('editor.toolbar.bold')"
      @click="runCommand('core.bold')"
    >
      <Bold :size="19" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mobile-editor-tab-bar__button"
      :aria-label="t('editor.toolbar.italic')"
      :title="t('editor.toolbar.italic')"
      @click="runCommand('core.italic')"
    >
      <Italic :size="19" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mobile-editor-tab-bar__button"
      :aria-label="t('slashMenu.items.checklist')"
      :title="t('slashMenu.items.checklist')"
      @click="runCommand('core.checklistItem')"
    >
      <CheckSquare :size="19" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mobile-editor-tab-bar__button"
      :aria-label="t('editor.toolbar.link')"
      :title="t('editor.toolbar.link')"
      @click="openLink"
    >
      <Link2 :size="19" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mobile-editor-tab-bar__button"
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
      class="mobile-editor-tab-bar__dismiss-layer"
      aria-hidden="true"
      @pointerdown="closeMenus"
    />
    <div
      v-if="overflowOpen"
      id="mobile-editor-tab-bar-overflow"
      class="mobile-editor-tab-bar__overflow"
      role="menu"
      @pointerdown.prevent
      @keydown.esc.stop="closeMenus"
    >
      <button type="button" role="menuitem" @click="runCommand('core.paragraph')">
        <Pilcrow :size="17" aria-hidden="true" />
        <span>{{ t('slashMenu.items.paragraph') }}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        @click="runCommand('core.strikethrough')"
      >
        <Strikethrough :size="17" aria-hidden="true" />
        <span>{{ t('editor.toolbar.strikethrough') }}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        @click="runCommand('core.underline')"
      >
        <Underline :size="17" aria-hidden="true" />
        <span>{{ t('editor.toolbar.underline') }}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        @click="runCommand('core.code')"
      >
        <Code2 :size="17" aria-hidden="true" />
        <span>{{ t('editor.toolbar.code') }}</span>
      </button>
      <button type="button" role="menuitem" @click="requestImage">
        <ImageIcon :size="17" aria-hidden="true" />
        <span>{{ t('editor.toolbar.image') }}</span>
      </button>
    </div>
  </Teleport>

  <MobileEditorHeadingMenu
    :open="headingMenuOpen"
    @close="closeMenus"
    @select="selectHeading"
  />
</template>

<style scoped>
.mobile-editor-tab-bar {
  position: absolute;
  z-index: 42;
  right: calc(12px + max(var(--safe-area-right), 0px));
  bottom:
    calc(
      20px
      + max(var(--safe-area-bottom), 0px)
      + var(--mobile-keyboard-inset, 0px)
    );
  left: calc(12px + max(var(--safe-area-left), 0px));
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  gap: 0;
  padding: 6px;
  overflow-x: auto;
  overflow-y: visible;
  border: 1px solid var(--line-2);
  border-radius: calc(18px * var(--radius-scale, 1));
  background: color-mix(in oklab, var(--glass-titlebar) 94%, var(--canvas-1));
  box-shadow: 0 18px 44px -16px var(--shadow);
  backdrop-filter: blur(24px) saturate(118%);
  -webkit-backdrop-filter: blur(24px) saturate(118%);
  scrollbar-width: none;
}

.mobile-editor-tab-bar::-webkit-scrollbar {
  display: none;
}

.mobile-editor-tab-bar__button {
  display: grid;
  width: 44px;
  min-width: 44px;
  height: 44px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: calc(12px * var(--radius-scale, 1));
  color: var(--text-3);
  background: transparent;
  font: inherit;
}

.mobile-editor-tab-bar__button--text {
  font-size: 13px;
  font-weight: 720;
  letter-spacing: -0.02em;
}

.mobile-editor-tab-bar__button:active {
  background: var(--press);
  transform: scale(0.96);
}

.mobile-editor-tab-bar__button:focus-visible,
.mobile-editor-tab-bar__overflow button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.mobile-editor-tab-bar__dismiss-layer {
  position: fixed;
  z-index: 41;
  inset: 0;
}

.mobile-editor-tab-bar__overflow {
  position: fixed;
  z-index: 43;
  right: calc(12px + max(var(--safe-area-right), 0px));
  bottom:
    calc(
      88px
      + max(var(--safe-area-bottom), 0px)
      + var(--mobile-keyboard-inset, 0px)
    );
  display: grid;
  width: min(286px, calc(100vw - 24px));
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--line-2);
  border-radius: calc(18px * var(--radius-scale, 1));
  background: color-mix(in oklab, var(--glass-titlebar) 96%, var(--canvas-1));
  box-shadow: var(--shadow-pop);
  backdrop-filter: blur(24px) saturate(118%);
  -webkit-backdrop-filter: blur(24px) saturate(118%);
}

.mobile-editor-tab-bar__overflow button {
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 0;
  border-radius: calc(11px * var(--radius-scale, 1));
  color: var(--text-2);
  background: transparent;
  font: inherit;
  font-size: 11px;
  text-align: left;
}

.mobile-editor-tab-bar__overflow button:active {
  background: var(--press);
}

.mobile-editor-tab-bar__overflow span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 720px) {
  .mobile-editor-tab-bar {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-editor-tab-bar__button {
    transition: none;
  }
}
</style>
