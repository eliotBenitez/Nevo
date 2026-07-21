import type { DOMOutputSpec, MarkSpec, NodeSpec } from 'prosemirror-model'

const ALLOWED_ELEMENTS = new Set([
  'article',
  'aside',
  'button',
  'code',
  'div',
  'em',
  'header',
  'label',
  'li',
  'ol',
  'p',
  'pre',
  'section',
  'small',
  'span',
  'strong',
  'ul',
])

const ALLOWED_ATTRIBUTES = new Set([
  'aria-label',
  'aria-live',
  'aria-pressed',
  'class',
  'data-action',
  'data-bind',
  'role',
  'tabindex',
  'title',
])

const SAFE_CONTENT_PATTERN = /^(?:inline|block|text|[A-Za-z][A-Za-z0-9_]*)(?:[+*?])?(?:\s+(?:inline|block|text|[A-Za-z][A-Za-z0-9_]*)(?:[+*?])?|\s*\|\s*(?:inline|block|text|[A-Za-z][A-Za-z0-9_]*)(?:[+*?])?)*$/
const SAFE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,79}$/
const SAFE_CLASS_PATTERN = /^[A-Za-z0-9 _-]{0,240}$/

export interface HostUiText {
  type: 'text'
  value?: string
  bind?: string
}

export interface HostUiContentSlot {
  type: 'contentSlot'
}

export interface HostUiElement {
  type: 'element'
  tag: string
  props?: Record<string, unknown>
  children?: HostUiNode[]
}

export type HostUiNode = HostUiText | HostUiContentSlot | HostUiElement

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertSafeBinding(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^attrs\.[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value)) {
    throw new Error(`${field} must bind to attrs.<name>`)
  }
  return value
}

export function sanitizeHostUi(value: unknown, field = 'ui', depth = 0): HostUiNode {
  if (depth > 16 || !isObject(value)) throw new Error(`${field} is not a valid host UI node`)
  if (value.type === 'text') {
    const text: HostUiText = { type: 'text' }
    if (value.value !== undefined) {
      if (typeof value.value !== 'string' || value.value.length > 10_000) {
        throw new Error(`${field}.value is invalid`)
      }
      text.value = value.value
    }
    if (value.bind !== undefined) text.bind = assertSafeBinding(value.bind, `${field}.bind`)
    if (text.value === undefined && text.bind === undefined) text.value = ''
    return text
  }
  if (value.type === 'contentSlot') return { type: 'contentSlot' }
  if (value.type !== 'element' || typeof value.tag !== 'string' || !ALLOWED_ELEMENTS.has(value.tag)) {
    throw new Error(`${field}.tag is not allowed`)
  }
  const props: Record<string, unknown> = {}
  if (value.props !== undefined) {
    if (!isObject(value.props)) throw new Error(`${field}.props must be an object`)
    for (const [name, raw] of Object.entries(value.props)) {
      if (!ALLOWED_ATTRIBUTES.has(name) && !name.startsWith('aria-') && !name.startsWith('data-')) {
        throw new Error(`${field}.props.${name} is not allowed`)
      }
      if (name.toLowerCase().startsWith('on') || name === 'style' || name === 'src' || name === 'href') {
        throw new Error(`${field}.props.${name} is not allowed`)
      }
      if (name === 'data-bind') {
        props[name] = assertSafeBinding(raw, `${field}.props.${name}`)
      } else if (name.startsWith('data-') && typeof raw === 'string' && raw.startsWith('attrs.')) {
        props[name] = assertSafeBinding(raw, `${field}.props.${name}`)
      } else if (typeof raw === 'string' || typeof raw === 'boolean' || typeof raw === 'number') {
        if (name === 'class' && (typeof raw !== 'string' || !SAFE_CLASS_PATTERN.test(raw))) {
          throw new Error(`${field}.props.class is invalid`)
        }
        props[name] = raw
      } else {
        throw new Error(`${field}.props.${name} must be scalar`)
      }
    }
  }
  const children = value.children === undefined
    ? []
    : Array.isArray(value.children)
      ? value.children.map((child, index) => sanitizeHostUi(child, `${field}.children[${index}]`, depth + 1))
      : (() => { throw new Error(`${field}.children must be an array`) })()
  return { type: 'element', tag: value.tag, props, children }
}

function bindingValue(binding: string, attrs: Record<string, unknown>): string {
  const key = binding.slice('attrs.'.length)
  const value = attrs[key]
  return value === undefined || value === null ? '' : String(value)
}

export function hostUiToDomSpec(node: HostUiNode, attrs: Record<string, unknown>): DOMOutputSpec | 0 {
  if (node.type === 'contentSlot') return 0
  if (node.type === 'text') return node.bind ? bindingValue(node.bind, attrs) : (node.value ?? '')
  const domAttrs: Record<string, string> = {}
  for (const [name, raw] of Object.entries(node.props ?? {})) {
    if (name === 'data-bind' && typeof raw === 'string') continue
    domAttrs[name] = typeof raw === 'string' && raw.startsWith('attrs.')
      ? bindingValue(raw, attrs)
      : String(raw)
  }
  return [
    node.tag,
    domAttrs,
    ...(node.children ?? []).map(child => hostUiToDomSpec(child, attrs)),
  ]
}

function sanitizedAttrs(value: unknown): Record<string, { default?: unknown }> {
  if (value === undefined) return {}
  if (!isObject(value)) throw new Error('schema attrs must be an object')
  const result: Record<string, { default?: unknown }> = {}
  for (const [name, descriptor] of Object.entries(value)) {
    if (!SAFE_NAME_PATTERN.test(name) || !isObject(descriptor)) {
      throw new Error(`Invalid schema attr ${name}`)
    }
    const encoded = JSON.stringify(descriptor.default)
    if (encoded !== undefined && encoded.length > 16_384) throw new Error(`Schema attr ${name} is too large`)
    result[name] = descriptor.default === undefined ? {} : { default: descriptor.default }
  }
  return result
}

function booleanField(descriptor: Record<string, unknown>, name: string): boolean | undefined {
  const value = descriptor[name]
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`schema ${name} must be boolean`)
  return value
}

export function schemaNodeFromDescriptor(descriptor: Record<string, unknown>): { name: string; spec: NodeSpec } {
  const name = descriptor.name
  if (typeof name !== 'string' || !SAFE_NAME_PATTERN.test(name)) throw new Error('Invalid schema node name')
  const content = descriptor.content
  if (content !== undefined && (typeof content !== 'string' || !SAFE_CONTENT_PATTERN.test(content))) {
    throw new Error(`Invalid content expression for ${name}`)
  }
  const group = descriptor.group
  if (group !== undefined && (typeof group !== 'string' || !/^[A-Za-z][A-Za-z0-9_ ]{0,79}$/.test(group))) {
    throw new Error(`Invalid group for ${name}`)
  }
  const ui = descriptor.ui === undefined ? null : sanitizeHostUi(descriptor.ui, `${name}.ui`)
  const pluginId = typeof descriptor.pluginId === 'string' ? descriptor.pluginId : ''
  let contentSlots = 0
  const countSlots = (node: HostUiNode) => {
    if (node.type === 'contentSlot') contentSlots += 1
    if (node.type === 'element') node.children?.forEach(countSlots)
  }
  if (ui) countSlots(ui)
  if (contentSlots > 1) throw new Error(`${name}.ui may contain only one contentSlot`)
  if (content && ui && contentSlots !== 1) throw new Error(`${name}.ui must contain one contentSlot`)

  const spec: NodeSpec = {
    attrs: sanitizedAttrs(descriptor.attrs),
    ...(typeof content === 'string' ? { content } : {}),
    ...(typeof group === 'string' ? { group } : {}),
    inline: booleanField(descriptor, 'inline'),
    atom: booleanField(descriptor, 'atom'),
    selectable: booleanField(descriptor, 'selectable'),
    draggable: booleanField(descriptor, 'draggable'),
    defining: booleanField(descriptor, 'defining'),
    isolating: booleanField(descriptor, 'isolating'),
    parseDOM: [{ tag: `div[data-nevo-plugin-node="${name}"]` }],
    toDOM(node) {
      if (ui) {
        const rendered = hostUiToDomSpec(ui, node.attrs)
        if (Array.isArray(rendered)) {
          const renderedAttrs = rendered[1]
          if (renderedAttrs && typeof renderedAttrs === 'object' && !Array.isArray(renderedAttrs)) {
            renderedAttrs['data-nevo-plugin-node'] = name
            if (pluginId) renderedAttrs['data-nevo-plugin'] = pluginId
          }
        }
        return rendered as DOMOutputSpec
      }
      return ['div', {
        'data-nevo-plugin-node': name,
        ...(pluginId ? { 'data-nevo-plugin': pluginId } : {}),
      }, ...(content ? [0] : [])]
    },
  }
  return { name, spec }
}

export function schemaMarkFromDescriptor(descriptor: Record<string, unknown>): { name: string; spec: MarkSpec } {
  const name = descriptor.name
  if (typeof name !== 'string' || !SAFE_NAME_PATTERN.test(name)) throw new Error('Invalid schema mark name')
  const tag = descriptor.tag ?? 'span'
  if (typeof tag !== 'string' || !ALLOWED_ELEMENTS.has(tag)) throw new Error(`Invalid mark tag for ${name}`)
  return {
    name,
    spec: {
      attrs: sanitizedAttrs(descriptor.attrs),
      inclusive: booleanField(descriptor, 'inclusive'),
      excludes: typeof descriptor.excludes === 'string' ? descriptor.excludes : undefined,
      parseDOM: [{ tag: `${tag}[data-nevo-plugin-mark="${name}"]` }],
      toDOM: () => [tag, { 'data-nevo-plugin-mark': name }, 0],
    },
  }
}

export function sanitizeScopedCss(pluginId: string, css: string): string {
  if (css.length > 64 * 1024) throw new Error('Plugin CSS exceeds 64 KiB')
  if (/@import|@font-face|url\s*\(|:global|html\b|body\b|:root/i.test(css)) {
    throw new Error('Plugin CSS contains a forbidden global or external construct')
  }
  const scope = `[data-nevo-plugin="${pluginId}"]`
  return css.replace(/(^|})\s*([^@}{][^{}]*)\{/g, (_match, boundary: string, selectors: string) => {
    const scoped = selectors
      .split(',')
      .map(selector => `${scope} ${selector.trim()}`)
      .join(', ')
    return `${boundary}\n${scoped} {`
  })
}
