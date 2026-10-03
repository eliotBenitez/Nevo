# Editor Core Guidelines

These rules apply to `src/editor-core/**` in addition to the repository root instructions.

## Boundaries and State

- Keep this directory framework-agnostic. Do not import Vue, Pinia stores, or app components into editor-core.
- Express document changes as ProseMirror transactions and commands. Keep editor state out of Vue reactivity and Pinia.
- Bridge UI or persistence through typed options, callbacks, commands, and serialization boundaries.
- Decide the module split up front, not as a later refactor (see the root "Design Before Implementation"). Give each unit one concern: keep schema, commands/keymap, plugins, node views, and serializers in separate files, and put a node view's DOM/event/render logic in its own module instead of one large file. Treat roughly **500 lines** as a trigger to extract a submodule, not a cap to fill.
- Preserve undo/redo semantics (`prosemirror-history`). Do not create competing history paths.

## Schema and Serialization

- Treat persisted note JSON as a compatibility contract. New node attributes need safe defaults and legacy parse behavior.
- Keep schema parsing and DOM serialization deterministic. Sanitize or validate untrusted attributes before rendering them.
- When adding a node or mark, review schema registration, commands/keymap, slash menu, node views, JSON round-trip serialization, clipboard/DOM parsing, and all supported export serializers.
- Prefer explicit migrations or normalization for legacy content. Never discard unknown or invalid content silently when recovery is possible.

## Node Views and Plugins

- Resolve `getPos` defensively because a node view may already be detached.
- Clean up DOM listeners, observers, timers, Vue mounts, object URLs, and async work in `destroy`.
- Keep plugin keys stable and avoid duplicated plugin registration.
- Avoid dispatching transactions from stale async callbacks; re-check node identity and current position first.
- Trusted plugin `onActivate` receives the full registration context and may mutate shared registries, so activation order is observable. Only sandboxed plugins (whose contributions register at load time) may be activated in parallel; keep trusted activation sequential and after the sandbox batch.

## Verification

- Put focused tests beside the implementation or under `src/editor-core/__tests__`.
- Run the directly affected test file.
- Run `serialization.test.ts` for schema, parsing, or stored-content changes.
- Run `regression.test.ts` for command, selection, keymap, history, or node-view behavior changes.
