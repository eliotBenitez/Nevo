//! Copies `database_records` SQLite rows for every V2 database block
//! discovered while remapping note content, from the extracted archive's
//! `databases.sqlite` into the current workspace's, under the freshly
//! allocated id.

use std::collections::HashMap;
use std::path::Path;

use rusqlite::params;

use crate::commands::database::{checkpoint_database, open_database};

/// No-op if the archive carries no database ids at all (no V2 database
/// blocks were found), or no `databases.sqlite` file (the source workspace
/// never created one). Both are ordinary, not errors.
pub(super) fn copy_database_records(
    temp_dir: &Path,
    current_root: &Path,
    database_ids: &HashMap<String, String>,
) -> Result<(), String> {
    if database_ids.is_empty() {
        return Ok(());
    }
    let source_sqlite = temp_dir.join(".nevo").join("databases.sqlite");
    if !source_sqlite.is_file() {
        return Ok(());
    }

    // Fold each side's WAL into the main file first so a row committed just
    // before export/now is actually visible to the plain SELECT below.
    checkpoint_database(temp_dir)?;
    checkpoint_database(current_root)?;

    let source = open_database(temp_dir)?;
    let dest = open_database(current_root)?;

    let mut select = source
        .prepare(
            "SELECT record_id, ordinal, cells_json FROM database_records WHERE database_id = ?1",
        )
        .map_err(|error| error.to_string())?;

    for (old_id, new_id) in database_ids {
        let rows = select
            .query_map([old_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        for (record_id, ordinal, cells_json) in rows {
            dest.execute(
                "INSERT INTO database_records(database_id, record_id, ordinal, cells_json) \
                 VALUES (?1, ?2, ?3, ?4)",
                params![new_id, record_id, ordinal, cells_json],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}
