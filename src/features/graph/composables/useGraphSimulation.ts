import { onUnmounted, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force'
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force'
import type { GraphEdge, GraphNode, GraphSnapshot } from '../../../types/graph'

export interface SimNode extends SimulationNodeDatum {
  id: string
  title: string
  icon: string
  folderId: string | null
  degree: number
  x: number
  y: number
}

type SimLink = SimulationLinkDatum<SimNode>

export function useGraphSimulation(snapshot: Ref<GraphSnapshot | null>, width: Ref<number>, height: Ref<number>) {
  const simNodes = shallowRef<SimNode[]>([])
  let simulation: ReturnType<typeof forceSimulation<SimNode>> | null = null
  const rafId = 0

  function buildNodes(nodes: GraphNode[], cx: number, cy: number): SimNode[] {
    const existing = new Map(simNodes.value.map(n => [n.id, n]))
    return nodes.map(n => {
      const prev = existing.get(n.id)
      return {
        ...n,
        // Seed new layouts near the eventual force-center target to avoid the
        // initial "camera jump" between the first fit and the next simulation ticks.
        x: prev?.x ?? (cx + (Math.random() - 0.5) * 200),
        y: prev?.y ?? (cy + (Math.random() - 0.5) * 200),
      } as SimNode
    })
  }

  function buildLinks(edges: GraphEdge[], nodeById: Map<string, SimNode>): SimLink[] {
    const links: SimLink[] = []
    for (const e of edges) {
      const source = nodeById.get(e.source)
      const target = nodeById.get(e.target)
      if (source && target) links.push({ source, target })
    }
    return links
  }

  function restart(data: GraphSnapshot) {
    if (simulation) { simulation.stop(); cancelAnimationFrame(rafId) }

    const cx = width.value / 2
    const cy = height.value / 2
    const nodes = buildNodes(data.nodes, cx, cy)
    const nodeById = new Map(nodes.map(n => [n.id, n]))
    const links = buildLinks(data.edges, nodeById)

    simulation = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id(d => d.id).distance(80).strength(0.4))
      .force('charge', forceManyBody<SimNode>().strength(d => -120 - d.degree * 20))
      .force('center', forceCenter(cx, cy).strength(0.05))
      .force('collide', forceCollide<SimNode>(d => nodeRadius(d) + 8))
      .alphaDecay(0.02)

    // Publish the live node array once. Rendering is driven by GraphCanvas's own
    // requestAnimationFrame loop, which reads these node objects directly while
    // d3 mutates their x/y in place — so we don't republish a fresh array on
    // every simulation tick. That avoided ~60×/sec array allocations plus the
    // cascade of reactive recomputations they triggered during settling
    // (focusGraph computed + useGraphFocus's O(N) graph watch), none of which
    // depend on node positions.
    simNodes.value = nodes
  }

  watch(snapshot, (data) => {
    if (data) restart(data)
    else {
      simulation?.stop()
      simNodes.value = []
    }
  }, { immediate: true })

  function reheat() { simulation?.alpha(0.4).restart() }

  function pinNode(id: string, x: number, y: number) {
    const node = simNodes.value.find(n => n.id === id)
    if (!node) return
    node.fx = x
    node.fy = y
    simulation?.alpha(0.1).restart()
  }

  function unpinNode(id: string) {
    const node = simNodes.value.find(n => n.id === id)
    if (!node) return
    node.fx = undefined
    node.fy = undefined
  }

  onUnmounted(() => {
    simulation?.stop()
    cancelAnimationFrame(rafId)
  })

  return { simNodes, reheat, pinNode, unpinNode }
}

export function nodeRadius(node: { degree: number }): number {
  return 5 + Math.min(node.degree * 1.5, 12)
}
