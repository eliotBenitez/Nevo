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
</script>

<template>
  <div v-if="visible" class="editor-overlay floating-toolbar" :style="toolbarStyle">
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('strong') }"
      :aria-label="t('editor.toolbar.bold')"
      :title="t('editor.toolbar.bold')"
      @mousedown.prevent
      @click="emit('command', 'core.bold')"
    >
      <Bold :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('em') }"
      :aria-label="t('editor.toolbar.italic')"
      :title="t('editor.toolbar.italic')"
      @mousedown.prevent
      @click="emit('command', 'core.italic')"
    >
      <Italic :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('strike') }"
      :aria-label="t('editor.toolbar.strikethrough')"
      :title="t('editor.toolbar.strikethrough')"
      @mousedown.prevent
      @click="emit('command', 'core.strikethrough')"
    >
      <Strikethrough :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('underline') }"
      :aria-label="t('editor.toolbar.underline')"
      :title="t('editor.toolbar.underline')"
      @mousedown.prevent
      @click="emit('command', 'core.underline')"
    >
      <UnderlineIcon :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('code') }"
      :aria-label="t('editor.toolbar.code')"
      :title="t('editor.toolbar.code')"
      @mousedown.prevent
      @click="emit('command', 'core.code')"
    >
      <Code2 :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('kbd') }"
      :aria-label="t('editor.toolbar.kbd')"
      :title="t('editor.toolbar.kbd')"
      @mousedown.prevent
      @click="emit('command', 'core.kbd')"
    >
      <SquareTerminal :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('tag') }"
      :aria-label="t('editor.toolbar.tag')"
      :title="t('editor.toolbar.tag')"
      @mousedown.prevent
      @click="emit('command', 'core.tag')"
    >
      <Hash :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('link') }"
      :aria-label="t('editor.toolbar.link')"
      :title="t('editor.toolbar.link')"
      @mousedown.prevent
      @click="emit('openLinkPopover')"
    >
      <Link2 :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('superscript') }"
      :aria-label="t('editor.toolbar.superscript')"
      :title="t('editor.toolbar.superscript')"
      @mousedown.prevent
      @click="emit('command', 'core.superscript')"
    >
      <Superscript :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('subscript') }"
      :aria-label="t('editor.toolbar.subscript')"
      :title="t('editor.toolbar.subscript')"
      @mousedown.prevent
      @click="emit('command', 'core.subscript')"
    >
      <Subscript :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('highlight') }"
      :aria-label="t('editor.toolbar.highlight')"
      :title="t('editor.toolbar.highlight')"
      @mousedown.prevent
      @click="emit('openHighlightPicker')"
    >
      <Highlighter :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :class="{ 'is-active': activeMarks.has('text_color') }"
      :aria-label="t('editor.toolbar.textColor')"
      :title="t('editor.toolbar.textColor')"
      @mousedown.prevent
      @click="emit('openTextColorPicker')"
    >
      <Palette :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
      :aria-label="t('editor.toolbar.math')"
      :title="t('editor.toolbar.math')"
      @mousedown.prevent
      @click="emit('command', 'core.math.inline.insert')"
    >
      <Sigma :size="14" />
    </button>
    <button
      class="floating-toolbar__button"
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
      class="floating-toolbar__button floating-toolbar__button--plugin"
      @mousedown.prevent
      @click="emit('pluginAction', action)"
    >
      {{ action.title }}
    </button>
  </div>
</template>
