<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Component } from 'vue'
import {
  GripVertical,
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Quote,
  SquareCode,
  List,
  ListOrdered,
  MessageSquareQuote,
  ChevronRightSquare,
  CheckSquare,
  Minus,
  Sigma,
  GitBranch,
  Network,
  Globe,
  Image as ImageIcon,
  Paperclip,
  Table2,
  Video,
  Music,
  FileText,
  Palette,
  Database,
} from 'lucide-vue-next'

defineProps<{
  visible: boolean
  position: { top: number; left: number }
  hoveredBlockTypeName: string | null
  hoveredBlockIconAttrs: { level?: number; kind?: string } | null
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  typeIconClick: []
  mouseenter: []
  mouseleave: []
}>()

const nodeTypeIconMap: Record<string, Component> = {
  paragraph: Pilcrow,
  blockquote: Quote,
  code_block: SquareCode,
  bullet_list: List,
  ordered_list: ListOrdered,
  callout: MessageSquareQuote,
  toggle: ChevronRightSquare,
  checklist_item: CheckSquare,
  divider: Minus,
  math_block: Sigma,
  mermaid_block: GitBranch,
  markmap_block: Network,
  image_block: ImageIcon,
  file_block: Paperclip,
  table: Table2,
  note_embed: FileText,
  embed_block: Globe,
  draw_block: Palette,
  database_block: Database,
}

function getNodeIcon(typeName: string | null, attrs: { level?: number; kind?: string } | null): Component {
  if (!typeName) return Pilcrow
  if (typeName === 'heading') {
    const level = attrs?.level
    if (level === 1) return Heading1
    if (level === 2) return Heading2
    if (level === 3) return Heading3
    if (level === 4) return Heading4
    if (level === 5) return Heading5
    return Heading6
  }
  if (typeName === 'media_block') {
    return attrs?.kind === 'video' ? Video : Music
  }
  return nodeTypeIconMap[typeName] ?? Pilcrow
}

const { t } = useI18n()
</script>

<template>
  <div
    v-if="visible"
    class="block-handle"
    :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
  >
    <button
      class="block-handle__btn block-handle__drag"
      :aria-label="t('editor.blockHandle.drag')"
      :title="t('editor.blockHandle.drag')"
      @pointerdown="emit('pointerdown', $event)"
    >
      <GripVertical :size="14" />
    </button>
    <button
      class="block-handle__btn block-handle__type"
      :aria-label="t('editor.blockHandle.options')"
      :title="t('editor.blockHandle.options')"
      @mousedown.prevent="emit('typeIconClick')"
    >
      <component :is="getNodeIcon(hoveredBlockTypeName, hoveredBlockIconAttrs)" :size="13" />
    </button>
  </div>
</template>
