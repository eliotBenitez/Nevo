# Repository Guidelines

Answers to the user must be written in Russian. Code, identifiers, commit subjects, and `changes.md` entries remain in English.

## Instruction Scope and Working Agreement

- Follow the nearest `AGENTS.md` for the files being changed. A nested file extends or overrides this root file for its subtree.
- Inspect the current implementation, tests, and `git diff` before editing. Treat existing dirty-worktree changes as user-owned and do not rewrite or remove them.
- Keep changes inside the requested scope. Report unrelated defects separately instead of fixing them opportunistically.
- Prefer the smallest coherent change. Preserve public APIs, stored workspace data, serialized note content, and platform behavior unless the task explicitly requires a breaking change.
- For codebase questions, use the existing graphify knowledge graph first, then verify conclusions against the current source when necessary.

## Design Before Implementation

Decide the shape of the code before writing it. Decomposition and layering are design decisions, not post-hoc cleanup, and they are expected as part of the plan for any non-trivial task.

- **Decompose during planning, not cleanup.** Before writing code, decide the file/module/component breakdown and name each unit and its single responsibility. A monolithic first draft "to split later" is not acceptable; the split is part of the plan and part of the initial implementation.
- **One concern per file.** When a task spans multiple concerns — rendering, stateful logic, IO/serialization, framework-agnostic algorithms — separate them from the first commit along the existing boundaries: presentational component (`src/app`, `src/ui`) → composable (`src/composables`, `src/app/composables`) → framework-agnostic service/helper (`src/core`, `src/utils`) → shared state (`src/stores`). In Rust, split command handlers by domain under `src-tauri/src/commands/<domain>`.
- **Size is a design signal.** Treat roughly **500 lines** — for Vue/TS files and Rust modules alike — as a trigger to stop and extract, not a target to fill. This applies while authoring, not only in review. A new file already approaching 500 lines at creation time means the boundaries were drawn wrong; redesign them. The number is a prompt to reconsider boundaries, not a mechanical cap — one concern per file is the actual rule.
- **State ownership and data flow up front.** Before coding, state where each piece of state lives, who mutates it, and where side effects happen. Respect layering: components render, composables hold stateful UI logic, `src/core` and `src/utils` stay framework-agnostic, and `src/stores` holds shared state — never ProseMirror editor state (see `src/editor-core/AGENTS.md`). Cross boundaries only through typed props, callbacks, commands, and serialization edges.
- **Reuse before adding.** Search existing primitives, composables, and utils for a fit before introducing new units.

## Definition of Done

For implementation tasks:

1. Identify the affected architectural boundaries and existing tests, and name the concrete files, components, and composables the change will create or split, with the single responsibility of each (see "Design Before Implementation").
2. Implement the change without modifying unrelated user work.
3. Add or update regression coverage when behavior changes.
4. Run the checks required by the verification matrix below.
5. Review `git diff --check` and the final scoped diff.
6. Update `changes.md` only after the implementation is successfully verified.
7. Run `graphify update .` after source or project documentation changes.
8. In the final response, list completed work, checks actually run, and any known failures or skipped checks.

If the repository already has unrelated lint or test failures, do not expand the task to fix them. Run focused checks for changed files, state the baseline failure clearly, and ensure the change introduces no additional failure.

## Change Log Maintenance (`changes.md`)

Update `changes.md` for implemented product changes, bug fixes, refactors, user-facing documentation, or agent-workflow changes. Do not update it for read-only analysis, explanations, diagnostics, or abandoned work.

- Write entries in English, concisely, and in the past tense.
- Preserve existing history and keep exactly one top-level section of each kind: `## 🆕 Added`, `## 🛠️ Fixed`, and `## 🔄 Updated / Improved`.
- Insert new entries at the top of the matching section. Use `### Feature Name` under `Added` when grouping several related items.
- Use `* **Detail**: Description` for entries.

## Architecture and Module Boundaries

The active Vue/TypeScript application lives in `src/`. Entry points are `src/main.ts`, `src/App.vue`, and `src/router/index.ts`.

- `src/app/`: workspace shell, core product components, settings, editor wrappers, and app-level composables.
- `src/editor-core/`: framework-isolated ProseMirror schema, commands, plugins, node views, serialization, and collaboration. Follow `src/editor-core/AGENTS.md`.
- `src/features/`: route and product features, including onboarding, graph, drawing, shared storage, kanban, and databases.
- `src/stores/`: shared Pinia state. Do not place ProseMirror editor state here.
- On local workspaces, editor content lives in the disk-backed Y.Doc (`.nevo/collab/<noteId>.yjs`), not `note.content` — `note.content` only seeds a brand-new Y.Doc. To change a node's attributes from outside the editor, dispatch a ProseMirror transaction on the live `EditorView` (or patch the persisted Y.Doc directly); mutating `noteStore.setContent` is ignored by the editor and clobbered on re-serialization.
- `src/core/`: framework-agnostic services and workspace backend adapters.
- `src/composables/` and `src/app/composables/`: shared and app-scoped Vue composables.
- `src/tauri/`: typed frontend wrappers around Tauri commands.
- `src/locales/`: vue-i18n catalogs and locale consistency tests. Follow `src/locales/AGENTS.md`.
- `src/styles/`: design tokens and global/feature CSS.
- `src/ui/`: reusable primitives, glass components, animations, and UI composables. Follow `src/ui/AGENTS.md`.
- `src/utils/`: reusable runtime, export/import, editor-adjacent, and workspace utilities.
- `src-tauri/`: Tauri v2 Rust backend. Follow `src-tauri/AGENTS.md`.

Keep components and modules focused as a boundary decision made up front, not a later refactor (see "Design Before Implementation"). Extract substantial UI regions into their own components, move complex stateful logic into composables or framework-agnostic helpers, and keep Rust command modules split by domain. Do not grow an existing file past its concern; add a new unit instead.

## Design Source

`Nevo.html` is the checked-in visual reference. Use it together with `src/styles/tokens.css` and existing UI primitives; current application behavior and accessibility take precedence when the reference is stale.

## Build and Development Commands

Use `pnpm` because the repository includes `pnpm-lock.yaml`. CI uses Node 22 and pnpm 11.

- `pnpm dev`: start Vite on strict port `1420`.
- `pnpm tauri dev`: run the desktop application.
- `pnpm build`: run `vue-tsc --noEmit` and build the frontend.
- `pnpm lint`: lint the frontend tree.
- `pnpm test`: run Vitest in watch mode.
- `pnpm test:run`: run the frontend suite once.
- `pnpm exec vitest run <path>`: run focused frontend tests.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: check Rust formatting.
- `cargo test --manifest-path src-tauri/Cargo.toml`: run Rust tests.

## Verification Matrix

| Changed area | Required checks |
| --- | --- |
| Documentation or agent instructions only | `git diff --check` and direct content review |
| `src/**/*.ts`, `src/**/*.vue`, frontend config | Focused Vitest tests, ESLint on changed TS/Vue files, and `pnpm build` when types or public component contracts changed |
| `src/editor-core/**` | Relevant editor test plus `src/editor-core/__tests__/serialization.test.ts` and `regression.test.ts` when schema/serialization behavior is affected |
| `src/locales/**`, `src/i18n.ts`, locale types | `pnpm exec vitest run src/locales/locales.test.ts src/i18n.test.ts` |
| `src/styles/**`, `src/ui/**`, visual Vue changes | Focused tests and manual/automated visual review for light/dark, relevant responsive sizes, and keyboard focus |
| `src/tauri/**` | Relevant frontend wrapper tests; verify command names and payload casing against Rust |
| `src-tauri/**` | `cargo fmt --check` and targeted or full `cargo test` |
| Workspace manifests, SQLite, migrations, import/export | Round-trip, legacy-data, failure-path, and no-data-loss regression coverage |
| Cross-cutting or release-sensitive changes | `pnpm lint`, `pnpm test:run`, `pnpm build`, and Rust checks when applicable |

Use `.codex/skills/nevo-verify-change` when available to derive the check list from the current diff.

## Coding Style

Follow existing TypeScript and Vue style: 2-space indentation, single quotes, no semicolons, strict TypeScript, and `<script setup lang="ts">`. Use PascalCase for Vue components and descriptive camelCase for stores, composables, and helpers. Add comments only when they explain non-obvious constraints or failure modes.

Rust follows `rustfmt`. Avoid blocking async runtimes, unchecked path construction, panics in command handlers, and silent data-loss fallbacks.

## UI, Accessibility, and Localization

- Reuse `src/styles/tokens.css` and primitives from `src/ui/primitives` before adding new visual patterns.
- Preserve keyboard operation, visible focus, semantic labels, reduced-motion behavior, and usable touch targets.
- Route user-facing strings through vue-i18n.
- Treat `src/i18n.ts` as the source of truth for registered locales. Update every registered locale, preserve interpolation placeholders, and keep locale consistency tests passing.
- Check WebKitGTK behavior for rendering techniques not universally supported by embedded webviews.

## Security, Data, and Generated Files

- Never commit secrets, workspace data, logs, caches, build output, or `src-tauri/target/`.
- Treat filesystem paths, imported content, rendered HTML/SVG, URLs, and Tauri IPC payloads as untrusted input.
- Changes to `src-tauri/src/commands`, `src-tauri/src/collab`, `src-tauri/src/media_server`, capabilities, or `src/tauri` require explicit review of filesystem, network, and permission impact.
- Do not hand-edit generated capability schemas under `src-tauri/gen/schemas`.
- Treat mobile scaffolds under `src-tauri/gen/android` and `src-tauri/gen/apple` as platform projects: edit them only for an explicit mobile task and avoid generated build/cache subdirectories.
- Preserve backward compatibility for workspace manifests, persisted settings, note JSON, assets, and SQLite data. Add migrations instead of silently replacing incompatible data.

## Platform Gotchas

- Tauri v2 synchronous commands run on the webview main thread. Make heavy commands `async` and offload blocking work with `tauri::async_runtime::spawn_blocking`.
- WebKitGTK (the Linux webview) renders `<foreignObject>` embedded in images as blank in relevant export paths. Prefer native SVG text/path content over canvas rasterization of HTML-in-SVG.
- WebKitGTK withholds clipboard `text/uri-list` payloads from JavaScript (`DataTransfer.getData` and `DataTransferItem.getAsString` return empty), and `navigator.clipboard.read()` rejects with `NotAllowedError`. For image/file paste, read the OS clipboard natively via `tauri-plugin-clipboard-manager` (`readImage`/`readText`) rather than the webview `DataTransfer`.
- Native HTML5 drag-and-drop is unreliable on WebKitGTK (lag, freeze, copy-instead-of-move). Implement in-app dragging with pointer events (`pointerdown`/`pointermove`/`pointerup`) instead of the HTML5 drag API.
- Gate desktop-only plugins and services with appropriate Tauri capabilities and Rust `cfg` attributes so Android/iOS builds do not reference unavailable desktop functionality.

## Git and Pull Requests

Use recent history when it clarifies conventions, but verify behavior against the current tree. Use short imperative commit subjects. Keep commits focused. PRs should include a summary, testing notes, linked issues when applicable, screenshots or recordings for UI changes, and explicit risk notes for filesystem, workspace data, export/import, collaboration, networking, permissions, or migrations.

## graphify

This project has a knowledge graph under `graphify-out/`.

- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path` for relationships and `graphify explain` for focused concepts.
- Dirty graphify output is expected and is not a reason to skip it. Skip only when investigating stale/incorrect graph output or when the user explicitly opts out.
- Prefer `graphify-out/wiki/index.md` for broad navigation when it exists. Read `GRAPH_REPORT.md` only for broad architecture review or when scoped queries are insufficient.
- After modifying source or project documentation, run `graphify update .`.
