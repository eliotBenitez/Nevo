use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};

use dashmap::DashMap;

use super::path_utils::{normalize_workspace_path, validate_id, write_atomic};

static GRAPH_LOCKS: OnceLock<DashMap<String, Arc<Mutex<()>>>> = OnceLock::new();

/// Normalized workspace path: the `graph_lock` key and the base for every
/// manifest/note read, so IPC commands and Rust write paths share one mutex.
pub(crate) fn normalized_workspace(workspace_path: &str) -> Result<String, String> {
    Ok(normalize_workspace_path(workspace_path)?
        .to_string_lossy()
        .into_owned())
}

/// Expects a path from `normalized_workspace`.
pub(crate) fn graph_lock(workspace_path: &str) -> Arc<Mutex<()>> {
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
    // Set once every note's links were read from note.json. Older indexes only
    // held edges of notes edited in the open editor, missing notes written by
    // MCP, import or restore.
    #[serde(default, rename = "linksBackfilled")]
    links_backfilled: bool,
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

/// Internal-link edges of a note body, matching the editor's `extractLinks`:
/// only text nodes reached through `content` count, never marks on inline
/// atoms or JSON inside node attrs. Unresolved links (empty or invalid
/// `noteId`) are skipped later, not rejected, so one broken `[[Title]]` cannot
/// drop the note's other edges.
pub(crate) fn extract_link_edges(content: &serde_json::Value) -> Vec<EdgeInput> {
    fn walk(node: &serde_json::Value, edges: &mut Vec<EdgeInput>) {
        if node.get("type").and_then(|t| t.as_str()) == Some("text") {
            let attrs = node
                .get("marks")
                .and_then(|marks| marks.as_array())
                .and_then(|marks| {
                    marks.iter().find(|mark| {
                        mark.get("type").and_then(|t| t.as_str()) == Some("internal_link")
                    })
                })
                .and_then(|mark| mark.get("attrs"));
            if let Some(attrs) = attrs {
                if let Some(target) = attrs.get("noteId").and_then(|id| id.as_str()) {
                    edges.push(EdgeInput {
                        target: target.to_string(),
                        kind: EdgeKind::Link,
                        anchor: attrs
                            .get("anchor")
                            .and_then(|a| a.as_str())
                            .map(str::to_string),
                    });
                }
            }
        }
        if let Some(children) = node.get("content").and_then(|c| c.as_array()) {
            children.iter().for_each(|child| walk(child, edges));
        }
    }
    let mut edges = Vec::new();
    walk(content, &mut edges);
    edges
}

fn to_graph_edges(note_id: &str, edges: Vec<EdgeInput>) -> Vec<GraphEdge> {
    edges
        .into_iter()
        .filter(|edge| validate_id(&edge.target).is_ok())
        .map(|e| GraphEdge {
            source: note_id.to_string(),
            target: e.target,
            kind: e.kind,
            anchor: e.anchor,
        })
        .collect()
}

fn replace_outgoing(index: &mut GraphIndex, note_id: &str, outgoing: Vec<GraphEdge>) {
    let old_outgoing = index.forward.remove(note_id).unwrap_or_default();
    update_backward_for_source(index, note_id, &old_outgoing, &outgoing);
    if !outgoing.is_empty() {
        index.forward.insert(note_id.to_string(), outgoing);
    }
}

/// Rebuilds every note's link edges from note.json once per workspace and
/// drops sources no longer in the manifest (trashed or deleted notes). Must
/// run under `graph_lock` with a normalized path. Returns whether the index
/// changed.
fn backfill_links(workspace_path: &str, index: &mut GraphIndex) -> Result<bool, String> {
    if index.links_backfilled {
        return Ok(false);
    }
    let manifest = super::folder::load_manifest(workspace_path)?;
    let note_ids = super::folder::manifest_note_ids(&manifest);
    let live: HashSet<&str> = note_ids.iter().map(String::as_str).collect();
    let stale: Vec<String> = index
        .forward
        .keys()
        .filter(|id| !live.contains(id.as_str()))
        .cloned()
        .collect();
    for note_id in stale {
        replace_outgoing(index, &note_id, Vec::new());
    }
    for note_id in &note_ids {
        let Ok(path) = super::note::note_path(workspace_path, note_id) else {
            continue;
        };
        // Unreadable notes keep whatever edges they had: best-effort, like
        // the note metadata index backfill.
        let Some(content) = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|mut note| note.get_mut("content").map(serde_json::Value::take))
        else {
            continue;
        };
        replace_outgoing(
            index,
            note_id,
            to_graph_edges(note_id, extract_link_edges(&content)),
        );
    }
    index.links_backfilled = true;
    Ok(true)
}

fn load_backfilled_index(workspace_path: &str) -> Result<GraphIndex, String> {
    let workspace_path = normalized_workspace(workspace_path)?;
    let lock = graph_lock(&workspace_path);
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    let mut index = load_index(&workspace_path)?;
    // A failed rebuild or write must not fail the read: the in-memory index is
    // still served, and an unsaved rebuild is retried on the next read.
    let failure = match backfill_links(&workspace_path, &mut index) {
        Ok(true) => save_index(&workspace_path, &index).err(),
        Ok(false) => None,
        Err(message) => Some(message),
    };
    if let Some(message) = failure {
        let _ = crate::logging::logger().warn(
            "tauri.graph",
            "backfill_links",
            "Failed to rebuild the link graph index",
            super::workspace::is_extended_diagnostics_enabled(&workspace_path),
            crate::logging::LogContext::default().with_error(crate::logging::LogError {
                kind: Some("io".to_string()),
                message,
                details: None,
            }),
        );
    }
    Ok(index)
}

fn graph_update_note_edges_sync(
    workspace_path: String,
    note_id: String,
    edges: Vec<EdgeInput>,
) -> Result<(), String> {
    // IPC payload cap; Rust-extracted edges are bounded by the note itself.
    if edges.len() > 10_000 {
        return Err("Graph edge update exceeds the limit".to_string());
    }
    update_note_edges(&workspace_path, &note_id, edges)
}

fn update_note_edges(
    workspace_path: &str,
    note_id: &str,
    edges: Vec<EdgeInput>,
) -> Result<(), String> {
    validate_id(note_id)?;
    let workspace_path = normalized_workspace(workspace_path)?;
    let lock = graph_lock(&workspace_path);
    let _guard = lock.lock().map_err(|error| error.to_string())?;
    let mut index = load_index(&workspace_path)?;

    let outgoing = to_graph_edges(note_id, edges);
    // Every autosave reaches this; skip rewriting graph.json when nothing changed.
    let unchanged = index
        .forward
        .get(note_id)
        .map_or(outgoing.is_empty(), |current| current == &outgoing);
    if unchanged {
        return Ok(());
    }
    replace_outgoing(&mut index, note_id, outgoing);
    save_index(&workspace_path, &index)
}

/// Refreshes a note's link edges from its saved body. Called by the Rust write
/// paths so notes saved without the editor open still reach the graph.
pub(crate) fn index_note_links(
    workspace_path: &str,
    note_id: &str,
    content: &serde_json::Value,
) -> Result<(), String> {
    update_note_edges(workspace_path, note_id, extract_link_edges(content))
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
        let index = load_backfilled_index(&workspace_path)?;
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
        let index = load_backfilled_index(&workspace_path)?;
        Ok(index.forward.get(&note_id).cloned().unwrap_or_default())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn graph_remove_note_sync(workspace_path: String, note_id: String) -> Result<(), String> {
    validate_id(&note_id)?;
    let workspace_path = normalized_workspace(&workspace_path)?;
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
        let index = load_backfilled_index(&workspace_path)?;
        Ok(index.forward.into_values().flatten().collect())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        extract_link_edges, graph_remove_note_sync, graph_update_note_edges_sync, index_note_links,
        load_backfilled_index, load_index, EdgeInput, EdgeKind,
    };
    use serde_json::json;

    fn linked_content(targets: &[&str]) -> serde_json::Value {
        let paragraphs: Vec<_> = targets
            .iter()
            .map(|target| {
                json!({ "type": "paragraph", "content": [{
                    "type": "text",
                    "text": "link",
                    "marks": [{ "type": "internal_link", "attrs": { "noteId": target, "anchor": null } }]
                }] })
            })
            .collect();
        json!({ "type": "doc", "content": paragraphs })
    }

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

    #[test]
    fn unresolved_links_are_skipped_instead_of_dropping_the_note() {
        let root = workspace();
        let path = root.to_string_lossy().into_owned();
        let content = linked_content(&["target-a", "", "bad id"]);
        assert_eq!(extract_link_edges(&content).len(), 3);

        index_note_links(&path, "source-a", &content).unwrap();
        let index = load_index(&path).unwrap();
        assert_eq!(index.forward["source-a"].len(), 1);
        assert_eq!(index.forward["source-a"][0].target, "target-a");

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn backfills_links_of_notes_never_opened_in_the_editor() {
        let root = workspace();
        let path = root.to_string_lossy().into_owned();
        std::fs::write(
            root.join(".nevo/workspace.json"),
            json!({
                "id": "ws", "name": "ws", "glyph": "", "gradient": "",
                "schemaVersion": 2, "createdAt": "", "rootOrder": [],
                "tree": [{
                    "id": "folder", "title": "F", "icon": "", "parentId": null, "order": 0,
                    "children": [], "notes": [{ "id": "toc", "title": "TOC", "icon": "", "folderId": "folder", "order": 0, "updatedAt": "" }]
                }],
                "rootNotes": []
            })
            .to_string(),
        )
        .unwrap();
        let note_file = super::super::note::note_path(&path, "toc").unwrap();
        std::fs::create_dir_all(note_file.parent().unwrap()).unwrap();
        std::fs::write(
            &note_file,
            json!({ "id": "toc", "content": linked_content(&["n1", "n2"]) }).to_string(),
        )
        .unwrap();
        // A trashed or deleted note still in the index from an earlier build.
        index_note_links(&path, "ghost", &linked_content(&["n3"])).unwrap();

        let index = load_backfilled_index(&path).unwrap();
        assert_eq!(index.forward["toc"].len(), 2);
        assert_eq!(index.backward["n1"][0].source_id, "toc");
        assert!(!index.forward.contains_key("ghost"));
        assert!(!index.backward.contains_key("n3"));
        assert!(load_index(&path).unwrap().links_backfilled);

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn extraction_ignores_marks_outside_text_nodes() {
        let link =
            json!([{ "type": "internal_link", "attrs": { "noteId": "n1", "anchor": null } }]);
        let content = json!({ "type": "doc", "content": [{ "type": "paragraph", "content": [
            { "type": "math_inline", "attrs": { "latex": "x" }, "marks": link },
            { "type": "plugin_block", "attrs": { "doc": { "type": "text", "text": "x", "marks": link } } },
            { "type": "text", "text": "x", "marks": link }
        ] }] });
        assert_eq!(extract_link_edges(&content).len(), 1);
    }

    #[test]
    fn unchanged_edges_do_not_rewrite_the_index() {
        let root = workspace();
        let path = root.to_string_lossy().into_owned();
        let content = linked_content(&["target-a"]);
        index_note_links(&path, "source-a", &content).unwrap();
        let graph_file = root.join(".nevo/index/graph.json");
        let mut raw: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&graph_file).unwrap()).unwrap();
        raw["probe"] = json!(true);
        std::fs::write(&graph_file, raw.to_string()).unwrap();

        index_note_links(&path, "source-a", &content).unwrap();
        assert!(std::fs::read_to_string(&graph_file)
            .unwrap()
            .contains("probe"));

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn a_failed_backfill_write_still_serves_the_read() {
        let root = workspace();
        let path = root.to_string_lossy().into_owned();
        std::fs::write(
            root.join(".nevo/workspace.json"),
            json!({
                "id": "ws", "name": "ws", "glyph": "", "gradient": "",
                "schemaVersion": 2, "createdAt": "", "rootOrder": ["a"], "tree": [],
                "rootNotes": [{ "id": "a", "title": "A", "icon": "", "folderId": null, "order": 0, "updatedAt": "" }]
            })
            .to_string(),
        )
        .unwrap();
        let note_file = super::super::note::note_path(&path, "a").unwrap();
        std::fs::create_dir_all(note_file.parent().unwrap()).unwrap();
        std::fs::write(
            &note_file,
            json!({ "id": "a", "content": linked_content(&["n1"]) }).to_string(),
        )
        .unwrap();
        // `.nevo/index` as a file makes every graph.json write fail.
        std::fs::write(root.join(".nevo/index"), "").unwrap();

        let index = load_backfilled_index(&path).unwrap();
        assert_eq!(index.forward["a"][0].target, "n1");

        std::fs::remove_dir_all(root).ok();
    }
}
