# Tauri Backend Guidelines

These rules apply to `src-tauri/**` in addition to the repository root instructions.

## Commands and IPC

- Keep commands grouped by domain and register every frontend-visible command in `src-tauri/src/lib.rs`.
- Decide the module split by domain up front, not as a later refactor (see the root "Design Before Implementation"). Give each `commands/<domain>` module and `mod.rs` a single responsibility, and separate the request/response types, filesystem/SQLite/archive/Typst IO, and pure domain logic into their own modules or free functions rather than one large handler file.
- Treat roughly **500 lines** in a `.rs` file as a trigger to stop and extract a submodule (`commands/<domain>/<subdomain>.rs`, or a `types`/`ops`/`io` split), not a cap to fill. A module approaching it at creation time means the domain boundary was drawn too wide — redraw it.
- Keep Rust command names, TypeScript wrappers in `src/tauri`, payload field casing, events, and response types in sync.
- Return actionable typed errors. Do not panic on user-controlled input, filesystem state, network responses, or malformed workspace data.
- Make heavy synchronous work asynchronous at the command boundary and use `tauri::async_runtime::spawn_blocking` for blocking filesystem, SQLite, archive, Typst, font, or CPU-heavy work.

## Filesystem, Data, and Security

- Treat every path and URL received over IPC as untrusted. Normalize and validate paths against the intended workspace or application-owned root before reading or writing.
- Use atomic writes for manifests, settings, and user-authored content where partial writes could corrupt a workspace.
- Preserve existing schema versions and serialized field names. Add idempotent migrations with legacy and failure-path tests.
- Avoid logging secrets, tokens, note contents, or sensitive absolute paths.
- Review capabilities whenever adding a plugin, command, protocol, filesystem scope, or network behavior. Grant the narrowest platform-specific permission.

## Platform Boundaries

- Gate desktop-only plugins, updater behavior, global shortcuts, local media services, and OS APIs with `cfg` and platform-scoped capabilities.
- Do not hand-edit `gen/schemas`. Edit Android or Apple scaffolds only for explicit mobile work; never edit their build caches or derived outputs.
- Keep Linux/WebKitGTK, Windows path/encoding, macOS sandbox/signing, and mobile scoped-storage differences in mind.

## Verification

- Run `cargo fmt --manifest-path src-tauri/Cargo.toml --check`.
- Run targeted Rust tests while iterating and `cargo test --manifest-path src-tauri/Cargo.toml` before completion when feasible.
- For IPC changes, also run affected frontend wrapper tests and verify registration in `lib.rs`.
- For filesystem, database, import/export, or migrations, add round-trip, legacy-data, invalid-input, and interrupted/failure-path coverage.
