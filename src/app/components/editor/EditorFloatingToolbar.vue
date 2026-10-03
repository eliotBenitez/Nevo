<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  Bold,
  Code2,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  Palette,
  Hash,
  Sigma,
  SquareTerminal,
  Strikethrough,
  Subscript,
  Superscript,
  Underline as UnderlineIcon,
} from 'lucide-vue-next'
import type { NevoToolbarAction } from '../../../types/editor-plugin'

defineProps<{
  visible: boolean
  toolbarStyle: Record<string, string>
  activeMarks: Set<string>
  pluginActions: NevoToolbarAction[]
}>()

const emit = defineEmits<{
  command: [id: string]
  openLinkPopover: []
  openHighlightPicker: []
  openTextColorPicker: []
  requestImage: []
  pluginAction: [action: NevoToolbarAction]
}>()

const { t } = useI18n()

const toolbarButtonClass = 'tw:inline-flex tw:h-[30px] tw:min-w-[30px] tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-[9px] tw:font-nv-ui tw:text-xs tw:leading-none tw:font-semibold tw:text-content-secondary tw:transition-[background,border-color,color] tw:duration-140 tw:hover:bg-[color-mix(in_oklab,var(--accent-soft)_40%,var(--hover)_60%)] tw:hover:text-content-primary tw:[&.is-active]:bg-[color-mix(in_oklab,var(--accent-soft)_40%,var(--hover)_60%)] tw:[&.is-active]:text-content-primary'
</script>

<template>
  <div v-if="visible" class="editor-overlay floating-toolbar tw:fixed tw:z-60 tw:inline-flex tw:-translate-x-1/2 tw:translate-y-[calc(-100%-8px)] tw:items-center tw:gap-[5px] tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-1.5 tw:shadow-(--shadow-overlay) tw:max-[719px]:hidden" :style="toolbarStyle">
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('strong') }]"
      :aria-label="t('editor.toolbar.bold')"
      :aria-pressed="activeMarks.has('strong')"
      :title="t('editor.toolbar.bold')"
      @mousedown.prevent
      @click="emit('command', 'core.bold')"
    >
      <Bold :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('em') }]"
      :aria-label="t('editor.toolbar.italic')"
      :aria-pressed="activeMarks.has('em')"
      :title="t('editor.toolbar.italic')"
      @mousedown.prevent
      @click="emit('command', 'core.italic')"
    >
      <Italic :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('strike') }]"
      :aria-label="t('editor.toolbar.strikethrough')"
      :aria-pressed="activeMarks.has('strike')"
      :title="t('editor.toolbar.strikethrough')"
      @mousedown.prevent
      @click="emit('command', 'core.strikethrough')"
    >
      <Strikethrough :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('underline') }]"
      :aria-label="t('editor.toolbar.underline')"
      :aria-pressed="activeMarks.has('underline')"
      :title="t('editor.toolbar.underline')"
      @mousedown.prevent
      @click="emit('command', 'core.underline')"
    >
      <UnderlineIcon :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('code') }]"
      :aria-label="t('editor.toolbar.code')"
      :aria-pressed="activeMarks.has('code')"
      :title="t('editor.toolbar.code')"
      @mousedown.prevent
      @click="emit('command', 'core.code')"
    >
      <Code2 :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('kbd') }]"
      :aria-label="t('editor.toolbar.kbd')"
      :aria-pressed="activeMarks.has('kbd')"
      :title="t('editor.toolbar.kbd')"
      @mousedown.prevent
      @click="emit('command', 'core.kbd')"
    >
      <SquareTerminal :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('tag') }]"
      :aria-label="t('editor.toolbar.tag')"
      :aria-pressed="activeMarks.has('tag')"
      :title="t('editor.toolbar.tag')"
      @mousedown.prevent
      @click="emit('command', 'core.tag')"
    >
      <Hash :size="14" />
    </button>
    <!-- Link, highlight and text colour open a picker rather than toggling, so they expose a popup instead of a pressed state. -->
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('link') }]"
      :aria-label="t('editor.toolbar.link')"
      aria-haspopup="true"
      :title="t('editor.toolbar.link')"
      @mousedown.prevent
      @click="emit('openLinkPopover')"
    >
      <Link2 :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('superscript') }]"
      :aria-label="t('editor.toolbar.superscript')"
      :aria-pressed="activeMarks.has('superscript')"
      :title="t('editor.toolbar.superscript')"
      @mousedown.prevent
      @click="emit('command', 'core.superscript')"
    >
      <Superscript :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('subscript') }]"
      :aria-label="t('editor.toolbar.subscript')"
      :aria-pressed="activeMarks.has('subscript')"
      :title="t('editor.toolbar.subscript')"
      @mousedown.prevent
      @click="emit('command', 'core.subscript')"
    >
      <Subscript :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('highlight') }]"
      :aria-label="t('editor.toolbar.highlight')"
      aria-haspopup="true"
      :title="t('editor.toolbar.highlight')"
      @mousedown.prevent
      @click="emit('openHighlightPicker')"
    >
      <Highlighter :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="[toolbarButtonClass, { 'is-active': activeMarks.has('text_color') }]"
      :aria-label="t('editor.toolbar.textColor')"
      aria-haspopup="true"
      :title="t('editor.toolbar.textColor')"
      @mousedown.prevent
      @click="emit('openTextColorPicker')"
    >
      <Palette :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="toolbarButtonClass"
      :aria-label="t('editor.toolbar.math')"
      :title="t('editor.toolbar.math')"
      @mousedown.prevent
      @click="emit('command', 'core.math.inline.insert')"
    >
      <Sigma :size="14" />
    </button>
    <button
      type="button"
      class="floating-toolbar__button"
      :class="toolbarButtonClass"
      :aria-label="t('editor.toolbar.image')"
      :title="t('editor.toolbar.image')"
      @mousedown.prevent
      @click="emit('requestImage')"
    >
      <ImageIcon :size="14" />
    </button>
    <button
      v-for="action in pluginActions"
      :key="action.id"
      type="button"
      class="floating-toolbar__button floating-toolbar__button--plugin tw:min-w-0 tw:text-[11.5px] tw:font-[550]"
      :class="toolbarButtonClass"
      @mousedown.prevent
      @click="emit('pluginAction', action)"
    >
      {{ action.title }}
    </button>
  </div>
</template>
