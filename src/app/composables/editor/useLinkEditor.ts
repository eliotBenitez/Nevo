import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EditorCore } from './useEditorCore'
import type { LinkPopoverState, ToolbarOverlayState } from './useEditorOverlays'

export function useLinkEditor(
  core: EditorCore,
  linkPopover: LinkPopoverState,
  toolbarOverlay: ToolbarOverlayState,
  onFocusInput: () => void,
  onOverlaysUpdate: () => void,
) {
  const { t } = useI18n()

  function normalizeHrefInput(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) return trimmed
    return `https://${trimmed}`
  }

  function validateHref(value: string): boolean {
    if (!value) return false
    try {
      const parsed = new URL(value)
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)
    } catch {
      return false
    }
  }

  function closeLinkPopover() {
    linkPopover.open = false
    linkPopover.error = ''
  }

  function openLinkPopover() {
    if (!core.editorView || !core.coreCommands) return
    if (!toolbarOverlay.visible) return
    const existing = core.coreCommands.getLinkRange(core.editorView.state)
    linkPopover.open = true
    linkPopover.href = existing?.href ?? ''
    linkPopover.editing = Boolean(existing)
    linkPopover.error = ''
    linkPopover.position = {
      top: toolbarOverlay.position.top - 12,
      left: toolbarOverlay.position.left,
    }
    nextTick(() => { onFocusInput() })
  }

  function applyLinkFromPopover() {
    if (!core.editorView || !core.coreCommands) return
    const normalizedHref = normalizeHrefInput(linkPopover.href)
    if (!validateHref(normalizedHref)) {
      linkPopover.error = t('workspace.linkInvalid')
      return
    }
    linkPopover.error = ''
    const command = linkPopover.editing
      ? core.coreCommands.updateLink(normalizedHref)
      : core.coreCommands.setLink(normalizedHref)
    command(core.editorView.state, core.editorView.dispatch.bind(core.editorView))
    closeLinkPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function removeLinkFromPopover() {
    if (!core.editorView || !core.coreCommands) return
    core.coreCommands.unsetLink(core.editorView.state, core.editorView.dispatch.bind(core.editorView))
    closeLinkPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function onLinkInputKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeLinkPopover()
      core.editorView?.focus()
    }
  }

  return {
    openLinkPopover,
    closeLinkPopover,
    applyLinkFromPopover,
    removeLinkFromPopover,
    onLinkInputKeyDown,
  }
}
