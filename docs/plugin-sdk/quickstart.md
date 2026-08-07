# Быстрый старт и manifest

Эта страница проводит от пустой папки до загружаемого SDK V2 plugin bundle.
Итоговая папка `dist/` содержит `manifest.json` и один или несколько ES modules,
доступных только внутри каталога плагина.

## Требования

- Node.js 20 или новее;
- pnpm;
- установленный Nevo с локальным workspace;
- TypeScript рекомендуется, но runtime принимает собранный JavaScript ES module.

Если вы работаете внутри репозитория Nevo, готовые примеры находятся в
`packages/plugin-sdk/examples`, а базовый шаблон — в
`packages/plugin-sdk/templates/basic`.

## 1. Создайте проект

```sh
mkdir acme-hello
cd acme-hello
pnpm init
pnpm add -D @nevo/plugin-sdk@^2.0.0 typescript vite vitest
```

Минимальная структура:

```text
acme-hello/
├── package.json
├── public/
│   └── manifest.json
├── src/
│   └── index.ts
├── test/
│   └── index.test.ts
├── tsconfig.json
└── vite.config.ts
```

`public/manifest.json` автоматически попадёт в `dist/`, а Vite соберёт
`src/index.ts` в `dist/index.js`.

## 2. Настройте сборку

`package.json`:

```json
{
  "name": "acme-hello",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "test": "vitest run",
    "conformance": "nevo-plugin-conformance ./dist/index.js"
  },
  "devDependencies": {
    "@nevo/plugin-sdk": "^2.0.0",
    "typescript": "~5.6.2",
    "vite": "^6.0.0",
    "vitest": "^4.0.0"
  }
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
  },
})
```

Не помечайте `@nevo/plugin-sdk` как external: bare import нельзя разрешить за
пределами plugin directory. SDK должен попасть в bundle.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

## 3. Добавьте manifest

`public/manifest.json`:

```json
{
  "id": "acme.hello",
  "name": "Hello",
  "version": "1.0.0",
  "description": "Adds a locale-aware greeting command.",
  "enabled": true,
  "kind": "marketplace",
  "source": "marketplace",
  "entryPoint": "index.js",
  "apiVersion": "2.0.0",
  "executionMode": "sandboxed-worker",
  "dataVersion": 1,
  "capabilities": ["editor.write"],
  "nevoVersionRange": "^1.0.0",
  "settingsSchema": []
}
```

### Поля manifest

| Поле | Обязательно | Назначение |
| --- | --- | --- |
| `id` | Да | Стабильный ID и имя каталога; безопасные символы `A-Z a-z 0-9 . _ -` |
| `name` | Да | Отображаемое имя |
| `version` | Да | Версия пакета |
| `description` | Нет | Описание в marketplace/settings |
| `enabled` | Да | Начальное состояние |
| `kind` | Да для marketplace | `marketplace`; другие значения зарезервированы для host |
| `source` | Да для marketplace | `marketplace` |
| `entryPoint` | Да | Plugin-relative ES module, например `index.js` |
| `apiVersion` | Да | Для SDK V2 — `2.0.0` |
| `executionMode` | Да | Для SDK V2 — `sandboxed-worker` |
| `dataVersion` | Да | Версия persisted plugin data, целое `>= 1` |
| `capabilities` | Да | Единый список разрешений SDK V2 |
| `network` | При использовании сети | Разрешённые HTTPS hosts и methods |
| `nevoVersionRange` | Нет | Точная версия, `^major`, `*` или `latest` |
| `priority` | Нет | Порядок загрузки; большее значение загружается раньше |
| `settingsSchema` | Нет | Поля UI настроек плагина |

Legacy-поля `editorCapabilities`, `uiCapabilities` и
`workspaceCapabilities` не являются источником разрешений SDK V2.

### Network policy

`network` разрешён только вместе с `network.fetch`:

```json
{
  "capabilities": ["network.fetch"],
  "network": {
    "hosts": ["api.example.com", "*.cdn.example.com"],
    "methods": ["GET", "POST"]
  }
}
```

Указывайте host без scheme, port, path или query. Запрос всё равно должен
использовать HTTPS. Wildcard `*.example.com` не означает сам `example.com`;
добавьте оба значения, если нужны оба.

### Settings schema

Nevo строит форму настроек из `settingsSchema`:

```json
{
  "capabilities": ["settings.read", "secrets.read"],
  "settingsSchema": [
    {
      "key": "format",
      "type": "select",
      "label": "Date format",
      "default": "long",
      "options": [
        { "value": "short", "label": "Short" },
        { "value": "long", "label": "Long" }
      ]
    },
    {
      "key": "apiToken",
      "type": "password",
      "label": "API token",
      "description": "Stored in the secure store.",
      "secret": true
    }
  ]
}
```

Поддерживаемые types: `text`, `password`, `textarea`, `select`, `number`,
`checkbox`. Для number доступны `min`, `max`, `step`; для select — `options`.

Обычное поле читается через `api.settings.get()`. Поле с `secret: true` хранится
в secure store и читается только через `api.secrets.get()`. Секрет нельзя
получить через `api.settings`.

## 4. Напишите entry module

`src/index.ts`:

```ts
import { definePlugin, transaction } from '@nevo/plugin-sdk'

export default definePlugin({
  setup(api) {
    api.command({
      id: `${api.pluginId}.greet`,
      title: 'Insert greeting',
    }, (_input, { editor }) => {
      if (!editor) throw new Error('Editor snapshot is required')

      const greeting = new Intl.DateTimeFormat(editor.locale, {
        dateStyle: 'long',
        timeZone: editor.timeZone,
      }).format(new Date(editor.now))

      return transaction(editor.revision, [{
        type: 'insertText',
        text: `Hello — ${greeting}`,
        from: 'selection.from',
        to: 'selection.to',
      }])
    })
  },
})
```

Экспортируйте definition как `default` или именованный `plugin`. `default`
проще и используется во всех примерах.

## 5. Соберите и проверьте bundle

```sh
pnpm build
pnpm conformance
```

Ожидаемая структура:

```text
dist/
├── index.js
└── manifest.json
```

Conformance CLI сейчас проверяет форму модуля и наличие `setup`. Регистрации,
capabilities и runtime-поведение дополнительно проверяет реальный host, поэтому
обязательно добавьте unit tests и выполните ручную проверку.

## 6. Установите development build

Для локальной проверки скопируйте содержимое `dist/` в:

```text
<workspace>/.nevo/plugins/acme.hello/
├── index.js
└── manifest.json
```

Имя каталога должно точно совпадать с `manifest.id`. После копирования
перезапустите Nevo или заново откройте workspace, затем проверьте плагин в
Settings → Plugins.

Не публикуйте development bundle как trusted/folder V1 plugin. Для marketplace
package должен сохранять `apiVersion: "2.0.0"` и
`executionMode: "sandboxed-worker"`.

## 7. Добавьте первый unit test

`test/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createTestPluginHost } from '@nevo/plugin-sdk/test-host'
import plugin from '../src/index'

describe('acme.hello', () => {
  it('registers the greeting command', async () => {
    const host = await createTestPluginHost(
      'acme.hello',
      plugin,
      ['editor.write'],
    )

    expect(host.contributions).toEqual([
      expect.objectContaining({
        kind: 'command',
        id: 'acme.hello.greet',
      }),
    ])
  })
})
```

Следующий шаг: [Contributions и lifecycle](./contributions.md).
