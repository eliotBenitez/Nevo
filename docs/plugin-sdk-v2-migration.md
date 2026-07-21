# Migration from trusted SDK V1 to SDK V2

V2 не совместим с исходным кодом V1. Перенесите императивные registrations в
`definePlugin({ setup })`, функции оставьте Worker handlers, а изменения
документа выражайте transaction intents.

1. Установите `@nevo/plugin-sdk` 2.0.
2. Замените split capability arrays на `capabilities`, добавьте `dataVersion`.
3. Замените `onRegister(ctx)` на `setup(api)`.
4. Замените ProseMirror commands на handler, возвращающий `transaction(...)`.
5. Замените `NodeSpec` callbacks/NodeView DOM на schema descriptor и host UI DSL.
6. Перенесите filesystem/network/storage в соответствующий broker.
7. Добавьте serializers/importers как Worker handlers.
8. Запустите conformance CLI и проверки legacy data.

Schema node names и attrs — persisted API. Не переименовывайте их при миграции.
Например, migrated Callout сохраняет `callout_block`, `variant`, `icon` и
`block+` children. Миграция `dataVersion` нужна только для реального изменения
данных, а не для смены runtime.

Trusted V1 остаётся доступным уже установленным и bundled/folder plugins, но
новая marketplace-публикация обязана быть V2.

`migrations` индексируются целевой версией данных и выполняются последовательно
в том же изолированном Worker. Каждый handler получает `fromDataVersion`,
snapshot plugin storage и сериализованные plugin nodes и обязан вернуть
следующий `dataVersion`, storage и полный массив nodes. Пропущенный шаг,
невалидный JSON или несовпадающая версия отклоняют миграцию.

Marketplace update выполняется как двухфазная транзакция. Host сначала
скачивает пакет в отдельный staging-каталог, повторно проверяет permission
fingerprint, запускает Worker только через временный `nevoplugin` session и
валидирует все contributions. Перед чтением данных активный редактор
дожидается сохранения своего Y.Doc и останавливается.

Миграция читает реальные `.nevo/collab/<noteId>.yjs`, а не `note.content`.
Из каждого документа извлекаются ноды зарегистрированных типов; результат
проверяется новой ProseMirror schema на копиях. Только после успешной проверки
всех заметок Rust журналирует резервные копии plugin directory, workspace
storage, registry и затронутых Y.Doc и атомарно публикует их. Ошибка, crash до
финальной отметки commit или несовпадение fingerprint/installed version
восстанавливает прежние файлы и данные.
