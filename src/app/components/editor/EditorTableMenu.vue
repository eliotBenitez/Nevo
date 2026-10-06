<script setup lang="ts">
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
  Rows3,
  Sigma,
  Split,
  SquareCode,
  Table as TableIcon,
  Trash2,
  Type,
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { NevoTableContext } from '../../../types/editor-plugin'

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
  cellFormula: []
}>()

const { t } = useI18n()

function getTableSelectionLabel(context: NevoTableContext): string {
  return t('editor.table.selection', { rows: context.selectedRows, cols: context.selectedCols })
}

function toggleTextAccent() {
  const current = props.context?.activeCell?.textColor
  emit('cellAttr', 'textColor', current ? null : 'oklch(0.34 0.08 250)')
}

function toggleBorderAccent() {
  const current = props.context?.activeCell?.borderColor
  emit('cellAttr', 'borderColor', current ? null : 'oklch(0.58 0.08 250)')
}

function togglePadding() {
  const current = props.context?.activeCell?.padding
  emit('cellAttr', 'padding', current ? null : '16px')
}

const btnBase =
  'tw:inline-flex tw:size-7 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:p-0 tw:text-content-secondary tw:transition-all tw:duration-120 tw:ease-out tw:enabled:hover:bg-(--accent-soft) tw:enabled:hover:text-content-primary tw:enabled:active:scale-[0.92] tw:[&.is-active]:bg-(--accent-soft) tw:[&.is-active]:text-accent tw:disabled:cursor-default tw:disabled:opacity-30'

const btnDanger =
  'tw:inline-flex tw:size-7 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:p-0 tw:text-[#c84e4e] tw:transition-all tw:duration-120 tw:ease-out tw:enabled:hover:bg-[#c84e4e1f] tw:enabled:hover:text-[#c84e4e] tw:enabled:active:scale-[0.92] tw:disabled:cursor-default tw:disabled:opacity-30'
</script>

<template>
  <div
    v-if="visible && context"
    class="editor-overlay table-menu tw:fixed tw:z-60 tw:flex tw:w-[min(396px,calc(100vw-24px))] tw:max-w-[calc(100vw-24px)] tw:-translate-x-1/2 tw:flex-col tw:overflow-hidden tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-(--border-subtle) tw:bg-(--menu-bg) tw:p-0 tw:shadow-(--shadow-overlay)"
    :style="menuStyle"
  >
    <!-- Header with table title, selection badge, and delete table button -->
    <div class="table-menu__header tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:border-b tw:border-b-solid tw:border-(--border-subtle) tw:bg-[color-mix(in_oklab,var(--hover)_20%,transparent)] tw:px-3 tw:py-1.5">
      <div class="tw:flex tw:min-w-0 tw:items-center tw:gap-1.5">
        <TableIcon :size="13" class="tw:shrink-0 tw:text-accent" />
        <span class="table-menu__title tw:truncate tw:font-nv-mono tw:text-[11px] tw:font-semibold tw:tracking-[0.04em] tw:text-accent">{{ t('editor.table.title') }}</span>
      </div>
      <div class="tw:flex tw:shrink-0 tw:items-center tw:gap-1.5">
        <span class="table-menu__meta tw:inline-flex tw:items-center tw:rounded-full tw:bg-(--hover-strong) tw:px-2 tw:py-0.5 tw:font-nv-mono tw:text-[10px] tw:font-medium tw:tabular-nums tw:text-content-secondary">
          {{ getTableSelectionLabel(context) }}
        </span>
        <button
          type="button"
          :class="btnDanger"
          :title="t('editor.table.deleteTable')"
          :aria-label="t('editor.table.deleteTable')"
          @mousedown.prevent
          @click="emit('command', 'core.table.delete')"
        >
          <Trash2 :size="13" />
        </button>
      </div>
    </div>

    <div class="table-menu__content tw:flex tw:w-full tw:flex-col tw:gap-1.5 tw:p-2">
      <!-- Row 1: Table structure (rows, columns, cell merging) -->
      <div class="tw:grid tw:w-full tw:grid-cols-3 tw:gap-1.5">
        <!-- Row operations pill -->
        <div class="tw:flex tw:items-center tw:justify-center tw:gap-0.5 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-(--hover-strong) tw:p-0.5">
          <span class="tw:inline-flex tw:size-7 tw:items-center tw:justify-center tw:text-content-muted tw:select-none" :title="t('editor.table.categories.insert')">
            <Rows3 :size="12" />
          </span>
          <button
            type="button"
            :class="btnBase"
            :title="t('editor.table.rowAddAbove')"
            :aria-label="t('editor.table.rowAddAbove')"
            @mousedown.prevent
            @click="emit('command', 'core.table.row.add.before')"
          >
            <ArrowUp :size="13" />
          </button>
          <button
            type="button"
            :class="btnBase"
            :title="t('editor.table.rowAddBelow')"
            :aria-label="t('editor.table.rowAddBelow')"
            @mousedown.prevent
            @click="emit('command', 'core.table.row.add.after')"
          >
            <ArrowDown :size="13" />
          </button>
          <button
            type="button"
            :class="btnDanger"
            :title="t('editor.table.deleteRow')"
            :aria-label="t('editor.table.deleteRow')"
            @mousedown.prevent
            @click="emit('command', 'core.table.row.delete')"
          >
            <Trash2 :size="13" />
          </button>
        </div>

        <!-- Column operations pill -->
        <div class="tw:flex tw:items-center tw:justify-center tw:gap-0.5 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-(--hover-strong) tw:p-0.5">
          <span class="tw:inline-flex tw:size-7 tw:items-center tw:justify-center tw:text-content-muted tw:select-none" :title="t('editor.table.categories.insert')">
            <Columns3 :size="12" />
          </span>
          <button
            type="button"
            :class="btnBase"
            :title="t('editor.table.colAddLeft')"
            :aria-label="t('editor.table.colAddLeft')"
            @mousedown.prevent
            @click="emit('command', 'core.table.column.add.before')"
          >
            <ArrowLeft :size="13" />
          </button>
          <button
            type="button"
            :class="btnBase"
            :title="t('editor.table.colAddRight')"
            :aria-label="t('editor.table.colAddRight')"
            @mousedown.prevent
            @click="emit('command', 'core.table.column.add.after')"
          >
            <ArrowRight :size="13" />
          </button>
          <button
            type="button"
            :class="btnDanger"
            :title="t('editor.table.deleteCol')"
            :aria-label="t('editor.table.deleteCol')"
            @mousedown.prevent
            @click="emit('command', 'core.table.column.delete')"
          >
            <Trash2 :size="13" />
          </button>
        </div>

        <!-- Cell structure pill: merge, split, header toggles -->
        <div class="tw:flex tw:items-center tw:justify-center tw:gap-0.5 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-(--hover-strong) tw:p-0.5">
          <button
            type="button"
            :class="btnBase"
            :title="t('editor.table.mergeCells')"
            :aria-label="t('editor.table.mergeCells')"
            :disabled="!context?.canMerge"
            @mousedown.prevent
            @click="emit('command', 'core.table.merge')"
          >
            <Combine :size="13" />
          </button>
          <button
            type="button"
            :class="btnBase"
            :title="t('editor.table.splitCell')"
            :aria-label="t('editor.table.splitCell')"
            :disabled="!context?.canSplit"
            @mousedown.prevent
            @click="emit('command', 'core.table.split')"
          >
            <Split :size="13" />
          </button>
          <button
            type="button"
            :class="[btnBase, { 'is-active': context?.activeCell?.isHeader }]"
            :title="t('editor.table.toggleHeaderRow')"
            :aria-label="t('editor.table.toggleHeaderRow')"
            @mousedown.prevent
            @click="emit('command', 'core.table.header.toggle.row')"
          >
            <Heading1 :size="13" />
          </button>
          <button
            type="button"
            :class="btnBase"
            :title="t('editor.table.toggleHeaderCol')"
            :aria-label="t('editor.table.toggleHeaderCol')"
            @mousedown.prevent
            @click="emit('command', 'core.table.header.toggle.column')"
          >
            <Heading2 :size="13" />
          </button>
        </div>
      </div>

      <!-- Row 2: Alignment, colors, cell formatting & formula -->
      <div class="tw:grid tw:w-full tw:grid-cols-3 tw:gap-1.5">
        <!-- Alignment pill -->
        <div class="tw:flex tw:items-center tw:justify-center tw:gap-0.5 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-(--hover-strong) tw:p-0.5">
          <button
            type="button"
            :class="[btnBase, { 'is-active': context?.activeCell?.align === 'left' }]"
            :title="t('editor.table.alignLeft')"
            :aria-label="t('editor.table.alignLeft')"
            @mousedown.prevent
            @click="emit('cellAlignment', 'left')"
          >
            <AlignLeft :size="13" />
          </button>
          <button
            type="button"
            :class="[btnBase, { 'is-active': context?.activeCell?.align === 'center' }]"
            :title="t('editor.table.alignCenter')"
            :aria-label="t('editor.table.alignCenter')"
            @mousedown.prevent
            @click="emit('cellAlignment', 'center')"
          >
            <AlignCenter :size="13" />
          </button>
          <button
            type="button"
            :class="[btnBase, { 'is-active': context?.activeCell?.align === 'right' }]"
            :title="t('editor.table.alignRight')"
            :aria-label="t('editor.table.alignRight')"
            @mousedown.prevent
            @click="emit('cellAlignment', 'right')"
          >
            <AlignRight :size="13" />
          </button>
          <button
            type="button"
            :class="btnBase"
            :title="t('editor.table.clearAlignment')"
            :aria-label="t('editor.table.clearAlignment')"
            :disabled="!context?.activeCell?.align"
            @mousedown.prevent
            @click="emit('cellAlignment', null)"
          >
            <Minus :size="13" />
          </button>
        </div>

        <!-- Color styling pill -->
        <div class="tw:flex tw:items-center tw:justify-center tw:gap-0.5 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-(--hover-strong) tw:p-0.5">
          <span class="tw:inline-flex tw:size-7 tw:items-center tw:justify-center tw:text-content-muted tw:select-none" :title="t('editor.table.categories.styling')">
            <PaintBucket :size="12" />
          </span>
          <button
            type="button"
            :class="[btnBase, { 'is-active': context?.activeCell?.background === 'oklch(0.95 0.04 90)' }]"
            :title="t('editor.table.bgWarm')"
            :aria-label="t('editor.table.bgWarm')"
            @mousedown.prevent
            @click="emit('cellBackground', 'oklch(0.95 0.04 90)')"
          >
            <span
              class="tw:relative tw:inline-flex tw:size-3.5 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-black/15 dark:tw:border-white/25 tw:shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]"
              style="background: oklch(0.95 0.04 90);"
            >
              <span
                v-if="context?.activeCell?.background === 'oklch(0.95 0.04 90)'"
                class="tw:size-1 tw:rounded-full tw:bg-neutral-800"
              />
            </span>
          </button>
          <button
            type="button"
            :class="[btnBase, { 'is-active': context?.activeCell?.background === 'oklch(0.9 0.03 250)' }]"
            :title="t('editor.table.bgCool')"
            :aria-label="t('editor.table.bgCool')"
            @mousedown.prevent
            @click="emit('cellBackground', 'oklch(0.9 0.03 250)')"
          >
            <span
              class="tw:relative tw:inline-flex tw:size-3.5 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-black/15 dark:tw:border-white/25 tw:shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]"
              style="background: oklch(0.9 0.03 250);"
            >
              <span
                v-if="context?.activeCell?.background === 'oklch(0.9 0.03 250)'"
                class="tw:size-1 tw:rounded-full tw:bg-neutral-800"
              />
            </span>
          </button>
          <button
            type="button"
            :class="btnBase"
            :title="t('editor.table.clearBackground')"
            :aria-label="t('editor.table.clearBackground')"
            :disabled="!context?.activeCell?.background"
            @mousedown.prevent
            @click="emit('cellBackground', null)"
          >
            <Minus :size="13" />
          </button>
        </div>

        <!-- Formula and cell accents pill -->
        <div class="tw:flex tw:items-center tw:justify-center tw:gap-0.5 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-(--hover-strong) tw:p-0.5">
          <button
            type="button"
            :class="[btnBase, { 'is-active': !!context?.activeCell?.formula }]"
            :title="t('editor.table.formula')"
            :aria-label="t('editor.table.formula')"
            @mousedown.prevent
            @click="emit('cellFormula')"
          >
            <Sigma :size="13" />
          </button>
          <button
            type="button"
            :class="[btnBase, { 'is-active': !!context?.activeCell?.textColor }]"
            :title="t('editor.table.textAccent')"
            :aria-label="t('editor.table.textAccent')"
            @mousedown.prevent
            @click="toggleTextAccent"
          >
            <Type :size="13" />
          </button>
          <button
            type="button"
            :class="[btnBase, { 'is-active': !!context?.activeCell?.borderColor }]"
            :title="t('editor.table.borderAccent')"
            :aria-label="t('editor.table.borderAccent')"
            @mousedown.prevent
            @click="toggleBorderAccent"
          >
            <SquareCode :size="13" />
          </button>
          <button
            type="button"
            :class="[btnBase, { 'is-active': !!context?.activeCell?.padding }]"
            :title="t('editor.table.padding16')"
            :aria-label="t('editor.table.padding16')"
            @mousedown.prevent
            @click="togglePadding"
          >
            <Rows3 :size="13" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
