# UI и пользовательские блоки

SDK V2 предлагает три уровня UI. Выбирайте минимальный уровень, который решает
задачу: чем выше tier, тем больше кода, тестов и состояния нужно плагину.

| Tier | Подходит для | Выполнение |
| --- | --- | --- |
| Host UI | Статичные schema nodes и forms | DOM полностью создаёт Nevo |
| Tier 1 SVG | Вычисляемые diagrams, charts, badges | Worker возвращает sanitized SVG |
| Tier 2 frame | Интерактивные canvas, grid, complex widgets | View работает в sandboxed iframe |

## Host UI DSL

`ui` строит JSON tree, из которого host создаёт DOM:

```ts
import { ui } from '@nevo/plugin-sdk'

const calloutUi = ui.element('aside', {
  role: 'note',
}, [
  ui.element('div', {
    class: 'acme-callout',
    'data-tone': 'attrs.tone',
  }, [
    ui.element('span', {
      class: 'acme-callout__icon',
      'aria-hidden': true,
    }, [
      ui.attr('icon'),
    ]),
    ui.element('div', {
      class: 'acme-callout__content',
    }, [
      ui.contentSlot(),
    ]),
  ]),
])
```

Helpers:

- `ui.element(tag, props, children)` — allow-listed element;
- `ui.text(value)` — статичный text node;
- `ui.attr(name)` — escaped string из `attrs.<name>`;
- `ui.contentSlot()` — место для ProseMirror content.

Для content node должен быть ровно один `contentSlot`. Для content-less node
slot не нужен.

### Разрешённые elements

`article`, `aside`, `button`, `code`, `div`, `em`, `header`, `label`, `li`, `ol`,
`p`, `pre`, `section`, `small`, `span`, `strong`, `ul`.

### Разрешённые attributes

`aria-label`, `aria-live`, `aria-pressed`, `class`, `data-action`, `data-bind`,
`role`, `tabindex`, `title`, а также безопасные `aria-*` и `data-*`.

`style`, `src`, `href`, `on*` и функции запрещены. Attr binding имеет только
форму `attrs.<name>`.

## Scoped CSS

`blockType` может добавить CSS:

```ts
api.blockType({
  id: `${api.pluginId}.callout`,
  name: 'acme_callout',
  schema: {
    group: 'block',
    content: 'block+',
    attrs: {
      tone: { default: 'info' },
      icon: { default: '💡' },
    },
  },
  ui: calloutUi,
  css: `
    .acme-callout {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      border: 1px solid currentColor;
      border-radius: 0.75rem;
    }

    .acme-callout:focus-within {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
  `,
})
```

Host добавляет plugin scope к selectors. В примере `.acme-callout` — дочерний
элемент корня, на который host ставит scope attribute. CSS ограничен 64 KiB. Запрещены
`@import`, `@font-face`, `url()`, `:global`, `html`, `body`, `:root` и внешние
resources.

Не полагайтесь только на цвет. Добавляйте text/icon/ARIA semantics, проверяйте
light/dark theme и keyboard focus.

## Tier 1: sanitized SVG

Tier 1 подходит, если UI полностью вычисляется из attrs и не требует direct
interaction.

```ts
import { definePlugin, type JsonObject } from '@nevo/plugin-sdk'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default definePlugin({
  setup(api) {
    api.blockType({
      id: `${api.pluginId}.metric`,
      name: 'acme_metric',
      render: 'svg',
      schema: {
        group: 'block',
        atom: true,
        attrs: {
          label: { default: 'Metric' },
          value: { default: 0 },
        },
      },
      ui: {
        type: 'element',
        tag: 'div',
        props: { class: 'acme-metric-fallback' },
        children: [{ type: 'text', bind: 'attrs.label' }],
      },
    }, ({ attrs }) => {
      const values = attrs as JsonObject
      const label = escapeXml(String(values.label ?? 'Metric'))
      const amount = Number(values.value ?? 0)

      return {
        svg: `
          <svg viewBox="0 0 320 96" role="img" aria-label="${label}">
            <rect width="320" height="96" rx="12" fill="#1f2937"/>
            <text x="20" y="38" fill="#d1d5db">${label}</text>
            <text x="20" y="72" fill="#ffffff">${amount}</text>
          </svg>
        `,
      }
    })
  },
})
```

Правила:

- `render` поддерживает только `"svg"`;
- render handler обязателен;
- `schema.content` запрещён: block должен быть content-less;
- input имеет форму `{ attrs }`;
- result имеет форму `{ svg: string }`;
- `render` и `frame` взаимно исключаются.

Host удаляет `script`, `foreignObject`, `style`, `on*`, external `url()` и
опасные `href`. Используйте SVG presentation attributes (`fill`, `stroke`,
`font-size`), а не inline style.

Render асинхронный и debounced. Устаревший result не монтируется. Ошибка даёт
пустую поверхность, не ломая editor. Статичный `ui` остаётся fallback для
export/copy и disabled plugin.

## Tier 2: interactive block frame

Tier 2 разделяет privileged Worker и unprivileged iframe:

```text
Worker handler <-> validated host bridge <-> iframe view
```

Block descriptor:

```ts
import { transaction, type JsonObject } from '@nevo/plugin-sdk'

const workerHandlerId = api.blockType({
  id: `${api.pluginId}.board`,
  name: 'acme_board',
  frame: {
    source: 'views/board.html',
  },
  schema: {
    group: 'block',
    atom: true,
    attrs: {
      title: { default: 'Board' },
      columns: { default: [] },
      workerHandlerId: { default: '' },
    },
  },
}, async (input) => {
  const values = input as JsonObject
  return await api.storage.workspace.get(
    String(values.storageKey ?? 'default'),
  )
})

if (!workerHandlerId) {
  throw new Error('Block Worker handler was not registered')
}

api.slashItem({
  id: `${api.pluginId}.insert-board`,
  title: 'Board',
  category: 'layout',
}, (_input, { editor }) => transaction(editor?.revision ?? 0, [{
  type: 'insertNode',
  nodeType: 'acme_board',
  attrs: {
    title: 'Board',
    columns: [],
    workerHandlerId,
  },
  at: 'selection.from',
}]))
```

Manifest:

```json
{
  "capabilities": [
    "editor.schema",
    "ui.blockFrame",
    "editor.write.self",
    "storage.workspace"
  ]
}
```

View entry:

```ts
import { defineBlockView, type JsonObject } from '@nevo/plugin-sdk'

const titleInput = document.querySelector<HTMLInputElement>('[data-title]')
const syncButton = document.querySelector<HTMLButtonElement>('[data-sync]')
const output = document.querySelector<HTMLElement>('[data-output]')
let workerHandlerId = ''

defineBlockView((api) => {
  api.onNode(({ attrs, editable, theme, locale }) => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = locale
    if (titleInput) {
      titleInput.value = String(attrs.title ?? '')
      titleInput.disabled = !editable
    }
    workerHandlerId = String(attrs.workerHandlerId ?? '')
  })

  titleInput?.addEventListener('change', () => {
    api.patchAttrs({ title: titleInput.value })
  })

  syncButton?.addEventListener('click', async () => {
    if (!workerHandlerId) return
    const result = await api.invoke<JsonObject>(
      workerHandlerId,
      { storageKey: 'default' },
    )
    if (output) output.textContent = JSON.stringify(result)
  })
})
```

Handler ID передан frame через attrs при создании node. Не угадывайте его
внутренний формат: он opaque, принадлежит текущей Worker session и может
измениться после restart. Production view должен получать актуальный ID из
host-delivered attrs и не сохранять его вне node/session state.

`defineBlockView()` предоставляет:

- `onNode(listener)` — attrs, editable flag, theme и locale;
- `patchAttrs(attrs)` — node-scoped merge patch;
- `invoke(handlerId, input?)` — вызов Worker handler.

Attrs — единственный источник истины. Frame не должен хранить независимую копию
важного состояния только в DOM. `patchAttrs`:

- работает только с `editor.write.self`;
- ограничен нодой, которой принадлежит frame;
- принимает JSON до 256 KiB;
- не может менять другой node или selection.

Без `editor.write.self` frame остаётся read-only и получает
`editable: false`.

### Iframe isolation

Frame запускается с:

```html
<iframe sandbox="allow-scripts" referrerpolicy="no-referrer">
```

Он не получает same-origin, host DOM, direct network, navigation, popups,
secrets или Worker host services. CSP запрещает connections, nested frames,
objects и forms. Для privileged work используйте `api.invoke()`.

`source` всегда plugin-relative и загружается через opaque `nevoplugin` token.
Payload postMessage ограничен 256 KiB и версионирован protocol `2.0`.

## Binary images во frame

Worker сохраняет bytes:

```ts
const assetId = await api.assets.upload(dataBase64)
const imageUrl = await api.assets.url(assetId)
```

Frame может использовать полученный `nevoplugin-asset://` URL как `<img src>`.
Protocol отдаёт только распознанные PNG, JPEG, GIF, WebP и AVIF. SVG, HTML и
произвольный binary response не отображаются этим каналом.

Tier 1 SVG sanitizer не разрешает такую внешнюю ссылку; рисуйте данные прямо в
SVG или используйте Tier 2.

## Workspace views и modals

Они используют тот же iframe security model, но монтируются host в route или
modal surface.

```ts
api.workspaceView({
  id: `${api.pluginId}.report`,
  title: 'Report',
  route: `/workspace/plugin/${api.pluginId}/report`,
  source: 'views/report.html',
})

api.modal({
  id: `${api.pluginId}.preferences`,
  source: 'views/preferences.html',
})
```

Sidebar item только открывает route внутри namespace своего plugin:

```ts
api.sidebarItem({
  id: `${api.pluginId}.report-link`,
  title: 'Report',
  route: `/workspace/plugin/${api.pluginId}/report`,
})
```

Desktop host поддерживает эти surfaces. Android/iOS возвращают explicit
`unsupported`, пока для mobile не появился отдельный E2E contract.

## Accessibility checklist

- Дайте iframe и SVG содержательное accessible name.
- Сохраняйте keyboard order и видимый focus.
- Не блокируйте zoom и text selection без необходимости.
- Учитывайте `editable: false`.
- Слушайте theme/locale updates, а не только первое сообщение.
- Поддерживайте reduced motion внутри view.
- Не используйте цвет как единственный сигнал.
- Проверяйте WebKitGTK: не используйте `<foreignObject>` в SVG.
