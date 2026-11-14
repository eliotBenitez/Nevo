import { useI18n } from 'vue-i18n'

// Blocks that normally carry their own text: an empty one is worth calling out
// as "empty", whereas an image or divider never has inline text to begin with.
const TEXT_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'code_block',
  'bullet_list',
  'ordered_list',
  'callout',
  'checklist_item',
  'toggle',
  'table',
  'column_list',
])

/** Localized names for ProseMirror block types shown in the history diff. */
export function useHistoryBlockType() {
  const { t, te } = useI18n()

  function typeName(type: string): string {
    const key = `workspace.history.blockType.${type}`
    // Unknown (e.g. plugin) block types keep their raw id so they stay identifiable.
    return te(key) ? t(key) : type
  }

  /** Stand-in text for a block whose inline text is empty. */
  function placeholder(type: string): string {
    return TEXT_BLOCK_TYPES.has(type) ? t('workspace.history.emptyBlock', { type: typeName(type) }) : typeName(type)
  }

  return { typeName, placeholder }
}
