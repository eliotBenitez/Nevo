# Contributions and lifecycle

A contribution is a JSON descriptor that Nevo turns into host-owned behavior.
Functions never leave the Worker: the SDK stores them under opaque handler IDs,
and the host calls the handler after a user action.

## Plugin definition

```ts
import { definePlugin } from '@nevo/plugin-sdk'

export default definePlugin({
  setup(api) {
    // Register contributions and host-managed work.
  },
  async activate() {
    // The plugin is registered and may begin active work.
  },
  async deactivate() {
    // The workspace is stopping or disabling active plugins.
  },
  async dispose() {
    // The Worker session is about to be destroyed.
  },
  migrations: {
    // Target data version -> migration handler.
  },
})
```

Normal load order:

1. Nevo validates the manifest and creates a plugin-scoped code session.
2. The Worker imports the entry module.
3. `setup(api)` registers contributions.
4. The host validates all descriptors and saves the schema fallback.
5. `activate()` is called after all enabled plugins are registered.
6. When the workspace stops, `deactivate()` is called.
7. Before the Worker is destroyed, `dispose()` is called.

`setup`, lifecycle hooks and migrations have a 10-second limit. A regular
handler has 5 seconds. Host-managed schedules are cleared on deactivate/dispose
regardless of plugin code.

`setup` may return an array of raw contributions, but the typed methods on `api`
are preferable: they create handler IDs and reduce the risk of a wrong shape.

## General descriptor requirements

Every descriptor:

- contains a string `id`;
- uses the namespace `${api.pluginId}.…`;
- has an ID that is unique among this plugin's contributions;
- consists only of JSON values;
- contains no more than 300 keys per object, 2,000 items per array and 24
  levels of nesting;
- uses an ID no longer than 160 characters;
- limits `title`, when present, to 200 characters.

On a capability mismatch the entire sandbox definition is rejected. The host
does not "skip" just one incorrect registration.

## Quick reference

| API | Capability | Main descriptor fields | Handler |
| --- | --- | --- | --- |
| `api.command()` | `editor.write` | `id`, `title?` | Required |
| `api.keymap()` | `editor.write` | `id`, `key`, `priority?` | Required |
| `api.slashItem()` | `editor.write` | `id`, `title?`, `category?`, `keywords?` | Required |
| `api.toolbarAction()` | `editor.write` | `id`, `title?`, `order?` | Required |
| `api.schemaNode()` | `editor.schema` | `id`, `name`, schema fields | None |
| `api.schemaMark()` | `editor.schema` | `id`, `name`, mark fields | None |
| `api.blockType()` | `editor.schema` | `id`, `name`, `schema` | Optional by render mode |
| `api.register('popover')` | `ui.contributions` | `id`, `nodeType`, `fields` | None |
| `api.register('decoration')` | `editor.read` | `id`, `mode`, style fields | None |
| `api.serializer()` | `editor.read` | `id`, `nodeType`, `format` | Required |
| `api.importer()` | `editor.write` | `id`, `fencedLang` | Required |
| `api.workspaceView()` | `ui.iframe` | `id`, `source`, route fields | Optional |
| `api.sidebarItem()` | `ui.contributions` | `id`, route fields | Optional |
| `api.modal()` | `ui.iframe` | `id`, `source` | Optional |
| `api.onEditorEvent()` | `runtime.events` | `id`, `event` | Required |

## Commands, keymaps and actions

All of these handlers receive an editor snapshot and usually return a
transaction intent.

### Command

```ts
api.command({
  id: `${api.pluginId}.insert-divider`,
  title: 'Insert divider',
}, (_input, { editor }) => transaction(editor?.revision ?? 0, [{
  type: 'insertNode',
  nodeType: 'horizontal_rule',
  at: 'selection.from',
}]))
```

A command goes into the internal command registry. The public SDK does not yet
provide a separate API for running another plugin's command.

### Keymap

```ts
api.keymap({
  id: `${api.pluginId}.insert-divider-keymap`,
  key: 'Mod-Alt--',
  priority: 20,
}, (_input, { editor }) => transaction(editor?.revision ?? 0, [{
  type: 'insertNode',
  nodeType: 'horizontal_rule',
  at: 'selection.from',
}]))
```

The key syntax matches ProseMirror key names. A higher `priority` is handled
first; with equal priority the order is stabilized by plugin ID.

### Slash item

```ts
api.slashItem({
  id: `${api.pluginId}.slash-divider`,
  title: 'Divider',
  category: 'layout',
  keywords: ['divider', 'separator', 'line'],
}, handler)
```

### Toolbar action

```ts
api.toolbarAction({
  id: `${api.pluginId}.toolbar-divider`,
  title: 'Divider',
  order: 30,
}, handler)
```

## Schema nodes and marks

`toDOM`, `parseDOM` and any callbacks are forbidden in a schema contribution.
The allowed spec is deliberately narrower than ProseMirror's `NodeSpec`.

```ts
api.schemaNode({
  id: `${api.pluginId}.badge-node`,
  name: 'acme_badge',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: {
    label: { default: 'Badge' },
    tone: { default: 'neutral' },
  },
  ui: ui.element('span', {
    class: 'acme-badge',
    'data-tone': 'attrs.tone',
  }, [
    ui.attr('label'),
  ]),
})
```

The node descriptor supports:

- `name`, `content`, `group`, `attrs`;
- `inline`, `atom`, `selectable`, `draggable`, `defining`, `isolating`;
- `ui` for a safe DOM tree.

`name` and attr names must match `^[A-Za-z][A-Za-z0-9_]{0,79}$`. A content
expression supports simple node/group names, `+`, `*`, `?`, spaces and `|`;
complex ProseMirror grammar is not accepted.

```ts
api.schemaMark({
  id: `${api.pluginId}.highlight-mark`,
  name: 'acme_highlight',
  tag: 'span',
  inclusive: true,
  excludes: '',
  attrs: {
    tone: { default: 'yellow' },
  },
})
```

The mark descriptor supports `name`, `tag`, `attrs`, `inclusive`, `excludes`.
`tag` must be in the host UI elements allow-list.

In practice `api.blockType()` is needed more often, because it combines schema,
presentation and an optional render handler. All three UI tiers are described in
detail in [UI and custom blocks](./ui.md).

## Popover

A popover edits the attrs of the selected plugin node with host-owned controls:

```ts
api.register('popover', {
  id: `${api.pluginId}.badge-popover`,
  nodeType: 'acme_badge',
  title: 'Badge settings',
  removable: true,
  fields: [{
    key: 'label',
    type: 'text',
    label: 'Label',
    placeholder: 'Badge',
  }, {
    key: 'tone',
    type: 'select',
    label: 'Tone',
    options: [
      { value: 'neutral', label: 'Neutral' },
      { value: 'positive', label: 'Positive' },
    ],
  }],
})
```

A field supports `key`, `type`, `label`, `placeholder`, `rows`, `min`, `max`,
`step`, `options`. Use the types already supported by the Nevo UI: `text`,
`textarea`, `select`, `number`, `checkbox` and compatible plugin popover
controls.

## Decorations

A decoration declaratively adds a CSS class to the selection or to all matching
nodes:

```ts
api.register('decoration', {
  id: `${api.pluginId}.warning-decoration`,
  mode: 'node',
  nodeType: 'acme_badge',
  attrs: { tone: 'warning' },
  className: 'acme-badge-warning',
})
```

For `mode: "selection"`, `nodeType` and `attrs` are not needed:

```ts
api.register('decoration', {
  id: `${api.pluginId}.selection-decoration`,
  mode: 'selection',
  className: 'acme-selection',
})
```

`className` must match `^[A-Za-z][A-Za-z0-9_-]{0,79}$`. A decoration descriptor
does not accept an arbitrary document-traversal function.

## Serializers

A serializer is called for a specific node type:

```ts
api.serializer({
  id: `${api.pluginId}.badge-markdown`,
  nodeType: 'acme_badge',
  format: 'markdown',
}, (input) => {
  const value = input as JsonObject
  const node = value.node as JsonObject
  const attrs = (node.attrs ?? {}) as JsonObject
  return `[${String(attrs.label ?? 'Badge')}]`
})
```

Supported formats: `markdown`, `html`, `typst`. Input:

```ts
{
  node: JsonObject
  children: string
}
```

`children` is already serialized by the current exporter and is needed for
content nodes. The handler must return a string no longer than 1 MiB. HTML goes
through an additional check: `script`, `iframe`, `object`, `embed`, event
attributes, `javascript:` and `data:text/html` are rejected.

## Importers

An importer converts a fenced Markdown block into ProseMirror JSON:

```ts
api.importer({
  id: `${api.pluginId}.badge-importer`,
  fencedLang: 'acme-badge',
}, (input) => {
  const { code } = input as { code: string }
  return {
    type: 'acme_badge',
    attrs: { label: code.trim(), tone: 'neutral' },
  }
})
```

The handler receives `{ code: string }` and returns node JSON or `null`. The
node type, attrs and content are validated against the current editor schema.

## Workspace UI contributions

Workspace views and modals load plugin-relative HTML in an iframe:

```ts
api.workspaceView({
  id: `${api.pluginId}.dashboard`,
  title: 'Dashboard',
  route: `/workspace/plugin/${api.pluginId}/dashboard`,
  source: 'views/dashboard.html',
  icon: 'chart',
  order: 40,
})

api.sidebarItem({
  id: `${api.pluginId}.dashboard-link`,
  title: 'Dashboard',
  route: `/workspace/plugin/${api.pluginId}/dashboard`,
  icon: 'chart',
  order: 40,
})

api.modal({
  id: `${api.pluginId}.details`,
  source: 'views/details.html',
})
```

`source` cannot be an absolute URL, `data:`, `javascript:`, or contain `..` or a
backslash. The route is limited to the `/workspace/plugin/<pluginId>` namespace
and cannot contain a query/hash.

An optional handler receives UI events in the form:

```ts
{
  contributionId: string
  event: {
    type: string
    payload: JsonValue
  }
}
```

The iframe bridge and its limits are described in the [UI guide](./ui.md).

## Editor events

Currently the sandbox host publishes a single event, `transactionApplied`:

```ts
api.onEditorEvent({
  id: `${api.pluginId}.track-transactions`,
  event: 'transactionApplied',
}, (input, { editor, signal }) => {
  if (signal.aborted) return null
  const { docChanged } = input as { docChanged: boolean }
  if (!docChanged || !editor) return null

  return { revision: editor.revision }
})
```

Events are debounced and are not meant for synchronously intercepting a
transaction. `editor.doc` is present only with `editor.read`. The result of an
event handler is not applied as an editor transaction.

## Errors and cancellation

A handler receives an `AbortSignal`:

```ts
api.command(descriptor, async (_input, { editor, signal }) => {
  const result = await doWork({ signal })
  if (signal.aborted) return null
  return transaction(editor?.revision ?? 0, result.operations)
})
```

A timeout sends the Worker a cancel request and aborts the signal. Your async
helpers must react to `signal` themselves; a broker call that has already
started may complete, but its result should not be used after cancellation.

A fatal Worker error causes one automatic restart and a retry of the
invocation. A repeated crash puts the plugin into session quarantine. Therefore
a handler must be idempotent until the moment it returns its result: do not
combine a non-repeatable external side effect with an editor transaction without
your own idempotency key.
