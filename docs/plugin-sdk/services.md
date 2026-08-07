# Host services

Worker не имеет прямого storage, filesystem, network или timers. Вместо них
`PluginSetupApi` предоставляет brokers. Каждый вызов заново проверяет capability
из установленного manifest и автоматически добавляет workspace/plugin namespace.

## Сводка

| API | Capability | Scope |
| --- | --- | --- |
| `api.storage.workspace` | `storage.workspace` | Синхронизируемый workspace JSON |
| `api.storage.local` | `storage.local` | Локальный app-data JSON |
| `api.settings.get` | `settings.read` | Plugin settings в workspace settings |
| `api.settings.set` | `settings.write` | Plugin settings в workspace settings |
| `api.secrets.get` | `secrets.read` | Secure store namespace плагина |
| `api.assets.read/url` | `assets.read` | Workspace binary asset store |
| `api.assets.write/upload/delete` | `assets.write` | Workspace binary asset store |
| `api.network.fetch` | `network.fetch` + policy | Allow-listed HTTPS |
| `api.scheduling` | `runtime.scheduling` | Host-managed timers |
| `api.workspace.invoke` | Domain capability | Allow-listed commands |

## JSON storage

```ts
interface PluginStorage {
  get<T extends JsonValue = JsonValue>(key: string): Promise<T | null>
  set(key: string, value: JsonValue): Promise<void>
  delete(key: string): Promise<void>
}
```

### Workspace storage

```ts
const state = await api.storage.workspace.get<JsonObject>('state')

await api.storage.workspace.set('state', {
  lastSyncAt: new Date().toISOString(),
  cursor: 42,
})

await api.storage.workspace.delete('state')
```

Файл:

```text
<workspace>/.nevo/plugin-data/<pluginId>.json
```

Он относится к workspace, попадает в backup/transfer и может синхронизироваться
вместе с workspace.

### Local storage

```ts
await api.storage.local.set('cache', {
  etag: 'W/"123"',
  value: 'cached response',
})
```

Local scope хранится в app data с workspace fingerprint и plugin namespace. Он
подходит для кэша и machine-local preferences, но не для данных, которые должны
переезжать с workspace.

### Лимиты storage

- ключ: `A-Z a-z 0-9 . _ -`, от 1 до 160 символов;
- одно значение: до 256 KiB serialized JSON;
- каждый scope: до 5 MiB на plugin;
- запись атомарно переписывает plugin JSON file.

Не используйте storage как database для сотен chatty writes. Группируйте
связанные значения и избегайте записи на каждое editor event.

## Settings и secrets

Settings UI объявляется в manifest. Обычные поля:

```ts
const format = await api.settings.get<string>('format')
await api.settings.set('lastUsedFormat', format ?? 'long')
```

Capabilities:

```json
{
  "capabilities": ["settings.read", "settings.write"]
}
```

Поле с `secret: true` хранится отдельно:

```ts
const token = await api.secrets.get('apiToken')
if (!token) throw new Error('Configure API token in plugin settings')
```

```json
{
  "capabilities": ["secrets.read"],
  "settingsSchema": [{
    "key": "apiToken",
    "type": "password",
    "label": "API token",
    "secret": true
  }]
}
```

Секрет доступен только Worker. Не возвращайте его handler result, не сохраняйте
в storage/node attrs и не передавайте iframe. `api.network.fetch` намеренно
запрещает `Authorization` и cookies, поэтому секрет нельзя использовать как
произвольный credential header этого broker. Проектируйте интеграцию вокруг
поддержанного server authentication flow.

## Binary assets

Asset store content-addressed: ID равен SHA-256 содержимого, одинаковые bytes
дедуплицируются.

```ts
const assetId = await api.assets.write(smallBase64)
const sameId = await api.assets.upload(largeBase64)

const dataBase64 = await api.assets.read(assetId)
const imageUrl = await api.assets.url(assetId)

await api.assets.delete(assetId)
```

Файлы:

```text
<workspace>/.nevo/plugin-assets/<pluginId>/<assetId>
```

### Когда какой method

| Method | Назначение | Лимит |
| --- | --- | --- |
| `write()` | Маленький single-shot payload | 512 KiB raw bytes |
| `upload()` | Автоматический chunked upload | 8 MiB assembled |
| `read()` | Получить base64 через Worker channel | Только asset до 512 KiB |
| `url()` | Отобразить large image во frame | До 8 MiB |
| `delete()` | Удалить asset текущего plugin | — |

Общая квота — 64 MiB на plugin, одновременно можно вести до восьми chunked
uploads. При ошибке `upload()` SDK abort-ит staging file.

В editor node храните только `assetId`:

```ts
return transaction(editor.revision, [{
  type: 'insertNode',
  nodeType: 'acme_image',
  attrs: {
    assetId,
    alt: 'Generated chart',
  },
  at: 'selection.from',
}])
```

`api.assets.url()` выдаёт `nevoplugin-asset://` URL для `<img>` внутри Tier 2
frame. Host проверяет magic bytes и отдаёт только PNG, JPEG, GIF, WebP и AVIF.

## Network broker

Manifest объявляет hosts и methods:

```json
{
  "capabilities": ["network.fetch"],
  "network": {
    "hosts": ["api.example.com"],
    "methods": ["GET", "POST"]
  }
}
```

Request:

```ts
const response = await api.network.fetch({
  url: 'https://api.example.com/v1/items',
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-client-version': '1',
  },
  bodyBase64: btoa(JSON.stringify({
    query: 'Nevo',
  })),
})

if (response.status < 200 || response.status >= 300) {
  throw new Error(`Request failed with ${response.status}`)
}

const payload = JSON.parse(atob(response.bodyBase64)) as JsonValue
```

Response:

```ts
{
  status: number
  headers: Record<string, string>
  bodyBase64: string
}
```

Broker:

- принимает только credential-free HTTPS URL;
- проверяет method и каждый redirect против manifest;
- запрещает private, loopback, link-local и другие non-public IP;
- pin-ит проверенные DNS addresses, закрывая DNS rebinding window;
- допускает до пяти redirects;
- ограничивает request/response body 5 MiB;
- имеет connect timeout 10 секунд и общий timeout 30 секунд;
- не использует browser cookies или credential store.

Запрещены `authorization`, `cookie`, `host`, `content-length`, proxy/connection
headers и browser-owned `sec-*`. Wildcard host `*.example.com` разрешает
subdomains, но не apex `example.com`.

## Scheduling

Глобальные `setTimeout` и `setInterval` внутри Worker отозваны. Используйте:

```ts
const scheduleId = await api.scheduling.setInterval(
  async (input, { signal }) => {
    if (signal.aborted) return null

    const event = input as {
      scheduleId: string
      scheduledAt: string
    }
    await api.storage.local.set('lastTick', event.scheduledAt)
    return null
  },
  60_000,
)

await api.scheduling.clear(scheduleId)
```

Правила:

- delay/interval: от 100 ms до 24 часов;
- до 32 активных schedules на plugin;
- schedule принадлежит текущей host session;
- schedules очищаются при deactivate/dispose;
- это не durable jobs: после restart их нужно зарегистрировать заново.

Регистрируйте recurring work в `activate()`, если оно не зависит от
registration descriptors, и сохраняйте schedule ID только в памяти Worker.

## Workspace commands

`api.workspace.invoke()` не является произвольным Tauri invoke. Host разрешает
только фиксированный список:

| Command ID | Capability |
| --- | --- |
| `template_list` | `template.read` |
| `template_get` | `template.read` |
| `template_create` | `template.write` |
| `template_update` | `template.write` |
| `template_delete` | `template.write` |
| `template_create_note` | `template.write` |
| `kanban_list_boards` | `kanban.read` |
| `kanban_list_cards` | `kanban.read` |
| `kanban_create_board` | `kanban.write` |
| `kanban_update_board` | `kanban.write` |
| `kanban_delete_board` | `kanban.write` |
| `kanban_create_card` | `kanban.write` |
| `kanban_update_card` | `kanban.write` |
| `kanban_delete_card` | `kanban.write` |
| `kanban_move_card` | `kanban.write` |
| `kanban_save_board_schema` | `kanban.write` |

```ts
const boards = await api.workspace.invoke<JsonValue>(
  'kanban_list_boards',
  {},
)
```

Command name и аргументы должны совпадать с текущим host contract. Не формируйте
command ID из untrusted input.

Capabilities `workspace.*` и `note.*` зарезервированы для соответствующих domain
brokers, но текущий публичный `PluginSetupApi.workspace.invoke` не открывает
произвольные workspace/note commands. Наличие capability само по себе не создаёт
method, которого нет в SDK.

## Обработка broker errors

Broker rejection приходит как `Error`, а `error.name` содержит host error code,
если он доступен:

```ts
try {
  await api.storage.workspace.set('state', nextState)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  throw new Error(`Could not save plugin state: ${message}`)
}
```

Различайте ожидаемые состояния (`null`, missing setting, non-2xx status) и
ошибки capability/quota. Не делайте бесконечный retry внутри 5-second handler.
