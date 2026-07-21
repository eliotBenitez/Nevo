import type { Node as PMNode } from 'prosemirror-model'
import type { NodeView } from 'prosemirror-view'
import type { SandboxedPluginSession } from './sandbox'
import { sanitizeSvg } from '../../utils/sanitizeSvg'

const RENDER_DEBOUNCE_MS = 120
const MAX_RENDER_SVG_BYTES = 512 * 1024

export interface SandboxRenderNodeViewOptions {
  pluginId: string
  nodeName: string
  handlerId: string
  session: SandboxedPluginSession
  onError: (error: unknown) => void
}

function isRenderResult(value: unknown): value is { svg: string } {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as { svg?: unknown }).svg === 'string'
}

/**
 * NodeView for a Tier 1 render-channel block: the Worker owns a pure
 * `attrs -> { svg }` handler and the host mounts the DOMPurify-sanitized result.
 * The plugin never touches the DOM directly — the SVG string crosses the sandbox
 * boundary as data and is sanitized here before it reaches the document. Rendering
 * is async and debounced; stale results are discarded via a generation token, and
 * any failure degrades to an empty error surface without tearing down the editor.
 */
export function createSandboxRenderNodeView(
  options: SandboxRenderNodeViewOptions,
): (node: PMNode) => NodeView {
  return (node) => {
    const dom = document.createElement('div')
    dom.className = `nv-plugin-block nv-plugin-block--${options.nodeName}`
    dom.dataset.nevoPluginNode = options.nodeName
    dom.dataset.nevoPlugin = options.pluginId
    const surface = document.createElement('div')
    surface.className = 'nv-plugin-block__render'
    dom.append(surface)

    let currentAttrsKey = ''
    let generation = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const renderError = () => {
      surface.replaceChildren()
      surface.dataset.nevoRenderError = 'true'
    }

    const mountSvg = (svg: string): void => {
      const sanitized = sanitizeSvg(svg)
      if (!sanitized) return renderError()
      const parsed = new DOMParser().parseFromString(sanitized, 'image/svg+xml')
      const root = parsed.documentElement
      if (root.localName !== 'svg' || parsed.querySelector('parsererror')) return renderError()
      delete surface.dataset.nevoRenderError
      surface.replaceChildren(document.importNode(root, true))
    }

    const render = (attrs: Record<string, unknown>): void => {
      const token = ++generation
      void options.session.invoke(options.handlerId, { attrs })
        .then((result) => {
          if (token !== generation) return
          const svg = isRenderResult(result) ? result.svg : ''
          if (!svg || new TextEncoder().encode(svg).byteLength > MAX_RENDER_SVG_BYTES) {
            renderError()
            return
          }
          mountSvg(svg)
        })
        .catch((error) => {
          if (token !== generation) return
          renderError()
          options.onError(error)
        })
    }

    const scheduleRender = (attrs: Record<string, unknown>, immediate: boolean): void => {
      const key = JSON.stringify(attrs)
      if (key === currentAttrsKey) return
      currentAttrsKey = key
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (immediate) {
        render(attrs)
        return
      }
      timer = setTimeout(() => {
        timer = null
        render(attrs)
      }, RENDER_DEBOUNCE_MS)
    }

    scheduleRender(node.attrs, true)

    return {
      dom,
      update(nextNode) {
        if (nextNode.type.name !== options.nodeName) return false
        scheduleRender(nextNode.attrs, false)
        return true
      },
      ignoreMutation() {
        return true
      },
      destroy() {
        if (timer !== null) clearTimeout(timer)
        generation += 1
      },
    }
  }
}
