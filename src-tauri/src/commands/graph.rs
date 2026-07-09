use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::path_utils::{normalize_workspace_path, write_atomic};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EdgeKind {
    Link,
    Embed,
    Mention,
    Parent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub kind: EdgeKind,
    pub anchor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacklinkRef {
    #[serde(rename = "sourceId")]
    pub source_id: String,
    #[serde(rename = "sourceTitle")]
    pub source_title: String,
    #[serde(rename = "sourceIcon")]
    pub source_icon: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct GraphIndex {
    // noteId -> list of outgoing edges
    forward: HashMap<String, Vec<GraphEdge>>,
    // noteId -> list of incoming source ids with counts
    backward: HashMap<String, Vec<BacklinkRef>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EdgeInput {
    pub target: String,
    pub kind: EdgeKind,
    pub anchor: Option<String>,
}

fn index_path(workspace_path: &str) -> Result<std::path::PathBuf, String> {
    let base = normalize_workspace_path(workspace_path).map_err(|e| e.to_string())?;
    Ok(base.join(".nevo").join("index").join("graph.json"))
}

fn load_index(workspace_path: &str) -> Result<GraphIndex, String> {
    let path = index_path(workspace_path)?;
    if !path.exists() {
        return Ok(GraphIndex::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_index(workspace_path: &str, index: &GraphIndex) -> Result<(), String> {
    let path = index_path(workspace_path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    write_atomic(&path, json.as_bytes()).map_err(|e| e.to_string())
}

fn rebuild_backward(index: &mut GraphIndex) {
    index.backward.clear();
    for (source_id, edges) in &index.forward {
        let mut counts: HashMap<String, usize> = HashMap::new();
        for edge in edges {
            *counts.entry(edge.target.clone()).or_default() += 1;
        }
        for (target_id, count) in counts {
            let entry = index.backward.entry(target_id).or_default();
            if let Some(existing) = entry.iter_mut().find(|r| r.source_id == *source_id) {
                existing.count = count;
            } else {
                entry.push(BacklinkRef {
                    source_id: source_id.clone(),
                    source_title: String::new(),
                    source_icon: String::new(),
                    count,
                });
            }
        }
    }
}

#[tauri::command]
pub fn graph_update_note_edges(
    workspace_path: String,
    note_id: String,
    edges: Vec<EdgeInput>,
) -> Result<(), String> {
    let mut index = load_index(&workspace_path)?;

    let outgoing: Vec<GraphEdge> = edges
        .into_iter()
        .map(|e| GraphEdge {
            source: note_id.clone(),
            target: e.target,
            kind: e.kind,
            anchor: e.anchor,
        })
        .collect();

    if outgoing.is_empty() {
        index.forward.remove(&note_id);
    } else {
        index.forward.insert(note_id, outgoing);
    }

    rebuild_backward(&mut index);
    save_index(&workspace_path, &index)
}

#[tauri::command]
pub fn graph_get_backlinks(
    workspace_path: String,
    note_id: String,
) -> Result<Vec<BacklinkRef>, String> {
    let index = load_index(&workspace_path)?;
    Ok(index.backward.get(&note_id).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn graph_get_outlinks(
    workspace_path: String,
    note_id: String,
) -> Result<Vec<GraphEdge>, String> {
    let index = load_index(&workspace_path)?;
    Ok(index.forward.get(&note_id).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn graph_remove_note(workspace_path: String, note_id: String) -> Result<(), String> {
    let mut index = load_index(&workspace_path)?;
    index.forward.remove(&note_id);
    // Remove any backlink references pointing to this note
    for refs in index.backward.values_mut() {
        refs.retain(|r| r.source_id != note_id);
    }
    index.backward.remove(&note_id);
    rebuild_backward(&mut index);
    save_index(&workspace_path, &index)
}

#[tauri::command]
pub fn graph_get_all_edges(workspace_path: String) -> Result<Vec<GraphEdge>, String> {
    let index = load_index(&workspace_path)?;
    let all: Vec<GraphEdge> = index.forward.into_values().flatten().collect();
    Ok(all)
}
