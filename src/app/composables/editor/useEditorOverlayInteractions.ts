import type { Ref } from 'vue'

export interface EditorOverlayElements {
  slashMenuEl: HTMLElement | null
  toolbarEl: HTMLElement | null
  linkPopoverEl: HTMLElement | null
  mathPopoverEl: HTMLElement | null
  formulaPopoverEl: HTMLElement | null
  mermaidPopoverEl: HTMLElement | null
  markmapPopoverEl: HTMLElement | null
  vegaPopoverEl: HTMLElement | null
  pluginNodePopoverEl: HTMLElement | null
  embedUrlPopoverEl: HTMLElement | null
  calloutIconPickerEl: HTMLElement | null
  blockHandleEl: HTMLElement | null
  blockTypeMenuEl: HTMLElement | null
}

interface EditorOverlayInteractionsOptions {
  overlayElements: Ref<EditorOverlayElements | null>
  noteEmbedPickerEl: () => HTMLElement | null
  isBlockTypeMenuOpen: () => boolean
  isLinkPopoverOpen: () => boolean
  isMathPopoverOpen: () => boolean
  isFormulaPopoverOpen: () => boolean
  isMermaidPopoverOpen: () => boolean
  isMarkmapPopoverOpen: () => boolean
  isVegaPopoverOpen: () => boolean
  isPluginNodePopoverOpen: () => boolean
  isEmbedUrlPopoverOpen: () => boolean
  isCalloutIconPickerOpen: () => boolean
  isSlashEmojiPickerOpen: () => boolean
  isNoteEmbedPickerOpen: () => boolean
  closeBlockTypeMenu: () => void
  closeLinkPopover: () => void
  closeMathPopover: () => void
  closeFormulaPopover: () => void
  closeMermaidPopover: () => void
  closeMarkmapPopover: () => void
  closeVegaPopover: () => void
  closePluginNodePopover: () => void
  closeEmbedUrlPopover: () => void
  closeCalloutIconPicker: () => void
  closeSlashEmojiPicker: () => void
  closeNoteEmbedPicker: () => void
  isEmbedOpeningClickIgnored: () => boolean
  onEditorScroll: () => void
  repositionOverlays: Array<() => void>
}

function isInsideNvSelectMenu(target: Node): boolean {
  return target instanceof Element && target.closest('.nv-select__menu') !== null
}

export function useEditorOverlayInteractions(options: EditorOverlayInteractionsOptions) {
  function onDocumentMouseDown(event: MouseEvent) {
    const target = event.target as Node | null
    if (!target) return
    const elements = options.overlayElements.value

    if (options.isBlockTypeMenuOpen()) {
      const insideHandle = elements?.blockHandleEl?.contains(target) ?? false
      const insideMenu = elements?.blockTypeMenuEl?.contains(target) ?? false
      if (!insideHandle && !insideMenu) options.closeBlockTypeMenu()
    }
    if (options.isLinkPopoverOpen()) {
      const insidePopover = elements?.linkPopoverEl?.contains(target) ?? false
      const insideToolbar = elements?.toolbarEl?.contains(target) ?? false
      if (!insidePopover && !insideToolbar) options.closeLinkPopover()
    }
    if (options.isMathPopoverOpen()
      && !elements?.mathPopoverEl?.contains(target)) options.closeMathPopover()
    if (options.isFormulaPopoverOpen()
      && !elements?.formulaPopoverEl?.contains(target)) options.closeFormulaPopover()
    if (options.isMermaidPopoverOpen()
      && !elements?.mermaidPopoverEl?.contains(target)) options.closeMermaidPopover()
    if (options.isMarkmapPopoverOpen()
      && !elements?.markmapPopoverEl?.contains(target)) options.closeMarkmapPopover()
    if (options.isVegaPopoverOpen()
      && !elements?.vegaPopoverEl?.contains(target)) options.closeVegaPopover()
    if (options.isPluginNodePopoverOpen()) {
      const insidePopover = elements?.pluginNodePopoverEl?.contains(target) ?? false
      if (!insidePopover && !isInsideNvSelectMenu(target)) options.closePluginNodePopover()
    }
    if (options.isEmbedUrlPopoverOpen()) {
      const insidePopover = elements?.embedUrlPopoverEl?.contains(target) ?? false
      const insideSlashMenu = elements?.slashMenuEl?.contains(target) ?? false
      const ignoreOpeningClick = options.isEmbedOpeningClickIgnored()
      if (!insidePopover && !insideSlashMenu && !ignoreOpeningClick) {
        options.closeEmbedUrlPopover()
      }
    }
    if (options.isCalloutIconPickerOpen()
      && !elements?.calloutIconPickerEl?.contains(target)) options.closeCalloutIconPicker()
    if (options.isSlashEmojiPickerOpen()
      && !elements?.slashMenuEl?.contains(target)) options.closeSlashEmojiPicker()
    if (options.isNoteEmbedPickerOpen()
      && !options.noteEmbedPickerEl()?.contains(target)) options.closeNoteEmbedPicker()
  }

  function handleEditorScroll() {
    options.onEditorScroll()
    for (const reposition of options.repositionOverlays) reposition()
  }

  return { onDocumentMouseDown, handleEditorScroll }
}
