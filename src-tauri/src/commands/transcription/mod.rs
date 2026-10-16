mod decode;

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Manager, State};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    start: f64,
    end: f64,
    text: String,
}

#[derive(Default)]
pub struct TranscriptionState {
    busy: AtomicBool,
    context: OnceLock<Result<WhisperContext, String>>,
}

struct BusyGuard(Arc<TranscriptionState>);

impl BusyGuard {
    fn acquire(state: Arc<TranscriptionState>) -> Option<Self> {
        state
            .busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
            .ok()
            .map(|_| Self(state))
    }
}

impl Drop for BusyGuard {
    fn drop(&mut self) {
        self.0.busy.store(false, Ordering::Release);
    }
}

fn transcript_segment(start: i64, end: i64, text: &str) -> Option<TranscriptSegment> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    let start = start.max(0);
    Some(TranscriptSegment {
        start: start as f64 / 100.0,
        end: end.max(start.saturating_add(1)) as f64 / 100.0,
        text: text.to_string(),
    })
}

fn validate_language(language: Option<String>) -> Result<Option<String>, String> {
    let Some(language) = language else {
        return Ok(None);
    };
    if language == "auto" {
        return Ok(None);
    }
    if language.len() > 8
        || !language.bytes().all(|byte| byte.is_ascii_lowercase())
        || !(0..=whisper_rs::get_lang_max_id())
            .any(|id| whisper_rs::get_lang_str(id) == Some(language.as_str()))
    {
        return Err("audio_language_unsupported".to_string());
    }
    Ok(Some(language))
}

fn transcribe(
    state: &TranscriptionState,
    model: &Path,
    audio: &Path,
    language: Option<&str>,
) -> Result<Vec<TranscriptSegment>, String> {
    // whisper.cpp otherwise writes recognized words to stderr in debug output.
    whisper_rs::install_logging_hooks();
    let pcm = decode::decode_audio(audio)?;
    let context = state
        .context
        .get_or_init(|| {
            WhisperContext::new_with_params(model, WhisperContextParameters::default())
                .map_err(|_| "model_unavailable".to_string())
        })
        .as_ref()
        .map_err(Clone::clone)?;
    let mut whisper = context.create_state().map_err(|_| "inference_failed")?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(language);
    params.set_translate(false);
    // Without this, music is captioned as "[Music]"/"[Música]" instead of lyrics or nothing.
    params.set_suppress_nst(true);
    params.set_print_progress(false);
    params.set_n_threads(
        std::thread::available_parallelism().map_or(4, |count| count.get().min(8)) as i32,
    );
    whisper.full(params, &pcm).map_err(|_| "inference_failed")?;
    Ok((0..whisper.full_n_segments())
        .filter_map(|index| whisper.get_segment(index))
        .filter_map(|segment| {
            segment.to_str().ok().and_then(|text| {
                transcript_segment(segment.start_timestamp(), segment.end_timestamp(), text)
            })
        })
        .collect())
}

#[tauri::command]
pub async fn transcribe_audio(
    app: AppHandle,
    state: State<'_, Arc<TranscriptionState>>,
    src: String,
    language: Option<String>,
) -> Result<Vec<TranscriptSegment>, String> {
    let language = validate_language(language)?;
    // Only a currently open workspace asset may be read. No filesystem path is accepted via IPC.
    let audio = crate::commands::path_utils::active_workspace_audio_asset(&src)?;
    let model = app
        .path()
        .resolve("models/ggml-base.bin", tauri::path::BaseDirectory::Resource)
        .map_err(|_| "model_unavailable")?;
    if !model.is_file() {
        return Err("model_unavailable".to_string());
    }
    let guard = BusyGuard::acquire(Arc::clone(state.inner()))
        .ok_or_else(|| "transcription_busy".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        transcribe(&guard.0, &model, &audio, language.as_deref())
    })
    .await
    .map_err(|_| "inference_failed".to_string())?
}

#[cfg(test)]
mod tests {
    use super::{transcribe, transcript_segment, validate_language, BusyGuard, TranscriptionState};

    #[test]
    fn accepts_russian_and_auto_but_rejects_unknown_or_control_characters() {
        assert_eq!(validate_language(None).unwrap(), None);
        assert_eq!(validate_language(Some("auto".to_string())).unwrap(), None);
        assert_eq!(
            validate_language(Some("ru".to_string())).unwrap(),
            Some("ru".to_string())
        );
        assert!(validate_language(Some("zz".to_string())).is_err());
        assert!(validate_language(Some("ru\0".to_string())).is_err());
    }

    #[test]
    fn busy_guard_releases_after_worker_finishes() {
        let state = std::sync::Arc::new(TranscriptionState::default());
        let guard = BusyGuard::acquire(std::sync::Arc::clone(&state)).unwrap();
        assert!(BusyGuard::acquire(std::sync::Arc::clone(&state)).is_none());
        drop(guard);
        assert!(BusyGuard::acquire(state).is_some());
    }

    #[test]
    #[ignore = "requires pnpm model:prepare and NEVO_ASR_SAMPLE WAV path"]
    fn bundled_model_transcribes_real_speech() {
        let audio = std::env::var_os("NEVO_ASR_SAMPLE").expect("set NEVO_ASR_SAMPLE");
        let model =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/models/ggml-base.bin");
        let segments = transcribe(
            &TranscriptionState::default(),
            &model,
            std::path::Path::new(&audio),
            None,
        )
        .unwrap();
        let text = segments
            .iter()
            .map(|segment| segment.text.as_str())
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        assert!(text.contains("ask not"), "unexpected recognition: {text}");
    }

    #[test]
    fn transcript_segments_use_seconds_and_skip_blank_recognition() {
        let segment = transcript_segment(120, 245, " Hello ").unwrap();
        assert_eq!(segment.start, 1.2);
        assert_eq!(segment.end, 2.45);
        assert_eq!(segment.text, "Hello");
        assert!(transcript_segment(0, 10, "   ").is_none());
    }

    #[test]
    fn transcript_keeps_text_with_zero_length_timestamps() {
        let segment = transcript_segment(120, 120, "Hello").unwrap();
        assert!(segment.end > segment.start);
        assert_eq!(segment.text, "Hello");
    }
}
