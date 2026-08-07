# Migration from trusted SDK V1 to SDK V2

V2 не совместим с исходным кодом V1. Миграция меняет модель выполнения:

| V1 | V2 |
| --- | --- |
| Код в главном WebView | Изолированный Worker |
| `onRegister(ctx)` | `definePlugin({ setup(api) })` |
| ProseMirror objects | JSON snapshot + transaction intent |
| DOM callbacks/NodeView | Host UI, sanitized SVG или iframe |
| Direct/in-process services | Capability-gated brokers |
| Split capability arrays | Единый `capabilities` |

Trusted V1 остаётся для bundled/system, folder и уже установленных legacy
plugins. Новая marketplace publication обязана быть V2.

## До начала

Составьте inventory:

- registrations и их IDs;
- schema node/mark names;
- attrs и content expressions;
- serialized/export formats;
- storage keys и их JSON shape;
- filesystem/network/Tauri calls;
- custom DOM/NodeView behavior;
- workspace routes и modals;
- текущая persisted data version.

Schema names, attrs, contribution IDs и storage keys считаются persisted/public
contract. Не переименовывайте их только ради cleanup.

## 1. Обновите manifest

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

Добавьте `network` только при реальном `api.network.fetch`.

`dataVersion` описывает persisted data, а не runtime. Если storage/schema data не
изменилась, переход V1 → V2 сам по себе не требует увеличивать `dataVersion`.

## 2. Перенесите registration

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

Не переносите `state`, `dispatch` или `view` в closure. Их нет в Worker.

## 3. Перенесите schema и UI

Сохраните имя и attrs:

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

Замените:

- `toDOM`/`parseDOM` callbacks → declarative `ui`;
- computed static view → `render: "svg"`;
- interactive NodeView → Tier 2 `frame`;
- direct popover DOM → `api.register('popover', descriptor)`.

Raw HTML, DOM callbacks, external CSS resources и global selectors V2 не
принимает.

## 4. Перенесите services

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

Если replacement отсутствует, функциональность нельзя переносить обходным
путём. Зафиксируйте SDK gap отдельно.

## 5. Добавьте serializers/importers

Custom node должна экспортироваться без plugin runtime:

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

Добавьте Markdown/HTML/Typst serializer для каждого custom node, если этот
format поддерживает продуктовый workflow. Importer нужен для обратного
round-trip fenced syntax.

## 6. Миграции persisted data

`migrations` индексируется целевой data version. Для перехода 1 → 3 нужны оба
handlers: `2` и `3`.

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

Каждый handler получает:

```ts
{
  fromDataVersion: number
  storage: JsonObject
  nodes: JsonObject[]
}
```

И обязан вернуть:

```ts
{
  dataVersion: targetVersion
  storage: JsonObject
  nodes: JsonObject[]
}
```

Пропущенный step, неверный `dataVersion`, non-JSON result или invalid node
отклоняют update.

## Как Nevo применяет migration

Marketplace update двухфазный:

1. скачивает package в staging;
2. проверяет permission fingerprint;
3. загружает staged Worker и validates contributions;
4. сохраняет live Y.Doc и останавливает старый Worker;
5. читает plugin nodes из реальных `.nevo/collab/<noteId>.yjs`;
6. последовательно вызывает migrations;
7. проверяет новые nodes против новой schema на копиях;
8. journaled backup сохраняет plugin directory, storage, registry и Y.Doc;
9. только затем новая версия публикуется атомарно.

`note.content` не является источником истины для существующего local document:
оно только seed нового Y.Doc.

Crash, validation error, missing migration, fingerprint race или installed
version race восстанавливает прежние files/data.

## Callout compatibility example

При runtime migration без data migration сохраните:

- node name `callout_block`;
- attrs `variant` и `icon`;
- content expression `block+`;
- nested rich content;
- serializers для всех поддержанных formats.

Это позволяет cached schema fallback открыть document даже при disabled/broken
plugin.

## Testing migration

Для каждой legacy version:

1. создайте workspace fixture реальной старой версией;
2. добавьте несколько plugin nodes, включая nested content;
3. сохраните workspace, чтобы данные оказались в Y.Doc;
4. сделайте копию workspace;
5. обновите plugin через marketplace transaction;
6. проверьте storage и каждую node;
7. проверьте editor undo/redo и export;
8. повторите с искусственной ошибкой migration и убедитесь в rollback;
9. disable plugin и проверьте cached fallback.

Unit test чистого migration:

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

- [ ] `apiVersion` и `executionMode` переключены на V2.
- [ ] Split capability arrays заменены единым минимальным `capabilities`.
- [ ] `onRegister(ctx)` заменён `setup(api)`.
- [ ] ProseMirror mutations выражены transaction intents.
- [ ] Direct DOM заменён подходящим UI tier.
- [ ] Direct services заменены brokers.
- [ ] Contribution IDs сохраняют namespace и стабильность.
- [ ] Schema names/attrs/content сохранены или migrated.
- [ ] Serializers/importers покрывают custom nodes.
- [ ] Каждый `dataVersion` step существует и tested.
- [ ] Legacy Y.Doc fixture проходит update и rollback.
- [ ] Conformance, unit tests и реальный Nevo host проходят.
