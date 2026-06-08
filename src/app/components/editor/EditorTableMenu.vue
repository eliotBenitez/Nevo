<script setup lang="ts">
import { computed } from 'vue'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns3,
  Combine,
  Heading1,
  Heading2,
  Minus,
  PaintBucket,
  Plus,
  Rows3,
  Split,
  SquareCode,
  Table,
  Trash2,
  Type,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { NevoTableContext } from '../../../types/editor-plugin'
import type { Component } from 'vue'

const props = defineProps<{
  visible: boolean
  context: NevoTableContext | null
  menuStyle: Record<string, string>
}>()

const emit = defineEmits<{
  command: [id: string]
  cellAlignment: [alignment: string | null]
  cellBackground: [color: string | null]
  cellAttr: [name: string, value: string | null]
}>()

const { t } = useI18n()

function getTableSelectionLabel(context: NevoTableContext): string {
  return t('editor.table.selection', { rows: context.selectedRows, cols: context.selectedCols })
}

interface TableMenuItem {
  label: string
  icon: Component
  hint?: Component
  action: () => void
  disabled?: boolean
  danger?: boolean
}

interface TableMenuGroup {
  label: string
  items: TableMenuItem[]
}

const groups = computed<TableMenuGroup[]>(() => {
  const ctx = props.context
  return [
    {
      label: t('editor.table.categories.insert'),
      items: [
        { label: t('editor.table.rowAddAbove'), icon: ArrowUp, hint: Plus, action: () => emit('command', 'core.table.row.add.before') },
        { label: t('editor.table.rowAddBelow'), icon: ArrowDown, hint: Plus, action: () => emit('command', 'core.table.row.add.after') },
        { label: t('editor.table.colAddLeft'), icon: ArrowLeft, hint: Columns3, action: () => emit('command', 'core.table.column.add.before') },
        { label: t('editor.table.colAddRight'), icon: ArrowRight, hint: Columns3, action: () => emit('command', 'core.table.column.add.after') },
      ]
    },
    {
      label: t('editor.table.categories.cells'),
      items: [
        { label: t('editor.table.mergeCells'), icon: Combine, hint: Table, action: () => emit('command', 'core.table.merge'), disabled: !ctx?.canMerge },
        { label: t('editor.table.splitCell'), icon: Split, hint: Table, action: () => emit('command', 'core.table.split'), disabled: !ctx?.canSplit },
        { label: t('editor.table.toggleHeaderRow'), icon: Rows3, hint: Heading1, action: () => emit('command', 'core.table.header.toggle.row') },
        { label: t('editor.table.toggleHeaderCol'), icon: Columns3, hint: Heading2, action: () => emit('command', 'core.table.header.toggle.column') },
      ]
    },
    {
      label: t('editor.table.categories.alignment'),
      items: [
        { label: t('editor.table.alignLeft'), icon: AlignLeft, action: () => emit('cellAlignment', 'left') },
        { label: t('editor.table.alignCenter'), icon: AlignCenter, action: () => emit('cellAlignment', 'center') },
        { label: t('editor.table.alignRight'), icon: AlignRight, action: () => emit('cellAlignment', 'right') },
        { label: t('editor.table.clearAlignment'), icon: Minus, action: () => emit('cellAlignment', null) },
      ]
    },
    {
      label: t('editor.table.categories.styling'),
      items: [
        { label: t('editor.table.bgWarm'), icon: PaintBucket, action: () => emit('cellBackground', 'oklch(0.95 0.04 90)') },
        { label: t('editor.table.bgCool'), icon: PaintBucket, action: () => emit('cellBackground', 'oklch(0.9 0.03 250)') },
        { label: t('editor.table.clearBackground'), icon: Minus, action: () => emit('cellBackground', null) },
        { label: t('editor.table.borderAccent'), icon: SquareCode, action: () => emit('cellAttr', 'borderColor', 'oklch(0.58 0.08 250)') },
        { label: t('editor.table.textAccent'), icon: Type, action: () => emit('cellAttr', 'textColor', 'oklch(0.34 0.08 250)') },
        { label: t('editor.table.padding16'), icon: Rows3, action: () => emit('cellAttr', 'padding', '16px') },
      ]
    },
    {
      label: t('editor.table.categories.actions'),
      items: [
        { label: t('editor.table.deleteRow'), icon: Trash2, action: () => emit('command', 'core.table.row.delete'), danger: true },
        { label: t('editor.table.deleteCol'), icon: Trash2, action: () => emit('command', 'core.table.column.delete'), danger: true },
        { label: t('editor.table.deleteTable'), icon: Trash2, action: () => emit('command', 'core.table.delete'), danger: true },
      ]
    },
  ]
})
</script>

<template>
  <div v-if="visible && context" class="editor-overlay table-menu" :style="menuStyle">
    <div class="table-menu__header">
      <span class="table-menu__title">{{ t('editor.table.title') }}</span>
      <span class="table-menu__meta">{{ getTableSelectionLabel(context) }}</span>
    </div>
    <div class="table-menu__content">
      <div v-for="group in groups" :key="group.label" class="table-menu__group">
        <div class="table-menu__category">{{ group.label }}</div>
        <div class="table-menu__list">
          <button
            v-for="item in group.items"
            :key="item.label"
            class="table-menu__item"
            :class="{ 'is-danger': item.danger }"
            :disabled="item.disabled"
            @mousedown.prevent
            @click="item.action"
          >
            <span class="table-menu__item-content">
              <span class="table-menu__icon">
                <component :is="item.icon" :size="13" />
              </span>
              <span>{{ item.label }}</span>
            </span>
            <span v-if="item.hint" class="table-menu__hint">
              <component :is="item.hint" :size="12" />
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
