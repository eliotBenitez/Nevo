# Repository Guidelines
Answers must be written in Russian

## Ui Design File
- `Nevo.html`

## Change Log Maintenance (changes.md)

After successfully completing any task, applying fixes, or implementing new features, you must document your actions in the `changes.md` file located at the root of the project.

### Rules for updating changes.md:
1. **Language Requirement:** All entries in `changes.md` must be written in **English** (на английском языке).
2. **Preserve History:** **DO NOT** overwrite, clear, or replace the existing history. All previous entries must remain untouched.
3. **Structure & Sections:** The file must be structured into three main sections separated by `---` dividers:
   - `## 🆕 Added` (for new features, grouped under `### Feature Name` headers if there are multiple items, using `* **Detail**: Description` format)
   - `## 🛠️ Fixed` (for bug fixes, using `* **Component/Detail**: Description` format)
   - `## 🔄 Updated / Improved` (for refactoring and improvements, using `* **Component/Detail**: Description` format, nesting is allowed)
4. **Insertion Rule:** New entries must be added at the top of their respective section (or subsection under `## 🆕 Added`), keeping the rest of the file intact.
5. **Grammar & Tone:** Keep the descriptions concise, brief, and in the past tense (e.g., "Added...", "Fixed...", "Improved...", "Implemented...").

### Format Template:
## 🆕 Added

### [Feature Name]
* **[Detail]**: [Description of the implemented feature]

---

## 🛠️ Fixed

* **[Component/Area]**: [Description of the fixed bug]

---

## 🔄 Updated / Improved

* **[Component/Area]**: [Description of the improvement or refactoring]

## Project Structure & Module Organization
The active application lives in `src/`. Entry points are `src/main.ts`, `src/App.vue`, and `src/router/index.ts`. The workspace shell and most product UI are in `src/app`; route-level onboarding, graph, shared-storage, and kanban/database features are active modules under `src/features`. Shared Pinia state lives in `src/stores`, reusable composables in `src/composables` and `src/app/composables`, app search helpers in `src/app/search`, and typed domain models in `src/types`.

Keep ProseMirror implementation details isolated in `src/editor-core`: schema, commands, plugins, node views, serialization, collaboration adapters, and editor tests belong there rather than in Vue or Pinia. Tauri-facing TypeScript wrappers live in `src/tauri`. Localized strings are in `src/locales`, design tokens and global styles are in `src/styles`, UI primitives are in `src/ui/primitives`, and glass/backdrop components are in `src/ui/glass`.

The desktop backend is a Tauri v2 app in `src-tauri/`. Rust commands are grouped under `src-tauri/src/commands`, with larger domains split into `commands/note` and `commands/workspace`. Collaboration server code is in `src-tauri/src/collab`, the local media server is in `src-tauri/src/media_server`, and frontend-accessible command registration is wired from `src-tauri/src/lib.rs`.

## Directory Map
- `src/`: active Vue/TypeScript frontend.
- `src/app/`: workspace shell, core app components, settings UI, editor UI wrappers, and app-level composables.
- `src/app/components/editor/`: Vue components around editor controls, popovers, overlays, block handles, math, Mermaid, Vega, and link UI.
- `src/app/components/settings/`: settings modal panels and workspace settings groups.
- `src/app/search/`: app search settings, fuzzy search helpers, and searchable workspace items.
- `src/core/`: framework-agnostic core services, including workspace backend adapters and crypto helpers.
- `src/composables/`: shared Vue composables used outside a single app feature.
- `src/editor-core/`: ProseMirror schema, commands, plugins, node views, serialization, collaboration, slash menu, and editor tests.
- `src/features/`: active feature modules such as onboarding, graph, shared storage, and kanban/databases.
- `src/locales/`: `vue-i18n` locale JSON files and locale consistency tests.
- `src/router/`: Vue Router route definitions.
- `src/stores/`: Pinia stores for workspace, notes, tabs, theme, graph, kanban, auth, collab, and UI state.
- `src/styles/`: global CSS, design tokens, editor prose, primitives, settings, onboarding, graph, and app styles.
- `src/tauri/`: frontend TypeScript wrappers for Tauri commands, secure store, and media server helpers.
- `src/types/`: shared TypeScript domain types.
- `src/ui/`: reusable UI primitives, glass components, animations, and UI-specific composables.
- `src/utils/`: shared utilities for runtime, hotkeys, logging, templates, KaTeX, oEmbed, note history, import/export, and workspace settings.
- `src-tauri/`: Tauri v2 Rust backend, capabilities, icons, config, and generated schemas.
- `src-tauri/src/commands/`: Rust command modules exposed through Tauri invoke handlers.
- `src-tauri/src/commands/note/`: note CRUD, search, assets, trash, snapshots, export, and collaboration persistence commands.
- `src-tauri/src/commands/workspace/`: workspace manifests, settings, paths, plugins, and maintenance commands.
- `src-tauri/src/collab/`: local collaboration server implementation.
- `src-tauri/src/media_server/`: localhost media streaming server for local media playback.
- `public/`: static frontend assets copied by Vite.
- `docs/`: project documentation.
- `settings/`: checked-in reference screenshots/settings assets used by the project.
- `node_modules/`, `src-tauri/target/`, and other build/cache outputs: generated local artifacts; do not edit or commit.

## Build, Test, and Development Commands
Use `pnpm` because the repo includes `pnpm-lock.yaml`.

- `pnpm dev`: start the Vite frontend on port `1420` with a strict port.
- `pnpm tauri dev`: run the desktop app with the Tauri shell.
- `pnpm build`: run `vue-tsc --noEmit` and produce a production frontend bundle.
- `pnpm test`: start Vitest in watch mode.
- `pnpm test:run`: run the full frontend test suite once.
- `pnpm preview`: preview the production frontend bundle.
- `cargo test --manifest-path src-tauri/Cargo.toml`: run Rust unit tests when touching backend commands, logging, export, assets, or workspace settings.

## Coding Style & Naming Conventions
Follow the existing TypeScript and Vue style: 2-space indentation, single quotes, and semicolon-free statements. Prefer Vue Composition API with `<script setup lang="ts">`. Vue components use PascalCase file names such as `WorkspaceShell.vue`, `KanbanView.vue`, and `NvButton.vue`. Stores and composables use descriptive camelCase names such as `theme.ts`, `useNotePersistence.ts`, and `useEditorCore.ts`. Use comments in the code only when absolutely necessary, such as when dealing with highly complex implementation details.

Avoid concentrating all logic and markup in a single large file. Logically split the code into multiple components and files: extract large blocks of UI markup into subcomponents, and move complex business logic, computations, or state machines into helper composables (for Vue) or specialized modules/helpers (for TypeScript and Rust). This will prevent files from bloating in the future and make them easier to maintain and test.

Keep TypeScript strictness intact; `tsconfig.json` enables `strict`, `noUnusedLocals`, and `noUnusedParameters`. Avoid putting ProseMirror state into Pinia or Vue reactivity; keep editor state transitions inside `src/editor-core` and bridge them through focused composables/components. Rust code in `src-tauri` should follow standard `rustfmt` defaults and keep command modules focused by domain.

## UI, Styling, and Localization
Use the existing design-token system in `src/styles/tokens.css` and the global CSS files in `src/styles` before introducing new styling patterns. Prefer reusable primitives from `src/ui/primitives` for buttons, menus, toggles, inputs, popups, mini editors, and window controls. Keep feature-specific styling aligned with the existing app, editor, settings, onboarding, graph, and primitive style files.

All user-facing strings that participate in localization should go through `vue-i18n` and the JSON files in `src/locales`. When adding or changing localized UI, update both `en.json` and `ru.json` and keep `src/locales/locales.test.ts` passing.

## Testing Guidelines
Vitest runs in a `jsdom` environment with globals enabled from `vite.config.ts`. Tests are distributed across the codebase; keep new tests close to the code they cover using `*.test.ts`, or use `src/editor-core/__tests__` for editor-core behavior. Existing coverage includes editor serialization and commands, workspace shell/components, editor composables, search, stores, UI primitives, utils, kanban, graph focus behavior, localization, and Tauri TypeScript wrappers.

Add regression coverage for editor behavior, serialization, workspace persistence, export/import, kanban and graph data flows, localization shape, and Tauri-facing integration points when changing those areas. Run `pnpm test:run` before opening a PR; also run targeted `cargo test --manifest-path src-tauri/Cargo.toml` when Rust code changes.

## Commit & Pull Request Guidelines
Git history is not available in this checkout, so use short imperative commit subjects such as `Add note snapshot restore test`. Keep commits focused on one concern. PRs should include a clear summary, testing notes, linked issues, and screenshots or short recordings for UI changes. Call out any Tauri, filesystem, workspace data, export/import, collaboration, or migration-related risk explicitly.

## Security & Configuration Tips
Do not commit workspace data, generated artifacts, build outputs, logs, or secrets. Treat `src-tauri/target/` as generated output. Review changes touching `src-tauri/src/commands`, `src-tauri/src/collab`, `src-tauri/src/media_server`, and `src/tauri` carefully because they affect filesystem access, networking, local media serving, secure storage, and desktop capabilities.

## Platform Gotchas
- **Tauri v2 sync commands run on the webview main thread.** A synchronous `#[command] fn` that does heavy work (e.g. PDF/Typst compilation) blocks the UI. Make such commands `async` and offload the heavy part to `tauri::async_runtime::spawn_blocking`.
- **WebKitGTK (the Linux webview) renders `<foreignObject>`-in-image as blank** (canvas tainting), so rasterizing SVG that embeds HTML/foreignObject into PNG produces empty output on this platform. Convert such content to a native SVG path (e.g. `<text>`/`<path>` glyphs) instead of relying on canvas rasterization.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
