# Working with the editor

SDK V2 does not hand the plugin an `EditorView`, `EditorState` or a ProseMirror
`Transaction`. A handler receives an immutable JSON snapshot and returns an
intent, which the host validates and applies atomically.

## Editor snapshot

```ts
interface PluginEditorSnapshot {
  revision: number
  selection: {
    from: number
    to: number
    empty: boolean
    anchor: number
    head: number
  }
  schema: {
    nodes: string[]
    marks: string[]
  }
  doc?: JsonObject
  now: string
  locale: string
  timeZone: string
}
```

- `revision` increases after every applied transaction;
- selection positions refer to the document of this revision;
- `schema` lets you check whether a node/mark type exists;
- `doc` is included only with the `editor.read` capability;
- `now`, `locale` and `timeZone` are set by the host for reproducible
  formatting.

Do not use `Date.now()`, the browser locale or the system timezone when the
result must match the Nevo settings. Use the snapshot fields:

```ts
function formatHostDate(editor: PluginEditorSnapshot): string {
  return new Intl.DateTimeFormat(editor.locale, {
    dateStyle: 'long',
    timeZone: editor.timeZone,
  }).format(new Date(editor.now))
}
```

## Transaction intent

```ts
import { transaction } from '@nevo/plugin-sdk'

return transaction(editor.revision, [
  {
    type: 'insertText',
    text: 'Hello',
    from: 'selection.from',
    to: 'selection.to',
  },
  {
    type: 'setSelection',
    from: 'selection.to',
  },
], {
  scrollIntoView: true,
})
```

A single intent contains up to 100 operations. The host validates operation
types, positions, schema names and payload, then builds one ProseMirror
transaction. If any operation is invalid, the whole intent is not applied.

## Positions and stale state

Transaction position:

```ts
type TransactionPosition =
  | number
  | 'selection.from'
  | 'selection.to'
```

Symbolic positions are resolved against the current selection at the moment of
application. An absolute numeric position refers to the snapshot revision.

If the document changed while the handler was running:

- an intent with only symbolic positions can be applied to the current
  selection;
- an intent with at least one absolute position is rejected with
  `STALE_EDITOR_STATE`.

So use numeric positions only when the operation is really bound to the
document structure you read. Do not try to "fix" a stale position by hand
without a new snapshot.

## Operations

### `insertText`

```ts
{
  type: 'insertText',
  text: 'Inserted text',
  from: 'selection.from',
  to: 'selection.to',
}
```

`from` and `to` default to the selection boundaries. The maximum text payload
is 256 KiB.

### `insertNode`

```ts
{
  type: 'insertNode',
  nodeType: 'acme_badge',
  attrs: {
    label: 'New',
    tone: 'neutral',
  },
  at: 'selection.from',
}
```

The host looks up `nodeType` in the current schema and calls `createAndFill`.
An unknown type, or attrs/content a node cannot be created with, rejects the
intent.

You can check the snapshot before returning:

```ts
if (!editor.schema.nodes.includes('acme_badge')) {
  throw new Error('acme_badge is not registered')
}
```

### `replaceSelection`

```ts
{
  type: 'replaceSelection',
  content: [{
    type: 'paragraph',
    content: [{ type: 'text', text: 'Replacement' }],
  }],
}
```

`content` is a single node JSON or an array of nodes. The host parses each one
through the current schema.

### `setNodeAttrs`

```ts
{
  type: 'setNodeAttrs',
  position: 12,
  attrs: {
    tone: 'positive',
  },
}
```

Attrs are merged with the node's current attrs. A numeric position makes the
intent revision-sensitive.

For a Tier 2 frame, use `api.patchAttrs()` — it is already scoped to its own
node and needs no absolute position.

### `addMark` and `removeMark`

```ts
{
  type: 'addMark',
  markType: 'strong',
  from: 'selection.from',
  to: 'selection.to',
}
```

```ts
{
  type: 'removeMark',
  markType: 'strong',
  from: 'selection.from',
  to: 'selection.to',
}
```

`addMark` accepts `attrs`.

### `wrap`

```ts
{
  type: 'wrap',
  nodeType: 'blockquote',
  from: 'selection.from',
  to: 'selection.to',
}
```

The host uses the current block range and the schema wrapping rules. If the
selection cannot be wrapped in the given node type, the intent is rejected.

### `setSelection`

```ts
{
  type: 'setSelection',
  from: 'selection.from',
  to: 'selection.to',
}
```

If `to` is omitted, a collapsed text selection is created.

## Helpers

`operations` shortens common simple operations:

```ts
import { operations, transaction } from '@nevo/plugin-sdk'

return transaction(editor.revision, [
  operations.insertText('Hello'),
  operations.insertNode('horizontal_rule'),
])
```

For `setNodeAttrs`, the helper takes a position:

```ts
operations.setNodeAttrs('selection.from', { tone: 'warning' })
```

Helpers return plain JSON and do not mutate the editor.

## Reading the document

With `editor.read`, the snapshot contains ProseMirror JSON:

```ts
api.command(descriptor, (_input, { editor }) => {
  if (!editor?.doc) throw new Error('Document read capability is required')

  const paragraphs = countNodes(editor.doc, 'paragraph')
  return transaction(editor.revision, [{
    type: 'insertText',
    text: `Paragraphs: ${paragraphs}`,
    from: 'selection.from',
    to: 'selection.to',
  }])
})
```

A recursive helper stays framework-agnostic:

```ts
function countNodes(value: JsonValue, type: string): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0

  const node = value as JsonObject
  const own = node.type === type ? 1 : 0
  const content = Array.isArray(node.content) ? node.content : []
  return own + content.reduce((total, child) => total + countNodes(child, type), 0)
}
```

Do not store the whole `editor.doc` in plugin storage. A snapshot can be large,
goes stale quickly and duplicates Nevo's source of truth.

## Patterns for a reliable handler

### Check that an editor exists

Some handlers are invoked outside an editor context:

```ts
if (!editor) throw new Error('This action requires an open editor')
```

### Check the schema

```ts
if (!editor.schema.marks.includes('strong')) return null
```

### Use the host time context

This makes the result identical across OSes and webviews.

### Return a single intent

Do not split a logical change across several UI actions. A single intent is
atomic and creates one undo step.

### Account for invocation retries

A Worker may be restarted once after a fatal failure, after which the host
retries the handler. Pure computation plus a single returned intent is safer
than side effects before the result.

## Common errors

| Error | Cause | Fix |
| --- | --- | --- |
| `Plugin handler must return a transaction intent` | The editor action returned plain JSON or `null` | Return `transaction(...)` |
| `STALE_EDITOR_STATE` | An absolute position was used with an old revision | Use a symbolic position or wait for a new user action |
| `Unknown node type` | The node is not registered or its name changed | Declare `editor.schema`, the schema contribution and a stable name |
| `Cannot create node` | Attrs/content do not match the schema | Add defaults or valid node JSON |
| `Transaction position ... is outside the document` | The numeric position is invalid | Compute it from the current snapshot and keep the revision |
| `Transaction intent must contain at most 100 operations` | The batch is too large | Simplify the change or rethink the UX |
