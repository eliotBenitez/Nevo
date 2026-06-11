let vegaEmbedModulePromise: Promise<typeof import('vega-embed')['default']> | null = null

async function loadVegaEmbed(): Promise<typeof import('vega-embed')['default']> {
  if (!vegaEmbedModulePromise) {
    vegaEmbedModulePromise = import('vega-embed').then((mod) => mod.default)
  }
  return vegaEmbedModulePromise
}

function parseSpec(spec: string): unknown | null {
  const trimmed = spec.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (!Object.keys(parsed as Record<string, unknown>).length) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Render a Vega/Vega-Lite spec to a standalone SVG string for PDF export.
 * Returns `null` for empty/default/invalid specs or render failures so a broken
 * chart never aborts the whole document export.
 */
export async function renderVegaToSvg(spec: string): Promise<string | null> {
  const parsedSpec = parseSpec(spec)
  if (!parsedSpec || typeof document === 'undefined') return null

  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-99999px'
  container.style.top = '0'
  container.style.visibility = 'hidden'
  document.body.appendChild(container)

  let view: { finalize: () => void } | null = null
  try {
    const vegaEmbed = await loadVegaEmbed()
    const result = await vegaEmbed(container, parsedSpec as Parameters<typeof vegaEmbed>[1], {
      actions: false,
      renderer: 'svg',
      theme: undefined,
    })
    view = result.view

    const svg = container.querySelector('svg')
    return svg ? new XMLSerializer().serializeToString(svg) : null
  } catch {
    return null
  } finally {
    try {
      view?.finalize()
    } finally {
      container.remove()
    }
  }
}
