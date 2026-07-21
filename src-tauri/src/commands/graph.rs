use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use dashmap::DashMap;

use super::path_utils::{normalize_workspace_path, validate_id, write_atomic};

static GRAPH_LOCKS: OnceLock<DashMap<String, Arc<Mutex<()>>>> = OnceLock::new();

fn graph_lock(workspace_path: &str) -> Arc<Mutex<()>> {
    GRAPH_LOCKS
        .get_or_init(DashMap::new)
        .entry(workspace_path.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

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
    if !base.join(".nevo/workspace.json").is_file() {
        return Err("Workspace manifest is missing".to_string());
    }
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

fn update_backward_for_source(
    index: &mut GraphIndex,
    source_id: &str,
    old_edges: &[GraphEdge],
    new_edges: &[GraphEdge],
) {
    let old_targets = old_edges
        .iter()
        .map(|edge| edge.target.clone())
        .collect::<std::collections::HashSet<_>>();
    for target in old_targets {
        let remove_target = if let Some(backlinks) = index.backward.get_mut(&target) {
            backlinks.retain(|backlink| backlink.source_id != source_id);
            backlinks.is_empty()
        } else {
            false
        };
        if remove_target {
            index.backward.remove(&target);
        }
    }

    let mut counts = HashMap::<String, usize>::new();
    for edge in new_edges {
        *counts.entry(edge.target.clone()).or_default() += 1;
    }
    for (target, count) in counts {
        index.backward.entry(target).or_default().push(BacklinkRef {
            source_id: source_id.to_string(),
            source_title: String::new(),
            source_icon: String::new(),
            count,
        });
    }
}

fn graph_update_note_edges_sync(
    workspace_path: String,
    note_id: String,
    edges: Vec<EdgeInput>,
) -> Result<(), String> {
    validate_id(&note_id)?;
    if edges.len() > 10_000 {
        return Err("Graph edge update exceeds the limit".to_string());
    }
    for edge in &edges {
        validate_id(&edge.target)?;
    }
    let lock = graph_lock(&workspace_path);
    let _guard = lock.lock().map_err(|error| error.to_string())?;
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

    let old_outgoing = index.forward.remove(&note_id).unwrap_or_default();
    update_backward_for_source(&mut index, &note_id, &old_outgoing, &outgoing);
    if !outgoing.is_empty() {
        index.forward.insert(note_id, outgoing);
    }
    save_index(&workspace_path, &index)
}

#[tauri::command]
pub async fn graph_update_note_edges(
    workspace_path: String,
    note_id: String,
    edges: Vec<EdgeInput>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        graph_update_note_edges_sync(workspace_path, note_id, edges)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn graph_get_backlinks(
    workspace_path: String,
    note_id: String,
) -> Result<Vec<BacklinkRef>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_id(&note_id)?;
        let index = load_index(&workspace_path)?;
        Ok(index.backward.get(&note_id).cloned().unwrap_or_default())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn graph_get_outlinks(
    workspace_path: String,
    note_id: String,
) -> Result<Vec<GraphEdge>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_id(&note_id)?;
        let index = load_index(&workspace_path)?;
        Ok(index.forward.get(&note_id).cloned().unwrap_or_default())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn graph_remove_note_sync(workspace_path: String, note_id: String) -> Result<(), String> {
    validate_id(&note_id)?;
    let lock = graph_lock(&workspace_path);
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    let mut index = load_index(&workspace_path)?;
    let old_outgoing = index.forward.remove(&note_id).unwrap_or_default();
    update_backward_for_source(&mut index, &note_id, &old_outgoing, &[]);

    // A deleted note cannot remain as a target. Removing those inbound edges
    // also prevents its backlink bucket from being recreated on later writes.
    index.backward.remove(&note_id);
    for edges in index.forward.values_mut() {
        edges.retain(|edge| edge.target != note_id);
    }
    index.forward.retain(|_, edges| !edges.is_empty());
    save_index(&workspace_path, &index)
}

#[tauri::command]
pub async fn graph_remove_note(workspace_path: String, note_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || graph_remove_note_sync(workspace_path, note_id))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn graph_get_all_edges(workspace_path: String) -> Result<Vec<GraphEdge>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let index = load_index(&workspace_path)?;
        Ok(index.forward.into_values().flatten().collect())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        graph_remove_note_sync, graph_update_note_edges_sync, load_index, EdgeInput, EdgeKind,
    };

    fn workspace() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("nevo_graph_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".nevo")).unwrap();
        std::fs::write(root.join(".nevo/workspace.json"), "{}").unwrap();
        root
    }

    #[test]
    fn updates_only_the_changed_sources_backlinks_and_removes_deleted_targets() {
        let root = workspace();
        let path = root.to_string_lossy().into_owned();
        graph_update_note_edges_sync(
            path.clone(),
            "source-a".into(),
            vec![
                EdgeInput {
                    target: "target-a".into(),
                    kind: EdgeKind::Link,
                    anchor: None,
                },
                EdgeInput {
                    target: "target-a".into(),
                    kind: EdgeKind::Mention,
                    anchor: None,
                },
            ],
        )
        .unwrap();
        graph_update_note_edges_sync(
            path.clone(),
            "source-b".into(),
            vec![EdgeInput {
                target: "target-b".into(),
                kind: EdgeKind::Link,
                anchor: None,
            }],
        )
        .unwrap();

        let index = load_index(&path).unwrap();
        assert_eq!(index.backward["target-a"][0].count, 2);
        assert_eq!(index.backward["target-b"][0].source_id, "source-b");

        graph_remove_note_sync(path.clone(), "target-b".into()).unwrap();
        let index = load_index(&path).unwrap();
        assert!(!index.backward.contains_key("target-b"));
        assert!(!index.forward.contains_key("source-b"));

        std::fs::remove_dir_all(root).ok();
    }
}
