# UI and custom blocks

SDK V2 offers three UI tiers. Choose the lowest tier that solves the task: the
higher the tier, the more code, tests and state the plugin needs.

| Tier | Suited for | Execution |
| --- | --- | --- |
| Host UI | Static schema nodes and forms | Nevo creates the DOM entirely |
| Tier 1 SVG | Computed diagrams, charts, badges | The Worker returns sanitized SVG |
| Tier 2 frame | Interactive canvas, grid, complex widgets | The view runs in a sandboxed iframe |

## Host UI DSL

`ui` builds a JSON tree from which the host creates the DOM:

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

- `ui.element(tag, props, children)` — an allow-listed element;
- `ui.text(value)` — a static text node;
- `ui.attr(name)` — an escaped string from `attrs.<name>`;
- `ui.contentSlot()` — the place for ProseMirror content.

A content node must have exactly one `contentSlot`. A content-less node needs
no slot. The UI root is always `ui.element(...)`, and `contentSlot` must be the
only child of its element (wrap it in a separate `div`, as above); otherwise
the schema is rejected at registration.

### Allowed elements

`article`, `aside`, `button`, `code`, `div`, `em`, `header`, `label`, `li`, `ol`,
`p`, `pre`, `section`, `small`, `span`, `strong`, `ul`.

### Allowed attributes

`aria-label`, `aria-live`, `aria-pressed`, `class`, `data-action`, `data-bind`,
`role`, `tabindex`, `title`, plus safe `aria-*` and `data-*`.

`style`, `src`, `href`, `on*` and functions are forbidden. Attr binding only
takes the form `attrs.<name>`.

## Scoped CSS

`blockType` can add CSS:

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

The host adds the plugin scope to selectors. In the example, `.acme-callout` is
a child of the root element on which the host sets the scope attribute. CSS is
limited to 64 KiB. `@import`, `@font-face`, `url()`, `:global`, `html`, `body`,
`:root` and external resources are forbidden.

Do not rely on color alone. Add text/icon/ARIA semantics, and check the
light/dark theme and keyboard focus.

## Tier 1: sanitized SVG

Tier 1 fits when the UI is fully computed from attrs and needs no direct
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

Rules:

- `render` only supports `"svg"`;
- a render handler is required;
- `schema.content` is forbidden: the block must be content-less;
- the input has the form `{ attrs }`;
- the result has the form `{ svg: string }`;
- `render` and `frame` are mutually exclusive.

The host removes `script`, `foreignObject`, `style`, `on*`, external `url()` and
dangerous `href`. Use SVG presentation attributes (`fill`, `stroke`,
`font-size`) rather than inline style.

Rendering is asynchronous and debounced. A stale result is not mounted. An
error produces an empty surface without breaking the editor. The static `ui`
remains the fallback for export/copy and for a disabled plugin.

## Tier 2: interactive block frame

Tier 2 separates a privileged Worker from an unprivileged iframe:

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

The handler ID is passed to the frame through attrs when the node is created.
Do not guess its internal format: it is opaque, belongs to the current Worker
session and may change after a restart. A production view should get the
current ID from host-delivered attrs and not keep it outside node/session
state.

`defineBlockView()` provides:

- `onNode(listener)` — attrs, editable flag, theme and locale;
- `patchAttrs(attrs)` — a node-scoped merge patch;
- `invoke(handlerId, input?)` — calls a Worker handler.

Attrs are the only source of truth. A frame must not keep an independent copy
of important state only in the DOM. `patchAttrs`:

- works only with `editor.write.self`;
- is scoped to the node that owns the frame;
- accepts JSON up to 256 KiB;
- cannot change another node or the selection.

Without `editor.write.self`, the frame stays read-only and receives
`editable: false`.

### Iframe isolation

The frame runs with:

```html
<iframe sandbox="allow-scripts" referrerpolicy="no-referrer">
```

It gets no same-origin access, host DOM, direct network, navigation, popups,
secrets or Worker host services. CSP forbids connections, nested frames,
objects and forms. Use `api.invoke()` for privileged work.

`source` is always plugin-relative and is loaded through an opaque `nevoplugin`
token. The postMessage payload is limited to 256 KiB and versioned by protocol
`2.0`.

## Binary images in a frame

The Worker stores the bytes:

```ts
const assetId = await api.assets.upload(dataBase64)
const imageUrl = await api.assets.url(assetId)
```

The frame can use the resulting `nevoplugin-asset://` URL as `<img src>`. The
protocol serves only recognized PNG, JPEG, GIF, WebP and AVIF. SVG, HTML and
arbitrary binary responses are not displayed through this channel.

The Tier 1 SVG sanitizer does not allow such an external reference; draw the
data directly in the SVG or use Tier 2.

## Workspace views and modals

They use the same iframe security model, but the host mounts them in a route or
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

A sidebar item only opens a route inside its own plugin's namespace:

```ts
api.sidebarItem({
  id: `${api.pluginId}.report-link`,
  title: 'Report',
  route: `/workspace/plugin/${api.pluginId}/report`,
})
```

The desktop host supports these surfaces. Android/iOS return an explicit
`unsupported` until a separate E2E contract exists for mobile.

## Accessibility checklist

- Give the iframe and SVG a meaningful accessible name.
- Preserve keyboard order and visible focus.
- Do not block zoom and text selection unnecessarily.
- Honor `editable: false`.
- Listen for theme/locale updates, not just the first message.
- Support reduced motion inside the view.
- Do not use color as the only signal.
- Check WebKitGTK: do not use `<foreignObject>` in SVG.
