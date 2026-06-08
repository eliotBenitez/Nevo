export type EdgeKind = 'link' | 'embed' | 'mention' | 'parent'

export interface ExtractedEdge {
  target: string
  kind: EdgeKind
  anchor: string | null
  position: number
}

export interface GraphEdge {
  source: string
  target: string
  kind: EdgeKind
  anchor?: string
}

export interface BacklinkRef {
  sourceId: string
  sourceTitle: string
  sourceIcon: string
  count: number
}

export interface GraphNode {
  id: string
  title: string
  icon: string
  folderId: string | null
  degree: number
}

export interface GraphSnapshot {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface LocalGraph {
  centerId: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  depth: number
}
