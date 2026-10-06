# Repository Guidelines

Answers to the user must be written in Russian. Code, identifiers, commit subjects, and `changes.md` entries remain in English.

## Instruction Scope and Working Agreement

- Follow the nearest `AGENTS.md` for the files being changed. A nested file extends or overrides this root file for its subtree.
- Inspect the current implementation, tests, and `git diff` before editing. Treat existing dirty-worktree changes as user-owned and do not rewrite or remove them.
- Keep changes inside the requested scope. Report unrelated defects separately instead of fixing them opportunistically.
- Prefer the smallest coherent change. Preserve public APIs, stored workspace data, serialized note content, and platform behavior unless the task explicitly requires a breaking change.
- For codebase questions, use the existing graphify knowledge graph first, then verify conclusions against the current source when necessary.

## Project Documentation Map

This file defines how to behave. These define how the system works — read the relevant one before designing a change, and update it when the behavior it describes changes.

| Question | Document |
| --- | --- |
| How does the app boot, where does state live, what owns what | `ARCHITECTURE.md` |
| What is persisted, in what shape, and how a migration is written | `docs/data-model.md` |
| How this repo is tested, which suites are load-bearing | `docs/testing.md` |
| Why the system is the way it is; what was removed and why | `docs/decisions/` |
| What shipped, when | `changes.md` |
| Plugin SDK, capabilities, sandbox security | `docs/plugins.md`, `docs/plugin-capabilities.md`, `docs/plugin-security.md`, `docs/plugin-sdk-v2-migration.md` |
| MCP bridge for external agents | `docs/mcp-bridge.md` |
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
7. Update the affected document from the map above when the change alters startup, layering, state ownership, a persisted schema, or a load-bearing test suite. A stale `ARCHITECTURE.md` or `docs/data-model.md` misleads every later agent.
8. Run `graphify update .` after source or project documentation changes.
9. Commit each completed task to the `dev` branch.
10. In the final response, list completed work, checks actually run, and any known failures or skipped checks.

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
- `src/editor-core/`: framework-isolated ProseMirror schema, commands, plugins, node views, serialization, and the sandboxed plugin host. Follow `src/editor-core/AGENTS.md`.
- `src/features/`: route and product features, including onboarding, graph, drawing, kanban, and databases.
- `src/stores/`: shared Pinia state. Do not place ProseMirror editor state here.
- On local workspaces, editor content lives in `note.json` (`content` + `canvas`), which is a note's sole source of truth. To change a node's attributes from outside the editor: while the note is open, dispatch a ProseMirror transaction on the live `EditorView` — mutating `noteStore.setContent` while the editor is mounted is ignored and clobbered on the next autosave; while the note is not open, go through `noteStore.setContent` followed by a save.
- `src/core/`: framework-agnostic services and workspace backend adapters.
- `src/composables/` and `src/app/composables/`: shared and app-scoped Vue composables.
- `src/tauri/`: typed frontend wrappers around Tauri commands.
- `src/locales/`: vue-i18n catalogs and locale consistency tests. Follow `src/locales/AGENTS.md`.
- `src/styles/`: design tokens and global/feature CSS.
- `src/ui/`: reusable primitives, animations, and UI composables. Follow `src/ui/AGENTS.md`.
- `src/utils/`: reusable runtime, export/import, editor-adjacent, and workspace utilities.
- `src-tauri/`: Tauri v2 Rust backend. Follow `src-tauri/AGENTS.md`.

Keep components and modules focused as a boundary decision made up front, not a later refactor (see "Design Before Implementation"). Extract substantial UI regions into their own components, move complex stateful logic into composables or framework-agnostic helpers, and keep Rust command modules split by domain. Do not grow an existing file past its concern; add a new unit instead.

## Removed Subsystems

These features were deliberately removed. Do not reintroduce them, and do not treat leftover references as a bug to "restore".

- **Collaboration and Yjs.** Removed in September 2026. `note.json` is a note's sole source of truth; there is no CRDT, no awareness/presence, and no collaboration server. Legitimate residue: `src/core/legacy-yjs/` (one-way migration of legacy `.yjs` files into `note.json`) and the `vendor-yjs` chunk rule in `vite.config.ts`. Treat any other Y.Doc mention as stale documentation to fix, not an API to call.
- **Cloud workspaces, shared storages, teams, and OAuth.** Removed in September 2026. Legitimate residue: `src/app/legacyCloudCleanup.ts`, a one-time best-effort cleanup of leftover local state, invoked fire-and-forget from `src/main.ts`.

Rationale and the full residue list for each: `docs/decisions/`. If a task genuinely requires one of these, say so and get explicit confirmation before designing it — it is a product decision, not an implementation detail.

## Design Source

`docs/design/nevo-reference.html` is the checked-in visual reference for the borderless UI (open it in a browser; theme and accent are switchable). Its design rules live in `docs/superpowers/specs/2026-09-22-solid-ui-redesign-design.md`. Use them together with `src/styles/tokens.css` and existing UI primitives; current application behavior and accessibility take precedence when the reference is stale. The old `Nevo.html` glass mockup is retired and git-ignored.

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
| `src/styles/**`, `src/ui/**`, visual Vue changes | Focused tests and a visual review of the real app for light/dark, relevant responsive sizes, and keyboard focus: Linux `pnpm qa` (Tauri/WebKitGTK; `.codex/skills/nevo-visual-qa`), Windows `.codex/skills/nevo-windows-qa` (Tauri/WebView2), Android phone/tablet `.codex/skills/nevo-android-qa` (Android WebView emulators) for mobile or touch changes; report platform-specific gaps separately |
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
- Changes to `src-tauri/src/commands`, `src-tauri/src/media_server`, capabilities, or `src/tauri` require explicit review of filesystem, network, and permission impact.
- Do not hand-edit generated capability schemas under `src-tauri/gen/schemas`.
- Treat mobile scaffolds under `src-tauri/gen/android` and `src-tauri/gen/apple` as platform projects: edit them only for an explicit mobile task and avoid generated build/cache subdirectories.
- Preserve backward compatibility for workspace manifests, persisted settings, note JSON, assets, and SQLite data. Add migrations instead of silently replacing incompatible data.

## Platform Gotchas

- Local note persistence must distinguish permission to save from the need for an initial save. A degraded or unparseable note must never be silently overwritten — a note.json that failed to parse cleanly still needs a first write once it is safely recovered, but an unchanged, successfully-loaded note must not trigger a spurious save. Test this through real editor setup and the navigation flush, not only the persistence helper.
- Tauri v2 synchronous commands run on the webview main thread. Make heavy commands `async` and offload blocking work with `tauri::async_runtime::spawn_blocking`.
- WebKitGTK (the Linux webview) renders `<foreignObject>` embedded in images as blank in relevant export paths. Prefer native SVG text/path content over canvas rasterization of HTML-in-SVG.
- WebKitGTK withholds clipboard `text/uri-list` payloads from JavaScript (`DataTransfer.getData` and `DataTransferItem.getAsString` return empty), and `navigator.clipboard.read()` rejects with `NotAllowedError`. For image/file paste, read the OS clipboard natively via `tauri-plugin-clipboard-manager` (`readImage`/`readText`) rather than the webview `DataTransfer`.
- Native HTML5 drag-and-drop is unreliable on WebKitGTK (lag, freeze, copy-instead-of-move). Implement in-app dragging with pointer events (`pointerdown`/`pointermove`/`pointerup`) instead of the HTML5 drag API.
- Gate desktop-only plugins and services with appropriate Tauri capabilities and Rust `cfg` attributes so Android/iOS builds do not reference unavailable desktop functionality.

## Git and Pull Requests

Commit every completed task to the `dev` branch. Use recent history when it clarifies conventions, but verify behavior against the current tree. Use short imperative commit subjects. Keep commits focused. PRs should include a summary, testing notes, linked issues when applicable, screenshots or recordings for UI changes, and explicit risk notes for filesystem, workspace data, export/import, plugin sandboxing, networking, permissions, or migrations.

## Codex Model Roles

Use this division of responsibilities for Codex work in this repository:

- **Orchestrator — GPT-6-Sol (`gpt-6-sol`)**: Own user communication, inspect the current tree, design module boundaries, define bounded implementation tasks and acceptance criteria, coordinate coding agents, and integrate their results.
- **Coder — GPT-6-Luna (`gpt-6-luna`)**: Delegate code implementation, refactoring, and regression-test changes to this model. Give each coding agent explicit file ownership, relevant repository instructions, the agreed design, and required checks. Coding agents must preserve unrelated work and report their scoped diff, checks run, and unresolved issues.
- **Verifier — GPT-6-Sol (`gpt-6-sol`)**: Review the actual final diff against the requirements and architectural boundaries, run the required verification checks, and assess correctness independently of the coder's report. Return defects to the Luna coder and verify the corrections before declaring completion.
- Set the model explicitly when spawning an agent; do not rely on inherited defaults. With the `collaboration.spawn_agent` tool, use `model: 'gpt-6-luna'` for coders and `model: 'gpt-6-sol'` for a separate orchestrator or verifier. When model overrides require a limited context fork, use `fork_turns: 'none'` or a supported turn count and provide the necessary context in the task message.
- Parallelize coding only for independent tasks with non-overlapping file ownership. The Sol orchestrator may also perform verification itself; a separate verifier agent is optional. Read-only answers and small documentation-only edits may be handled directly by Sol.
- These instructions define roles; they do not change the running session's model. Select `gpt-6-sol` in the Codex session configuration for the main agent. If the requested model or delegation capability is unavailable, disclose the limitation and obtain the user's choice before substituting another model.

## Agent Tooling

Several agent harnesses read this repository (`CLAUDE.md`, `GEMINI.md`, and `.codex/` all defer to this file). Only some of the tooling is versioned, so check what is actually present before relying on it.

**Versioned, available to everyone:** this file and the nested `AGENTS.md` files, `.codex/skills/` (the diff-scoped `nevo-verify-change` selector plus workflows for data safety, Plugin SDK evolution, MCP bridge changes, import/export round trips, visual QA, and mobile platform gates), `tools/visual-qa/` (`pnpm qa`: runs the real Tauri/WebKitGTK app in an isolated headless GNOME session and exposes screenshot, click, type, key, eval and resize commands to any agent through the shell), and the documents in the map above.

On Windows, `.codex/skills/nevo-windows-qa` uses
`tools/visual-qa/windows-session.ps1` and `windows-qa.mjs` for the same renderer
checks in a separate Tauri/WebView2 QA profile, without Linux desktop tools.
Viewport emulation does not test native OS window resizing or dialogs.

For Android, `.codex/skills/nevo-android-qa` uses `tools/visual-qa/android-qa.mjs`
to install a debug APK on the `nevo-phone` and `nevo-tablet` emulators and drive
the real Android WebView over adb-forwarded DevTools.

**Machine-local, not in git:** everything under `.claude/` and `.agents/` (ignored in `.gitignore`), and `graphify-out/`. On a machine that has them, `.claude/skills/` carries per-domain checklists for the high-fan-out changes — editor blocks, i18n keys, plugin capabilities, Tauri commands, releases, verification — plus the `nevo-executor` subagent and the `/delegate` and `/verify` commands.

Rules:

- Prefer an available skill over improvising a checklist; the fan-out it encodes (registration points, serializers, locales) is exactly what gets silently half-done otherwise.
- If a skill is not present on this machine, do not skip the work it covers. Fall back to this file's verification matrix and the relevant nested `AGENTS.md`, and say in the final report which checklist was unavailable.
- Never assume another agent's local configuration exists. Anything a task depends on must live in the repository or be stated in the task.
- Do not edit `.claude/settings.local.json`, generated capability schemas, or `graphify-out/` by hand.

## graphify

This project has a knowledge graph under `graphify-out/`.

- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path` for relationships, `graphify explain` for focused concepts, and `graphify affected "<symbol>"` for reverse impact analysis before a refactor or a signature change.
- `graphify-out/` is generated and git-ignored, so a fresh clone has no graph. If `graphify-out/graph.json` is missing, either build it once (`graphify extract .`, or the `/graphify` skill) or fall back to `ARCHITECTURE.md` plus ordinary search — do not block on it.
- Dirty graphify output is expected and is not a reason to skip it. Skip only when investigating stale/incorrect graph output or when the user explicitly opts out.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when scoped queries are insufficient; it is ~125 KB, so prefer `ARCHITECTURE.md` for orientation.
- The graph records the commit it was built from (see its "Graph Freshness" section). Compare it against `git rev-parse HEAD` before trusting a scoped result on recently changed code.
- After modifying source or project documentation, run `graphify update .`.
