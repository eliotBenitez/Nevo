# Plugin SDK V2 capability reference

| Capability | Разрешение |
| --- | --- |
| `editor.read` | Document JSON в invocation snapshot, serializers/decorations |
| `editor.write` | Commands, keymaps, actions, importers и transaction intents |
| `editor.schema` | Schema nodes/marks и block types |
| `ui.contributions` | Host-rendered popovers/sidebar/declarative UI |
| `ui.iframe` | Sandboxed workspace views и modals |
| `ui.navigation` | Brokered in-app navigation |
| `workspace.read/write` | Workspace domain brokers |
| `note.read/write` | Note domain brokers |
| `template.read/write` | Allow-listed template commands |
| `kanban.read/write` | Allow-listed kanban commands |
| `settings.read/write` | Plugin settings namespace |
| `secrets.read` | Plugin secure-store namespace; Worker only |
| `storage.local` | Unsynced workspace/plugin local storage |
| `storage.workspace` | Synced workspace/plugin storage |
| `runtime.events` | Editor/runtime event handlers |
| `runtime.scheduling` | Host-managed `setTimeout`/`setInterval` через `api.scheduling`; прямые Worker timers остаются отозванными |
| `network.fetch` | Rust HTTPS broker constrained by manifest `network` |

Marketplace fingerprint включает execution mode, capability set и network
policy. Install/update commit отклоняется, если fingerprint
изменился после подтверждения. Расширение permissions показывается до staging;
commit также отклоняет транзакцию, если установленная версия изменилась, пока
пользователь подтверждал разрешения или Worker проверял migrations.
