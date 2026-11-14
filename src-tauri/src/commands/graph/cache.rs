//! Per-workspace cache of the parsed graph.json and the manifest's live note
//! ids, behind the mutex that serializes graph.json access.

use std::collections::HashSet;
use std::sync::{Arc, Mutex, OnceLock};

use dashmap::DashMap;

use super::{index_path, load_index, save_index, GraphIndex};
use crate::commands::path_utils::normalize_workspace_path;

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
    GRAPH_LOCKS
        .get_or_init(DashMap::new)
        .entry(workspace_path.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(GraphSlot::default())))
        .clone()
}

/// Drops every parsed index when the user opens a workspace, so only the one
/// in use is re-read and kept resident. A busy slot is skipped, never waited on.
pub(crate) fn evict_cached_indexes() {
    let Some(locks) = GRAPH_LOCKS.get() else {
        return;
    };
    for entry in locks.iter() {
        if let Ok(mut slot) = entry.value().try_lock() {
            slot.invalidate();
        }
    }
}

type FileStamp = Option<(std::time::SystemTime, u64)>;

fn file_stamp(path: &std::path::Path) -> FileStamp {
    let meta = std::fs::metadata(path).ok()?;
    Some((meta.modified().ok()?, meta.len()))
}

pub(super) struct CachedIndex {
    pub(super) path: std::path::PathBuf,
    pub(super) stamp: FileStamp,
    pub(super) index: GraphIndex,
}

/// The parsed graph.json, so autosave does not re-parse the whole workspace
/// index on every save. Re-read whenever the file's mtime/size differs from
/// the last read or write here. A failed write by an update drops the cache
/// (`save_or_invalidate`) so the next update retries from disk; only the
/// backfill read path keeps its unsaved rebuild in memory, to avoid rescanning
/// every note on each read of an unwritable workspace. `live` caches the
/// manifest's note ids the same way, keyed by workspace.json's stamp.
#[derive(Default)]
pub(crate) struct GraphSlot {
    pub(super) index: Option<CachedIndex>,
    pub(super) live: Option<(FileStamp, HashSet<String>)>,
}

impl GraphSlot {
    pub(super) fn index_mut(&mut self, workspace_path: &str) -> Result<&mut GraphIndex, String> {
        let path = index_path(workspace_path)?;
        // Stat before reading: a write racing the read leaves a stale stamp,
        // which only forces another re-read.
        let stamp = file_stamp(&path);
        let fresh =
            matches!(&self.index, Some(cached) if cached.path == path && cached.stamp == stamp);
        if !fresh {
            let index = load_index(workspace_path)?;
            self.index = Some(CachedIndex { path, stamp, index });
        }
        self.index
            .as_mut()
            .map(|cached| &mut cached.index)
            .ok_or_else(|| "Graph index cache is empty".to_string())
    }

    pub(super) fn save(&mut self) -> Result<(), String> {
        let Some(cached) = self.index.as_mut() else {
            return Ok(());
        };
        save_index(&cached.path, &cached.index)?;
        cached.stamp = file_stamp(&cached.path);
        Ok(())
    }

    /// Refreshes the live note ids, re-parsing workspace.json only when its
    /// mtime/size changed. On a read failure the set is dropped.
    pub(super) fn refresh_live(&mut self, workspace_path: &str) -> Result<(), String> {
        let stamp = file_stamp(&std::path::Path::new(workspace_path).join(".nevo/workspace.json"));
        if stamp.is_some() && matches!(&self.live, Some((cached, _)) if *cached == stamp) {
            return Ok(());
        }
        self.live = None;
        let manifest = crate::commands::folder::load_manifest(workspace_path)?;
        let ids = crate::commands::folder::manifest_note_ids(&manifest)
            .into_iter()
            .collect();
        self.live = Some((stamp, ids));
        Ok(())
    }

    #[cfg(test)]
    pub(super) fn is_empty(&self) -> bool {
        self.index.is_none()
    }

    /// For writers that replace graph.json directly (workspace merge).
    pub(crate) fn invalidate(&mut self) {
        self.index = None;
        self.live = None;
    }
}
