# Plugin SDK V2 security model

Граница доверия проходит между Worker/iframe и host. Capabilities V2 — исполняемая
политика, а не подсказка UI. Trusted V1 исполняется в главном WebView и такой
границы не имеет.

Worker не имеет DOM, Tauri, filesystem, direct network/storage, nested workers,
broadcast channels или timers. Host и Worker проверяют versioned RPC, request
IDs, session token, JSON shape, message limits и timeouts. После crash Worker
перезапускается один раз; повторный crash помещает plugin в session quarantine,
не меняя persisted `enabled`.

Plugin code загружается через `nevoplugin` token, канонически привязанный к одному
plugin directory. Relative imports разрешены только внутри этого каталога.
`nevoasset` не используется для V2 code.

Host UI DSL допускает только безопасные элементы/атрибуты, attrs bindings и один
`contentSlot`. CSS всегда scoped и не может содержать raw external resources или
global selectors. Iframe не получает `allow-same-origin`, secrets, navigation,
popup или direct network.

Marketplace install/update использует prepared transaction root. Staged code
не видит установленный plugin directory, а commit повторно сверяет подтверждённый
permission fingerprint и версию установленного пакета. Plugin files,
`.nevo/plugin-data/<pluginId>.json`, `.nevo/plugin-registry.json` и затронутые
`.nevo/collab/*.yjs` имеют journaled backups. Незавершённый `committing` journal
откатывается при следующем marketplace-вызове; `committed` journal только
очищается. Перед staging live editor синхронно сохраняет Y.Doc и освобождает
старый Worker, исключая запись устаревшего состояния поверх миграции.

Rust network broker повторно проверяет установленный manifest, HTTPS host/method,
headers, DNS addresses и redirects. Проверенные адреса pin-ятся в HTTP client,
что закрывает окно DNS rebinding между проверкой и connect.
