mod decode;
pub(crate) mod resample;

use std::path::{Path, PathBuf};
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

pub(crate) struct BusyGuard(Arc<TranscriptionState>);

impl BusyGuard {
    pub(crate) fn acquire(state: Arc<TranscriptionState>) -> Option<Self> {
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

pub(crate) fn validate_language(language: Option<String>) -> Result<Option<String>, String> {
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

pub(crate) fn whisper_context<'a>(
    state: &'a TranscriptionState,
    model: &Path,
) -> Result<&'a WhisperContext, String> {
    // whisper.cpp otherwise writes recognized words to stderr in debug output.
    whisper_rs::install_logging_hooks();
    state
        .context
        .get_or_init(|| {
            WhisperContext::new_with_params(model, WhisperContextParameters::default())
                .map_err(|_| "model_unavailable".to_string())
        })
        .as_ref()
        .map_err(Clone::clone)
}

pub(crate) fn resolve_model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let model = app
        .path()
        .resolve("models/ggml-base.bin", tauri::path::BaseDirectory::Resource)
        .map_err(|_| "model_unavailable")?;
    if !model.is_file() {
        return Err("model_unavailable".to_string());
    }
    Ok(model)
}

const GREEDY: SamplingStrategy = SamplingStrategy::Greedy { best_of: 1 };

fn base_params<'a>(strategy: SamplingStrategy, language: Option<&'a str>) -> FullParams<'a, 'a> {
    let mut params = FullParams::new(strategy);
    params.set_language(language);
    params.set_translate(false);
    // Without this, music is captioned as "[Music]"/"[Música]" instead of lyrics or nothing.
    params.set_suppress_nst(true);
    params.set_print_progress(false);
    params.set_n_threads(
        std::thread::available_parallelism().map_or(4, |count| count.get().min(8)) as i32,
    );
    params
}

/// Encoder context for at most 15 s of audio (50 frames per second) instead of the
/// full 30 s window; dictation segments are capped at 12 s, so this halves encoder time.
const UTTERANCE_AUDIO_CTX: i32 = 768;

/// Recognizes one short utterance (at most 15 s) as a single segment of plain text.
/// `precise` trades CPU time for accuracy with beam search; meant for final text.
pub(crate) fn recognize_text(
    ctx: &WhisperContext,
    pcm: &[f32],
    language: Option<&str>,
    prompt: Option<&str>,
    precise: bool,
) -> Result<String, String> {
    let mut whisper = ctx.create_state().map_err(|_| "inference_failed")?;
    let strategy = if precise {
        SamplingStrategy::BeamSearch {
            beam_size: 5,
            patience: -1.0,
        }
    } else {
        GREEDY
    };
    let mut params = base_params(strategy, language);
    params.set_audio_ctx(UTTERANCE_AUDIO_CTX);
    params.set_single_segment(true);
    params.set_no_timestamps(true);
    if let Some(prompt) = prompt {
        params.set_initial_prompt(prompt);
    }
    whisper.full(params, pcm).map_err(|_| "inference_failed")?;
    // A whole dictated phrase may legitimately be "Thank you."; only short bursts are suspect.
    let short = pcm.len() < SHORT_SEGMENT_SAMPLES;
    let text = (0..whisper.full_n_segments())
        .filter_map(|index| whisper.get_segment(index))
        // Whisper invents text for noise ("you", "Thank you."); trust its own no-speech estimate.
        .filter(|segment| segment.no_speech_probability() <= NO_SPEECH_MAX_PROBABILITY)
        .filter_map(|segment| segment.to_str().ok().map(|text| text.trim().to_string()))
        .filter(|text| !text.is_empty() && !(short && is_silence_hallucination(text)))
        .collect::<Vec<_>>()
        .join(" ");
    Ok(text.trim().to_string())
}

const NO_SPEECH_MAX_PROBABILITY: f32 = 0.6;
const SHORT_SEGMENT_SAMPLES: usize = 16_000 * 5 / 2;

/// Phrases Whisper is known to produce for silence or room noise (subtitle credits
/// learned from its training data). Only a segment that is exactly one of them is dropped.
const SILENCE_HALLUCINATIONS: &[&str] = &[
    "you",
    "thank you",
    "thanks for watching",
    "thank you for watching",
    "продолжение следует",
    "субтитры сделал dimatorzok",
    "субтитры создавал dimatorzok",
    "редактор субтитров а.семкин корректор а.егорова",
    "спасибо за просмотр",
    "спасибо",
    "thanks",
    "danke",
    "merci",
    "gracias",
    "untertitel im auftrag des zdf für funk, 2017",
    "sous-titrage st' 501",
    "subtítulos realizados por la comunidad de amara.org",
];

fn is_silence_hallucination(text: &str) -> bool {
    let normalized = text
        .trim_matches(|c: char| c.is_ascii_punctuation() || c.is_whitespace() || c == '…')
        .to_lowercase();
    SILENCE_HALLUCINATIONS.contains(&normalized.as_str())
}

fn transcribe(
    state: &TranscriptionState,
    model: &Path,
    audio: &Path,
    language: Option<&str>,
) -> Result<Vec<TranscriptSegment>, String> {
    let pcm = decode::decode_audio(audio)?;
    let context = whisper_context(state, model)?;
    let mut whisper = context.create_state().map_err(|_| "inference_failed")?;
    whisper
        .full(base_params(GREEDY, language), &pcm)
        .map_err(|_| "inference_failed")?;
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
    let model = resolve_model_path(&app)?;
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
    fn drops_whole_segment_silence_hallucinations_only() {
        assert!(super::is_silence_hallucination(" you"));
        assert!(super::is_silence_hallucination("Thank you."));
        assert!(super::is_silence_hallucination("Продолжение следует..."));
        assert!(super::is_silence_hallucination(
            "Субтитры сделал DimaTorzok"
        ));
        assert!(!super::is_silence_hallucination(
            "Thank you for the report."
        ));
        assert!(!super::is_silence_hallucination("you know"));
        assert!(super::is_silence_hallucination("Спасибо!"));
        assert!(!super::is_silence_hallucination("Спасибо за помощь"));
    }

    #[test]
    fn transcript_keeps_text_with_zero_length_timestamps() {
        let segment = transcript_segment(120, 120, "Hello").unwrap();
        assert!(segment.end > segment.start);
        assert_eq!(segment.text, "Hello");
    }
}
