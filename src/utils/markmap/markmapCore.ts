type ViewModule = typeof import('markmap-view')

/* eslint-disable @typescript-eslint/no-explicit-any */
let transformerInstance: any = null
let viewModule: ViewModule | null = null
const loadedAssetKeys = new Set<string>()

export interface MarkmapInstance {
  setData: (data: unknown, opts?: unknown) => void
  setOptions: (opts: unknown) => void
  fit: () => Promise<void> | void
  destroy: () => void
}

export interface TransformedMarkmap {
  view: ViewModule
  root: unknown
  /** Options derived from the document's `markmap:` frontmatter. */
  options: Record<string, unknown>
}

interface MarkmapNode {
  content?: unknown
  children?: unknown
}

async function ensureMarkmap(): Promise<{ transformer: any; view: ViewModule }> {
  if (!transformerInstance) {
    const lib = await import('markmap-lib')
    transformerInstance = new lib.Transformer()
  }
  if (!viewModule) {
    viewModule = await import('markmap-view')
  }
  return { transformer: transformerInstance, view: viewModule }
}

/** Track which asset descriptors have been injected so repeats are skipped. */
function isNewAsset(item: unknown): boolean {
  const key = JSON.stringify(item)
  if (loadedAssetKeys.has(key)) return false
  loadedAssetKeys.add(key)
  return true
}

export function normalizeMarkmapKatexContent(content: string): string {
  if (!content.includes('class="katex"') || typeof document === 'undefined') return content

  const template = document.createElement('template')
  template.innerHTML = content

  template.content.querySelectorAll('.katex').forEach((katexEl) => {
    const math = katexEl.querySelector('.katex-mathml math, math')
    if (!math) return

    const wrapper = document.createElement('span')
    wrapper.className = 'katex nv-markmap-katex-mathml'
    wrapper.append(math.cloneNode(true))
    katexEl.replaceWith(wrapper)
  })

  return template.innerHTML
}

function normalizeMarkmapKatexTree(node: unknown): void {
  if (!node || typeof node !== 'object') return

  const markmapNode = node as MarkmapNode
  if (typeof markmapNode.content === 'string') {
    markmapNode.content = normalizeMarkmapKatexContent(markmapNode.content)
  }

  if (Array.isArray(markmapNode.children)) {
    markmapNode.children.forEach(normalizeMarkmapKatexTree)
  }
}

/**
 * Transform markmap markdown into render-ready data.
 * Loads the rich-content assets (KaTeX, prism) markmap needs and resolves the
 * per-document options encoded in the `markmap:` frontmatter (colorFreezeLevel,
 * maxWidth, etc.) so callers can spread them over their base options.
 */
export async function transformMarkmap(markdown: string): Promise<TransformedMarkmap> {
  const { transformer, view } = await ensureMarkmap()
  const { root, features, frontmatter } = transformer.transform(markdown)
  normalizeMarkmapKatexTree(root)

  const assets = transformer.getUsedAssets(features)
  const styles = (assets.styles ?? []).filter(isNewAsset)
  const scripts = (assets.scripts ?? []).filter(isNewAsset)
  if (styles.length) view.loadCSS(styles)
  if (scripts.length) view.loadJS(scripts, { getMarkmap: () => view })

  const fm = (frontmatter as { markmap?: unknown } | undefined)?.markmap
  const options = (view.deriveOptions(fm as never) ?? {}) as Record<string, unknown>

  return { view, root, options }
}
