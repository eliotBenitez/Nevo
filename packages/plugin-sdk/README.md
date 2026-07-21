# @nevo/plugin-sdk

SDK V2 for sandboxed Nevo plugins. Plugins export `definePlugin({ setup })`;
the setup function registers JSON descriptors and Worker-local handlers. The
host validates every descriptor, invocation snapshot and transaction intent.

```ts
import { definePlugin, transaction } from '@nevo/plugin-sdk'

export default definePlugin({
  setup(api) {
    api.command({ id: `${api.pluginId}.today`, title: 'Today' }, (_input, { editor }) =>
      transaction(editor?.revision ?? 0, [{
        type: 'insertText',
        text: new Intl.DateTimeFormat(editor?.locale, {
          timeZone: editor?.timeZone,
          dateStyle: 'long',
        }).format(new Date(editor?.now ?? Date.now())),
        from: 'selection.from',
        to: 'selection.to',
      }]))
  },
})
```
