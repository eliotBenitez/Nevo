use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::logging::{LogContext, LogError};

pub const VOICE_IMPORT_MAX_BYTES: u64 = 512 * 1024 * 1024;
const VOICE_DIR: &str = "voice-recordings";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecorderError {
    /// Kept for the frontend error-code contract; desktop `cpal` capture
    /// never actually produces this (the OS gates the input device itself,
    /// surfacing as `NoDevice` or `Other` instead).
    #[allow(dead_code)]
    PermissionDenied,
    NoDevice,
    AlreadyRecording,
    NotRecording,
    /// Returned by the `#[cfg(mobile)]` command stubs in `mod.rs` — desktop-only
    /// in v1, so a desktop build never constructs this outside its own tests.
    #[allow(dead_code)]
    Unsupported,
    Other(String),
}

impl RecorderError {
    pub fn code(&self) -> String {
        match self {
            Self::PermissionDenied => "permission_denied".into(),
            Self::NoDevice => "no_device".into(),
            Self::AlreadyRecording => "already_recording".into(),
            Self::NotRecording => "not_recording".into(),
            Self::Unsupported => "unsupported".into(),
            Self::Other(detail) => format!("recording_failed: {}", detail),
        }
    }
}

pub struct StoppedRecording {
    pub file_path: PathBuf,
    pub duration_ms: u64,
}

pub struct ImportedAudio {
    pub src: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecordedAudioAsset {
    pub src: String,
    pub name: String,
    pub mime: String,
    pub size: u64,
    pub duration_ms: u64,
}

pub fn temp_output_base(cache_dir: &Path, id: &str) -> PathBuf {
    let dir = cache_dir.join(VOICE_DIR);
    let _ = std::fs::create_dir_all(&dir);
    dir.join(id)
}

pub fn mime_for_path(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "wav" => Some("audio/wav"),
        _ => None,
    }
}

pub fn display_file_name(label: &str, timestamp: &str, recorded: &Path) -> String {
    let ext = recorded
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("wav")
        .to_ascii_lowercase();
    let label = label.trim();
    let label = if label.is_empty() { "Recording" } else { label };
    format!("{} {}.{}", label, timestamp, ext)
}

pub fn discard_temp_file(path: &Path) {
    if let Err(error) = std::fs::remove_file(path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            let logger = crate::logging::logger();
            let _ = logger.warn(
                "tauri.voice_recording",
                "discard_temp_file",
                "Failed to remove voice recording temp file",
                false,
                LogContext::default().with_error(LogError {
                    kind: Some("io".to_string()),
                    message: format!("{}: {}", path.display(), error),
                    details: None,
                }),
            );
        }
    }
}

/// Imports the stopped recording and deletes the temp file only on success.
pub fn finalize_recording<F>(
    stopped: &StoppedRecording,
    file_name: &str,
    import: F,
) -> Result<RecordedAudioAsset, String>
where
    F: FnOnce(&str, &str) -> Result<ImportedAudio, String>,
{
    let mime = mime_for_path(&stopped.file_path).ok_or_else(|| {
        format!(
            "recording_failed: unexpected file type {}",
            stopped.file_path.display()
        )
    })?;
    let source = stopped.file_path.to_string_lossy().into_owned();
    let imported = import(&source, file_name).map_err(|error| {
        let logger = crate::logging::logger();
        let _ = logger.error(
            "tauri.voice_recording",
            "finalize_recording",
            "Voice recording import failed; temp file kept",
            LogContext::default().with_error(LogError {
                kind: Some("io".to_string()),
                message: format!("{} (temp file: {})", error, source),
                details: None,
            }),
        );
        format!("import_failed: {}", error)
    })?;
    discard_temp_file(&stopped.file_path);
    Ok(RecordedAudioAsset {
        src: imported.src,
        name: file_name.to_string(),
        mime: mime.to_string(),
        size: imported.bytes,
        duration_ms: stopped.duration_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;
    use uuid::Uuid;

    fn scratch_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nevo-voice-{}-{}", label, Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn temp_output_base_is_inside_cache_voice_dir() {
        let cache = scratch_dir("cache");
        let base = temp_output_base(&cache, "abc");
        assert_eq!(base, cache.join("voice-recordings").join("abc"));
        assert!(cache.join("voice-recordings").is_dir());
    }

    #[test]
    fn maps_known_recorder_errors_to_codes() {
        assert_eq!(RecorderError::PermissionDenied.code(), "permission_denied");
        assert_eq!(RecorderError::NoDevice.code(), "no_device");
        assert_eq!(RecorderError::AlreadyRecording.code(), "already_recording");
        assert_eq!(RecorderError::NotRecording.code(), "not_recording");
        assert_eq!(RecorderError::Unsupported.code(), "unsupported");
        assert_eq!(
            RecorderError::Other("x".into()).code(),
            "recording_failed: x"
        );
    }

    #[test]
    fn mime_for_extension() {
        assert_eq!(mime_for_path(Path::new("a.wav")), Some("audio/wav"));
        assert_eq!(mime_for_path(Path::new("a.exe")), None);
    }

    #[test]
    fn display_file_name_uses_label_and_extension() {
        let name = display_file_name("Recording", "2026-09-27 14-05", Path::new("/c/x.wav"));
        assert_eq!(name, "Recording 2026-09-27 14-05.wav");
    }

    #[test]
    fn finalize_imports_and_deletes_temp_file() {
        let dir = scratch_dir("ok");
        let temp = dir.join("rec.wav");
        std::fs::write(&temp, b"RIFF....WAVE").unwrap();
        let stopped = StoppedRecording {
            file_path: temp.clone(),
            duration_ms: 1500,
        };
        let seen = Mutex::new(None);
        let result = finalize_recording(&stopped, "Recording 1.wav", |source, name| {
            *seen.lock().unwrap() = Some((source.to_string(), name.to_string()));
            Ok(ImportedAudio {
                src: ".nevo/assets/h-recording-1.wav".into(),
                bytes: 12,
            })
        })
        .unwrap();
        assert_eq!(result.src, ".nevo/assets/h-recording-1.wav");
        assert_eq!(result.mime, "audio/wav");
        assert_eq!(result.size, 12);
        assert_eq!(result.duration_ms, 1500);
        assert_eq!(result.name, "Recording 1.wav");
        assert!(!temp.exists(), "temp file must be removed after import");
        assert_eq!(seen.lock().unwrap().as_ref().unwrap().1, "Recording 1.wav");
    }

    #[test]
    fn finalize_keeps_temp_file_when_import_fails() {
        let dir = scratch_dir("fail");
        let temp = dir.join("rec.wav");
        std::fs::write(&temp, b"RIFF").unwrap();
        let stopped = StoppedRecording {
            file_path: temp.clone(),
            duration_ms: 10,
        };
        let err =
            finalize_recording(&stopped, "R.wav", |_, _| Err("disk full".into())).unwrap_err();
        assert_eq!(err, "import_failed: disk full");
        assert!(temp.exists(), "temp file must survive a failed import");
    }

    #[test]
    fn finalize_rejects_unexpected_extension() {
        let dir = scratch_dir("ext");
        let temp = dir.join("rec.exe");
        std::fs::write(&temp, b"x").unwrap();
        let stopped = StoppedRecording {
            file_path: temp,
            duration_ms: 1,
        };
        let err = finalize_recording(&stopped, "R.exe", |_, _| unreachable!()).unwrap_err();
        assert!(err.starts_with("recording_failed:"));
    }

    #[test]
    fn discard_removes_temp_file_and_tolerates_missing() {
        let dir = scratch_dir("discard");
        let temp = dir.join("rec.wav");
        std::fs::write(&temp, b"x").unwrap();
        discard_temp_file(&temp);
        assert!(!temp.exists());
        discard_temp_file(&temp); // no panic
    }
}
