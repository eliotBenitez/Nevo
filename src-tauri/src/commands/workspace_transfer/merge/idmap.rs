//! Old-id -> new-id maps for a merge, plus the generic JSON walk that applies
//! them to a note's ProseMirror `content`. Every folder/note id in the
//! imported archive gets a fresh `Uuid::new_v4`, so collisions with ids
//! already present in the destination workspace are impossible by
//! construction — nothing here needs to check for existing ids.

use std::collections::HashMap;

use serde_json::{Map, Value};
use uuid::Uuid;

use crate::commands::workspace::{FolderMeta, WorkspaceManifest};

/// Old-id -> new-id maps built once per merge. `folders` and `notes` are
/// populated up front from the imported manifest tree. `databases` starts
/// empty and grows as V2 database blocks are discovered while walking note
/// content (`remap_content`), since the manifest alone does not enumerate
/// them — a database block's id only appears inside a note's `content`.
#[derive(Debug, Default)]
pub(super) struct IdMaps {
    pub folders: HashMap<String, String>,
    pub notes: HashMap<String, String>,
    pub databases: HashMap<String, String>,
}

fn walk_folder_ids(folder: &FolderMeta, maps: &mut IdMaps) {
    maps.folders
        .insert(folder.id.clone(), Uuid::new_v4().to_string());
    for note in &folder.notes {
        maps.notes
            .insert(note.id.clone(), Uuid::new_v4().to_string());
    }
    for child in &folder.children {
        walk_folder_ids(child, maps);
    }
}

/// Builds the folder/note id maps from the imported manifest's `tree` and
/// `rootNotes`. `trash` is deliberately never walked — trashed items are
/// never imported (see `manifest_merge::merge_manifest_tree`).
pub(super) fn build_id_maps(manifest: &WorkspaceManifest) -> IdMaps {
    let mut maps = IdMaps::default();
    for folder in &manifest.tree {
        walk_folder_ids(folder, &mut maps);
    }
    for note in &manifest.root_notes {
        maps.notes
            .insert(note.id.clone(), Uuid::new_v4().to_string());
    }
    maps
}

/// Recursively walks a note's ProseMirror `content` JSON, remapping any
/// object's `attrs.noteId` that is present in `maps.notes`. This is
/// deliberately generic over node/mark type names (it covers both the
/// `internal_link` mark and the `note_embed` node without special-casing
/// either) — remapping only ever replaces a string with a value already
/// present in `maps.notes`, so a false-positive match is not possible.
/// `attrs.data` on a database-block node is also inspected and remapped in
/// place via `remap_database_attrs_data`.
pub(super) fn remap_content(value: &mut Value, maps: &mut IdMaps) {
    match value {
        Value::Object(map) => {
            if let Some(Value::Object(attrs)) = map.get_mut("attrs") {
                remap_attrs(attrs, maps);
            }
            for nested in map.values_mut() {
                remap_content(nested, maps);
            }
        }
        Value::Array(items) => {
            for item in items.iter_mut() {
                remap_content(item, maps);
            }
        }
        _ => {}
    }
}

fn remap_attrs(attrs: &mut Map<String, Value>, maps: &mut IdMaps) {
    if let Some(note_id) = attrs
        .get("noteId")
        .and_then(Value::as_str)
        .map(str::to_owned)
    {
        if let Some(new_id) = maps.notes.get(&note_id) {
            attrs.insert("noteId".to_string(), Value::String(new_id.clone()));
        }
    }
    if let Some(data) = attrs.get("data") {
        if let Some(remapped) = remap_database_attrs_data(data, maps) {
            attrs.insert("data".to_string(), remapped);
        }
    }
}

/// `attrs.data` on a database-block node is either a V1 payload (inline
/// `records`, no `databaseId` — block-local ids, no collision risk, left
/// untouched) or a V2 payload (`databaseId` pointing at rows in
/// `databases.sqlite`), stored as either a JSON object or a JSON-encoded
/// string (both occur in practice). Returns `None` (leave `attrs.data`
/// untouched) for V1 or anything unparseable; otherwise returns the same
/// shape it was given with `databaseId` remapped — object stays object,
/// string stays a re-serialized JSON string — allocating a fresh id in
/// `maps.databases` on first sight of an old id.
fn remap_database_attrs_data(data: &Value, maps: &mut IdMaps) -> Option<Value> {
    match data {
        Value::Object(fields) => {
            let old_id = fields.get("databaseId")?.as_str()?.to_string();
            let new_id = remapped_database_id(&old_id, maps);
            let mut next = fields.clone();
            next.insert("databaseId".to_string(), Value::String(new_id));
            Some(Value::Object(next))
        }
        Value::String(raw) => {
            let mut parsed: Value = serde_json::from_str(raw).ok()?;
            let fields = parsed.as_object_mut()?;
            let old_id = fields.get("databaseId")?.as_str()?.to_string();
            let new_id = remapped_database_id(&old_id, maps);
            fields.insert("databaseId".to_string(), Value::String(new_id));
            serde_json::to_string(&parsed).ok().map(Value::String)
        }
        _ => None,
    }
}

fn remapped_database_id(old_id: &str, maps: &mut IdMaps) -> String {
    maps.databases
        .entry(old_id.to_string())
        .or_insert_with(|| Uuid::new_v4().to_string())
        .clone()
}
