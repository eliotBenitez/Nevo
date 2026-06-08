import type { Node } from 'prosemirror-model'
import type { ExtractedEdge } from '../types/graph'

export function extractLinks(doc: Node): ExtractedEdge[] {
  const edges: ExtractedEdge[] = []
  const internalLinkType = doc.type.schema.marks.internal_link
  if (!internalLinkType) return edges

  doc.descendants((node, pos) => {
    if (!node.isText) return
    const mark = internalLinkType.isInSet(node.marks)
    if (!mark) return
    edges.push({
      target: mark.attrs.noteId as string,
      kind: 'link',
      anchor: (mark.attrs.anchor as string | null) ?? null,
      position: pos,
    })
  })

  return edges
}
