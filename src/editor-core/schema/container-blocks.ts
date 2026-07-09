import type { NodeType, Schema } from 'prosemirror-model'

/**
 * «Контейнерный» блок — блочная нода, внутрь которой можно складывать обычные
 * блоки и выходить из неё двойным Enter / Mod-Enter (callout, blockquote и
 * любые аналогичные контейнеры плагинов). Определяется структурно, а не по
 * жёсткому списку имён, чтобы одинаково работать для встроенных нод и нод,
 * которые регистрируют плагины.
 *
 * Исключаются toggle (первым ребёнком идёт `toggle_title`) и column_list
 * (первым ребёнком идёт `column`): у них параграф недопустим на позиции 0,
 * поэтому `matchType(paragraph)` вернёт null.
 */
export function isContainerBlockType(type: NodeType): boolean {
  if (type.spec.defining !== true) return false
  const group = typeof type.spec.group === 'string' ? type.spec.group.split(/\s+/) : []
  if (!group.includes('block')) return false
  const paragraph = type.schema.nodes.paragraph
  if (!paragraph) return false
  return type.contentMatch.matchType(paragraph) != null
}

export function getContainerBlockTypes(schema: Schema): Set<NodeType> {
  const set = new Set<NodeType>()
  for (const type of Object.values(schema.nodes)) {
    if (isContainerBlockType(type)) set.add(type)
  }
  return set
}
