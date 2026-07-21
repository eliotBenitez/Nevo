mod draw;
mod gc;
mod import;
mod naming;
mod remote;
mod store;

#[cfg(test)]
mod tests;

// Glob re-exports so each command's `#[tauri::command]`-generated helper items
// (e.g. `__cmd__import_image_asset`) are re-exported alongside the function —
// the parent `note` module re-exports these in turn, and Tauri's
// `generate_handler!` in lib.rs resolves them as siblings of `note::<command>`.
pub use draw::*;
pub use gc::*;
pub use import::*;
pub use remote::*;

use crate::commands::note::ImportedImageAsset;

/// Store raw bytes into the workspace assets directory, reusing the same
/// dedup/write path as `import_image_asset`. `store::store_asset_bytes` is
/// `pub(super)` (visible only within `assets`), so this wrapper re-exposes it
/// at `pub(super)` relative to `assets` — i.e. visible to `note` and all of
/// its descendants — for sibling modules such as `vault_import` that need the
/// same asset-store path without widening `store_asset_bytes` itself.
pub(super) fn store_workspace_asset(
    workspace_path: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<ImportedImageAsset, String> {
    store::store_asset_bytes(workspace_path, file_name, bytes)
}
