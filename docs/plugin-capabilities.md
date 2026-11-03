# Plugin SDK V2: capabilities

A capability is an enforceable permission. It is simultaneously:

1. declared in `manifest.capabilities`;
2. shown to the user on marketplace install/update;
3. checked when a contribution is registered;
4. re-checked on every host broker call.

SDK V2 does not read the legacy `editorCapabilities`, `uiCapabilities`, and
`workspaceCapabilities` arrays as a source of permissions.

## Editor

| Capability | Allows | Does not allow |
| --- | --- | --- |
| `editor.read` | `editor.doc` in the snapshot; decorations; serializers | Direct `EditorState`, DOM, or writes |
| `editor.write` | Commands, keymaps, slash/toolbar actions, importers, and transaction intents | Direct ProseMirror transactions |
| `editor.write.self` | A Tier 2 frame can patch the attrs of its own node | Writing to other nodes or the selection |
| `editor.schema` | Schema nodes, marks, and block types | Raw `NodeSpec` callbacks or NodeView DOM |

Editor command example:

```json
{
  "capabilities": ["editor.write"]
}
```

For a custom block that reads the document:

```json
{
  "capabilities": [
    "editor.read",
    "editor.write",
    "editor.schema"
  ]
}
```

## UI

| Capability | Allows |
| --- | --- |
| `ui.contributions` | Host-rendered popovers and sidebar items |
| `ui.iframe` | Sandboxed workspace views and modals |
| `ui.blockFrame` | A sandboxed iframe inside a content-less block |
| `ui.navigation` | Brokered in-app navigation, when the method is published by the host |

`workspace.view.register` and `workspace.navigation` exist only for
trusted SDK V1. Do not add them to a new V2 manifest.

A Tier 2 interactive block usually requires:

```json
{
  "capabilities": [
    "editor.schema",
    "ui.blockFrame",
    "editor.write.self"
  ]
}
```

Without `editor.write.self`, the frame renders read-only.

## Workspace domains

| Capability | Published operations |
| --- | --- |
| `template.read` | `template_list`, `template_get` |
| `template.write` | `template_create`, `template_update`, `template_delete`, `template_create_note` |
| `kanban.read` | `kanban_list_boards`, `kanban_list_cards` |
| `kanban.write` | Create/update/delete/move card/board and save board schema |
| `workspace.read/write` | Reserved for the workspace domain broker |
| `note.read/write` | Reserved for the note domain broker |

The current public `api.workspace.invoke()` exposes only allow-listed template
and kanban commands. A capability does not allow calling an arbitrary Tauri
command and does not create an SDK method that is not in `PluginSetupApi`.

## Settings, storage, and secrets

| Capability | API | Scope |
| --- | --- | --- |
| `settings.read` | `api.settings.get()` | `.nevo/settings.json`, plugin namespace |
| `settings.write` | `api.settings.set()` | `.nevo/settings.json`, plugin namespace |
| `secrets.read` | `api.secrets.get()` | Secure store, Worker only |
| `storage.workspace` | `api.storage.workspace.*` | Synced workspace data |
| `storage.local` | `api.storage.local.*` | Unsynced app data |

`secret: true` in `settingsSchema` means:

- the UI saves the value to the secure store;
- `api.settings.get(key)` does not return it;
- the Worker reads it via `api.secrets.get(key)`;
- the iframe does not receive the secret.

## Assets

| Capability | API |
| --- | --- |
| `assets.read` | `api.assets.read()`, `api.assets.url()` |
| `assets.write` | `api.assets.write()`, `upload()`, `delete()` |

If a plugin creates and then displays an asset, both permissions are needed:

```json
{
  "capabilities": ["assets.read", "assets.write"]
}
```

## Runtime

| Capability | API |
| --- | --- |
| `runtime.events` | `api.onEditorEvent()` |
| `runtime.scheduling` | `api.scheduling.setTimeout/setInterval/clear` |

Global Worker timers stay revoked even with `runtime.scheduling`: the
capability opens only the host-managed API with quotas and automatic cleanup.

## Network

`network.fetch` requires both the capability and a policy:

```json
{
  "capabilities": ["network.fetch"],
  "network": {
    "hosts": ["api.example.com", "*.cdn.example.com"],
    "methods": ["GET", "POST"]
  }
}
```

A capability without a `network` policy grants access to no host. A policy
without the capability is rejected by marketplace validation.

The permission applies to `api.network.fetch()`, but does not restore the
Worker's global `fetch` and does not open network access for an iframe.

## Contribution matrix

| Contribution | Required capability |
| --- | --- |
| `command` | `editor.write` |
| `keymap` | `editor.write` |
| `slashItem` | `editor.write` |
| `toolbarAction` | `editor.write` |
| `schemaNode` | `editor.schema` |
| `schemaMark` | `editor.schema` |
| `blockType` | `editor.schema` |
| `blockType` with `frame` | `editor.schema` + `ui.blockFrame` |
| `popover` | `ui.contributions` |
| `decoration` | `editor.read` |
| `serializer` | `editor.read` |
| `importer` | `editor.write` |
| `workspaceView` | `ui.iframe` |
| `sidebarItem` | `ui.contributions` |
| `modal` | `ui.iframe` |
| `editorEvent` | `runtime.events` |

A handler may use additional brokers, so the final manifest contains the union
of the contribution and handler body permissions.

## Minimal sets

### Locale-aware insertion command

```json
{
  "capabilities": ["editor.write"]
}
```

The snapshot still contains the selection, schema names, `now`, `locale`, and
`timeZone`; `editor.read` is needed only for `doc`.

### Rich host-rendered block

```json
{
  "capabilities": [
    "editor.read",
    "editor.write",
    "editor.schema",
    "ui.contributions"
  ]
}
```

### Interactive network-backed block

```json
{
  "capabilities": [
    "editor.schema",
    "editor.write.self",
    "ui.blockFrame",
    "network.fetch",
    "storage.local"
  ],
  "network": {
    "hosts": ["api.example.com"],
    "methods": ["GET"]
  }
}
```

### Scheduled workspace sync

```json
{
  "capabilities": [
    "runtime.scheduling",
    "storage.workspace",
    "network.fetch"
  ],
  "network": {
    "hosts": ["sync.example.com"],
    "methods": ["GET", "POST"]
  }
}
```

## Permission fingerprint and updates

The marketplace fingerprint includes:

- execution mode;
- normalized capability set;
- normalized network hosts and methods.

If the fingerprint changed, Nevo shows the new permissions before staging.
Commit re-checks the fingerprint and installed version, so an update is
rejected if the package or permissions changed while the user was confirming
the operation or the Worker was running migrations.

Removing a capability also changes the fingerprint. This is expected: the
manifest and the user-confirmed policy must match exactly.

## How to choose capabilities

1. Start with an empty list.
2. Add a permission for each contribution according to the matrix.
3. Add permissions only for brokers that are actually called.
4. Separate read and write.
5. Do not add a reserved permission "for the future".
6. After a refactor, remove unused capabilities.
7. Check the manifest in a real Nevo: the test host does not enforce the full
   matrix.

See [host services](./plugin-sdk/services.md) for the API and quotas and the
[security model](./plugin-security.md) for the trust boundary.
