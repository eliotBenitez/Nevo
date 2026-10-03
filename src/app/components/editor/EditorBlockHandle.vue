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
  ListFilter,
  Link2,
  Plus,
  BarChart3,
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
  insertBelow: []
  mouseenter: []
  mouseleave: []
}>()

function onTypeIconClick() {
  emit('typeIconClick')
}

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
  query_block: ListFilter,
  block_embed: Link2,
  vega_block: BarChart3,
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
    class="block-handle tw:fixed tw:z-50 tw:flex tw:touch-none tw:items-start tw:gap-0 tw:-translate-x-full tw:coarse:translate-x-[-32px] tw:coarse:gap-0.5 tw:coarse:rounded-[calc(12px*var(--radius-scale,1))] tw:coarse:border tw:coarse:border-solid tw:coarse:border-transparent tw:coarse:bg-(--menu-bg) tw:coarse:p-0.5 tw:coarse:shadow-(--shadow-overlay)"
    :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
  >
    <button
      type="button"
      class="block-handle__btn block-handle__drag tw:flex tw:h-[22px] tw:w-4 tw:shrink-0 tw:cursor-grab tw:items-center tw:justify-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:p-0 tw:text-content-muted tw:transition-[background,color] tw:duration-80 tw:hover:bg-(--hover) tw:hover:text-content-secondary tw:active:cursor-grabbing tw:coarse:h-11 tw:coarse:w-11 tw:coarse:touch-none tw:coarse:text-content-secondary tw:coarse:active:bg-(--hover-strong) tw:coarse:active:text-accent"
      :aria-label="t('editor.blockHandle.drag')"
      :title="t('editor.blockHandle.drag')"
      @pointerdown="emit('pointerdown', $event)"
    >
      <GripVertical :size="14" />
    </button>
    <button
      type="button"
      class="block-handle__btn block-handle__type tw:flex tw:h-[22px] tw:w-4 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:p-0 tw:text-content-muted tw:transition-[background,color] tw:duration-80 tw:hover:bg-(--hover) tw:hover:text-content-secondary tw:coarse:h-11 tw:coarse:w-11 tw:coarse:touch-none tw:coarse:text-content-secondary tw:coarse:active:bg-(--hover-strong) tw:coarse:active:text-accent"
      :aria-label="t('editor.blockHandle.options')"
      :title="t('editor.blockHandle.options')"
      @mousedown.prevent.stop
      @click.prevent.stop="onTypeIconClick"
    >
      <component :is="getNodeIcon(hoveredBlockTypeName, hoveredBlockIconAttrs)" :size="13" />
    </button>
    <button
      type="button"
      class="block-handle__btn block-handle__insert-below tw:hidden tw:h-[22px] tw:w-4 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:p-0 tw:text-content-muted tw:transition-[background,color] tw:duration-80 tw:hover:bg-(--hover) tw:hover:text-content-secondary tw:coarse:flex tw:coarse:h-11 tw:coarse:w-11 tw:coarse:touch-none tw:coarse:text-content-secondary tw:coarse:active:bg-(--hover-strong) tw:coarse:active:text-accent"
      :aria-label="t('editor.blockMenu.insertBelow')"
      :title="t('editor.blockMenu.insertBelow')"
      @mousedown.prevent.stop
      @click.prevent.stop="emit('insertBelow')"
    >
      <Plus :size="16" aria-hidden="true" />
    </button>
  </div>
</template>
