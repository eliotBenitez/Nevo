# Работа с редактором

SDK V2 не передаёт плагину `EditorView`, `EditorState` или ProseMirror
`Transaction`. Handler получает immutable JSON snapshot и возвращает намерение,
которое host проверяет и применяет атомарно.

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

- `revision` увеличивается после каждой применённой transaction;
- selection positions относятся к документу этого revision;
- `schema` позволяет проверить наличие node/mark type;
- `doc` добавляется только с capability `editor.read`;
- `now`, `locale`, `timeZone` задаёт host для воспроизводимого formatting.

Не используйте `Date.now()`, browser locale или системную timezone, когда
результат должен соответствовать настройкам Nevo. Используйте поля snapshot:

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

Один intent содержит до 100 operations. Host проверяет operation types,
positions, schema names и payload, затем строит одну ProseMirror transaction.
Если любая operation невалидна, intent целиком не применяется.

## Позиции и stale state

Transaction position:

```ts
type TransactionPosition =
  | number
  | 'selection.from'
  | 'selection.to'
```

Symbolic positions разрешаются против актуального selection в момент применения.
Абсолютная numeric position относится к snapshot revision.

Если документ изменился, пока handler работал:

- intent только с symbolic positions можно применить к актуальному selection;
- intent хотя бы с одной absolute position отклоняется с
  `STALE_EDITOR_STATE`.

Поэтому используйте numeric positions только когда операция действительно
привязана к прочитанной структуре документа. Не пытайтесь «исправить» stale
position вручную без нового snapshot.

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

`from` и `to` по умолчанию равны границам selection. Максимальный text payload —
256 KiB.

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

Host ищет `nodeType` в актуальной schema и вызывает `createAndFill`. Неизвестный
тип или attrs/content, с которыми нельзя создать node, отклоняют intent.

Перед возвратом можно проверить snapshot:

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

`content` — один node JSON или массив nodes. Host парсит каждый через актуальную
schema.

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

Attrs объединяются с текущими attrs node. Numeric position делает intent
revision-sensitive.

Для Tier 2 frame используйте `api.patchAttrs()` — он уже ограничен собственной
нодой и не требует absolute position.

### `addMark` и `removeMark`

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

Для `addMark` можно передать `attrs`.

### `wrap`

```ts
{
  type: 'wrap',
  nodeType: 'blockquote',
  from: 'selection.from',
  to: 'selection.to',
}
```

Host использует актуальный block range и schema wrapping rules. Если selection
нельзя обернуть в указанный node type, intent отклоняется.

### `setSelection`

```ts
{
  type: 'setSelection',
  from: 'selection.from',
  to: 'selection.to',
}
```

При отсутствии `to` создаётся collapsed text selection.

## Helpers

`operations` сокращает частые простые операции:

```ts
import { operations, transaction } from '@nevo/plugin-sdk'

return transaction(editor.revision, [
  operations.insertText('Hello'),
  operations.insertNode('horizontal_rule'),
])
```

Для `setNodeAttrs` helper принимает position:

```ts
operations.setNodeAttrs('selection.from', { tone: 'warning' })
```

Helpers возвращают обычный JSON и не выполняют editor mutation.

## Чтение документа

С `editor.read` snapshot содержит ProseMirror JSON:

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

Рекурсивный helper остаётся framework-agnostic:

```ts
function countNodes(value: JsonValue, type: string): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0

  const node = value as JsonObject
  const own = node.type === type ? 1 : 0
  const content = Array.isArray(node.content) ? node.content : []
  return own + content.reduce((total, child) => total + countNodes(child, type), 0)
}
```

Не сохраняйте весь `editor.doc` в plugin storage. Snapshot может быть большим,
быстро устаревает и дублирует источник истины Nevo.

## Паттерны надёжного handler

### Проверяйте наличие editor

Некоторые handlers вызываются вне editor context:

```ts
if (!editor) throw new Error('This action requires an open editor')
```

### Проверяйте schema

```ts
if (!editor.schema.marks.includes('strong')) return null
```

### Используйте host time context

Это делает результат одинаковым на разных OS и webview.

### Возвращайте один intent

Не разбивайте логическое изменение на несколько UI actions. Один intent
атомарен и создаёт один undo step.

### Учитывайте повтор invocation

Worker может быть перезапущен один раз после fatal failure, после чего host
повторит handler. Чистое вычисление + один возвращаемый intent безопаснее
side effects до результата.

## Типичные ошибки

| Ошибка | Причина | Исправление |
| --- | --- | --- |
| `Plugin handler must return a transaction intent` | Editor action вернул обычный JSON или `null` | Верните `transaction(...)` |
| `STALE_EDITOR_STATE` | Использована absolute position со старым revision | Используйте symbolic position или запросите новое действие пользователя |
| `Unknown node type` | Node не зарегистрирован или имя изменено | Объявите `editor.schema`, schema contribution и стабильное name |
| `Cannot create node` | Attrs/content не соответствуют schema | Добавьте defaults или корректный node JSON |
| `Transaction position ... is outside the document` | Numeric position некорректна | Рассчитывайте по текущему snapshot и сохраняйте revision |
| `Transaction intent must contain at most 100 operations` | Слишком крупная batch | Упростите изменение или пересмотрите UX |
