# Host services

A Worker has no direct storage, filesystem, network or timers. Instead,
`PluginSetupApi` provides brokers. Every call re-checks the capability from the
installed manifest and automatically adds the workspace/plugin namespace.

## Summary

| API | Capability | Scope |
| --- | --- | --- |
| `api.storage.workspace` | `storage.workspace` | Syncable workspace JSON |
| `api.storage.local` | `storage.local` | Local app-data JSON |
| `api.settings.get` | `settings.read` | Plugin settings in workspace settings |
| `api.settings.set` | `settings.write` | Plugin settings in workspace settings |
| `api.secrets.get` | `secrets.read` | The plugin's secure store namespace |
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

File:

```text
<workspace>/.nevo/plugin-data/<pluginId>.json
```

It belongs to the workspace, is included in backup/transfer and may be synced
together with the workspace.

### Local storage

```ts
await api.storage.local.set('cache', {
  etag: 'W/"123"',
  value: 'cached response',
})
```

The local scope is stored in app data with a workspace fingerprint and a plugin
namespace. It suits caches and machine-local preferences, but not data that
must move with the workspace.

### Storage limits

- key: `A-Z a-z 0-9 . _ -`, 1 to 160 characters;
- a single value: up to 256 KiB of serialized JSON;
- each scope: up to 5 MiB per plugin;
- a write atomically rewrites the plugin JSON file.

Do not use storage as a database for hundreds of chatty writes. Group related
values and avoid writing on every editor event.

## Settings and secrets

The settings UI is declared in the manifest. Regular fields:

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

A field with `secret: true` is stored separately:

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

A secret is available only to the Worker. Do not return it in a handler result,
store it in storage/node attrs or pass it to an iframe. `api.network.fetch`
deliberately forbids `Authorization` and cookies, so a secret cannot be used as
an arbitrary credential header of this broker. Design the integration around a
supported server authentication flow.

## Binary assets

The asset store is content-addressed: the ID equals the SHA-256 of the content,
and identical bytes are deduplicated.

```ts
const assetId = await api.assets.write(smallBase64)
const sameId = await api.assets.upload(largeBase64)

const dataBase64 = await api.assets.read(assetId)
const imageUrl = await api.assets.url(assetId)

await api.assets.delete(assetId)
```

Files:

```text
<workspace>/.nevo/plugin-assets/<pluginId>/<assetId>
```

### Which method to use

| Method | Purpose | Limit |
| --- | --- | --- |
| `write()` | A small single-shot payload | 512 KiB raw bytes |
| `upload()` | Automatic chunked upload | 8 MiB assembled |
| `read()` | Get base64 through the Worker channel | Only assets up to 512 KiB |
| `url()` | Display a large image in a frame | Up to 8 MiB |
| `delete()` | Delete an asset of the current plugin | — |

The total quota is 64 MiB per plugin, and up to eight chunked uploads can run
at once. If `upload()` fails, the SDK aborts the staging file.

In an editor node, store only the `assetId`:

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

`api.assets.url()` issues a `nevoplugin-asset://` URL for `<img>` inside a
Tier 2 frame. The host checks magic bytes and serves only PNG, JPEG, GIF, WebP
and AVIF.

## Network broker

The manifest declares hosts and methods:

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

The broker:

- accepts only credential-free HTTPS URLs;
- checks the method and every redirect against the manifest;
- forbids private, loopback, link-local and other non-public IPs;
- pins verified DNS addresses, closing the DNS rebinding window;
- allows up to five redirects;
- limits the request/response body to 5 MiB;
- has a 10-second connect timeout and a 30-second overall timeout;
- does not use browser cookies or a credential store.

`authorization`, `cookie`, `host`, `content-length`, proxy/connection headers
and browser-owned `sec-*` are forbidden. The wildcard host `*.example.com`
allows subdomains, but not the apex `example.com`.

## Scheduling

The global `setTimeout` and `setInterval` are revoked inside the Worker. Use:

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

Rules:

- delay/interval: from 100 ms to 24 hours;
- up to 32 active schedules per plugin;
- a schedule belongs to the current host session;
- schedules are cleared on deactivate/dispose;
- these are not durable jobs: they must be registered again after a restart.

Register recurring work in `activate()` if it does not depend on registration
descriptors, and keep the schedule ID only in Worker memory.

## Workspace commands

`api.workspace.invoke()` is not an arbitrary Tauri invoke. The host allows only
a fixed list:

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

The command name and arguments must match the current host contract. Do not
build a command ID from untrusted input.

The `workspace.*` and `note.*` capabilities are reserved for the corresponding
domain brokers, but the current public `PluginSetupApi.workspace.invoke` does
not expose arbitrary workspace/note commands. Having a capability does not by
itself create a method that does not exist in the SDK.

## Handling broker errors

A broker rejection arrives as an `Error`, and `error.name` contains the host
error code when available:

```ts
try {
  await api.storage.workspace.set('state', nextState)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  throw new Error(`Could not save plugin state: ${message}`)
}
```

Distinguish expected states (`null`, a missing setting, a non-2xx status) from
capability/quota errors. Do not retry endlessly inside a 5-second handler.
