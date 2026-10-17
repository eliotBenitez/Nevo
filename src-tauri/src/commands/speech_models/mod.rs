//! Downloadable Whisper models. The bundled `base` model always exists; others are
//! fetched into `<app data>/models` and verified against the pinned catalog.

mod catalog;
mod download;

use crate::commands::path_utils::write_atomic;
use crate::commands::transcription::{BusyGuard, TranscriptionState};
use catalog::{find, ModelEntry, CATALOG};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

const ACTIVE_FILE: &str = "active.json";
const BASE_ID: &str = "base";

#[derive(Default)]
pub struct SpeechModelsState {
    cancel: Mutex<Option<Arc<AtomicBool>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechModelInfo {
    id: String,
    bytes: u64,
    installed: bool,
    active: bool,
    bundled: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    received: u64,
    total: u64,
}

#[derive(Serialize, Deserialize)]
struct ActiveFile {
    id: String,
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("models"))
        .map_err(|_| "model_unavailable".to_string())
}

fn bundled_path(app: &AppHandle) -> Result<PathBuf, String> {
    let model = app
        .path()
        .resolve("models/ggml-base.bin", tauri::path::BaseDirectory::Resource)
        .map_err(|_| "model_unavailable".to_string())?;
    if !model.is_file() {
        return Err("model_unavailable".to_string());
    }
    Ok(model)
}

/// A downloaded model counts only when its size matches the catalog.
fn is_downloaded(dir: &Path, entry: &ModelEntry) -> bool {
    std::fs::metadata(dir.join(entry.file))
        .is_ok_and(|meta| meta.is_file() && meta.len() == entry.bytes)
}

fn read_active_id(dir: &Path) -> Option<String> {
    let raw = std::fs::read(dir.join(ACTIVE_FILE)).ok()?;
    serde_json::from_slice::<ActiveFile>(&raw)
        .ok()
        .map(|file| file.id)
}

fn write_active_id(dir: &Path, id: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|_| "model_unavailable".to_string())?;
    let json = serde_json::to_vec(&ActiveFile { id: id.to_string() })
        .map_err(|_| "model_unavailable".to_string())?;
    write_atomic(&dir.join(ACTIVE_FILE), &json).map_err(|_| "model_unavailable".to_string())
}

/// Id of the model to use: the stored selection when it is known and usable, else `base`.
fn effective_active_id(dir: &Path) -> &'static str {
    read_active_id(dir)
        .and_then(|id| find(&id))
        .filter(|entry| entry.url.is_some() && is_downloaded(dir, entry))
        .map_or(BASE_ID, |entry| entry.id)
}

pub(crate) fn active_model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let bundled = bundled_path(app);
    let Ok(dir) = models_dir(app) else {
        return bundled;
    };
    match find(effective_active_id(&dir)) {
        Some(entry) if entry.url.is_some() => Ok(dir.join(entry.file)),
        _ => bundled,
    }
}

fn list_models(dir: &Path) -> Vec<SpeechModelInfo> {
    let active = effective_active_id(dir);
    CATALOG
        .iter()
        .map(|entry| SpeechModelInfo {
            id: entry.id.to_string(),
            bytes: entry.bytes,
            installed: entry.url.is_none() || is_downloaded(dir, entry),
            active: entry.id == active,
            bundled: entry.url.is_none(),
        })
        .collect()
}

#[tauri::command]
pub async fn speech_models_list(app: AppHandle) -> Result<Vec<SpeechModelInfo>, String> {
    let dir = models_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || list_models(&dir))
        .await
        .map_err(|_| "model_unavailable".to_string())
}

/// Clears the in-progress flag when the download future ends, however it ends.
struct DownloadSlot<'a>(&'a SpeechModelsState);

impl Drop for DownloadSlot<'_> {
    fn drop(&mut self) {
        if let Ok(mut slot) = self.0.cancel.lock() {
            *slot = None;
        }
    }
}

#[tauri::command]
pub async fn speech_model_download(
    app: AppHandle,
    state: State<'_, SpeechModelsState>,
    id: String,
    on_progress: tauri::ipc::Channel<DownloadProgress>,
) -> Result<(), String> {
    let entry = find(&id).ok_or_else(|| "unknown_model".to_string())?;
    if entry.url.is_none() {
        return Err("model_bundled".to_string());
    }
    let dir = models_dir(&app)?;
    let cancel = {
        let mut slot = state
            .cancel
            .lock()
            .map_err(|_| "download_failed".to_string())?;
        if slot.is_some() {
            return Err("download_in_progress".to_string());
        }
        let flag = Arc::new(AtomicBool::new(false));
        *slot = Some(Arc::clone(&flag));
        flag
    };
    let _slot = DownloadSlot(state.inner());
    let prepared = {
        let dir = dir.clone();
        tauri::async_runtime::spawn_blocking(move || {
            std::fs::create_dir_all(&dir).map_err(|_| "download_failed".to_string())?;
            Ok::<bool, String>(is_downloaded(&dir, entry))
        })
        .await
        .map_err(|_| "download_failed".to_string())??
    };
    if prepared {
        return Ok(());
    }
    download::download(entry, &dir, &cancel, |received, total| {
        let _ = on_progress.send(DownloadProgress { received, total });
    })
    .await
}

#[tauri::command]
pub async fn speech_model_cancel_download(
    state: State<'_, SpeechModelsState>,
) -> Result<(), String> {
    let slot = state
        .cancel
        .lock()
        .map_err(|_| "download_failed".to_string())?;
    if let Some(flag) = slot.as_ref() {
        flag.store(true, Ordering::Release);
    }
    Ok(())
}

#[tauri::command]
pub async fn speech_model_select(
    app: AppHandle,
    transcription: State<'_, Arc<TranscriptionState>>,
    id: String,
) -> Result<(), String> {
    let entry = find(&id).ok_or_else(|| "unknown_model".to_string())?;
    let dir = models_dir(&app)?;
    let guard = BusyGuard::acquire(Arc::clone(transcription.inner()))
        .ok_or_else(|| "transcription_busy".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        if entry.url.is_some() && !is_downloaded(&dir, entry) {
            return Err("model_not_installed".to_string());
        }
        write_active_id(&dir, entry.id)
    })
    .await
    .map_err(|_| "model_unavailable".to_string())?
}

#[tauri::command]
pub async fn speech_model_delete(
    app: AppHandle,
    transcription: State<'_, Arc<TranscriptionState>>,
    id: String,
) -> Result<(), String> {
    let entry = find(&id).ok_or_else(|| "unknown_model".to_string())?;
    if entry.url.is_none() {
        return Err("model_bundled".to_string());
    }
    let dir = models_dir(&app)?;
    let guard = BusyGuard::acquire(Arc::clone(transcription.inner()))
        .ok_or_else(|| "transcription_busy".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let was_active = effective_active_id(&dir) == entry.id;
        match std::fs::remove_file(dir.join(entry.file)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("model_unavailable".to_string()),
        }
        if was_active {
            write_active_id(&dir, BASE_ID)?;
        }
        Ok(())
    })
    .await
    .map_err(|_| "model_unavailable".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nevo-sm-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn corrupt_unknown_or_missing_selection_falls_back_to_base() {
        let dir = temp_dir("fallback");
        assert_eq!(effective_active_id(&dir), "base");
        std::fs::write(dir.join(ACTIVE_FILE), b"not json").unwrap();
        assert_eq!(effective_active_id(&dir), "base");
        write_active_id(&dir, "nope").unwrap();
        assert_eq!(effective_active_id(&dir), "base");
        write_active_id(&dir, "small").unwrap();
        assert_eq!(effective_active_id(&dir), "base");
        let small = find("small").unwrap();
        std::fs::write(dir.join(small.file), b"truncated").unwrap();
        assert_eq!(effective_active_id(&dir), "base");
        let listed = list_models(&dir);
        assert_eq!(listed.iter().filter(|m| m.active).count(), 1);
        assert!(listed.iter().find(|m| m.id == "base").unwrap().active);
        assert!(!listed.iter().find(|m| m.id == "small").unwrap().installed);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
