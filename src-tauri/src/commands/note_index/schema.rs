use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{Connection, OptionalExtension};

/// Bumped whenever `notes_index`/`note_tags`/`index_meta` structure changes.
/// Guards the migration in `migrate` via `PRAGMA user_version` so an
/// already-current database file skips the (idempotent, but non-free)
/// `CREATE TABLE`/`CREATE INDEX` batch on every open.
const SCHEMA_VERSION: i32 = 2;

/// `index_meta` key marking that a full `reindex_all` backfill has run at
/// least once for this workspace. See `is_backfilled`/`mark_backfilled`.
const BACKFILLED_KEY: &str = "backfilled";

pub(super) fn notes_index_path(workspace: &Path) -> PathBuf {
    workspace.join(".nevo").join("notes.sqlite")
}

/// Opens (creating if needed) the workspace-local note metadata index and
/// ensures its schema is current. Mirrors `database::open_database`'s
/// connection setup (WAL + busy timeout) so concurrent readers/writers behave
/// the same way as the existing per-workspace database-block store.
pub(super) fn open_notes_index(workspace: &Path) -> Result<Connection, String> {
    std::fs::create_dir_all(workspace.join(".nevo")).map_err(|error| error.to_string())?;
    let connection =
        Connection::open(notes_index_path(workspace)).map_err(|error| error.to_string())?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| error.to_string())?;
    connection
        .execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|error| error.to_string())?;
    migrate(&connection)?;
    Ok(connection)
}

fn migrate(connection: &Connection) -> Result<(), String> {
    let version: i32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if version >= SCHEMA_VERSION {
        return Ok(());
    }
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS notes_index (
               note_id TEXT PRIMARY KEY,
               title TEXT NOT NULL DEFAULT '',
               folder_id TEXT,
               folder_path TEXT NOT NULL DEFAULT '',
               note_type TEXT,
               status TEXT,
               date TEXT,
               created_at TEXT NOT NULL DEFAULT '',
               updated_at TEXT NOT NULL DEFAULT ''
             );
             CREATE TABLE IF NOT EXISTS note_tags (
               note_id TEXT NOT NULL,
               tag TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS note_tags_tag ON note_tags(tag);
             CREATE INDEX IF NOT EXISTS note_tags_note_id ON note_tags(note_id);
             CREATE TABLE IF NOT EXISTS index_meta (
               key TEXT PRIMARY KEY,
               value TEXT
             );",
        )
        .map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// Whether a full `reindex_all` backfill has already run once for this
/// workspace's index. Used to gate the one-time backfill in
/// `query_notes_impl` so it doesn't re-walk the manifest on every call once
/// the incremental create/save/move hooks are keeping the index current.
pub(super) fn is_backfilled(connection: &Connection) -> Result<bool, String> {
    let value: Option<String> = connection
        .query_row(
            "SELECT value FROM index_meta WHERE key = ?1",
            [BACKFILLED_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(value.as_deref() == Some("1"))
}

/// Marks the workspace index as backfilled so future `query_notes` calls
/// skip the full manifest walk. Idempotent (upsert).
pub(super) fn mark_backfilled(connection: &Connection) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO index_meta(key, value) VALUES (?1, '1')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [BACKFILLED_KEY],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_creation_is_idempotent_and_migration_guard_short_circuits() {
        let workspace =
            std::env::temp_dir().join(format!("nevo-note-index-schema-{}", uuid::Uuid::new_v4()));

        let connection = open_notes_index(&workspace).expect("open notes index");
        let version: i32 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user_version");
        assert_eq!(version, SCHEMA_VERSION);
        drop(connection);

        // Reopening an already-migrated database must not error even though
        // the CREATE TABLE/INDEX statements would otherwise re-run.
        let reopened = open_notes_index(&workspace).expect("reopen notes index");
        let version: i32 = reopened
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read user_version again");
        assert_eq!(version, SCHEMA_VERSION);

        assert!(notes_index_path(&workspace).is_file());
        let _ = std::fs::remove_dir_all(workspace);
    }
}
