mod maintenance;
mod manifest;
mod marketplace;
mod paths;
mod plugin_sdk;
mod plugins;
mod settings;
mod types;

// `paths` is otherwise a private implementation detail of `workspace`;
// `settings_path` is re-exported so sibling command modules (e.g.
// `commands::note::snapshots`) can locate the settings file without
// duplicating its layout.
pub(crate) use paths::settings_path;

// Glob re-exports so each command's `#[tauri::command]`-generated helper items
// are re-exported as siblings of `workspace::<command>` (Tauri's
// `generate_handler!` in lib.rs resolves them that way), alongside the shared
// settings/manifest types referenced across the crate.
pub use maintenance::*;
pub use manifest::*;
pub use marketplace::*;
pub use plugin_sdk::*;
pub use plugins::*;
pub use settings::*;
pub use types::*;
