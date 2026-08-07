# Contributions и lifecycle

Contribution — это JSON-дескриптор, который Nevo превращает в host-owned
поведение. Функции не покидают Worker: SDK сохраняет их под непрозрачными
handler IDs, а host вызывает handler после пользовательского действия.

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

Порядок обычной загрузки:

1. Nevo проверяет manifest и создаёт plugin-scoped code session.
2. Worker импортирует entry module.
3. `setup(api)` регистрирует contributions.
4. Host проверяет все descriptors и сохраняет schema fallback.
5. `activate()` вызывается после регистрации всех enabled plugins.
6. При остановке workspace вызывается `deactivate()`.
7. Перед уничтожением Worker вызывается `dispose()`.

`setup`, lifecycle и migrations имеют лимит 10 секунд. Обычный handler — 5
секунд. Host-managed schedules очищаются при deactivate/dispose независимо от
plugin code.

`setup` может вернуть массив raw contributions, но typed methods на `api`
предпочтительнее: они создают handler IDs и уменьшают риск неверной формы.

## Общие требования к descriptor

Каждый descriptor:

- содержит строковый `id`;
- использует namespace `${api.pluginId}.…`;
- имеет уникальный ID среди contributions этого плагина;
- состоит только из JSON values;
- не содержит более 300 ключей на объект, 2 000 элементов на массив и 24
  уровней вложенности;
- использует ID не длиннее 160 символов;
- при наличии `title` ограничивает его 200 символами.

При несовпадении capability весь sandbox definition отклоняется. Host не
«пропускает» только одну неправильную регистрацию.

## Краткий справочник

| API | Capability | Основные descriptor fields | Handler |
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

## Commands, keymaps и actions

Все эти handlers получают editor snapshot и обычно возвращают transaction
intent.

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

Command попадает во внутренний command registry. Публичный SDK пока не
предоставляет отдельный API для запуска command другого плагина.

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

Key syntax соответствует ProseMirror key names. Больший `priority` обрабатывается
раньше; при одинаковом priority порядок стабилизируется по plugin ID.

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

## Schema nodes и marks

Для schema contribution запрещены `toDOM`, `parseDOM` и любые callbacks.
Разрешённый spec специально уже ProseMirror `NodeSpec`.

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

Node descriptor поддерживает:

- `name`, `content`, `group`, `attrs`;
- `inline`, `atom`, `selectable`, `draggable`, `defining`, `isolating`;
- `ui` для безопасного DOM tree.

`name` и attr names соответствуют
`^[A-Za-z][A-Za-z0-9_]{0,79}$`. Content expression поддерживает простые node/group
names, `+`, `*`, `?`, пробелы и `|`; сложный ProseMirror grammar не принимается.

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

Mark descriptor поддерживает `name`, `tag`, `attrs`, `inclusive`, `excludes`.
`tag` должен входить в allow-list host UI elements.

Практически чаще нужен `api.blockType()`, потому что он объединяет schema,
presentation и optional render handler. Все три UI tier подробно описаны в
[UI и пользовательские блоки](./ui.md).

## Popover

Popover редактирует attrs выбранной plugin node host-owned controls:

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

Field поддерживает `key`, `type`, `label`, `placeholder`, `rows`, `min`, `max`,
`step`, `options`. Используйте типы, уже поддержанные UI Nevo: `text`,
`textarea`, `select`, `number`, `checkbox` и совместимые plugin popover controls.

## Decorations

Decoration декларативно добавляет CSS class выделению или всем подходящим nodes:

```ts
api.register('decoration', {
  id: `${api.pluginId}.warning-decoration`,
  mode: 'node',
  nodeType: 'acme_badge',
  attrs: { tone: 'warning' },
  className: 'acme-badge-warning',
})
```

Для `mode: "selection"` `nodeType` и `attrs` не нужны:

```ts
api.register('decoration', {
  id: `${api.pluginId}.selection-decoration`,
  mode: 'selection',
  className: 'acme-selection',
})
```

`className` должен соответствовать `^[A-Za-z][A-Za-z0-9_-]{0,79}$`.
Decoration descriptor не принимает произвольную функцию обхода документа.

## Serializers

Serializer вызывается для конкретного node type:

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

Поддерживаемые formats: `markdown`, `html`, `typst`. Input:

```ts
{
  node: JsonObject
  children: string
}
```

`children` уже сериализованы текущим exporter и нужны content nodes. Handler
обязан вернуть строку не длиннее 1 MiB. HTML проходит дополнительную проверку:
`script`, `iframe`, `object`, `embed`, event attributes, `javascript:` и
`data:text/html` отклоняются.

## Importers

Importer преобразует fenced Markdown block в ProseMirror JSON:

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

Handler получает `{ code: string }` и возвращает node JSON или `null`. Тип ноды,
attrs и content проверяются текущей editor schema.

## Workspace UI contributions

Workspace views и modals загружают plugin-relative HTML в iframe:

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

`source` не может быть absolute URL, `data:`, `javascript:`, содержать `..` или
backslash. Route ограничен `/workspace/plugin/<pluginId>` namespace и не может
содержать query/hash.

Optional handler получает UI events в форме:

```ts
{
  contributionId: string
  event: {
    type: string
    payload: JsonValue
  }
}
```

Iframe bridge и ограничения описаны в [UI guide](./ui.md).

## Editor events

Сейчас sandbox host публикует одно событие — `transactionApplied`:

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

События debounce-ятся и не предназначены для синхронного перехвата transaction.
`editor.doc` присутствует только при `editor.read`. Результат event handler не
применяется как editor transaction.

## Ошибки и отмена

Handler получает `AbortSignal`:

```ts
api.command(descriptor, async (_input, { editor, signal }) => {
  const result = await doWork({ signal })
  if (signal.aborted) return null
  return transaction(editor?.revision ?? 0, result.operations)
})
```

Timeout отправляет Worker cancel request и abort-ит signal. Ваши async helpers
должны сами реагировать на `signal`; уже начатый broker call может завершиться,
но его результат после отмены использовать не следует.

Fatal Worker error приводит к одному автоматическому restart и повтору
invocation. Повторный crash переводит плагин в session quarantine. Поэтому
handler должен быть идемпотентным до момента возврата результата: не сочетайте
неповторяемый внешний side effect и editor transaction без собственного
idempotency key.
