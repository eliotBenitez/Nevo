# Nevo Plugin SDK V2

Новые marketplace-плагины Nevo используют `@nevo/plugin-sdk` 2.0 и исполняются в
постоянном изолированном Worker. Плагин не получает DOM, ProseMirror, Tauri,
filesystem, storage или сеть напрямую. Он регистрирует JSON-дескрипторы, а
функции остаются внутри Worker под непрозрачными handler IDs.

Trusted SDK V1 сохранён для bundled/system, folder plugins и уже установленных
legacy-плагинов. Новые marketplace-публикации с V1 отклоняются backend.

## Manifest V2

```json
{
  "id": "example.plugin",
  "name": "Example",
  "version": "2.0.0",
  "description": "An example sandboxed plugin.",
  "enabled": true,
  "kind": "marketplace",
  "source": "marketplace",
  "entryPoint": "index.js",
  "apiVersion": "2.0.0",
  "executionMode": "sandboxed-worker",
  "dataVersion": 1,
  "capabilities": ["editor.write"],
  "network": {
    "hosts": ["api.example.com"],
    "methods": ["GET"]
  },
  "settingsSchema": []
}
```

V2 использует только единый `capabilities`. Поля `editorCapabilities`,
`uiCapabilities` и `workspaceCapabilities` читаются только для trusted V1.
`network` разрешён только вместе с `network.fetch`.

## Plugin entry

```ts
import { definePlugin, transaction } from '@nevo/plugin-sdk'

export default definePlugin({
  setup(api) {
    api.slashItem({
      id: `${api.pluginId}.hello`,
      title: 'Insert hello',
      category: 'text',
    }, (_input, { editor }) => transaction(editor?.revision ?? 0, [{
      type: 'insertText',
      text: 'Hello',
      from: 'selection.from',
      to: 'selection.to',
    }]))
  },
  async activate() {},
  async deactivate() {},
  async dispose() {},
})
```

`setup` поддерживает commands, keymaps, slash/toolbar actions, schema
nodes/marks, block types, popovers, decorations, serializers/importers,
workspace views, sidebar items, modals и editor events. Для сложных view/modal
используется iframe broker; iframe запускается с `sandbox="allow-scripts"` без
same-origin, navigation, popup и прямой сети.

На desktop workspace views доступны по host-owned маршрутам
`/workspace/plugin/<pluginId>/<viewId>`, sidebar items открывают только маршруты
своего plugin namespace, а modals монтируются host поверх workspace. URL iframe
всегда использует opaque `nevoplugin` token. Iframe получает только locale,
theme и versioned события через `postMessage`; payload ограничен 256 KiB.
Android/iOS возвращают явное `unsupported` до отдельного mobile E2E.

Отложенная работа регистрируется через `api.scheduling.setTimeout` или
`api.scheduling.setInterval`. Таймер принадлежит host, ограничен квотой и
автоматически очищается при deactivate/dispose; глобальные timers внутри Worker
недоступны.

## Editor transactions

Handler получает snapshot с `revision`, selection, schema names и host time
context (`now`, `locale`, `timeZone`). Поле `doc` присутствует только при
`editor.read`. Handler возвращает один атомарный transaction intent.

Абсолютные позиции отклоняются с `STALE_EDITOR_STATE`, если revision изменился.
Операции с `selection.from`/`selection.to` применяются к актуальному выделению.
Host проверяет диапазоны, node/mark types, JSON, размеры и число операций.

## Host services

SDK предоставляет только broker-вызовы:

- `api.storage.workspace` — `.nevo/plugin-data/<pluginId>.json`, синхронизируется;
- `api.storage.local` — app data с workspace/plugin namespace;
- `api.settings` — существующий `.nevo/settings.json`;
- `api.secrets.get` — secure store, значение не попадает в iframe;
- `api.assets` — plugin-scoped бинарное хранилище (см. ниже);
- `api.network.fetch` — declared HTTPS hosts/methods;
- `api.workspace.invoke` — фиксированный allow-list template/kanban команд.

Квота каждого storage scope — 5 MiB, одного значения — 256 KiB. Network broker
запрещает credentials/cookies и опасные headers, проверяет DNS и каждый redirect
на private/link-local адреса, pin-ит проверенные DNS-адреса, допускает не более
пяти redirects, 30 секунд и 5 MiB ответа.

## Asset store (Tier 3)

Плагину, которому нужно хранить бинарные данные (иконки, сгенерированные изображения,
кэш), доступен plugin-scoped content-addressed store. Значения не проходят через
ProseMirror и не попадают в note JSON — узел хранит только `assetId`.

```ts
const assetId = await api.assets.write(base64Payload)  // ≤ 512 KiB single-shot, sha256
const bigId = await api.assets.upload(largeBase64)      // ≤ 8 MiB, авто-чанкинг
const dataBase64 = await api.assets.read(assetId)       // null, если объект отсутствует
const src = await api.assets.url(bigId)                 // nevoplugin-asset:// URL для <img>
await api.assets.delete(assetId)
```

Объекты лежат под `.nevo/plugin-assets/<pluginId>/<assetId>` (workspace-scoped,
namespaced по плагину). Store content-addressed: одинаковые байты дедуплицируются и
не расходуют квоту повторно. Capabilities: `assets.write` (write/upload/delete) и
`assets.read` (read/url). `assetId` — 64 hex-символа; `pluginId` и `assetId` —
валидированные одиночные компоненты пути, поэтому traversal невозможен. Суммарная
квота на плагин — 64 MiB.

**Chunked upload (C.2).** `api.assets.upload` прозрачно грузит крупные бинарники:
мелкие идут single-shot `write`, крупные — потоком чанков ≤ 512 KiB (base64 режется
по 4-символьной границе, каждый чанк декодируется независимо) в staging-файл
`.nevo/plugin-assets/<pluginId>/.uploads/<uploadId>.part`, который на `finish`
хэшируется и коммитится в content-addressed store; при любой ошибке upload
абортится и staging удаляется. Одно значение ≤ 8 MiB, до 8 одновременных загрузок
на плагин. `read` остаётся ограничен 512 KiB — крупные ассеты потребляются через URL,
а не обратным каналом Worker.

**Renderable URL (C.2).** `api.assets.url(assetId)` выдаёт стабильный
`nevoplugin-asset://<token>/<assetId>` для использования как `<img src>` **внутри
Tier 2 frame** (в Tier 1 SVG-санитайзер вырезает внешние ссылки). Токен opaque и
привязан к каталогу *своего* плагина, поэтому URL нельзя навести на чужие ассеты
даже зная их id. Хендлер протокола определяет content-type по magic-байтам (PNG,
JPEG, GIF, WebP, AVIF) и отказывает всему, что не является изображением, — SVG/HTML
и произвольные octet-stream через этот канал не отдаются. Frame CSP расширен до
`img-src ... nevoplugin-asset:`.

## Schema and fallback

Schema/UI descriptors преобразуются host в безопасные `NodeSpec`/`MarkSpec` и
allow-listed DOM DSL. Raw HTML, DOM callbacks, внешние URL, `@import`, `url()`,
`:global`, `html`, `body` и `:root` запрещены.

Последняя валидная schema сохраняется в `.nevo/plugin-registry.json`. При
disabled/missing/broken plugin она загружается без запуска кода: attrs и rich
children остаются в документе. Fallback export добавляет безопасный JSON marker
и сохраняет children.

## Render channel (Tier 1)

Для блоков, чей вид вычисляется из данных (диаграммы, charts, badges), `blockType`
может объявить `render: 'svg'` и передать handler. Host на монтировании и при
изменении attrs узла вызывает handler в Worker с `{ attrs }`, ожидает
`{ svg: string }`, санитайзит результат (DOMPurify SVG-профиль: запрет `script`,
`foreignObject`, `style`, `on*`, внешних `url()`/`href`) и монтирует его как живой
NodeView. Плагин не касается DOM — SVG пересекает границу sandbox как данные.

```ts
api.blockType({
  id: `${api.pluginId}.spark`,
  name: 'spark_block',
  render: 'svg',
  schema: { group: 'block', atom: true, attrs: { points: { default: '' } } },
}, ({ attrs }) => ({ svg: renderSparklineSvg(String((attrs as JsonObject).points ?? '')) }))
```

Требования: render-блок обязан быть content-less (`schema.content` запрещён),
handler обязателен, единственный поддерживаемый режим — `'svg'`. Рендер
асинхронный и debounced; устаревшие результаты отбрасываются, ошибка деградирует
в пустую поверхность без падения редактора. Используйте presentation-атрибуты
(`fill`, `stroke`, …) вместо inline `style` — он вырезается санитайзером. Стойкая
schema и статичный `toDOM` остаются fallback'ом для export/copy и
disabled-плагинов.

## Frame blocks (Tier 2)

Для интерактивных блоков (canvas, grid, D3) `blockType` объявляет
`frame: { source: 'view.html' }`. View-бандл плагина исполняется в
`sandbox="allow-scripts"` iframe из `nevoplugin://` (без host-API и сети). Единый
источник истины — attrs узла: host шлёт их сообщением `node`, iframe предлагает
патчи сообщением `patch`, а host применяет их как **node-scoped** транзакцию после
capability- и JSON-валидации. Привилегированная логика делегируется в Worker через
`invoke`.

Capabilities: `ui.blockFrame` (встроить frame) и `editor.write.self` (патчить attrs
своего узла; без неё frame рендерится read-only). `frame` и `render` взаимно
исключающи, `source` — только plugin-relative, блок обязан быть content-less.

Iframe-рантайм — `defineBlockView`:

```ts
import { defineBlockView } from '@nevo/plugin-sdk'

defineBlockView((api) => {
  api.onNode(({ attrs, editable, theme }) => renderBoard(attrs, { editable, theme }))
  boardEl.addEventListener('change', () => api.patchAttrs({ title: boardEl.value }))
  // api.invoke('<handlerId>', input) — делегировать в Worker (сеть/секреты)
})
```

## Build and conformance

```sh
pnpm add -D @nevo/plugin-sdk@^2.0.0 vite
pnpm build
pnpm exec nevo-plugin-conformance ./dist/index.js
```

До отдельной npm-публикации marketplace CI может устанавливать tarball,
созданный из `packages/plugin-sdk` checkout Nevo.

См. также [migration guide](./plugin-sdk-v2-migration.md),
[capability reference](./plugin-capabilities.md) и
[security model](./plugin-security.md).
