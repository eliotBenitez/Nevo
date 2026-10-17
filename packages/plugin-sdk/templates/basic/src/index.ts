import { definePlugin, transaction } from '@nevo/plugin-sdk'

export default definePlugin({
  setup(api) {
    api.slashItem({
      id: `${api.pluginId}.insert-hello`,
      title: 'Insert hello',
      category: 'text',
      keywords: ['hello'],
    }, (_input, { editor }) => {
      if (!editor) throw new Error('Editor snapshot is required')

      return transaction(editor.revision, [{
        type: 'insertText',
        text: 'Hello from Nevo',
        from: 'selection.from',
        to: 'selection.to',
      }], {
        scrollIntoView: true,
      })
    })
  },
})
