mod maintenance;
mod manifest;
mod marketplace;
mod paths;
mod plugin_sdk;
mod plugins;
mod settings;
mod types;

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
