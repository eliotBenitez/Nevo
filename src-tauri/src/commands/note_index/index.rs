use std::path::Path;

use rusqlite::{params, Transaction};

use super::schema::{mark_backfilled, open_notes_index};
use crate::commands::note::{NoteDocument, NoteStatus, NoteType};
use crate::commands::workspace::FolderMeta;

/// Writes/updates a single note's row and replaces its tag rows inside one
/// transaction (delete-then-insert), mirroring `database::replace_records`.
#[allow(clippy::too_many_arguments)]
pub fn upsert_note(
    workspace: &Path,
    note_id: &str,
    title: &str,
    folder_id: Option<&str>,
    folder_path: &str,
    note_type: Option<&str>,
    status: Option<&str>,
    date: Option<&str>,
    created_at: &str,
    updated_at: &str,
    tags: &[String],
) -> Result<(), String> {
    let mut connection = open_notes_index(workspace)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    upsert_note_tx(
        &transaction,
        note_id,
        title,
        folder_id,
        folder_path,
        note_type,
        status,
        date,
        created_at,
        updated_at,
        tags,
    )?;
    transaction.commit().map_err(|error| error.to_string())
}

/// Convenience wrapper for the note write paths (`create_note`/`save_note`/
/// trash restore): extracts the indexable fields straight out of a
/// `NoteDocument` + its manifest-derived folder path.
pub fn upsert_note_document(
    workspace_path: &str,
    note: &NoteDocument,
    folder_path: &str,
) -> Result<(), String> {
    let properties = note.properties.as_ref();
    let tags = properties.map(|p| p.tags.clone()).unwrap_or_default();
    let note_type = properties
        .and_then(|p| p.note_type.as_ref())
        .and_then(note_type_str);
    let status = properties
        .and_then(|p| p.status.as_ref())
        .and_then(note_status_str);
    let date = properties.and_then(|p| p.date.clone());

    upsert_note(
        Path::new(workspace_path),
        &note.id,
        &note.title,
        note.folder_id.as_deref(),
        folder_path,
        note_type.as_deref(),
        status.as_deref(),
        date.as_deref(),
        &note.created_at,
        &note.updated_at,
        &tags,
    )
}

/// Removes a note's index row and its tag rows. Safe to call for a note that
/// was never indexed (e.g. index missing/lazily-populated) — deletes affect
/// zero rows and are not an error.
pub fn remove_note(workspace: &Path, note_id: &str) -> Result<(), String> {
    let mut connection = open_notes_index(workspace)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    remove_note_tx(&transaction, note_id)?;
    transaction.commit().map_err(|error| error.to_string())
}

/// Rebuilds the entire index from the workspace manifest + note files on
/// disk, mirroring `sidebar::list_sidebar_note_previews_impl`'s manifest walk.
/// Used as a lazy backfill when the index is missing/empty. Returns the
/// number of notes indexed.
pub fn reindex_all(workspace_path: &str) -> Result<usize, String> {
    let manifest = crate::commands::folder::load_manifest(workspace_path)?;

    let mut entries: Vec<(crate::commands::workspace::NoteMeta, String)> = manifest
        .root_notes
        .iter()
        .cloned()
        .map(|note| (note, String::new()))
        .collect();
    collect_folder_notes(&manifest.tree, &mut Vec::new(), &mut entries);

    let workspace_root = Path::new(workspace_path);
    let mut connection = open_notes_index(workspace_root)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch("DELETE FROM notes_index; DELETE FROM note_tags;")
        .map_err(|error| error.to_string())?;

    let mut indexed = 0usize;
    for (meta, folder_path) in entries {
        let Ok(note) = read_note_document(workspace_path, &meta.id) else {
            // Skip unreadable/corrupt note files, mirroring the sidebar
            // preview builder's best-effort behavior.
            continue;
        };
        let properties = note.properties.as_ref();
        let tags = properties.map(|p| p.tags.clone()).unwrap_or_default();
        let note_type = properties
            .and_then(|p| p.note_type.as_ref())
            .and_then(note_type_str);
        let status = properties
            .and_then(|p| p.status.as_ref())
            .and_then(note_status_str);
        let date = properties.and_then(|p| p.date.clone());

        upsert_note_tx(
            &transaction,
            &meta.id,
            &note.title,
            meta.folder_id.as_deref(),
            &folder_path,
            note_type.as_deref(),
            status.as_deref(),
            date.as_deref(),
            &note.created_at,
            &note.updated_at,
            &tags,
        )?;
        indexed += 1;
    }

    transaction.commit().map_err(|error| error.to_string())?;
    Ok(indexed)
}

/// Returns the human-readable folder path ("Parent / Child") for a folder id
/// by walking the manifest tree, mirroring
/// `sidebar::collect_folder_notes`'s path-building. Returns an empty string
/// for `None` (root) or an id that is no longer present in the tree.
pub fn folder_path_for_id(tree: &[FolderMeta], folder_id: Option<&str>) -> String {
    let Some(folder_id) = folder_id else {
        return String::new();
    };
    find_folder_path(tree, folder_id, &mut Vec::new()).unwrap_or_default()
}

fn find_folder_path(
    tree: &[FolderMeta],
    folder_id: &str,
    parents: &mut Vec<String>,
) -> Option<String> {
    for folder in tree {
        parents.push(folder.title.clone());
        if folder.id == folder_id {
            return Some(parents.join(" / "));
        }
        if let Some(path) = find_folder_path(&folder.children, folder_id, parents) {
            return Some(path);
        }
        parents.pop();
    }
    None
}

fn collect_folder_notes(
    folders: &[FolderMeta],
    parents: &mut Vec<String>,
    entries: &mut Vec<(crate::commands::workspace::NoteMeta, String)>,
) {
    for folder in folders {
        parents.push(folder.title.clone());
        let folder_path = parents.join(" / ");
        for note in &folder.notes {
            entries.push((note.clone(), folder_path.clone()));
        }
        collect_folder_notes(&folder.children, parents, entries);
        parents.pop();
    }
}

fn read_note_document(workspace_path: &str, note_id: &str) -> Result<NoteDocument, String> {
    let path = crate::commands::note::note_path(workspace_path, note_id)?;
    let content = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn note_type_str(value: &NoteType) -> Option<String> {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(str::to_owned))
}

fn note_status_str(value: &NoteStatus) -> Option<String> {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(str::to_owned))
}

#[allow(clippy::too_many_arguments)]
fn upsert_note_tx(
    transaction: &Transaction,
    note_id: &str,
    title: &str,
    folder_id: Option<&str>,
    folder_path: &str,
    note_type: Option<&str>,
    status: Option<&str>,
    date: Option<&str>,
    created_at: &str,
    updated_at: &str,
    tags: &[String],
) -> Result<(), String> {
    transaction
        .execute(
            "INSERT INTO notes_index(
               note_id, title, folder_id, folder_path, note_type, status, date, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(note_id) DO UPDATE SET
               title = excluded.title,
               folder_id = excluded.folder_id,
               folder_path = excluded.folder_path,
               note_type = excluded.note_type,
               status = excluded.status,
               date = excluded.date,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at",
            params![
                note_id, title, folder_id, folder_path, note_type, status, date, created_at,
                updated_at
            ],
        )
        .map_err(|error| error.to_string())?;

    transaction
        .execute("DELETE FROM note_tags WHERE note_id = ?1", params![note_id])
        .map_err(|error| error.to_string())?;
    for tag in tags {
        transaction
            .execute(
                "INSERT INTO note_tags(note_id, tag) VALUES (?1, ?2)",
                params![note_id, tag],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn remove_note_tx(transaction: &Transaction, note_id: &str) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM notes_index WHERE note_id = ?1",
            params![note_id],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM note_tags WHERE note_id = ?1", params![note_id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// `tauri::command` entry point for an explicit/forced rebuild, e.g. when the
/// frontend detects a stale index for a workspace that has notes. Also
/// (re)marks the workspace as backfilled so `query_notes_impl`'s one-time
/// lazy backfill does not immediately redo the same walk.
#[tauri::command]
pub async fn reindex_notes(workspace_path: String) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let workspace = crate::commands::path_utils::normalize_workspace_path(&workspace_path)?;
        let indexed = reindex_all(&workspace.to_string_lossy())?;
        let connection = open_notes_index(&workspace)?;
        mark_backfilled(&connection)?;
        Ok(indexed)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::note::{NoteProperties, NoteStatus, NoteType};

    fn sample_note(id: &str, folder_id: Option<&str>) -> NoteDocument {
        NoteDocument {
            id: id.to_string(),
            title: format!("Note {id}"),
            icon: "📄".to_string(),
            cover: None,
            folder_id: folder_id.map(str::to_string),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-02T00:00:00Z".to_string(),
            properties: Some(NoteProperties {
                note_type: Some(NoteType::Task),
                tags: vec!["alpha".to_string(), "beta".to_string()],
                date: Some("2024-01-15".to_string()),
                status: Some(NoteStatus::Active),
                extra: Default::default(),
            }),
            content: serde_json::json!({ "type": "doc", "content": [] }),
            canvas: None,
            extra: Default::default(),
        }
    }

    #[test]
    fn upsert_then_query_round_trips_fields_and_tags() {
        let workspace =
            std::env::temp_dir().join(format!("nevo-note-index-{}", uuid::Uuid::new_v4()));
        let note = sample_note("note-1", None);

        upsert_note_document(&workspace.to_string_lossy(), &note, "").expect("upsert note");

        let connection = open_notes_index(&workspace).expect("open index");
        let (title, note_type, status, date): (
            String,
            Option<String>,
            Option<String>,
            Option<String>,
        ) = connection
            .query_row(
                "SELECT title, note_type, status, date FROM notes_index WHERE note_id = ?1",
                params!["note-1"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("read row");
        assert_eq!(title, "Note note-1");
        assert_eq!(note_type.as_deref(), Some("task"));
        assert_eq!(status.as_deref(), Some("active"));
        assert_eq!(date.as_deref(), Some("2024-01-15"));

        let mut tag_statement = connection
            .prepare("SELECT tag FROM note_tags WHERE note_id = ?1 ORDER BY tag")
            .expect("prepare tags");
        let tags: Vec<String> = tag_statement
            .query_map(params!["note-1"], |row| row.get(0))
            .expect("query tags")
            .collect::<Result<_, _>>()
            .expect("collect tags");
        assert_eq!(tags, vec!["alpha".to_string(), "beta".to_string()]);

        let _ = std::fs::remove_dir_all(workspace);
    }

    #[test]
    fn upsert_twice_replaces_properties_and_tags() {
        let workspace =
            std::env::temp_dir().join(format!("nevo-note-index-{}", uuid::Uuid::new_v4()));
        let mut note = sample_note("note-1", None);
        upsert_note_document(&workspace.to_string_lossy(), &note, "").expect("first upsert");

        note.properties = Some(NoteProperties {
            note_type: Some(NoteType::Idea),
            tags: vec!["gamma".to_string()],
            date: None,
            status: Some(NoteStatus::Done),
            extra: Default::default(),
        });
        upsert_note_document(&workspace.to_string_lossy(), &note, "Folder").expect("second upsert");

        let connection = open_notes_index(&workspace).expect("open index");
        let (note_type, status, folder_path): (Option<String>, Option<String>, String) = connection
            .query_row(
                "SELECT note_type, status, folder_path FROM notes_index WHERE note_id = ?1",
                params!["note-1"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read updated row");
        assert_eq!(note_type.as_deref(), Some("idea"));
        assert_eq!(status.as_deref(), Some("done"));
        assert_eq!(folder_path, "Folder");

        let mut tag_statement = connection
            .prepare("SELECT tag FROM note_tags WHERE note_id = ?1")
            .expect("prepare tags");
        let tags: Vec<String> = tag_statement
            .query_map(params!["note-1"], |row| row.get(0))
            .expect("query tags")
            .collect::<Result<_, _>>()
            .expect("collect tags");
        assert_eq!(tags, vec!["gamma".to_string()]);

        let _ = std::fs::remove_dir_all(workspace);
    }

    #[test]
    fn remove_note_drops_row_and_tags() {
        let workspace =
            std::env::temp_dir().join(format!("nevo-note-index-{}", uuid::Uuid::new_v4()));
        let note = sample_note("note-1", None);
        upsert_note_document(&workspace.to_string_lossy(), &note, "").expect("upsert note");

        remove_note(&workspace, "note-1").expect("remove note");

        let connection = open_notes_index(&workspace).expect("open index");
        let row_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM notes_index WHERE note_id = ?1",
                params!["note-1"],
                |row| row.get(0),
            )
            .expect("count rows");
        assert_eq!(row_count, 0);
        let tag_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM note_tags WHERE note_id = ?1",
                params!["note-1"],
                |row| row.get(0),
            )
            .expect("count tags");
        assert_eq!(tag_count, 0);

        let _ = std::fs::remove_dir_all(workspace);
    }

    #[test]
    fn folder_path_for_id_walks_nested_tree() {
        let tree = vec![FolderMeta {
            id: "root-folder".to_string(),
            title: "Root".to_string(),
            icon: "📁".to_string(),
            parent_id: None,
            order: 0,
            children: vec![FolderMeta {
                id: "child-folder".to_string(),
                title: "Child".to_string(),
                icon: "📁".to_string(),
                parent_id: Some("root-folder".to_string()),
                order: 0,
                children: vec![],
                notes: vec![],
                extra: Default::default(),
            }],
            notes: vec![],
            extra: Default::default(),
        }];

        assert_eq!(folder_path_for_id(&tree, None), "");
        assert_eq!(folder_path_for_id(&tree, Some("missing")), "");
        assert_eq!(folder_path_for_id(&tree, Some("root-folder")), "Root");
        assert_eq!(
            folder_path_for_id(&tree, Some("child-folder")),
            "Root / Child"
        );
    }
}
