//! Workspace-local SQLite index (`.nevo/notes.sqlite`) of note metadata
//! (title, folder, type, status, date, tags), separate from the note
//! documents themselves (`notes/note-<id>.nevo`) and from the database-block
//! store (`database.rs`'s `.nevo/databases.sqlite`).
//!
//! Lets the app answer "which notes have tag X / status Y / are under folder
//! Z" without walking every `.nevo` file, while the note files on disk (and
//! the workspace manifest) remain the source of truth — this index is a
//! derived, rebuildable cache. See `index::reindex_all` for the full
//! backfill and `query::query_notes` for the lazy-backfill-on-empty path.

pub(crate) mod index;
mod query;
mod schema;

// Glob re-exports so each command's `#[tauri::command]`-generated helper
// item (e.g. `__cmd__query_notes`) is re-exported alongside the function —
// matches the pattern used by `commands::note`. Tauri's `generate_handler!`
// in lib.rs resolves them as siblings of `note_index::<command>`. This also
// re-exports the maintenance/query helpers (`upsert_note_document`,
// `remove_note`, `folder_path_for_id`, `reindex_all`, and the request/row
// types) for `note::crud`/`note::trash` and for other callers.
pub use index::*;
pub use query::*;
