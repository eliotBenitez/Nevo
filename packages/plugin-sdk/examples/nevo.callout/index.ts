import { definePlugin, transaction, ui, type JsonObject } from '../../src/index'

const variants = ['info', 'note', 'warning', 'danger', 'success']

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default definePlugin({
  setup(api) {
    api.blockType({
      id: `${api.pluginId}.block`,
      name: 'callout_block',
      schema: {
        group: 'block',
        content: 'block+',
        defining: true,
        attrs: {
          variant: { default: 'info' },
          icon: { default: '💡' },
        },
      },
      ui: ui.element('aside', {
        class: 'nv-sdk-callout',
        'data-variant': 'attrs.variant',
      }, [
        ui.element('span', { class: 'nv-sdk-callout__icon' }, [
          ui.attr('icon'),
        ]),
        ui.element('div', { class: 'nv-sdk-callout__content' }, [
          ui.contentSlot(),
        ]),
      ]),
      css: `
        .nv-sdk-callout {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.75rem;
          padding: 0.875rem 1rem;
          border: 1px solid currentColor;
          border-radius: 0.75rem;
        }
      `,
    })

    api.register('popover', {
      id: `${api.pluginId}.variant`,
      nodeType: 'callout_block',
      title: 'Callout style',
      fields: [{
        key: 'variant',
        type: 'select',
        options: variants.map(value => ({ value, label: value })),
      }, {
        key: 'icon',
        type: 'text',
      }],
    })

    api.slashItem({
      id: `${api.pluginId}.insert`,
      title: 'Callout',
      category: 'layout',
      keywords: ['callout', 'note', 'warning', 'info'],
    }, (_input, { editor }) => transaction(editor?.revision ?? 0, [{
      type: 'insertNode',
      nodeType: 'callout_block',
      attrs: { variant: 'info', icon: '💡' },
      at: 'selection.from',
    }], { scrollIntoView: true }))

    for (const format of ['markdown', 'html', 'typst'] as const) {
      api.serializer({
        id: `${api.pluginId}.serialize-${format}`,
        nodeType: 'callout_block',
        format,
      }, (input) => {
        const value = input as JsonObject
        const node = value.node as JsonObject
        const attrs = (node.attrs ?? {}) as JsonObject
        const children = String(value.children ?? '')
        const icon = String(attrs.icon ?? '')
        const variant = String(attrs.variant ?? 'info')
        if (format === 'markdown') {
          const prefix = [icon, `**${variant}**`].filter(Boolean).join(' ')
          return `${prefix}: ${children}`.split('\n').map(line => `> ${line}`).join('\n')
        }
        if (format === 'html') {
          return `<aside class="callout" data-variant="${escapeHtml(variant)}">${icon ? `<span class="callout-icon">${escapeHtml(icon)}</span>` : ''}<div class="callout-body">${children}</div></aside>`
        }
        return `#block(fill: luma(244), inset: 10pt, radius: 6pt, width: 100%)[${icon} ${children}]`
      })
    }
  },
})
