use std::collections::HashMap;

use rusqlite::{Connection, ToSql};
use serde::{Deserialize, Serialize};

use super::index::reindex_all;
use super::schema::{is_backfilled, mark_backfilled, open_notes_index};
use crate::commands::path_utils::normalize_workspace_path;
use crate::commands::workspace::FolderMeta;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NoteRow {
    pub note_id: String,
    pub title: String,
    pub icon: String,
    pub folder_id: Option<String>,
    pub folder_path: String,
    pub note_type: Option<String>,
    pub status: Option<String>,
    pub date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NoteSortField {
    Title,
    Date,
    UpdatedAt,
    CreatedAt,
}

impl NoteSortField {
    fn column(self) -> &'static str {
        match self {
            NoteSortField::Title => "title",
            NoteSortField::Date => "date",
            NoteSortField::UpdatedAt => "updated_at",
            NoteSortField::CreatedAt => "created_at",
        }
    }
}

fn default_sort_direction() -> String {
    "asc".to_string()
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSortRule {
    pub field: NoteSortField,
    #[serde(default = "default_sort_direction")]
    pub direction: String,
}

#[derive(Clone, Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NoteQueryFilters {
    /// Notes carrying at least one of these tags (empty = no filter).
    #[serde(default)]
    pub tags_any: Vec<String>,
    /// Notes carrying every one of these tags.
    #[serde(default)]
    pub tags_all: Vec<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub note_type: Option<String>,
    #[serde(default)]
    pub date_from: Option<String>,
    #[serde(default)]
    pub date_to: Option<String>,
    #[serde(default)]
    pub folder_id: Option<String>,
    /// Matches this exact `folder_path`, or (with `include_subtree`) any
    /// descendant folder path under it.
    #[serde(default)]
    pub folder_path_prefix: Option<String>,
    #[serde(default)]
    pub include_subtree: bool,
}

#[derive(Clone, Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NoteQueryRequest {
    #[serde(default)]
    pub filters: NoteQueryFilters,
    #[serde(default)]
    pub sorts: Vec<NoteSortRule>,
}

#[tauri::command]
pub async fn query_notes(
    workspace_path: String,
    request: NoteQueryRequest,
) -> Result<Vec<NoteRow>, String> {
    tauri::async_runtime::spawn_blocking(move || query_notes_impl(workspace_path, request))
        .await
        .map_err(|error| error.to_string())?
}

fn query_notes_impl(
    workspace_path: String,
    request: NoteQueryRequest,
) -> Result<Vec<NoteRow>, String> {
    let workspace = normalize_workspace_path(&workspace_path)?;
    let workspace_path = workspace.to_string_lossy().into_owned();

    let needs_backfill = {
        let connection = open_notes_index(&workspace)?;
        !is_backfilled(&connection)?
    };
    if needs_backfill {
        // Run a full manifest walk exactly once per workspace so notes that
        // predate this index (root notes, notes in folders never re-saved
        // since the feature shipped) are indexed even though incremental
        // create/save/move hooks may have already upserted a handful of rows
        // (e.g. the host note being edited to add a query block). A row
        // count > 0 is not proof the index is complete, so the trigger is a
        // durable per-workspace flag rather than `COUNT(*) == 0`.
        reindex_all(&workspace_path)?;
        let connection = open_notes_index(&workspace)?;
        mark_backfilled(&connection)?;
    }

    let connection = open_notes_index(&workspace)?;
    let (where_clause, params) = build_where(&request.filters);
    let order_clause = build_order_by(&request.sorts);
    let sql = format!(
        "SELECT note_id, title, folder_id, folder_path, note_type, status, date, created_at, updated_at \
         FROM notes_index{where_clause}{order_clause}"
    );

    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let mut rows = statement
        .query_map(
            rusqlite::params_from_iter(params.iter().map(|value| value.as_ref())),
            |row| {
                Ok(NoteRow {
                    note_id: row.get(0)?,
                    title: row.get(1)?,
                    icon: String::new(),
                    folder_id: row.get(2)?,
                    folder_path: row.get(3)?,
                    note_type: row.get(4)?,
                    status: row.get(5)?,
                    date: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    tags: Vec::new(),
                })
            },
        )
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    if !rows.is_empty() {
        attach_tags(&connection, &mut rows)?;
    }
    drop(statement);
    drop(connection);

    if !rows.is_empty() {
        attach_icons(&workspace_path, &mut rows)?;
    }

    Ok(rows)
}

fn build_where(filters: &NoteQueryFilters) -> (String, Vec<Box<dyn ToSql>>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut params: Vec<Box<dyn ToSql>> = Vec::new();

    if !filters.tags_any.is_empty() {
        let placeholders = repeat_placeholders(filters.tags_any.len());
        clauses.push(format!(
            "note_id IN (SELECT note_id FROM note_tags WHERE tag IN ({placeholders}))"
        ));
        for tag in &filters.tags_any {
            params.push(Box::new(tag.clone()));
        }
    }

    for tag in &filters.tags_all {
        clauses.push("note_id IN (SELECT note_id FROM note_tags WHERE tag = ?)".to_string());
        params.push(Box::new(tag.clone()));
    }

    if let Some(status) = &filters.status {
        clauses.push("status = ?".to_string());
        params.push(Box::new(status.clone()));
    }

    if let Some(note_type) = &filters.note_type {
        clauses.push("note_type = ?".to_string());
        params.push(Box::new(note_type.clone()));
    }

    if let Some(date_from) = &filters.date_from {
        clauses.push("date >= ?".to_string());
        params.push(Box::new(date_from.clone()));
    }

    if let Some(date_to) = &filters.date_to {
        clauses.push("date <= ?".to_string());
        params.push(Box::new(date_to.clone()));
    }

    if let Some(folder_id) = &filters.folder_id {
        clauses.push("folder_id = ?".to_string());
        params.push(Box::new(folder_id.clone()));
    }

    if let Some(prefix) = &filters.folder_path_prefix {
        if filters.include_subtree {
            clauses.push("(folder_path = ? OR folder_path LIKE ? ESCAPE '\\')".to_string());
            params.push(Box::new(prefix.clone()));
            params.push(Box::new(format!("{} / %", escape_like(prefix))));
        } else {
            clauses.push("folder_path = ?".to_string());
            params.push(Box::new(prefix.clone()));
        }
    }

    let where_clause = if clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", clauses.join(" AND "))
    };
    (where_clause, params)
}

fn repeat_placeholders(count: usize) -> String {
    std::iter::repeat("?")
        .take(count)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Escapes SQLite `LIKE` metacharacters (`\`, `%`, `_`) so a folder title
/// containing them is matched literally rather than as a wildcard.
fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn build_order_by(sorts: &[NoteSortRule]) -> String {
    if sorts.is_empty() {
        return String::new();
    }
    let parts: Vec<String> = sorts
        .iter()
        .map(|sort| {
            let direction = if sort.direction.eq_ignore_ascii_case("desc") {
                "DESC"
            } else {
                "ASC"
            };
            format!("{} {direction} NULLS LAST", sort.field.column())
        })
        .collect();
    format!(" ORDER BY {}", parts.join(", "))
}

fn attach_tags(connection: &Connection, rows: &mut [NoteRow]) -> Result<(), String> {
    let ids: Vec<String> = rows.iter().map(|row| row.note_id.clone()).collect();
    let placeholders = repeat_placeholders(ids.len());
    let sql = format!(
        "SELECT note_id, tag FROM note_tags WHERE note_id IN ({placeholders}) ORDER BY note_id, tag"
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let id_params: Vec<Box<dyn ToSql>> = ids
        .iter()
        .map(|id| Box::new(id.clone()) as Box<dyn ToSql>)
        .collect();
    let mut tags_by_note: HashMap<String, Vec<String>> = HashMap::new();
    let mapped = statement
        .query_map(
            rusqlite::params_from_iter(id_params.iter().map(|value| value.as_ref())),
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|error| error.to_string())?;
    for entry in mapped {
        let (note_id, tag) = entry.map_err(|error| error.to_string())?;
        tags_by_note.entry(note_id).or_default().push(tag);
    }
    for row in rows.iter_mut() {
        if let Some(tags) = tags_by_note.remove(&row.note_id) {
            row.tags = tags;
        }
    }
    Ok(())
}

/// Enriches rows with the icon from `NoteMeta` (the SQL index does not store
/// it) by walking the workspace manifest once for the whole result page.
fn attach_icons(workspace_path: &str, rows: &mut [NoteRow]) -> Result<(), String> {
    let manifest = crate::commands::folder::load_manifest(workspace_path)?;
    let mut icons: HashMap<String, String> = HashMap::new();
    for note in &manifest.root_notes {
        icons.insert(note.id.clone(), note.icon.clone());
    }
    collect_icons(&manifest.tree, &mut icons);
    for row in rows.iter_mut() {
        if let Some(icon) = icons.get(&row.note_id) {
            row.icon = icon.clone();
        }
    }
    Ok(())
}

fn collect_icons(folders: &[FolderMeta], icons: &mut HashMap<String, String>) {
    for folder in folders {
        for note in &folder.notes {
            icons.insert(note.id.clone(), note.icon.clone());
        }
        collect_icons(&folder.children, icons);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::note::{NoteDocument, NoteProperties, NoteStatus, NoteType};
    use crate::commands::note_index::index::upsert_note_document;
    use crate::commands::workspace::create_workspace;

    struct TestWorkspace {
        path: std::path::PathBuf,
    }

    impl TestWorkspace {
        fn new() -> Self {
            let path = std::env::temp_dir()
                .join(format!("nevo-note-index-query-{}", uuid::Uuid::new_v4()));
            create_workspace(
                path.to_string_lossy().into_owned(),
                "Query".to_string(),
                "N".to_string(),
                "violet".to_string(),
            )
            .expect("create workspace");
            Self { path }
        }

        fn path_string(&self) -> String {
            self.path.to_string_lossy().into_owned()
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn note(
        id: &str,
        title: &str,
        note_type: Option<NoteType>,
        status: Option<NoteStatus>,
        date: Option<&str>,
        tags: &[&str],
    ) -> NoteDocument {
        NoteDocument {
            id: id.to_string(),
            title: title.to_string(),
            icon: "📄".to_string(),
            cover: None,
            folder_id: None,
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            properties: Some(NoteProperties {
                note_type,
                tags: tags.iter().map(|tag| tag.to_string()).collect(),
                date: date.map(str::to_string),
                status,
            }),
            content: serde_json::json!({ "type": "doc", "content": [] }),
            canvas: None,
        }
    }

    /// These filter/sort tests seed the index via `upsert_note_document`
    /// directly, without registering the notes in the workspace manifest
    /// (unlike production, where every incremental upsert corresponds to a
    /// manifest-registered note). Mark the workspace as already backfilled
    /// so `query_notes_impl`'s one-time backfill doesn't treat the empty
    /// manifest as authoritative and wipe out these directly-seeded rows.
    fn mark_workspace_backfilled(path: &str) {
        let connection =
            open_notes_index(std::path::Path::new(path)).expect("open index to mark backfilled");
        mark_backfilled(&connection).expect("mark backfilled");
    }

    #[test]
    fn filters_by_tags_any_and_tags_all() {
        let workspace = TestWorkspace::new();
        let path = workspace.path_string();
        upsert_note_document(
            &path,
            &note("n1", "Alpha", None, None, None, &["red", "urgent"]),
            "",
        )
        .expect("upsert n1");
        upsert_note_document(&path, &note("n2", "Beta", None, None, None, &["blue"]), "")
            .expect("upsert n2");
        upsert_note_document(&path, &note("n3", "Gamma", None, None, None, &["red"]), "")
            .expect("upsert n3");
        mark_workspace_backfilled(&path);

        let any_result = query_notes_impl(
            path.clone(),
            NoteQueryRequest {
                filters: NoteQueryFilters {
                    tags_any: vec!["red".to_string()],
                    ..Default::default()
                },
                sorts: vec![],
            },
        )
        .expect("query tags_any");
        let mut any_ids: Vec<String> = any_result.into_iter().map(|row| row.note_id).collect();
        any_ids.sort();
        assert_eq!(any_ids, vec!["n1".to_string(), "n3".to_string()]);

        let all_result = query_notes_impl(
            path,
            NoteQueryRequest {
                filters: NoteQueryFilters {
                    tags_all: vec!["red".to_string(), "urgent".to_string()],
                    ..Default::default()
                },
                sorts: vec![],
            },
        )
        .expect("query tags_all");
        assert_eq!(all_result.len(), 1);
        assert_eq!(all_result[0].note_id, "n1");
        assert_eq!(
            all_result[0].tags,
            vec!["red".to_string(), "urgent".to_string()]
        );
    }

    #[test]
    fn filters_by_status_and_note_type() {
        let workspace = TestWorkspace::new();
        let path = workspace.path_string();
        upsert_note_document(
            &path,
            &note(
                "n1",
                "Task",
                Some(NoteType::Task),
                Some(NoteStatus::Active),
                None,
                &[],
            ),
            "",
        )
        .expect("upsert n1");
        upsert_note_document(
            &path,
            &note(
                "n2",
                "Idea",
                Some(NoteType::Idea),
                Some(NoteStatus::Done),
                None,
                &[],
            ),
            "",
        )
        .expect("upsert n2");
        mark_workspace_backfilled(&path);

        let result = query_notes_impl(
            path,
            NoteQueryRequest {
                filters: NoteQueryFilters {
                    status: Some("active".to_string()),
                    note_type: Some("task".to_string()),
                    ..Default::default()
                },
                sorts: vec![],
            },
        )
        .expect("query status/type");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].note_id, "n1");
    }

    #[test]
    fn filters_by_date_range() {
        let workspace = TestWorkspace::new();
        let path = workspace.path_string();
        upsert_note_document(
            &path,
            &note("n1", "Jan", None, None, Some("2024-01-10"), &[]),
            "",
        )
        .expect("upsert n1");
        upsert_note_document(
            &path,
            &note("n2", "Feb", None, None, Some("2024-02-10"), &[]),
            "",
        )
        .expect("upsert n2");
        upsert_note_document(
            &path,
            &note("n3", "Mar", None, None, Some("2024-03-10"), &[]),
            "",
        )
        .expect("upsert n3");
        mark_workspace_backfilled(&path);

        let result = query_notes_impl(
            path,
            NoteQueryRequest {
                filters: NoteQueryFilters {
                    date_from: Some("2024-01-15".to_string()),
                    date_to: Some("2024-02-28".to_string()),
                    ..Default::default()
                },
                sorts: vec![],
            },
        )
        .expect("query date range");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].note_id, "n2");
    }

    #[test]
    fn filters_by_folder_subtree() {
        let workspace = TestWorkspace::new();
        let path = workspace.path_string();
        upsert_note_document(&path, &note("n1", "Root", None, None, None, &[]), "")
            .expect("upsert n1");
        upsert_note_document(
            &path,
            &note("n2", "Parent", None, None, None, &[]),
            "Parent",
        )
        .expect("upsert n2");
        upsert_note_document(
            &path,
            &note("n3", "Child", None, None, None, &[]),
            "Parent / Child",
        )
        .expect("upsert n3");
        mark_workspace_backfilled(&path);

        let exact = query_notes_impl(
            path.clone(),
            NoteQueryRequest {
                filters: NoteQueryFilters {
                    folder_path_prefix: Some("Parent".to_string()),
                    include_subtree: false,
                    ..Default::default()
                },
                sorts: vec![],
            },
        )
        .expect("query exact folder");
        assert_eq!(exact.len(), 1);
        assert_eq!(exact[0].note_id, "n2");

        let subtree = query_notes_impl(
            path,
            NoteQueryRequest {
                filters: NoteQueryFilters {
                    folder_path_prefix: Some("Parent".to_string()),
                    include_subtree: true,
                    ..Default::default()
                },
                sorts: vec![],
            },
        )
        .expect("query subtree");
        let mut subtree_ids: Vec<String> = subtree.into_iter().map(|row| row.note_id).collect();
        subtree_ids.sort();
        assert_eq!(subtree_ids, vec!["n2".to_string(), "n3".to_string()]);
    }

    #[test]
    fn sorts_ascending_and_descending() {
        let workspace = TestWorkspace::new();
        let path = workspace.path_string();
        upsert_note_document(&path, &note("n1", "Banana", None, None, None, &[]), "")
            .expect("upsert n1");
        upsert_note_document(&path, &note("n2", "Apple", None, None, None, &[]), "")
            .expect("upsert n2");
        upsert_note_document(&path, &note("n3", "Cherry", None, None, None, &[]), "")
            .expect("upsert n3");
        mark_workspace_backfilled(&path);

        let ascending = query_notes_impl(
            path.clone(),
            NoteQueryRequest {
                filters: NoteQueryFilters::default(),
                sorts: vec![NoteSortRule {
                    field: NoteSortField::Title,
                    direction: "asc".to_string(),
                }],
            },
        )
        .expect("query asc");
        assert_eq!(
            ascending
                .iter()
                .map(|row| row.title.clone())
                .collect::<Vec<_>>(),
            vec![
                "Apple".to_string(),
                "Banana".to_string(),
                "Cherry".to_string()
            ]
        );

        let descending = query_notes_impl(
            path,
            NoteQueryRequest {
                filters: NoteQueryFilters::default(),
                sorts: vec![NoteSortRule {
                    field: NoteSortField::Title,
                    direction: "desc".to_string(),
                }],
            },
        )
        .expect("query desc");
        assert_eq!(
            descending
                .iter()
                .map(|row| row.title.clone())
                .collect::<Vec<_>>(),
            vec![
                "Cherry".to_string(),
                "Banana".to_string(),
                "Apple".to_string()
            ]
        );
    }

    #[test]
    fn empty_index_is_lazily_backfilled_from_manifest_and_notes() {
        let workspace = TestWorkspace::new();
        let path = workspace.path_string();
        let created = crate::commands::note::create_note_impl(
            path.clone(),
            None,
            "Backfilled".to_string(),
            "📄".to_string(),
        )
        .expect("create note directly, bypassing the index hook's insert");

        // Simulate a workspace whose index was never populated (e.g. an
        // older workspace opened for the first time after this feature
        // shipped) by wiping the index file's rows.
        let workspace_dir = std::path::Path::new(&path);
        let connection = open_notes_index(workspace_dir).expect("open index");
        connection
            .execute_batch("DELETE FROM notes_index; DELETE FROM note_tags;")
            .expect("clear index");
        drop(connection);

        let result = query_notes_impl(path, NoteQueryRequest::default()).expect("query all");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].note_id, created.id);
        assert_eq!(result[0].title, "Backfilled");
    }

    /// Reproduces the reported bug: a workspace where the index is
    /// non-empty (one note upserted by an incremental hook — e.g. the host
    /// note being edited to add a cross-note query block) must still get a
    /// full backfill so pre-existing notes in *other* folders and at the
    /// workspace root become visible, not just the note that happened to
    /// trigger an incremental upsert.
    #[test]
    fn nonempty_partial_index_still_gets_backfilled_for_notes_in_other_folders() {
        let workspace = TestWorkspace::new();
        let path = workspace.path_string();

        let folder_a = crate::commands::folder::create_folder_sync(
            path.clone(),
            None,
            "A".to_string(),
            "📁".to_string(),
        )
        .expect("create folder a");
        let folder_b = crate::commands::folder::create_folder_sync(
            path.clone(),
            None,
            "B".to_string(),
            "📁".to_string(),
        )
        .expect("create folder b");

        let root_note = crate::commands::note::create_note_impl(
            path.clone(),
            None,
            "RootNote".to_string(),
            "📄".to_string(),
        )
        .expect("create root note");
        let note_a = crate::commands::note::create_note_impl(
            path.clone(),
            Some(folder_a.id.clone()),
            "NoteA".to_string(),
            "📄".to_string(),
        )
        .expect("create note in folder a");
        let note_b = crate::commands::note::create_note_impl(
            path.clone(),
            Some(folder_b.id.clone()),
            "NoteB".to_string(),
            "📄".to_string(),
        )
        .expect("create note in folder b");

        // Simulate the pre-fix partial state that used to suppress backfill:
        // wipe the index and the backfilled flag, then re-upsert only the
        // HOST note (as the incremental create/save hook would do for the
        // note currently being edited to add the query block), leaving the
        // index non-empty but incomplete and NOT marked as backfilled. The
        // re-upserted title is a placeholder — the backfill is expected to
        // overwrite it from the real note file on disk.
        let workspace_dir = std::path::Path::new(&path);
        let connection = open_notes_index(workspace_dir).expect("open index");
        connection
            .execute_batch(
                "DELETE FROM notes_index; DELETE FROM note_tags; DELETE FROM index_meta;",
            )
            .expect("clear index and backfill flag");
        drop(connection);
        upsert_note_document(
            &path,
            &note(&root_note.id, "StalePlaceholder", None, None, None, &[]),
            "",
        )
        .expect("re-seed only the host note, as an incremental hook would");

        let result = query_notes_impl(path, NoteQueryRequest::default())
            .expect("query all after partial state");
        let host_row = result
            .iter()
            .find(|row| row.note_id == root_note.id)
            .expect("host note must still be present after backfill");
        assert_eq!(
            host_row.title, "RootNote",
            "backfill must refresh the host note's own row from disk, not leave the stale placeholder"
        );
        let mut ids: Vec<String> = result.into_iter().map(|row| row.note_id).collect();
        ids.sort();
        let mut expected = vec![root_note.id.clone(), note_a.id, note_b.id];
        expected.sort();
        assert_eq!(
            ids, expected,
            "backfill must recover notes from every folder and the workspace root, \
             not just the host note an incremental hook happened to upsert"
        );
    }

    /// Documents the once-only semantics of the durable backfill flag: after
    /// the first `query_notes` call marks the workspace as backfilled,
    /// steady-state freshness relies on the incremental create/save/move
    /// hooks, not on repeated full re-walks. A row that goes missing outside
    /// those hooks (simulated here by a direct delete) is not silently
    /// healed by a second `query_notes` call.
    #[test]
    fn backfill_runs_once_and_is_not_repeated_on_later_queries() {
        let workspace = TestWorkspace::new();
        let path = workspace.path_string();

        crate::commands::note::create_note_impl(
            path.clone(),
            None,
            "First".to_string(),
            "📄".to_string(),
        )
        .expect("create first note");
        let second = crate::commands::note::create_note_impl(
            path.clone(),
            None,
            "Second".to_string(),
            "📄".to_string(),
        )
        .expect("create second note");

        let first_query =
            query_notes_impl(path.clone(), NoteQueryRequest::default()).expect("first query");
        assert_eq!(first_query.len(), 2);

        let workspace_dir = std::path::Path::new(&path);
        let connection = open_notes_index(workspace_dir).expect("open index");
        assert!(
            is_backfilled(&connection).expect("read backfilled flag"),
            "first query_notes call must mark the workspace as backfilled"
        );

        // Drop one row directly (not through remove_note), simulating index
        // drift outside the incremental hooks.
        connection
            .execute(
                "DELETE FROM notes_index WHERE note_id = ?1",
                rusqlite::params![second.id],
            )
            .expect("drop one row directly");
        drop(connection);

        let second_query =
            query_notes_impl(path, NoteQueryRequest::default()).expect("second query");
        assert_eq!(
            second_query.len(),
            1,
            "a second query_notes call must not silently re-run the full backfill \
             once the workspace is already marked as backfilled"
        );
    }

    #[test]
    fn move_note_updates_index_folder_location() {
        let workspace = TestWorkspace::new();
        let path = workspace.path_string();

        let folder_a = crate::commands::folder::create_folder_sync(
            path.clone(),
            None,
            "FolderA".to_string(),
            "📁".to_string(),
        )
        .expect("create folder a");
        let folder_b = crate::commands::folder::create_folder_sync(
            path.clone(),
            None,
            "FolderB".to_string(),
            "📁".to_string(),
        )
        .expect("create folder b");

        let created = crate::commands::note::create_note_impl(
            path.clone(),
            Some(folder_a.id.clone()),
            "Movable".to_string(),
            "📄".to_string(),
        )
        .expect("create note in folder a");

        crate::commands::note::move_note_impl(
            path.clone(),
            created.id.clone(),
            Some(folder_b.id.clone()),
        )
        .expect("move note to folder b");

        let in_new_folder = query_notes_impl(
            path.clone(),
            NoteQueryRequest {
                filters: NoteQueryFilters {
                    folder_path_prefix: Some("FolderB".to_string()),
                    ..Default::default()
                },
                sorts: vec![],
            },
        )
        .expect("query folder b");
        assert_eq!(in_new_folder.len(), 1);
        assert_eq!(in_new_folder[0].note_id, created.id);
        assert_eq!(
            in_new_folder[0].folder_id.as_deref(),
            Some(folder_b.id.as_str())
        );
        assert_eq!(in_new_folder[0].folder_path, "FolderB");

        let in_old_folder = query_notes_impl(
            path,
            NoteQueryRequest {
                filters: NoteQueryFilters {
                    folder_path_prefix: Some("FolderA".to_string()),
                    ..Default::default()
                },
                sorts: vec![],
            },
        )
        .expect("query folder a");
        assert!(
            in_old_folder.is_empty(),
            "moved note must no longer be indexed under its old folder path"
        );
    }

    #[test]
    fn delete_folder_recursive_removes_child_note_from_index() {
        let workspace = TestWorkspace::new();
        let path = workspace.path_string();

        let folder = crate::commands::folder::create_folder_sync(
            path.clone(),
            None,
            "Nested".to_string(),
            "📁".to_string(),
        )
        .expect("create folder");
        let created = crate::commands::note::create_note_impl(
            path.clone(),
            Some(folder.id.clone()),
            "Cascaded".to_string(),
            "📄".to_string(),
        )
        .expect("create nested note");

        crate::commands::folder::delete_folder_sync(path.clone(), folder.id.clone(), true)
            .expect("recursive delete of folder with a child note");

        let result = query_notes_impl(path, NoteQueryRequest::default()).expect("query all");
        assert!(
            !result.iter().any(|row| row.note_id == created.id),
            "note cascaded into trash by a recursive folder delete must not remain indexed"
        );
    }
}
