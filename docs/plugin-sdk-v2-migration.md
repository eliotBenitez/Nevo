# Migration from trusted SDK V1 to SDK V2

V2 is not source-compatible with V1. The migration changes the execution model:

| V1 | V2 |
| --- | --- |
| Code in the main WebView | Isolated Worker |
| `onRegister(ctx)` | `definePlugin({ setup(api) })` |
| ProseMirror objects | JSON snapshot + transaction intent |
| DOM callbacks/NodeView | Host UI, sanitized SVG or iframe |
| Direct/in-process services | Capability-gated brokers |
| Split capability arrays | Single `capabilities` |

Trusted V1 remains for bundled/system, folder and already installed legacy
plugins. New marketplace publications must be V2.

## Before you start

Build an inventory:

- registrations and their IDs;
- schema node/mark names;
- attrs and content expressions;
- serialized/export formats;
- storage keys and their JSON shape;
- filesystem/network/Tauri calls;
- custom DOM/NodeView behavior;
- workspace routes and modals;
- the current persisted data version.

Schema names, attrs, contribution IDs and storage keys are a persisted/public
contract. Do not rename them just for cleanup.

## 1. Update the manifest

V1:

```json
{
  "apiVersion": "1.0.0",
  "executionMode": "trusted-webview",
  "editorCapabilities": ["editor.read", "editor.write"],
  "uiCapabilities": ["ui.contributions"],
  "workspaceCapabilities": ["storage.workspace"]
}
```

V2:

```json
{
  "apiVersion": "2.0.0",
  "executionMode": "sandboxed-worker",
  "dataVersion": 1,
  "capabilities": [
    "editor.read",
    "editor.write",
    "ui.contributions",
    "storage.workspace"
  ]
}
```

Add `network` only if you actually call `api.network.fetch`.

`dataVersion` describes persisted data, not the runtime. If the storage/schema
data has not changed, the V1 → V2 transition alone does not require increasing
`dataVersion`.

## 2. Move registrations

V1:

```ts
export default {
  onRegister(ctx) {
    ctx.registerSlashItem({
      id: 'acme.callout.insert',
      title: 'Callout',
      run({ state, dispatch }) {
        const node = state.schema.nodes.callout_block.create({
          variant: 'info',
          icon: '💡',
        })
        dispatch(state.tr.replaceSelectionWith(node).scrollIntoView())
      },
    })
  },
}
```

V2:

```ts
import { definePlugin, transaction } from '@nevo/plugin-sdk'

export default definePlugin({
  setup(api) {
    api.slashItem({
      id: `${api.pluginId}.insert`,
      title: 'Callout',
      category: 'layout',
      keywords: ['callout', 'note', 'warning'],
    }, (_input, { editor }) => transaction(editor?.revision ?? 0, [{
      type: 'insertNode',
      nodeType: 'callout_block',
      attrs: {
        variant: 'info',
        icon: '💡',
      },
      at: 'selection.from',
    }], {
      scrollIntoView: true,
    }))
  },
})
```

Do not carry `state`, `dispatch` or `view` over in a closure. They do not exist
in the Worker.

## 3. Move the schema and UI

Keep the name and attrs:

```ts
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
    class: 'acme-callout',
    'data-variant': 'attrs.variant',
  }, [
    ui.element('span', { class: 'acme-callout__icon' }, [
      ui.attr('icon'),
    ]),
    ui.element('div', { class: 'acme-callout__content' }, [
      ui.contentSlot(),
    ]),
  ]),
})
```

Replace:

- `toDOM`/`parseDOM` callbacks → declarative `ui`;
- computed static view → `render: "svg"`;
- interactive NodeView → Tier 2 `frame`;
- direct popover DOM → `api.register('popover', descriptor)`.

V2 does not accept raw HTML, DOM callbacks, external CSS resources or global
selectors.

## 4. Move services

| V1 behavior | V2 replacement |
| --- | --- |
| localStorage/IndexedDB | `api.storage.local` |
| workspace JSON file | `api.storage.workspace` |
| settings access | `api.settings` |
| credential read | `api.secrets.get` |
| binary file | `api.assets` |
| `fetch` | `api.network.fetch` + manifest policy |
| `setTimeout`/`setInterval` | `api.scheduling` |
| Tauri invoke | allow-listed `api.workspace.invoke` |

If there is no replacement, the functionality must not be ported through a
workaround. Record the SDK gap separately.

## 5. Add serializers/importers

A custom node must be exportable without the plugin runtime:

```ts
api.serializer({
  id: `${api.pluginId}.markdown`,
  nodeType: 'callout_block',
  format: 'markdown',
}, (input) => {
  const value = input as JsonObject
  const node = value.node as JsonObject
  const attrs = (node.attrs ?? {}) as JsonObject
  const children = String(value.children ?? '')
  const icon = String(attrs.icon ?? '')
  return `> ${icon} ${children}`.trimEnd()
})
```

Add a Markdown/HTML/Typst/DOCX serializer for every custom node if the product
workflow supports that format. An importer is needed for the reverse round-trip
of fenced syntax.

A DOCX serializer (requires host SDK >= 2.1.0) returns not `docx` objects but a
declarative JSON fragment; the handler receives only `{ node }`:

```ts
api.serializer({
  id: `${api.pluginId}.docx`,
  nodeType: 'callout_block',
  format: 'docx',
}, (input) => {
  const node = (input as JsonObject).node as JsonObject
  const attrs = (node.attrs ?? {}) as JsonObject
  return {
    blocks: [
      { type: 'heading', level: 3, children: [{ type: 'text', text: String(attrs.icon ?? ''), bold: true }] },
      { type: 'children' },
    ],
  }
})
```

Blocks: `paragraph`, `heading` (level 1-6), `table` (`rows` → cells → inlines,
`header`), `image` (`svg` or `src` — a path to an asset inside the workspace)
and `children` (the host substitutes the child nodes). Inlines: `text` (`bold`,
`italic`, `underline`, `strike`, `code`, `color` as `#RRGGBB`, `link` with an
http/https/mailto scheme) and `break`. An invalid fragment is rejected as a
whole, and the node is exported as the text of its children.

## 6. Persisted data migrations

`migrations` is indexed by the target data version. For a 1 → 3 transition both
handlers are required: `2` and `3`.

```ts
export default definePlugin({
  setup(api) {
    registerContributions(api)
  },
  migrations: {
    2(input) {
      return {
        dataVersion: 2,
        storage: {
          ...input.storage,
          format: input.storage.format ?? 'long',
        },
        nodes: input.nodes.map(node => {
          if (node.type !== 'callout_block') return node
          const attrs = (node.attrs ?? {}) as JsonObject
          return {
            ...node,
            attrs: {
              ...attrs,
              tone: attrs.variant ?? 'info',
            },
          }
        }),
      }
    },
    3(input) {
      return {
        dataVersion: 3,
        storage: input.storage,
        nodes: input.nodes.map(normalizeCalloutIcon),
      }
    },
  },
})
```

Each handler receives:

```ts
{
  fromDataVersion: number
  storage: JsonObject
  nodes: JsonObject[]
}
```

And must return:

```ts
{
  dataVersion: targetVersion
  storage: JsonObject
  nodes: JsonObject[]
}
```

A skipped step, a wrong `dataVersion`, a non-JSON result or an invalid node
rejects the update.

## How Nevo applies a migration

A marketplace update has two phases:

1. downloads the package into staging;
2. checks the permission fingerprint;
3. loads the staged Worker and validates contributions;
4. saves the live Y.Doc and stops the old Worker;
5. reads plugin nodes from the real `.nevo/collab/<noteId>.yjs`;
6. calls the migrations sequentially;
7. checks the new nodes against the new schema on copies;
8. a journaled backup saves the plugin directory, storage, registry and Y.Doc;
9. only then is the new version published atomically.

`note.content` is not the source of truth for an existing local document: it
only seeds a new Y.Doc.

A crash, validation error, missing migration, fingerprint race or installed
version race restores the previous files/data.

## Callout compatibility example

For a runtime migration without a data migration, keep:

- node name `callout_block`;
- attrs `variant` and `icon`;
- content expression `block+`;
- nested rich content;
- serializers for all supported formats.

This lets the cached schema fallback open the document even when the plugin is
disabled/broken.

## Testing a migration

For each legacy version:

1. create a workspace fixture with the real old version;
2. add several plugin nodes, including nested content;
3. save the workspace so that the data ends up in the Y.Doc;
4. make a copy of the workspace;
5. update the plugin through a marketplace transaction;
6. check the storage and every node;
7. check editor undo/redo and export;
8. repeat with an artificial migration error and verify the rollback;
9. disable the plugin and check the cached fallback.

Unit test of a pure migration:

```ts
it('preserves rich children while renaming the attr', async () => {
  const result = await migrateToV2({
    fromDataVersion: 1,
    storage: {},
    nodes: [{
      type: 'callout_block',
      attrs: { variant: 'warning', icon: '⚠️' },
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Nested' }],
      }],
    }],
  })

  expect(result.nodes[0]).toMatchObject({
    type: 'callout_block',
    attrs: { tone: 'warning', icon: '⚠️' },
    content: expect.any(Array),
  })
})
```

## Migration checklist

- [ ] `apiVersion` and `executionMode` are switched to V2.
- [ ] Split capability arrays are replaced with a single minimal `capabilities`.
- [ ] `onRegister(ctx)` is replaced with `setup(api)`.
- [ ] ProseMirror mutations are expressed as transaction intents.
- [ ] Direct DOM is replaced with a suitable UI tier.
- [ ] Direct services are replaced with brokers.
- [ ] Contribution IDs keep their namespace and stability.
- [ ] Schema names/attrs/content are preserved or migrated.
- [ ] Serializers/importers cover custom nodes.
- [ ] Every `dataVersion` step exists and is tested.
- [ ] The legacy Y.Doc fixture passes update and rollback.
- [ ] Conformance, unit tests and the real Nevo host pass.
