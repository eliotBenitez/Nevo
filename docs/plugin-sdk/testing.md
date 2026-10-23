# Testing and debugging

A reliable plugin is verified on three levels:

1. unit tests of pure helpers and handlers;
2. the SDK test host and the conformance bundle check;
3. the real Nevo host, which verifies capabilities, descriptors, the sandbox,
   editor transactions and platform UI.

## Unit test via the test host

`createTestPluginHost()` runs `setup`, collects contributions and lets you call
a registered handler.

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

## What the test host does

- runs `setup`;
- validates the contribution namespace;
- assigns handler IDs;
- limits registrations to 200;
- emulates workspace/local storage in memory;
- calls a handler with an editor snapshot and an `AbortSignal`.

## What the test host does not emulate

- full manifest validation and capability enforcement;
- the ProseMirror schema and applying a transaction intent;
- the UI DSL/CSS/SVG sanitizer;
- the iframe bridge;
- the settings, secrets, assets, network and workspace command brokers;
- lifecycle, timeout, restart, quarantine and migrations;
- persisted storage quotas.

So a passing unit test does not mean Nevo accepts the descriptor. For a
critical plugin, add an integration fixture or check the bundle in a
development workspace.

## Test pure logic separately

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

Test different locales/timezones, an empty selection, missing schema types,
missing settings, null storage, quota boundary inputs and an aborted signal.

## Conformance CLI

After the build:

```sh
pnpm build
pnpm exec nevo-plugin-conformance ./dist/index.js
```

The CLI imports the bundle and checks that the default or named `plugin` export
contains `setup`.

The current conformance check is deliberately minimal. It does not load the
manifest, does not verify the capability matrix and does not execute handlers.
Do not call it a "full sandbox check" in CI.

Recommended scripts:

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

## Manually installing a development bundle

Copy the contents of `dist/` into:

```text
<workspace>/.nevo/plugins/<pluginId>/
```

Check that:

1. the directory name matches `manifest.id`;
2. `manifest.entryPoint` exists inside the directory;
3. the plugin is enabled in Settings → Plugins;
4. the workspace was restarted after the manifest or bundle changed;
5. the contribution appears in the expected surface;
6. disable/re-enable does not corrupt saved nodes;
7. export works with the plugin both enabled and disabled.

For a schema/block plugin, create a separate disposable workspace and keep a
fixture note for each legacy data version.

## Manual UI matrix

For a visual contribution:

- light and dark theme;
- 100% and increased interface zoom;
- keyboard-only navigation;
- visible focus;
- empty, loading, error, readonly and large-data states;
- narrow and wide workspace;
- WebKitGTK/Linux and WebView2/Windows, if the feature depends on rendering;
- reduced motion;
- disabling the plugin with an already saved node.

Additionally for a Tier 2 frame:

- absence of `editor.write.self`;
- a stale frame after the node is deleted;
- a payload near 256 KiB;
- a Worker error during `invoke`;
- a large image via `nevoplugin-asset://`.

## Verifying persisted data

Schema names, attrs and content are part of the stored document contract. Test:

- a note created by a previous version;
- an update without a data migration;
- sequential migrations without skipping a version;
- rollback on exception;
- the missing/disabled plugin fallback;
- Markdown/HTML/Typst export;
- reinstalling after the code was removed.

A plugin node in a local workspace is stored in a disk-backed Y.Doc:

```text
<workspace>/.nevo/collab/<noteId>.yjs
```

`note.content` is only the seed of a new Y.Doc and is not the source of truth
for migrating an existing document.

## Common errors

### `Contribution id must be namespaced`

Use:

```ts
id: `${api.pluginId}.feature-name`
```

Do not hardcode someone else's namespace and do not use an ID without a dot
after the plugin ID.

### `Plugin ... requires capability ...`

A contribution or broker was called without the capability in
`manifest.capabilities`. See the [capability matrix](../plugin-capabilities.md).

### `descriptor.source must be a plugin-relative iframe entry`

`source` must look like `views/panel.html`, with no scheme, leading slash,
backslash or `..`.

### `route must stay inside ...`

A workspace route must start with:

```text
/workspace/plugin/<pluginId>
```

Query and hash are not supported.

### `Sandbox request timed out after 5000ms`

The handler did not finish within 5 seconds or blocked the event loop. Move
long-running work out of the user action, reduce the data, use the broker
timeout and check `signal.aborted`.

### Plugin quarantined

A fatal invocation is restarted once. A second fatal error disables the Worker
until the end of the session, but does not change the persisted `enabled`. Fix
the crash and restart the workspace.

### SVG is empty

The sanitizer may have removed `style`, `foreignObject`, an external link or an
event handler. Use native SVG elements and presentation attributes.

### `assets.read()` returns an error for a large file

The read channel is limited to 512 KiB. Get `api.assets.url()` and display the
asset in a frame.

### The unit test passes, but Nevo rejects the plugin

The test host does not perform full host validation. Run conformance, then
check the manifest, capability, descriptor and transaction in the real Nevo.

## Release checklist

- [ ] `pnpm test` passes.
- [ ] The production bundle builds with no bare imports outside the plugin
  directory.
- [ ] The conformance CLI accepts `dist/index.js`.
- [ ] Manifest ID, directory and contribution namespaces match.
- [ ] Capabilities are minimal and match all contributions/brokers.
- [ ] Network hosts/methods are listed completely, with no extra wildcards.
- [ ] Schema names and attrs were not renamed accidentally.
- [ ] Every sequential migration exists for the new `dataVersion`.
- [ ] Light/dark, keyboard and the disabled fallback are checked.
- [ ] Exporters/importers are checked against unsafe/large input.
- [ ] A marketplace update is checked against a legacy workspace copy.
