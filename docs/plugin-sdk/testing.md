# Тестирование и отладка

Надёжный plugin проверяется на трёх уровнях:

1. unit tests чистых helpers и handlers;
2. SDK test host и conformance bundle check;
3. реальный Nevo host, который проверяет capabilities, descriptors, sandbox,
   editor transactions и platform UI.

## Unit test через test host

`createTestPluginHost()` запускает `setup`, собирает contributions и позволяет
вызвать зарегистрированный handler.

```ts
import { describe, expect, it } from 'vitest'
import {
  type PluginEditorSnapshot,
  type TransactionIntent,
} from '@nevo/plugin-sdk'
import { createTestPluginHost } from '@nevo/plugin-sdk/test-host'
import plugin from '../src/index'

function editor(): PluginEditorSnapshot {
  return {
    revision: 7,
    selection: {
      from: 3,
      to: 8,
      empty: false,
      anchor: 3,
      head: 8,
    },
    schema: {
      nodes: ['doc', 'paragraph', 'text'],
      marks: ['strong'],
    },
    now: '2026-07-26T10:00:00.000Z',
    locale: 'ru-RU',
    timeZone: 'Europe/Moscow',
  }
}

describe('acme.hello', () => {
  it('replaces the selection with a greeting', async () => {
    const host = await createTestPluginHost(
      'acme.hello',
      plugin,
      ['editor.write'],
    )

    const command = host.contributions.find(
      contribution => contribution.id === 'acme.hello.greet',
    )
    expect(command?.kind).toBe('command')

    const result = await host.invoke(
      command?.handlerId ?? '',
      null,
      editor(),
    ) as TransactionIntent

    expect(result).toMatchObject({
      type: 'transaction',
      revision: 7,
      operations: [{
        type: 'insertText',
        from: 'selection.from',
        to: 'selection.to',
      }],
    })
  })
})
```

## Что умеет test host

- выполняет `setup`;
- проверяет contribution namespace;
- назначает handler IDs;
- ограничивает registrations числом 200;
- эмулирует workspace/local storage в памяти;
- вызывает handler с editor snapshot и `AbortSignal`.

## Что test host не эмулирует

- полный manifest validation и capability enforcement;
- ProseMirror schema и применение transaction intent;
- UI DSL/CSS/SVG sanitizer;
- iframe bridge;
- settings, secrets, assets, network и workspace command brokers;
- lifecycle, timeout, restart, quarantine и migrations;
- persisted storage quotas.

Поэтому passing unit test не означает, что descriptor принят Nevo. Для
критичного плагина добавляйте интеграционную fixture или проверяйте bundle в
development workspace.

## Тестируйте чистую логику отдельно

```ts
export function buildGreeting(
  now: string,
  locale: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone,
  }).format(new Date(now))
}
```

```ts
it('uses the host time zone', () => {
  expect(buildGreeting(
    '2026-07-26T21:30:00.000Z',
    'en-CA',
    'America/Vancouver',
  )).toBe('July 26, 2026')
})
```

Проверяйте разные locale/timezone, empty selection, missing schema types,
missing settings, null storage, quota boundary inputs и aborted signal.

## Conformance CLI

После сборки:

```sh
pnpm build
pnpm exec nevo-plugin-conformance ./dist/index.js
```

CLI импортирует bundle и проверяет, что default или named `plugin` export
содержит `setup`.

Текущий conformance check намеренно минимален. Он не загружает manifest, не
проверяет capability matrix и не исполняет handlers. Не называйте его
«полной sandbox проверкой» в CI.

Рекомендуемый script:

```json
{
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "conformance": "nevo-plugin-conformance ./dist/index.js",
    "check": "pnpm test && pnpm build && pnpm conformance"
  }
}
```

## Ручная установка development bundle

Скопируйте содержимое `dist/` в:

```text
<workspace>/.nevo/plugins/<pluginId>/
```

Проверьте:

1. имя каталога совпадает с `manifest.id`;
2. `manifest.entryPoint` существует внутри каталога;
3. плагин enabled в Settings → Plugins;
4. после изменения manifest или bundle workspace перезапущен;
5. contribution появляется в ожидаемом surface;
6. disable/re-enable не повреждает сохранённые nodes;
7. export работает с enabled и disabled plugin.

Для schema/block plugin создайте отдельный disposable workspace и оставьте
fixture note с каждой legacy data version.

## Manual UI matrix

Для visual contribution:

- light и dark theme;
- 100% и увеличенный interface zoom;
- keyboard-only navigation;
- visible focus;
- empty, loading, error, readonly и large-data states;
- narrow и wide workspace;
- WebKitGTK/Linux и WebView2/Windows, если feature зависит от rendering;
- reduce motion;
- disable plugin с уже сохранённой node.

Для Tier 2 frame дополнительно:

- отсутствие `editor.write.self`;
- stale frame после node delete;
- payload около 256 KiB;
- Worker error во время `invoke`;
- large image через `nevoplugin-asset://`.

## Проверка persisted data

Schema names, attrs и content — часть stored document contract. Тестируйте:

- note, созданную предыдущей версией;
- update без data migration;
- последовательные migrations без пропуска версии;
- rollback при exception;
- missing/disabled plugin fallback;
- Markdown/HTML/Typst export;
- повторную установку после удаления кода.

Плагинная нода в local workspace хранится в disk-backed Y.Doc:

```text
<workspace>/.nevo/collab/<noteId>.yjs
```

`note.content` — только seed нового Y.Doc и не является источником истины для
миграции существующего документа.

## Типичные ошибки

### `Contribution id must be namespaced`

Используйте:

```ts
id: `${api.pluginId}.feature-name`
```

Не хардкодьте чужой namespace и не используйте ID без точки после plugin ID.

### `Plugin ... requires capability ...`

Contribution или broker вызван без capability в `manifest.capabilities`.
Смотрите [capability matrix](../plugin-capabilities.md).

### `descriptor.source must be a plugin-relative iframe entry`

`source` должен быть вроде `views/panel.html`, без scheme, ведущего slash,
backslash и `..`.

### `route must stay inside ...`

Workspace route должен начинаться с:

```text
/workspace/plugin/<pluginId>
```

Query и hash не поддерживаются.

### `Sandbox request timed out after 5000ms`

Handler не уложился в 5 секунд или заблокировал event loop. Вынесите долгую
работу из user action, уменьшите данные, используйте broker timeout и проверяйте
`signal.aborted`.

### Плагин quarantined

Fatal invocation перезапускается один раз. Второй fatal error отключает Worker
до конца session, но не меняет persisted `enabled`. Исправьте crash и
перезапустите workspace.

### SVG пустой

Sanitizer мог удалить `style`, `foreignObject`, external link или event handler.
Используйте native SVG elements и presentation attributes.

### `assets.read()` возвращает ошибку для большого файла

Read channel ограничен 512 KiB. Получите `api.assets.url()` и отображайте asset
во frame.

### Unit test проходит, а Nevo отклоняет плагин

Test host не выполняет полный host validation. Запустите conformance, затем
проверьте manifest, capability, descriptor и transaction в реальном Nevo.

## Release checklist

- [ ] `pnpm test` проходит.
- [ ] Production bundle собирается без bare imports за пределы plugin directory.
- [ ] Conformance CLI принимает `dist/index.js`.
- [ ] Manifest ID, directory и contribution namespaces совпадают.
- [ ] Capabilities минимальны и соответствуют всем contributions/brokers.
- [ ] Network hosts/methods перечислены полностью, без лишних wildcard.
- [ ] Schema names и attrs не переименованы случайно.
- [ ] Для нового `dataVersion` есть каждый последовательный migration.
- [ ] Light/dark, keyboard и disabled fallback проверены.
- [ ] Exporters/importers проверены на unsafe/large input.
- [ ] Marketplace update проверен на legacy workspace copy.
