# Quickstart and manifest

This page takes you from an empty folder to a loadable SDK V2 plugin bundle.
The resulting `dist/` folder contains `manifest.json` and one or more ES modules
that are accessible only inside the plugin directory.

## Requirements

- Node.js 20 or newer;
- pnpm;
- an installed Nevo with a local workspace;
- TypeScript is recommended, but the runtime accepts a built JavaScript ES
  module.

If you work inside the Nevo repository, ready-made examples are in
`packages/plugin-sdk/examples`, and the base template is in
`packages/plugin-sdk/templates/basic`.

## 1. Create a project

```sh
mkdir acme-hello
cd acme-hello
pnpm init
pnpm add -D @nevo/plugin-sdk@^2.0.0 typescript vite vitest
```

Minimal structure:

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

`public/manifest.json` is copied into `dist/` automatically, and Vite builds
`src/index.ts` into `dist/index.js`.

## 2. Configure the build

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

Do not mark `@nevo/plugin-sdk` as external: a bare import cannot be resolved
outside the plugin directory. The SDK must be included in the bundle.

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

## 3. Add a manifest

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

### Manifest fields

| Field | Required | Purpose |
| --- | --- | --- |
| `id` | Yes | Stable ID and directory name; safe characters `A-Z a-z 0-9 . _ -` |
| `name` | Yes | Display name |
| `version` | Yes | Package version |
| `description` | No | Description in marketplace/settings |
| `enabled` | Yes | Initial state |
| `kind` | Yes for marketplace | `marketplace`; other values are reserved for the host |
| `source` | Yes for marketplace | `marketplace` |
| `entryPoint` | Yes | Plugin-relative ES module, for example `index.js` |
| `apiVersion` | Yes | `2.0.0` for SDK V2 |
| `executionMode` | Yes | `sandboxed-worker` for SDK V2 |
| `dataVersion` | Yes | Persisted plugin data version, integer `>= 1` |
| `capabilities` | Yes | Single SDK V2 permission list |
| `network` | When using the network | Allowed HTTPS hosts and methods |
| `nevoVersionRange` | No | Exact version, `^major`, `*` or `latest` |
| `runtimes` | No | Where the plugin runs: any of `desktop`, `android`, `ios`. Omitted means all runtimes; on other runtimes the plugin is not loaded |
| `priority` | No | Load order; a higher value loads earlier |
| `settingsSchema` | No | Fields of the plugin settings UI |

The legacy fields `editorCapabilities`, `uiCapabilities` and
`workspaceCapabilities` are not a source of SDK V2 permissions.

### Network policy

`network` is allowed only together with `network.fetch`:

```json
{
  "capabilities": ["network.fetch"],
  "network": {
    "hosts": ["api.example.com", "*.cdn.example.com"],
    "methods": ["GET", "POST"]
  }
}
```

Specify a host without a scheme, port, path or query. The request must still use
HTTPS. The wildcard `*.example.com` does not match `example.com` itself; add both
values if you need both.

### Settings schema

Nevo builds the settings form from `settingsSchema`:

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

Supported types: `text`, `password`, `textarea`, `select`, `number`,
`checkbox`. For number, `min`, `max` and `step` are available; for select,
`options`.

A regular field is read through `api.settings.get()`. A field with
`secret: true` is stored in the secure store and read only through
`api.secrets.get()`. A secret cannot be obtained through `api.settings`.

## 4. Write the entry module

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

Export the definition as `default` or as a named `plugin`. `default` is simpler
and is used in all examples.

## 5. Build and check the bundle

```sh
pnpm build
pnpm conformance
```

Expected structure:

```text
dist/
├── index.js
└── manifest.json
```

The conformance CLI currently checks the module shape and the presence of
`setup`. Registrations, capabilities and runtime behavior are additionally
checked by the real host, so be sure to add unit tests and perform a manual
check.

## 6. Install a development build

For local testing, copy the contents of `dist/` into:

```text
<workspace>/.nevo/plugins/acme.hello/
├── index.js
└── manifest.json
```

The directory name must exactly match `manifest.id`. After copying, restart Nevo
or reopen the workspace, then check the plugin in Settings → Plugins.

Do not publish a development bundle as a trusted/folder V1 plugin. For the
marketplace, the package must keep `apiVersion: "2.0.0"` and
`executionMode: "sandboxed-worker"`.

## 7. Add the first unit test

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

Next step: [Contributions and lifecycle](./contributions.md).
