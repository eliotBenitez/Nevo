//! Best-effort extras: merging the archive's link-index cache, copying
//! templates under fresh ids, and counting the deferred artifacts (standalone
//! kanban boards, note snapshot history) that v1 merge does not import.

use std::path::Path;

use serde_json::Value;

use crate::commands::path_utils::write_atomic;

use super::idmap::IdMaps;

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

fn remap_edge(edge: &Value, maps: &IdMaps) -> Option<Value> {
    let object = edge.as_object()?;
    let target = object.get("target")?.as_str()?;
    let new_target = maps.notes.get(target)?;
    let mut next = object.clone();
    next.insert("target".to_string(), Value::String(new_target.clone()));
    if let Some(source) = object.get("source").and_then(Value::as_str) {
        if let Some(new_source) = maps.notes.get(source) {
            next.insert("source".to_string(), Value::String(new_source.clone()));
        }
    }
    Some(Value::Object(next))
}

fn remap_backlink(backlink: &Value, maps: &IdMaps) -> Option<Value> {
    let object = backlink.as_object()?;
    let source_id = object.get("sourceId")?.as_str()?;
    let new_source_id = maps.notes.get(source_id)?;
    let mut next = object.clone();
    next.insert("sourceId".to_string(), Value::String(new_source_id.clone()));
    Some(Value::Object(next))
}

fn merge_edge_map(
    source: &Value,
    dest: &mut Value,
    key: &str,
    maps: &IdMaps,
    remap: impl Fn(&Value, &IdMaps) -> Option<Value>,
) {
    let Some(entries) = source.get(key).and_then(Value::as_object) else {
        return;
    };
    let Some(dest_map) = dest.as_object_mut().and_then(|obj| {
        obj.entry(key)
            .or_insert_with(|| Value::Object(Default::default()))
            .as_object_mut()
    }) else {
        return;
    };

    for (old_note_id, values) in entries {
        let Some(new_note_id) = maps.notes.get(old_note_id) else {
            continue;
        };
        let Some(values) = values.as_array() else {
            continue;
        };
        let remapped: Vec<Value> = values
            .iter()
            .filter_map(|value| remap(value, maps))
            .collect();
        dest_map.insert(new_note_id.clone(), Value::Array(remapped));
    }
}

fn try_merge_graph_index(
    temp_dir: &Path,
    current_root: &Path,
    maps: &IdMaps,
) -> Result<(), String> {
    let source_path = temp_dir.join(".nevo").join("index").join("graph.json");
    if !source_path.is_file() {
        return Ok(());
    }
    let source_raw = std::fs::read_to_string(&source_path).map_err(|error| error.to_string())?;
    let source: Value = serde_json::from_str(&source_raw).map_err(|error| error.to_string())?;

    let dest_path = current_root.join(".nevo").join("index").join("graph.json");
    let mut dest: Value = if dest_path.is_file() {
        std::fs::read_to_string(&dest_path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_else(default_graph_index)
    } else {
        default_graph_index()
    };

    // Edges/backlinks whose target/source falls outside the imported note-id
    // map are dropped rather than left dangling — `remap_edge`/`remap_backlink`
    // return `None` for those and `merge_edge_map` filters them out.
    merge_edge_map(&source, &mut dest, "forward", maps, remap_edge);
    merge_edge_map(&source, &mut dest, "backward", maps, remap_backlink);

    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let serialized = serde_json::to_vec_pretty(&dest).map_err(|error| error.to_string())?;
    write_atomic(&dest_path, &serialized).map_err(|error| error.to_string())
}

/// Merges `.nevo/index/graph.json` into the current workspace's copy,
/// remapping every note id it references. Best-effort: the graph index is a
/// derived cache the app can rebuild, so a failure here is swallowed rather
/// than aborting the whole merge.
pub(super) fn merge_graph_index(temp_dir: &Path, current_root: &Path, maps: &IdMaps) {
    let _ = try_merge_graph_index(temp_dir, current_root, maps);
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
