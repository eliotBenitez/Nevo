<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import type { NevoSlashItem, NevoToolbarAction } from '../../../types/editor-plugin'
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '../../../utils/editorColors'
import type {
  SlashOverlayState, ToolbarOverlayState, TableMenuOverlayState,
  LinkPopoverState, MathPopoverState, FormulaPopoverState, MermaidPopoverState, MarkmapPopoverState, VegaPopoverState,
  ColorPickerState, LinkPickerOverlayState, PluginNodePopoverState,
} from '../../composables/editor/useEditorOverlays'
import type { BlockHandleState } from '../../composables/editor/useBlockHandle'
import EditorSlashMenu from './EditorSlashMenu.vue'
import EditorFloatingToolbar from './EditorFloatingToolbar.vue'
import EditorColorPicker from './EditorColorPicker.vue'
import EditorTableMenu from './EditorTableMenu.vue'
import EditorLinkPopover from './EditorLinkPopover.vue'
import EditorMathPopover from './EditorMathPopover.vue'
import EditorFormulaPopover from './EditorFormulaPopover.vue'
import EditorMermaidPopover from './EditorMermaidPopover.vue'
import EditorMarkmapPopover from './EditorMarkmapPopover.vue'
import EditorVegaPopover from './EditorVegaPopover.vue'
import EditorPluginNodePopover from './EditorPluginNodePopover.vue'
import EditorEmbedUrlPopover from './EditorEmbedUrlPopover.vue'
import EditorLinkPicker from './EditorLinkPicker.vue'
import EditorBlockHandle from './EditorBlockHandle.vue'
import EditorBlockTypeMenu from './EditorBlockTypeMenu.vue'
import NvIconPicker from '../../../ui/primitives/NvIconPicker.vue'

export interface CalloutIconPickerState {
  open: boolean
  value: string
  nodePos: number | null
  position: { top: number; left: number }
}

export interface EmbedUrlPopoverState {
  open: boolean
  nodePos: number | null
  position: { top: number; left: number }
}

export interface OverlayHandlers {
  runSlashItem: (item: NevoSlashItem) => void
  executeCommandById: (id: string) => void
  openLinkPopover: () => void
  openHighlightPicker: () => void
  openTextColorPicker: () => void
  requestImage: () => void
  runPluginAction: (action: NevoToolbarAction) => void
  applyHighlight: (color: string) => void
  removeHighlight: () => void
  applyTextColor: (color: string) => void
  removeTextColor: () => void
  applyTableCellAlignment: (alignment: string | null) => void
  applyTableCellBackground: (color: string | null) => void
  applyTableCellAttr: (name: string, value: string | null) => void
  openTableCellFormula: () => void
  updateFormula: (v: string) => void
  applyFormula: () => void
  removeFormula: () => void
  onFormulaInputKeyDown: (e: KeyboardEvent) => void
  updateLinkHref: (v: string) => void
  applyLink: () => void
  removeLink: () => void
  onLinkInputKeyDown: (e: KeyboardEvent) => void
  updateLatex: (v: string) => void
  applyMath: () => void
  removeMath: () => void
  onMathInputKeyDown: (e: KeyboardEvent) => void
  updateCode: (v: string) => void
  applyMermaid: () => void
  removeMermaid: () => void
  onMermaidInputKeyDown: (e: KeyboardEvent) => void
  updateMarkmapMarkdown: (v: string) => void
  applyMarkmap: () => void
  removeMarkmap: () => void
  onMarkmapInputKeyDown: (e: KeyboardEvent) => void
  updateSpec: (v: string) => void
  applyVega: () => void
  removeVega: () => void
  onVegaInputKeyDown: (e: KeyboardEvent) => void
  updatePluginNodeValue: (payload: { key: string; value: unknown }) => void
  applyPluginNode: () => void
  removePluginNode: () => void
  onPluginNodeKeyDown: (e: KeyboardEvent) => void
  confirmEmbedUrl: (result: { url: string; embedType: string; embedHtml: string; title: string; thumbnailUrl: string }) => void
  cancelEmbedUrl: () => void
  onEmbedUrlInputKeyDown: (e: KeyboardEvent) => void
  selectLinkNote: (note: { id: string; title: string }) => void
  selectLinkCreateNote: (payload: { noteTitle: string; anchor: string | null; alias: string | null }) => void
  selectSlashEmoji: (emoji: string) => void
  openSlashEmojiPicker: () => void
  closeSlashEmojiPicker: () => void
  selectCalloutIcon: (icon: string) => void
  closeCalloutIconPicker: () => void
  onBlockHandlePointerDown: (event: PointerEvent) => void
  onTypeIconClick: () => void
  onHandleMouseEnter: () => void
  onHandleMouseLeave: () => void
  turnInto: (commandId: string) => void
  duplicateBlock: () => void
  insertBlockAbove: () => void
  insertBlockBelow: () => void
  deleteBlock: () => void
  copyBlockRef: () => void
  closeTypeMenu: () => void
  onMenuMouseEnter: () => void
  onMenuMouseLeave: () => void
  hideToolbarManually: () => void
}

interface Props {
  slashOverlay: SlashOverlayState
  toolbarOverlay: ToolbarOverlayState
  tableMenuOverlay: TableMenuOverlayState
  linkPopover: LinkPopoverState
  highlightPicker: ColorPickerState
  textColorPicker: ColorPickerState
  mathPopover: MathPopoverState
  formulaPopover: FormulaPopoverState
  mermaidPopover: MermaidPopoverState
  markmapPopover: MarkmapPopoverState
  vegaPopover: VegaPopoverState
  pluginNodePopover: PluginNodePopoverState
  embedUrlPopover: EmbedUrlPopoverState
  linkPickerOverlay: LinkPickerOverlayState
  calloutIconPicker: CalloutIconPickerState
  blockHandle: BlockHandleState
  activeMarkNames: Set<string>
  isTouch: boolean
  pluginActions: NevoToolbarAction[]
  currentNoteId: string | undefined
  slashEmojiPickerOpen: boolean
  handlers: OverlayHandlers
}

const props = defineProps<Props>()

const slashMenuElRef = ref<HTMLDivElement | null>(null)
const toolbarElRef = ref<HTMLDivElement | null>(null)
const tableMenuElRef = ref<HTMLDivElement | null>(null)
const linkPopoverElRef = ref<HTMLElement | null>(null)
const mathPopoverElRef = ref<HTMLElement | null>(null)
const formulaPopoverElRef = ref<HTMLElement | null>(null)
const mermaidPopoverElRef = ref<HTMLElement | null>(null)
const markmapPopoverElRef = ref<HTMLElement | null>(null)
const vegaPopoverElRef = ref<HTMLElement | null>(null)
const pluginNodePopoverElRef = ref<HTMLElement | null>(null)
const embedUrlPopoverElRef = ref<HTMLElement | null>(null)
const linkPickerElRef = ref<HTMLElement | null>(null)
const calloutIconPickerElRef = ref<HTMLElement | null>(null)
const blockHandleElRef = ref<HTMLElement | null>(null)
const blockTypeMenuElRef = ref<HTMLElement | null>(null)
const linkPopoverCompRef = ref<{ focusInput: () => void } | null>(null)
const mathPopoverCompRef = ref<{ focusInput: () => void } | null>(null)
const formulaPopoverCompRef = ref<{ focusInput: () => void } | null>(null)
const mermaidPopoverCompRef = ref<{ focusInput: () => void } | null>(null)
const markmapPopoverCompRef = ref<{ focusInput: () => void } | null>(null)
const vegaPopoverCompRef = ref<{ focusInput: () => void } | null>(null)
const pluginNodePopoverCompRef = ref<{ focusInput: () => void } | null>(null)
const embedUrlPopoverCompRef = ref<{ focusInput: () => void } | null>(null)
const linkPickerCompRef = ref<{ menuRef: HTMLDivElement | null; selectActive: () => boolean } | null>(null)

function onGlobalKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.toolbarOverlay.visible) {
    props.handlers.hideToolbarManually()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeyDown, { capture: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeyDown, { capture: true })
})

const slashMenuStyle = computed(() => ({ top: `${props.slashOverlay.position.top}px`, left: `${props.slashOverlay.position.left}px` }))
const toolbarStyle = computed(() => ({ top: `${props.toolbarOverlay.position.top}px`, left: `${props.toolbarOverlay.position.left}px` }))
const tableMenuStyle = computed(() => ({ top: `${props.tableMenuOverlay.position.top}px`, left: `${props.tableMenuOverlay.position.left}px` }))
const linkPopoverStyle = computed(() => ({ top: `${props.linkPopover.position.top}px`, left: `${props.linkPopover.position.left}px` }))
const mathPopoverStyle = computed(() => ({ top: `${props.mathPopover.position.top}px`, left: `${props.mathPopover.position.left}px` }))
const formulaPopoverStyle = computed(() => ({ top: `${props.formulaPopover.position.top}px`, left: `${props.formulaPopover.position.left}px` }))
const mermaidPopoverStyle = computed(() => ({ top: `${props.mermaidPopover.position.top}px`, left: `${props.mermaidPopover.position.left}px` }))
const markmapPopoverStyle = computed(() => ({ top: `${props.markmapPopover.position.top}px`, left: `${props.markmapPopover.position.left}px` }))
const vegaPopoverStyle = computed(() => ({ top: `${props.vegaPopover.position.top}px`, left: `${props.vegaPopover.position.left}px` }))
const pluginNodePopoverStyle = computed(() => ({ top: `${props.pluginNodePopover.position.top}px`, left: `${props.pluginNodePopover.position.left}px` }))
const highlightPickerStyle = computed(() => ({ top: `${props.highlightPicker.position.top}px`, left: `${props.highlightPicker.position.left}px` }))
const textColorPickerStyle = computed(() => ({ top: `${props.textColorPicker.position.top}px`, left: `${props.textColorPicker.position.left}px` }))
const linkPickerStyle = computed(() => ({ top: `${props.linkPickerOverlay.position.top}px`, left: `${props.linkPickerOverlay.position.left}px` }))
const blockTypeMenuStyle = computed(() => ({ top: `${props.blockHandle.typeMenuPosition.top}px`, left: `${props.blockHandle.typeMenuPosition.left}px` }))
const calloutIconPickerStyle = computed(() => ({ top: `${props.calloutIconPicker.position.top}px`, left: `${props.calloutIconPicker.position.left}px` }))

defineExpose({
  slashMenuEl: slashMenuElRef,
  toolbarEl: toolbarElRef,
  tableMenuEl: tableMenuElRef,
  linkPickerEl: linkPickerElRef,
  linkPopoverEl: linkPopoverElRef,
  linkPopoverComp: linkPopoverCompRef,
  mathPopoverEl: mathPopoverElRef,
  mathPopoverComp: mathPopoverCompRef,
  formulaPopoverEl: formulaPopoverElRef,
  formulaPopoverComp: formulaPopoverCompRef,
  mermaidPopoverEl: mermaidPopoverElRef,
  mermaidPopoverComp: mermaidPopoverCompRef,
  markmapPopoverEl: markmapPopoverElRef,
  markmapPopoverComp: markmapPopoverCompRef,
  vegaPopoverEl: vegaPopoverElRef,
  vegaPopoverComp: vegaPopoverCompRef,
  pluginNodePopoverEl: pluginNodePopoverElRef,
  pluginNodePopoverComp: pluginNodePopoverCompRef,
  embedUrlPopoverEl: embedUrlPopoverElRef,
  embedUrlPopoverComp: embedUrlPopoverCompRef,
  linkPickerComp: linkPickerCompRef,
  calloutIconPickerEl: calloutIconPickerElRef,
  blockHandleEl: blockHandleElRef,
  blockTypeMenuEl: blockTypeMenuElRef,
})
</script>

<template>
  <Teleport to="body">
    <div v-if="slashOverlay.open" ref="slashMenuElRef" class="teleport-anchor">
      <EditorSlashMenu
        :open="slashOverlay.open"
        :query="slashOverlay.query"
        :active-index="slashOverlay.activeIndex"
        :items="slashOverlay.items"
        :menu-style="slashMenuStyle"
        :emoji-picker-open="slashEmojiPickerOpen"
        @select="handlers.runSlashItem"
        @select-emoji="handlers.selectSlashEmoji"
        @open-emoji-picker="handlers.openSlashEmojiPicker"
        @close-emoji-picker="handlers.closeSlashEmojiPicker"
        @item-mousedown="(e) => e.preventDefault()"
      />
    </div>

    <div v-if="toolbarOverlay.visible" ref="toolbarElRef" class="teleport-anchor">
      <EditorFloatingToolbar
        :visible="toolbarOverlay.visible"
        :toolbar-style="toolbarStyle"
        :active-marks="activeMarkNames"
        :plugin-actions="pluginActions"
        @command="handlers.executeCommandById"
        @open-link-popover="handlers.openLinkPopover"
        @open-highlight-picker="handlers.openHighlightPicker"
        @open-text-color-picker="handlers.openTextColorPicker"
        @request-image="handlers.requestImage"
        @plugin-action="handlers.runPluginAction"
      />
    </div>

    <EditorColorPicker
      :open="highlightPicker.open"
      :picker-style="highlightPickerStyle"
      :colors="HIGHLIGHT_COLORS"
      @select="handlers.applyHighlight"
      @remove="handlers.removeHighlight"
    />

    <EditorColorPicker
      :open="textColorPicker.open"
      :picker-style="textColorPickerStyle"
      :colors="TEXT_COLORS"
      @select="handlers.applyTextColor"
      @remove="handlers.removeTextColor"
    />

    <div v-if="tableMenuOverlay.visible" ref="tableMenuElRef" class="teleport-anchor">
      <EditorTableMenu
        :visible="tableMenuOverlay.visible"
        :context="tableMenuOverlay.context"
        :menu-style="tableMenuStyle"
        @command="handlers.executeCommandById"
        @cell-alignment="handlers.applyTableCellAlignment"
        @cell-background="handlers.applyTableCellBackground"
        @cell-attr="handlers.applyTableCellAttr"
        @cell-formula="handlers.openTableCellFormula"
      />
    </div>

    <div v-if="formulaPopover.open" ref="formulaPopoverElRef" class="teleport-anchor">
      <EditorFormulaPopover
        ref="formulaPopoverCompRef"
        :open="formulaPopover.open"
        :formula="formulaPopover.formula"
        :popover-style="formulaPopoverStyle"
        @update:formula="handlers.updateFormula"
        @apply="handlers.applyFormula"
        @remove="handlers.removeFormula"
        @keydown="handlers.onFormulaInputKeyDown"
      />
    </div>

    <div v-if="linkPopover.open" ref="linkPopoverElRef" class="teleport-anchor">
      <EditorLinkPopover
        ref="linkPopoverCompRef"
        :open="linkPopover.open"
        :href="linkPopover.href"
        :editing="linkPopover.editing"
        :error="linkPopover.error"
        :popover-style="linkPopoverStyle"
        @update:href="handlers.updateLinkHref"
        @apply="handlers.applyLink"
        @remove="handlers.removeLink"
        @keydown="handlers.onLinkInputKeyDown"
      />
    </div>

    <div v-if="mathPopover.open" ref="mathPopoverElRef" class="teleport-anchor">
      <EditorMathPopover
        ref="mathPopoverCompRef"
        :open="mathPopover.open"
        :latex="mathPopover.latex"
        :is-inline="mathPopover.isInline"
        :popover-style="mathPopoverStyle"
        @update:latex="handlers.updateLatex"
        @apply="handlers.applyMath"
        @remove="handlers.removeMath"
        @keydown="handlers.onMathInputKeyDown"
      />
    </div>

    <div v-if="mermaidPopover.open" ref="mermaidPopoverElRef" class="teleport-anchor">
      <EditorMermaidPopover
        ref="mermaidPopoverCompRef"
        :open="mermaidPopover.open"
        :code="mermaidPopover.code"
        :popover-style="mermaidPopoverStyle"
        @update:code="handlers.updateCode"
        @apply="handlers.applyMermaid"
        @remove="handlers.removeMermaid"
        @keydown="handlers.onMermaidInputKeyDown"
      />
    </div>

    <div v-if="markmapPopover.open" ref="markmapPopoverElRef" class="teleport-anchor">
      <EditorMarkmapPopover
        ref="markmapPopoverCompRef"
        :open="markmapPopover.open"
        :markdown="markmapPopover.markdown"
        :popover-style="markmapPopoverStyle"
        @update:markdown="handlers.updateMarkmapMarkdown"
        @apply="handlers.applyMarkmap"
        @remove="handlers.removeMarkmap"
        @keydown="handlers.onMarkmapInputKeyDown"
      />
    </div>

    <div v-if="vegaPopover.open" ref="vegaPopoverElRef" class="teleport-anchor">
      <EditorVegaPopover
        ref="vegaPopoverCompRef"
        :open="vegaPopover.open"
        :spec="vegaPopover.spec"
        :popover-style="vegaPopoverStyle"
        @update:spec="handlers.updateSpec"
        @apply="handlers.applyVega"
        @remove="handlers.removeVega"
        @keydown="handlers.onVegaInputKeyDown"
      />
    </div>

    <div v-if="pluginNodePopover.open" ref="pluginNodePopoverElRef" class="teleport-anchor">
      <EditorPluginNodePopover
        ref="pluginNodePopoverCompRef"
        :open="pluginNodePopover.open"
        :title="pluginNodePopover.title"
        :fields="pluginNodePopover.fields"
        :values="pluginNodePopover.values"
        :removable="pluginNodePopover.removable"
        :popover-style="pluginNodePopoverStyle"
        @update:value="handlers.updatePluginNodeValue"
        @apply="handlers.applyPluginNode"
        @remove="handlers.removePluginNode"
        @keydown="handlers.onPluginNodeKeyDown"
      />
    </div>

    <div v-if="embedUrlPopover.open" ref="embedUrlPopoverElRef" class="teleport-anchor">
      <EditorEmbedUrlPopover
        ref="embedUrlPopoverCompRef"
        :open="embedUrlPopover.open"
        :position="embedUrlPopover.position"
        @confirm="handlers.confirmEmbedUrl"
        @cancel="handlers.cancelEmbedUrl"
        @keydown="handlers.onEmbedUrlInputKeyDown"
      />
    </div>

    <div ref="linkPickerElRef" class="teleport-anchor">
      <EditorLinkPicker
        ref="linkPickerCompRef"
        :open="linkPickerOverlay.open"
        :query="linkPickerOverlay.query"
        :active-index="linkPickerOverlay.activeIndex"
        :menu-style="linkPickerStyle"
        :current-note-id="currentNoteId"
        @select="handlers.selectLinkNote"
        @create="handlers.selectLinkCreateNote"
        @item-mousedown="(e) => e.preventDefault()"
      />
    </div>

    <div
      v-if="calloutIconPicker.open"
      ref="calloutIconPickerElRef"
      class="callout-icon-picker"
      :style="calloutIconPickerStyle"
    >
      <NvIconPicker
        :value="calloutIconPicker.value"
        @close="handlers.closeCalloutIconPicker"
        @select="handlers.selectCalloutIcon"
      />
    </div>

    <div
      v-if="!isTouch && (blockHandle.visible || blockHandle.typeMenuOpen)"
      ref="blockHandleElRef"
      class="teleport-anchor"
    >
      <EditorBlockHandle
        :visible="blockHandle.visible"
        :position="blockHandle.position"
        :hovered-block-type-name="blockHandle.hoveredBlockTypeName"
        :hovered-block-icon-attrs="blockHandle.hoveredBlockIconAttrs"
        @pointerdown="handlers.onBlockHandlePointerDown"
        @type-icon-click="handlers.onTypeIconClick"
        @mouseenter="handlers.onHandleMouseEnter"
        @mouseleave="handlers.onHandleMouseLeave"
      />
    </div>

    <div v-if="!isTouch && blockHandle.typeMenuOpen" ref="blockTypeMenuElRef" class="teleport-anchor">
      <EditorBlockTypeMenu
        :open="blockHandle.typeMenuOpen"
        :menu-style="blockTypeMenuStyle"
        :block-node-type="blockHandle.hoveredBlockTypeName"
        @turn-into="handlers.turnInto"
        @duplicate="handlers.duplicateBlock"
        @insert-above="handlers.insertBlockAbove"
        @insert-below="handlers.insertBlockBelow"
        @delete="handlers.deleteBlock"
        @copy-ref="handlers.copyBlockRef"
        @close="handlers.closeTypeMenu"
        @mouseenter="handlers.onMenuMouseEnter"
        @mouseleave="handlers.onMenuMouseLeave"
      />
    </div>
  </Teleport>
</template>
