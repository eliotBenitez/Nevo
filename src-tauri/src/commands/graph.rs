use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};

use dashmap::DashMap;

use super::path_utils::{normalize_workspace_path, validate_id, write_atomic};

static GRAPH_LOCKS: OnceLock<DashMap<String, Arc<Mutex<GraphSlot>>>> = OnceLock::new();

/// Normalized workspace path: the `graph_lock` key and the base for every
/// manifest/note read, so IPC commands and Rust write paths share one mutex.
pub(crate) fn normalized_workspace(workspace_path: &str) -> Result<String, String> {
    Ok(normalize_workspace_path(workspace_path)?
        .to_string_lossy()
        .into_owned())
}

/// Serializes graph.json access per workspace and guards its parsed cache.
/// Expects a path from `normalized_workspace`.
pub(crate) fn graph_lock(workspace_path: &str) -> Arc<Mutex<GraphSlot>> {
    let locks = GRAPH_LOCKS.get_or_init(DashMap::new);
    // Only the workspace in use keeps its parsed index resident; idle slots
    // drop theirs (a busy slot is skipped, never waited on).
    for entry in locks.iter() {
        if entry.key() != workspace_path {
            if let Ok(mut slot) = entry.value().try_lock() {
                slot.invalidate();
            }
        }
    }
    locks
        .entry(workspace_path.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(GraphSlot::default())))
        .clone()
}

type FileStamp = Option<(std::time::SystemTime, u64)>;

fn file_stamp(path: &std::path::Path) -> FileStamp {
    let meta = std::fs::metadata(path).ok()?;
    Some((meta.modified().ok()?, meta.len()))
}

struct CachedIndex {
    path: std::path::PathBuf,
    stamp: FileStamp,
    index: GraphIndex,
}

/// The parsed graph.json, so autosave does not re-parse the whole workspace
/// index on every save. Re-read whenever the file's mtime/size differs from
/// the last read or write here. After a failed write the in-memory index stays
/// authoritative until the next successful one.
#[derive(Default)]
pub(crate) struct GraphSlot(Option<CachedIndex>);

impl GraphSlot {
    fn index_mut(&mut self, workspace_path: &str) -> Result<&mut GraphIndex, String> {
        let path = index_path(workspace_path)?;
        // Stat before reading: a write racing the read leaves a stale stamp,
        // which only forces another re-read.
        let stamp = file_stamp(&path);
        let fresh = matches!(&self.0, Some(cached) if cached.path == path && cached.stamp == stamp);
        if !fresh {
            let index = load_index(workspace_path)?;
            self.0 = Some(CachedIndex { path, stamp, index });
        }
        self.0
            .as_mut()
            .map(|cached| &mut cached.index)
            .ok_or_else(|| "Graph index cache is empty".to_string())
    }

    fn save(&mut self) -> Result<(), String> {
        let Some(cached) = self.0.as_mut() else {
            return Ok(());
        };
        save_index(&cached.path, &cached.index)?;
        cached.stamp = file_stamp(&cached.path);
        Ok(())
    }

    #[cfg(test)]
    fn is_empty(&self) -> bool {
        self.0.is_none()
    }

    /// For writers that replace graph.json directly (workspace merge).
    pub(crate) fn invalidate(&mut self) {
        self.0 = None;
    }
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
    // An unparseable cache starts empty with `linksBackfilled` false, so the
    // next read rebuilds it from note.json instead of failing forever.
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

fn save_index(path: &std::path::Path, index: &GraphIndex) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(index).map_err(|e| e.to_string())?;
    write_atomic(path, json.as_bytes()).map_err(|e| e.to_string())
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

/// Internal-link edges of a note body: only text nodes reached through
/// `content` count, never marks on inline atoms or JSON inside node attrs.
/// Unresolved links (empty or invalid `noteId`) are skipped, not rejected, so
/// one broken `[[Title]]` cannot drop the note's other edges.
fn extract_link_edges(note_id: &str, content: &serde_json::Value) -> Vec<GraphEdge> {
    fn walk(note_id: &str, node: &serde_json::Value, edges: &mut Vec<GraphEdge>) {
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
                let target = attrs.get("noteId").and_then(|id| id.as_str());
                if let Some(target) = target.filter(|id| validate_id(id).is_ok()) {
                    edges.push(GraphEdge {
                        source: note_id.to_string(),
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
            children
                .iter()
                .for_each(|child| walk(note_id, child, edges));
        }
    }
    let mut edges = Vec::new();
    walk(note_id, content, &mut edges);
    edges
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
        replace_outgoing(index, note_id, extract_link_edges(note_id, &content));
    }
    index.links_backfilled = true;
    Ok(true)
}

/// Runs `read` on the workspace's index after the one-time link backfill.
fn with_backfilled_index<R>(
    workspace_path: &str,
    read: impl FnOnce(&GraphIndex) -> R,
) -> Result<R, String> {
    let workspace_path = normalized_workspace(workspace_path)?;
    let lock = graph_lock(&workspace_path);
    let mut slot = lock.lock().map_err(|error| error.to_string())?;
    // A failed rebuild or write must not fail the read: the in-memory index is
    // still served, and a rebuild that never ran is retried on the next read.
    let failure = match backfill_links(&workspace_path, slot.index_mut(&workspace_path)?) {
        Ok(true) => slot.save().err(),
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
    Ok(read(slot.index_mut(&workspace_path)?))
}

fn update_note_edges(
    workspace_path: &str,
    note_id: &str,
    outgoing: Vec<GraphEdge>,
) -> Result<(), String> {
    validate_id(note_id)?;
    let workspace_path = normalized_workspace(workspace_path)?;
    let lock = graph_lock(&workspace_path);
    let mut slot = lock.lock().map_err(|error| error.to_string())?;
    let index = slot.index_mut(&workspace_path)?;

    // Every autosave reaches this; skip rewriting graph.json when nothing changed.
    let unchanged = index
        .forward
        .get(note_id)
        .map_or(outgoing.is_empty(), |current| current == &outgoing);
    if unchanged {
        return Ok(());
    }
    replace_outgoing(index, note_id, outgoing);
    save_or_invalidate(&mut slot)
}

/// A failed write must not leave the change only in memory: later identical
/// updates would look unchanged and never retry. Dropping the cache makes the
/// next update re-read disk and write again.
fn save_or_invalidate(slot: &mut GraphSlot) -> Result<(), String> {
    let saved = slot.save();
    if saved.is_err() {
        slot.invalidate();
    }
    saved
}

/// Refreshes a note's link edges from its saved body. The graph is maintained
/// next to `note_index` in the Rust note lifecycle (save, snapshot and trash
/// restore, plugin migration, trash, purge); the editor only re-reads it.
pub(crate) fn index_note_links(
    workspace_path: &str,
    note_id: &str,
    content: &serde_json::Value,
) -> Result<(), String> {
    update_note_edges(
        workspace_path,
        note_id,
        extract_link_edges(note_id, content),
    )
}

/// Drops a trashed note's outgoing edges. Edges pointing at it stay, so they
/// are still there if the note is restored from trash.
pub(crate) fn remove_note_links(workspace_path: &str, note_id: &str) -> Result<(), String> {
    update_note_edges(workspace_path, note_id, Vec::new())
}

#[tauri::command]
pub async fn graph_get_backlinks(
    workspace_path: String,
    note_id: String,
) -> Result<Vec<BacklinkRef>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_id(&note_id)?;
        with_backfilled_index(&workspace_path, |index| {
            index.backward.get(&note_id).cloned().unwrap_or_default()
        })
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
        with_backfilled_index(&workspace_path, |index| {
            index.forward.get(&note_id).cloned().unwrap_or_default()
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Removes a permanently deleted note as both source and target.
pub(crate) fn purge_note(workspace_path: &str, note_id: &str) -> Result<(), String> {
    validate_id(note_id)?;
    let workspace_path = normalized_workspace(workspace_path)?;
    let lock = graph_lock(&workspace_path);
    let mut slot = lock.lock().map_err(|error| error.to_string())?;
    let index = slot.index_mut(&workspace_path)?;
    replace_outgoing(index, note_id, Vec::new());

    // A deleted note cannot remain as a target. Removing those inbound edges
    // also prevents its backlink bucket from being recreated on later writes.
    index.backward.remove(note_id);
    for edges in index.forward.values_mut() {
        edges.retain(|edge| edge.target != note_id);
    }
    index.forward.retain(|_, edges| !edges.is_empty());
    save_or_invalidate(&mut slot)
}

#[tauri::command]
pub async fn graph_get_all_edges(workspace_path: String) -> Result<Vec<GraphEdge>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_backfilled_index(&workspace_path, |index| {
            index.forward.values().flatten().cloned().collect()
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        extract_link_edges, graph_lock, index_note_links, load_index, normalized_workspace,
        purge_note, remove_note_links, update_note_edges, with_backfilled_index, EdgeKind,
        GraphEdge, GraphIndex,
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

    fn edge(source: &str, target: &str, kind: EdgeKind) -> GraphEdge {
        GraphEdge {
            source: source.into(),
            target: target.into(),
            kind,
            anchor: None,
        }
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
        update_note_edges(
            &path,
            "source-a",
            vec![
                edge("source-a", "target-a", EdgeKind::Link),
                edge("source-a", "target-a", EdgeKind::Mention),
            ],
        )
        .unwrap();
        update_note_edges(
            &path,
            "source-b",
            vec![edge("source-b", "target-b", EdgeKind::Link)],
        )
        .unwrap();

        let index = load_index(&path).unwrap();
        assert_eq!(index.backward["target-a"][0].count, 2);
        assert_eq!(index.backward["target-b"][0].source_id, "source-b");

        purge_note(&path, "target-b").unwrap();
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

        let index = with_backfilled_index(&path, GraphIndex::clone).unwrap();
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
        assert_eq!(extract_link_edges("source", &content).len(), 1);
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
    fn cached_index_picks_up_external_rewrites() {
        let root = workspace();
        let path = root.to_string_lossy().into_owned();
        index_note_links(&path, "source-a", &linked_content(&["target-a"])).unwrap();
        // Another writer replaces graph.json behind the cache with a version of
        // the same length, so only the mtime tells them apart.
        let graph_file = root.join(".nevo/index/graph.json");
        let original_len = std::fs::read(&graph_file).unwrap().len();
        let mut replacement =
            String::from(r#"{"forward":{},"backward":{},"linksBackfilled":true}"#);
        replacement.push_str(&" ".repeat(original_len - replacement.len()));
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&graph_file, replacement).unwrap();

        let index = with_backfilled_index(&path, GraphIndex::clone).unwrap();
        assert!(index.forward.is_empty());

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn a_failed_write_is_retried_by_the_next_identical_update() {
        let root = workspace();
        let path = root.to_string_lossy().into_owned();
        let content = linked_content(&["target-a"]);
        // `.nevo/index` as a file makes the graph.json write fail.
        std::fs::write(root.join(".nevo/index"), "").unwrap();
        assert!(index_note_links(&path, "source-a", &content).is_err());

        std::fs::remove_file(root.join(".nevo/index")).unwrap();
        index_note_links(&path, "source-a", &content).unwrap();
        assert_eq!(load_index(&path).unwrap().forward["source-a"].len(), 1);

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn trashing_drops_outgoing_edges_and_keeps_incoming_ones() {
        let root = workspace();
        let path = root.to_string_lossy().into_owned();
        index_note_links(&path, "a", &linked_content(&["b"])).unwrap();
        index_note_links(&path, "c", &linked_content(&["a"])).unwrap();

        remove_note_links(&path, "a").unwrap();
        let index = load_index(&path).unwrap();
        assert!(!index.forward.contains_key("a"));
        assert!(!index.backward.contains_key("b"));
        assert_eq!(index.backward["a"][0].source_id, "c");

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn an_unparseable_index_is_rebuilt_instead_of_failing() {
        let root = workspace();
        let path = root.to_string_lossy().into_owned();
        std::fs::create_dir_all(root.join(".nevo/index")).unwrap();
        std::fs::write(root.join(".nevo/index/graph.json"), "{ truncated").unwrap();

        index_note_links(&path, "a", &linked_content(&["b"])).unwrap();
        assert_eq!(load_index(&path).unwrap().forward["a"][0].target, "b");

        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn opening_another_workspace_drops_the_idle_cache() {
        let first = workspace();
        let second = workspace();
        let first_path = first.to_string_lossy().into_owned();
        index_note_links(&first_path, "a", &linked_content(&["b"])).unwrap();
        index_note_links(&second.to_string_lossy(), "c", &linked_content(&["d"])).unwrap();

        let key = normalized_workspace(&first_path).unwrap();
        assert!(graph_lock(&key).lock().unwrap().is_empty());

        std::fs::remove_dir_all(first).ok();
        std::fs::remove_dir_all(second).ok();
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

        let index = with_backfilled_index(&path, GraphIndex::clone).unwrap();
        assert_eq!(index.forward["a"][0].target, "n1");

        std::fs::remove_dir_all(root).ok();
    }
}
