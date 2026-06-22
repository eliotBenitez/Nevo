import type { WorkspaceBlockNavigationTarget } from '../../../types/search'

export const BLOCK_SEARCH_HIGHLIGHT_CLASS = 'nv-search-target-block'

const highlightTimers = new WeakMap<HTMLElement, number>()

export function focusBlockSearchTarget(
  editorRoot: HTMLElement | null,
  target: WorkspaceBlockNavigationTarget,
  highlightDurationMs = 1_600,
): boolean {
  if (!editorRoot) return false

  const proseMirrorRoot = editorRoot.querySelector('.ProseMirror') as HTMLElement | null
  if (!proseMirrorRoot) return false

  const blockElement = proseMirrorRoot.children.item(target.blockIndex) as HTMLElement | null
  if (!blockElement) return false

  blockElement.scrollIntoView({
    block: 'center',
    behavior: 'smooth',
  })

  const previousTimer = highlightTimers.get(blockElement)
  if (previousTimer) window.clearTimeout(previousTimer)

  blockElement.classList.add(BLOCK_SEARCH_HIGHLIGHT_CLASS)
  const timer = window.setTimeout(() => {
    blockElement.classList.remove(BLOCK_SEARCH_HIGHLIGHT_CLASS)
    highlightTimers.delete(blockElement)
  }, highlightDurationMs)
  highlightTimers.set(blockElement, timer)

  return true
}
