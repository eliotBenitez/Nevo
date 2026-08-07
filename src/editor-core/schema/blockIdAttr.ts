import type { DOMOutputSpec, NodeSpec, TagParseRule } from 'prosemirror-model'

/**
 * Shared plumbing for the lazily-assigned stable block id (`attrs.id`) that
 * referenceable block nodes carry. Ids are assigned on demand — see
 * `plugins/blockIds.ts` (duplicate re-keying) and `commands/blockId.ts`
 * (`ensureBlockId`) — so most blocks keep `id: null` forever and this module
 * only defines the read/write DOM round-trip, never a generator.
 */

/** Reads the block id from a `data-block-id` DOM attribute. Returns `null`
 *  (not `''`) when absent so it matches the node attr's `default: null`. */
export function readBlockIdAttr(dom: HTMLElement): string | null {
  return dom.getAttribute('data-block-id') || null
}

/** Adds `data-block-id` to a toDOM attrs object, but only when the block
 *  actually has an id — keeps the DOM (and serialized HTML/export paths)
 *  unchanged for the common case of an unreferenced block. */
export function withBlockIdAttr(attrs: Record<string, string>, id: unknown): Record<string, string> {
  if (typeof id === 'string' && id) return { ...attrs, 'data-block-id': id }
  return attrs
}

function extendParseRuleWithBlockId(rule: TagParseRule): TagParseRule {
  const getAttrs = rule.getAttrs
  return {
    ...rule,
    getAttrs(dom) {
      const parsed = getAttrs?.(dom)
      if (parsed === false) return false
      const attrs = parsed && typeof parsed === 'object' ? parsed : {}
      return {
        ...attrs,
        id: readBlockIdAttr(dom),
      }
    },
  }
}

function extendDomOutputWithBlockId(output: DOMOutputSpec, id: unknown): DOMOutputSpec {
  if (!Array.isArray(output)) return output
  const [tag, maybeAttrs, ...children] = output as unknown[]
  const isAttrs = maybeAttrs
    && typeof maybeAttrs === 'object'
    && !Array.isArray(maybeAttrs)
    && (Object.getPrototypeOf(maybeAttrs) === Object.prototype || Object.getPrototypeOf(maybeAttrs) === null)
  if (isAttrs) {
    return [tag, withBlockIdAttr(maybeAttrs as Record<string, string>, id), ...children] as unknown as DOMOutputSpec
  }
  return [tag, withBlockIdAttr({}, id), maybeAttrs, ...children].filter(value => value !== undefined) as unknown as DOMOutputSpec
}

/**
 * Adds the shared lazy `id` contract to a block NodeSpec while preserving its
 * existing attributes and DOM parser/serializer. Specs that already implement
 * the contract explicitly are returned unchanged.
 */
export function withStableBlockIdSpec(spec: NodeSpec): NodeSpec {
  if (spec.attrs && 'id' in spec.attrs) return spec
  const toDOM = spec.toDOM
  return {
    ...spec,
    attrs: { ...spec.attrs, id: { default: null } },
    parseDOM: spec.parseDOM?.map(extendParseRuleWithBlockId),
    toDOM: toDOM
      ? node => extendDomOutputWithBlockId(toDOM(node), node.attrs.id)
      : undefined,
  }
}
