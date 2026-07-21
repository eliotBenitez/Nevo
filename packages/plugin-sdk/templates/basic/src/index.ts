import { definePlugin, transaction } from '@nevo/plugin-sdk'

export default definePlugin({
  setup(api) {
    api.slashItem({
      id: `${api.pluginId}.hello`,
      title: 'Insert hello',
      category: 'text',
      keywords: ['hello'],
    }, (_input, { editor }) => transaction(editor?.revision ?? 0, [
      { type: 'insertText', text: 'Hello from Nevo', from: 'selection.from', to: 'selection.to' },
    ]))
  },
})
