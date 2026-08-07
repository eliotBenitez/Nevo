# Plugin SDK V2: capabilities

Capability — исполняемое разрешение. Оно одновременно:

1. объявляется в `manifest.capabilities`;
2. показывается пользователю при marketplace install/update;
3. проверяется при регистрации contribution;
4. повторно проверяется при каждом host broker call.

SDK V2 не читает legacy-массивы `editorCapabilities`, `uiCapabilities` и
`workspaceCapabilities` как источник разрешений.

## Editor

| Capability | Что разрешает | Не разрешает |
| --- | --- | --- |
| `editor.read` | `editor.doc` в snapshot; decorations; serializers | Direct `EditorState`, DOM или запись |
| `editor.write` | Commands, keymaps, slash/toolbar actions, importers и transaction intents | Direct ProseMirror transaction |
| `editor.write.self` | Tier 2 frame может patch attrs собственной node | Запись в другие nodes или selection |
| `editor.schema` | Schema nodes, marks и block types | Raw `NodeSpec` callbacks или NodeView DOM |

Пример editor command:

```json
{
  "capabilities": ["editor.write"]
}
```

Для custom block с чтением документа:

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

| Capability | Что разрешает |
| --- | --- |
| `ui.contributions` | Host-rendered popovers и sidebar items |
| `ui.iframe` | Sandboxed workspace views и modals |
| `ui.blockFrame` | Sandboxed iframe внутри content-less block |
| `ui.navigation` | Brokered in-app navigation, когда method опубликован host |

`workspace.view.register` и `workspace.navigation` существуют только для
trusted SDK V1. Не добавляйте их в новый V2 manifest.

Tier 2 interactive block обычно требует:

```json
{
  "capabilities": [
    "editor.schema",
    "ui.blockFrame",
    "editor.write.self"
  ]
}
```

Без `editor.write.self` frame рендерится read-only.

## Workspace domains

| Capability | Опубликованные операции |
| --- | --- |
| `template.read` | `template_list`, `template_get` |
| `template.write` | `template_create`, `template_update`, `template_delete`, `template_create_note` |
| `kanban.read` | `kanban_list_boards`, `kanban_list_cards` |
| `kanban.write` | Create/update/delete/move card/board и save board schema |
| `workspace.read/write` | Зарезервировано для workspace domain broker |
| `note.read/write` | Зарезервировано для note domain broker |

Текущий публичный `api.workspace.invoke()` открывает только allow-listed template
и kanban commands. Capability не позволяет вызвать произвольную Tauri command и
не создаёт SDK method, которого нет в `PluginSetupApi`.

## Settings, storage и secrets

| Capability | API | Scope |
| --- | --- | --- |
| `settings.read` | `api.settings.get()` | `.nevo/settings.json`, plugin namespace |
| `settings.write` | `api.settings.set()` | `.nevo/settings.json`, plugin namespace |
| `secrets.read` | `api.secrets.get()` | Secure store, только Worker |
| `storage.workspace` | `api.storage.workspace.*` | Synced workspace data |
| `storage.local` | `api.storage.local.*` | Unsynced app data |

`secret: true` в `settingsSchema` означает:

- UI сохраняет значение в secure store;
- `api.settings.get(key)` его не возвращает;
- Worker читает его через `api.secrets.get(key)`;
- iframe секрет не получает.

## Assets

| Capability | API |
| --- | --- |
| `assets.read` | `api.assets.read()`, `api.assets.url()` |
| `assets.write` | `api.assets.write()`, `upload()`, `delete()` |

Если плагин создаёт и затем показывает asset, нужны оба разрешения:

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

Глобальные Worker timers остаются отозванными даже при
`runtime.scheduling`: capability открывает только host-managed API с квотами и
автоматической очисткой.

## Network

`network.fetch` требует и capability, и policy:

```json
{
  "capabilities": ["network.fetch"],
  "network": {
    "hosts": ["api.example.com", "*.cdn.example.com"],
    "methods": ["GET", "POST"]
  }
}
```

Capability без `network` policy не даёт доступ ни к одному host. Policy без
capability отклоняется marketplace validation.

Разрешение применяется к `api.network.fetch()`, но не возвращает глобальный
`fetch` Worker и не открывает network iframe.

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

Handler может использовать дополнительные brokers, поэтому итоговый manifest
содержит union разрешений contribution и handler body.

## Минимальные наборы

### Locale-aware insertion command

```json
{
  "capabilities": ["editor.write"]
}
```

Snapshot всё равно содержит selection, schema names, `now`, `locale` и
`timeZone`; `editor.read` нужен только для `doc`.

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

## Permission fingerprint и updates

Marketplace fingerprint включает:

- execution mode;
- normalized capability set;
- normalized network hosts и methods.

Если fingerprint изменился, Nevo показывает новые permissions до staging.
Commit повторно сверяет fingerprint и installed version, поэтому update
отклоняется, если пакет или разрешения изменились, пока пользователь подтверждал
операцию или Worker выполнял migrations.

Удаление capability тоже меняет fingerprint. Это ожидаемо: manifest и
подтверждённая пользователем политика должны совпадать точно.

## Как выбирать capabilities

1. Начните с пустого списка.
2. Добавьте разрешение для каждой contribution по matrix.
3. Добавьте permissions только для реально вызываемых brokers.
4. Разделяйте read и write.
5. Не добавляйте зарезервированное разрешение «на будущее».
6. После refactor удаляйте неиспользуемые capabilities.
7. Проверяйте manifest в реальном Nevo: test host не enforce-ит полную matrix.

См. [host services](./plugin-sdk/services.md) для API и квот и
[security model](./plugin-security.md) для границы доверия.
