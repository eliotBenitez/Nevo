# @nevo/plugin-sdk

TypeScript SDK for sandboxed Nevo Plugin API V2.

Marketplace plugins run in an isolated Worker. They register JSON
contributions, receive immutable editor snapshots, return validated transaction
intents, and access privileged functionality only through capability-gated host
services.

## Install

```sh
pnpm add -D @nevo/plugin-sdk@^2.0.0 typescript vite vitest
```

Requirements: Node.js 20 or newer and an ES module build.

## Minimal plugin

`manifest.json`:

```json
{
  "id": "acme.hello",
  "name": "Hello",
  "version": "1.0.0",
  "description": "Adds an insertion command.",
  "enabled": true,
  "kind": "marketplace",
  "source": "marketplace",
  "entryPoint": "index.js",
  "apiVersion": "2.0.0",
  "executionMode": "sandboxed-worker",
  "dataVersion": 1,
  "capabilities": ["editor.write"],
  "settingsSchema": []
}
```

`src/index.ts`:

```ts
import { definePlugin, transaction } from '@nevo/plugin-sdk'

export default definePlugin({
  setup(api) {
    api.slashItem({
      id: `${api.pluginId}.hello`,
      title: 'Insert hello',
      category: 'text',
      keywords: ['hello'],
    }, (_input, { editor }) => {
      if (!editor) throw new Error('Editor snapshot is required')

      return transaction(editor.revision, [{
        type: 'insertText',
        text: 'Hello from Nevo',
        from: 'selection.from',
        to: 'selection.to',
      }], {
        scrollIntoView: true,
      })
    })
  },
})
```

Every contribution ID must be unique and namespaced under
`<manifest.id>.`.

## Build

Bundle the SDK into the plugin output. A sandboxed plugin cannot resolve a bare
package import outside its own directory.

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

Place `manifest.json` in Vite's `public/` directory so the output is:

```text
dist/
├── index.js
└── manifest.json
```

Then run:

```sh
pnpm build
pnpm exec nevo-plugin-conformance ./dist/index.js
```

The conformance CLI currently checks the module export shape. Nevo performs the
full manifest, capability, descriptor, sandbox, and transaction validation.

## Test

```ts
import { describe, expect, it } from 'vitest'
import { createTestPluginHost } from '@nevo/plugin-sdk/test-host'
import plugin from './index'

describe('acme.hello', () => {
  it('registers its slash item', async () => {
    const host = await createTestPluginHost(
      'acme.hello',
      plugin,
      ['editor.write'],
    )

    expect(host.contributions).toEqual([
      expect.objectContaining({
        kind: 'slashItem',
        id: 'acme.hello.hello',
      }),
    ])
  })
})
```

The test host runs `setup`, captures handlers, and provides in-memory JSON
storage. It does not emulate full Nevo capability enforcement, ProseMirror,
sanitizers, iframes, network, assets, lifecycle, or migrations.

## Main exports

| Export | Purpose |
| --- | --- |
| `definePlugin()` | Define setup, lifecycle, and migrations |
| `transaction()` | Build an atomic editor transaction intent |
| `operations` | Helpers for common editor operations |
| `ui` | Build host-owned declarative UI |
| `defineBlockView()` | Run the Tier 2 iframe-side bridge |
| Protocol types/constants | JSON, snapshot, capability, and contribution contracts |
| `@nevo/plugin-sdk/test-host` | Unit-test plugin setup and handlers |
| `nevo-plugin-conformance` | Validate a built module's export shape |

## Capabilities

Common permissions include:

- `editor.read`, `editor.write`, `editor.write.self`, `editor.schema`;
- `ui.contributions`, `ui.iframe`, `ui.blockFrame`;
- `settings.read/write`, `secrets.read`;
- `storage.local/workspace`, `assets.read/write`;
- `runtime.events`, `runtime.scheduling`, `network.fetch`;
- allow-listed template and kanban domain permissions.

Request only capabilities used by the plugin. Nevo re-checks them at the host
boundary, and permission changes require marketplace confirmation.

## Runtime limits

- 200 contributions;
- 1 MiB Worker protocol message;
- 256 KiB broker value;
- 5-second handler timeout;
- 10-second lifecycle/migration timeout;
- 100 editor operations per transaction intent;
- 5 MiB per JSON storage scope;
- 64 MiB per binary asset scope.

See the full documentation for method-specific limits.

## Documentation

- [Plugin SDK overview](https://github.com/eliotBenitez/Nevo/blob/main/docs/plugins.md)
- [Quick start and manifest](https://github.com/eliotBenitez/Nevo/blob/main/docs/plugin-sdk/quickstart.md)
- [Contributions and lifecycle](https://github.com/eliotBenitez/Nevo/blob/main/docs/plugin-sdk/contributions.md)
- [Editor transactions](https://github.com/eliotBenitez/Nevo/blob/main/docs/plugin-sdk/editor.md)
- [UI and custom blocks](https://github.com/eliotBenitez/Nevo/blob/main/docs/plugin-sdk/ui.md)
- [Host services](https://github.com/eliotBenitez/Nevo/blob/main/docs/plugin-sdk/services.md)
- [Testing and debugging](https://github.com/eliotBenitez/Nevo/blob/main/docs/plugin-sdk/testing.md)
- [Capabilities](https://github.com/eliotBenitez/Nevo/blob/main/docs/plugin-capabilities.md)
- [Security model](https://github.com/eliotBenitez/Nevo/blob/main/docs/plugin-security.md)
- [SDK V1 migration](https://github.com/eliotBenitez/Nevo/blob/main/docs/plugin-sdk-v2-migration.md)

Complete examples live in
[`packages/plugin-sdk/examples`](https://github.com/eliotBenitez/Nevo/tree/main/packages/plugin-sdk/examples).
