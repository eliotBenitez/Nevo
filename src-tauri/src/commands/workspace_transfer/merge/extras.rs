//! Best-effort extras: requesting a link-index rebuild, copying
//! templates under fresh ids, and counting the deferred artifacts (standalone
//! kanban boards, note snapshot history) that v1 merge does not import.

use std::path::Path;

use serde_json::Value;

use crate::commands::graph;
use crate::commands::path_utils::write_atomic;

/// Counts artifacts the merge deliberately does not import (standalone
/// kanban boards under `.nevo/boards/*.json`, and per-note snapshot history
/// under `.nevo/snapshots/**`), so the caller can report an honest
/// `MergeReport` instead of silently dropping them. Import-as-new-workspace
/// (Phase 2) copies both in full; only the merge-into-current flow defers
/// them (see the plan's "Out of scope (v1)" list).
pub(super) fn count_deferred(temp_dir: &Path) -> (u64, u64) {
    let boards = count_json_files(&temp_dir.join(".nevo").join("boards"));
    let snapshots = count_files_recursive(&temp_dir.join(".nevo").join("snapshots"));
    (boards, snapshots)
}

fn count_json_files(dir: &Path) -> u64 {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
                .count() as u64
        })
        .unwrap_or(0)
}

fn count_files_recursive(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut count = 0;
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            count += count_files_recursive(&entry.path());
        } else if file_type.is_file() {
            count += 1;
        }
    }
    count
}

fn default_graph_index() -> Value {
    serde_json::json!({ "forward": {}, "backward": {} })
}

/// Requests a link rebuild for the merged notes. The archive's own index is
/// not copied: the rebuild re-reads every manifest note's links from
/// note.json and replaces whatever edges were there.
fn try_reset_graph_index(current_root: &Path) -> Result<(), String> {
    // Same lock as note saves, which also rewrite graph.json.
    let workspace = graph::normalized_workspace(&current_root.to_string_lossy())?;
    let lock = graph::graph_lock(&workspace);
    let mut slot = lock.lock().map_err(|error| error.to_string())?;
    slot.invalidate();

    let dest_path = current_root.join(".nevo").join("index").join("graph.json");
    let mut dest: Value = std::fs::read_to_string(&dest_path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(default_graph_index);
    if let Some(dest) = dest.as_object_mut() {
        dest.insert("linksBackfilled".to_string(), Value::Bool(false));
    }

    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let serialized = serde_json::to_vec_pretty(&dest).map_err(|error| error.to_string())?;
    write_atomic(&dest_path, &serialized).map_err(|error| error.to_string())
}

/// Best-effort: the graph index is a derived cache the app can rebuild, so a
/// failure here is swallowed rather than aborting the whole merge.
pub(super) fn reset_graph_index(current_root: &Path) {
    let _ = try_reset_graph_index(current_root);
}

fn copy_one_template(source_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let raw = std::fs::read_to_string(source_path).map_err(|error| error.to_string())?;
    let mut value: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    let new_id = uuid::Uuid::new_v4().to_string();
    value
        .as_object_mut()
        .ok_or_else(|| "Template is not a JSON object".to_string())?
        .insert("id".to_string(), Value::String(new_id.clone()));

    std::fs::create_dir_all(dest_dir).map_err(|error| error.to_string())?;
    let dest_path = dest_dir.join(format!("{new_id}.json"));
    let serialized = serde_json::to_vec_pretty(&value).map_err(|error| error.to_string())?;
    write_atomic(&dest_path, &serialized).map_err(|error| error.to_string())
}

/// Copies every `.nevo/templates/*.json` from the archive into the current
/// workspace under a fresh id (both the filename and the `id` field are
/// rewritten). Best-effort per file: a malformed template is skipped rather
/// than aborting the merge.
pub(super) fn copy_templates(temp_dir: &Path, current_root: &Path) {
    let source_dir = temp_dir.join(".nevo").join("templates");
    let Ok(entries) = std::fs::read_dir(&source_dir) else {
        return;
    };
    let dest_dir = current_root.join(".nevo").join("templates");

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let _ = copy_one_template(&path, &dest_dir);
    }
}

#[cfg(test)]
mod tests {
    use super::try_reset_graph_index;

    #[test]
    fn merge_without_an_archive_index_still_requests_a_link_backfill() {
        let root = std::env::temp_dir().join(format!("nevo_merge_graph_{}", uuid::Uuid::new_v4()));
        let archive = root.join("archive");
        let current = root.join("current");
        std::fs::create_dir_all(archive.join(".nevo")).unwrap();
        std::fs::create_dir_all(current.join(".nevo/index")).unwrap();
        std::fs::write(
            current.join(".nevo/index/graph.json"),
            r#"{"forward":{},"backward":{},"linksBackfilled":true}"#,
        )
        .unwrap();

        try_reset_graph_index(&current).unwrap();

        let raw = std::fs::read_to_string(current.join(".nevo/index/graph.json")).unwrap();
        let index: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(index["linksBackfilled"], false);

        std::fs::remove_dir_all(root).ok();
    }
}
