<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Pilcrow, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, SquareCode, MessageSquareQuote, CheckSquare,
  Copy, Trash2, Link, ArrowUpToLine, ArrowDownToLine, List, ListOrdered,
} from 'lucide-vue-next'
import NvMenuItem from '../../../ui/primitives/NvMenuItem.vue'
import NvMenuSeparator from '../../../ui/primitives/NvMenuSeparator.vue'
import NvMenuLabel from '../../../ui/primitives/NvMenuLabel.vue'

const { t } = useI18n()

const props = defineProps<{
  open: boolean
  menuStyle: Record<string, string>
  blockNodeType: string | null
}>()

const emit = defineEmits<{
  turnInto: [commandId: string]
  duplicate: []
  insertAbove: []
  insertBelow: []
  delete: []
  copyRef: []
  close: []
  mouseenter: []
  mouseleave: []
}>()

const TURN_INTO_CAPABLE = new Set(['paragraph', 'heading', 'code_block', 'callout', 'checklist_item', 'bullet_list', 'ordered_list'])

const canTurnInto = computed(() =>
  props.blockNodeType ? TURN_INTO_CAPABLE.has(props.blockNodeType) : false,
)

interface TurnIntoItem { labelKey: string; commandId: string; icon: Component }

const turnIntoItems: TurnIntoItem[] = [
  { labelKey: 'workspace.blockMenu.paragraph', commandId: 'core.paragraph', icon: Pilcrow },
  { labelKey: 'workspace.blockMenu.heading1',  commandId: 'core.heading.1', icon: Heading1 },
  { labelKey: 'workspace.blockMenu.heading2',  commandId: 'core.heading.2', icon: Heading2 },
  { labelKey: 'workspace.blockMenu.heading3',  commandId: 'core.heading.3', icon: Heading3 },
  { labelKey: 'workspace.blockMenu.heading4',  commandId: 'core.heading.4', icon: Heading4 },
  { labelKey: 'workspace.blockMenu.heading5',  commandId: 'core.heading.5', icon: Heading5 },
  { labelKey: 'workspace.blockMenu.heading6',  commandId: 'core.heading.6', icon: Heading6 },
  { labelKey: 'workspace.blockMenu.bulletList', commandId: 'core.bulletList', icon: List },
  { labelKey: 'workspace.blockMenu.numberedList', commandId: 'core.orderedList', icon: ListOrdered },
  { labelKey: 'workspace.blockMenu.codeBlock', commandId: 'core.codeBlock', icon: SquareCode },
  { labelKey: 'workspace.blockMenu.callout',   commandId: 'core.callout',   icon: MessageSquareQuote },
  { labelKey: 'workspace.blockMenu.checklist', commandId: 'core.checklistItem', icon: CheckSquare },
]
</script>

<template>
  <div
    v-if="open"
    class="editor-overlay block-type-menu"
    :style="menuStyle"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
    @mousedown.prevent
  >
    <template v-if="canTurnInto">
      <NvMenuLabel :label="t('workspace.blockMenu.turnInto')" />
      <NvMenuItem
        v-for="item in turnIntoItems"
        :key="item.commandId"
        :icon="item.icon"
        :label="t(item.labelKey)"
        @select="emit('turnInto', item.commandId)"
      />
      <NvMenuSeparator />
    </template>

    <NvMenuItem :icon="Copy"            :label="t('workspace.blockMenu.duplicate')"   @select="emit('duplicate')" />
    <NvMenuItem :icon="ArrowUpToLine"   :label="t('workspace.blockMenu.insertAbove')" @select="emit('insertAbove')" />
    <NvMenuItem :icon="ArrowDownToLine" :label="t('workspace.blockMenu.insertBelow')" @select="emit('insertBelow')" />
    <NvMenuItem :icon="Link"            :label="t('workspace.blockMenu.copyRef')"     @select="emit('copyRef')" />
    <NvMenuSeparator />
    <NvMenuItem :icon="Trash2"          :label="t('workspace.blockMenu.delete')" danger @select="emit('delete')" />
  </div>
</template>
