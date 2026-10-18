//! Live dictation: microphone -> voice-activity segmentation -> bundled Whisper
//! model -> events over a `tauri::ipc::Channel`. Audio stays in memory and is
//! never written to disk. Desktop-only; mobile command stubs return `unsupported`.
//!
//! The slot follows the race-safe pattern of `voice_recording`: `Starting` is
//! reserved under the lock before the awaited device/model setup, so an
//! overlapping start (or a voice recording start) is rejected.

#![cfg_attr(mobile, allow(dead_code))]

mod segmenter;
#[cfg(desktop)]
mod stream;
#[cfg(desktop)]
mod worker;

use serde::Serialize;
use tauri::State;

#[cfg(desktop)]
use crate::commands::transcription::{
    resolve_model_path, validate_language, whisper_context, BusyGuard, TranscriptionState,
};
#[cfg(desktop)]
use crate::commands::voice_recording::{session::RecorderError, VoiceRecordingState};
#[cfg(desktop)]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(desktop)]
use std::sync::{mpsc, Arc, Mutex};
#[cfg(desktop)]
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DictationEvent {
    Partial { text: String },
    Final { text: String },
    Level { rms: f32 },
    Error { code: String },
    Stopped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SlotState {
    Idle,
    Starting,
    Active,
}

#[cfg(desktop)]
enum Slot {
    Idle,
    Starting,
    Active(Session),
}

#[cfg(desktop)]
impl Slot {
    fn state(&self) -> SlotState {
        match self {
            Slot::Idle => SlotState::Idle,
            Slot::Starting => SlotState::Starting,
            Slot::Active(_) => SlotState::Active,
        }
    }
}

/// Only `Idle` allows a new dictation.
fn start_is_allowed(state: SlotState) -> Result<(), &'static str> {
    match state {
        SlotState::Idle => Ok(()),
        SlotState::Starting | SlotState::Active => Err("already_recording"),
    }
}

/// Whether `stop` has a session to take; cancelling `Idle` is a no-op, while
/// `Starting` is rejected by both because the in-flight start cannot be interrupted.
fn stop_is_possible(state: SlotState) -> bool {
    state == SlotState::Active
}

#[derive(Default)]
pub struct DictationState {
    #[cfg(desktop)]
    slot: Mutex<SlotCell>,
}

#[cfg(desktop)]
struct SlotCell(Slot);

#[cfg(desktop)]
impl Default for SlotCell {
    fn default() -> Self {
        Self(Slot::Idle)
    }
}

#[cfg(desktop)]
impl DictationState {
    /// True while a dictation is starting or running (the microphone is taken).
    pub(crate) fn is_active(&self) -> bool {
        self.slot
            .lock()
            .map(|slot| slot.0.state() != SlotState::Idle)
            .unwrap_or(true)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, SlotCell>, String> {
        self.slot
            .lock()
            .map_err(|_| "recording_failed: state poisoned".to_string())
    }

    fn take_active(&self) -> Result<(SlotState, Option<Session>), String> {
        let mut guard = self.lock()?;
        let state = guard.0.state();
        if !stop_is_possible(state) {
            return Ok((state, None));
        }
        match std::mem::replace(&mut guard.0, Slot::Idle) {
            Slot::Active(session) => Ok((state, Some(session))),
            _ => Ok((state, None)),
        }
    }
}

/// A running dictation. The transcription guard is held until the worker has finished.
#[cfg(desktop)]
struct Session {
    input: stream::InputStream,
    worker: std::thread::JoinHandle<()>,
    cancelled: Arc<AtomicBool>,
    _guard: BusyGuard,
}

#[cfg(desktop)]
impl Session {
    /// Stops the microphone; the worker flushes the open segment before it ends.
    fn stop(self) {
        self.input.stop();
        let _ = self.worker.join();
    }

    fn cancel(self) {
        self.cancelled.store(true, Ordering::Release);
        self.stop();
    }
}

#[cfg(desktop)]
fn start_session(
    transcription: Arc<TranscriptionState>,
    model: std::path::PathBuf,
    language: Option<String>,
    events: tauri::ipc::Channel<DictationEvent>,
    guard: BusyGuard,
) -> Result<Session, String> {
    // Loads the model on first use (slow), off the main thread.
    whisper_context(&transcription, &model)?;
    let (chunk_tx, chunk_rx) = mpsc::channel::<Vec<f32>>();
    let input = stream::InputStream::start(chunk_tx).map_err(|error| error.code())?;
    let cancelled = Arc::new(AtomicBool::new(false));
    let config = worker::WorkerConfig {
        sample_rate: input.sample_rate,
        language,
        cancelled: Arc::clone(&cancelled),
    };
    let spawned = std::thread::Builder::new()
        .name("nevo-dictation".to_string())
        .spawn(move || {
            if let Ok(ctx) = whisper_context(&transcription, &model) {
                worker::run(&ctx, config, chunk_rx, events);
            }
        });
    match spawned {
        Ok(worker) => Ok(Session {
            input,
            worker,
            cancelled,
            _guard: guard,
        }),
        Err(error) => {
            input.stop();
            Err(format!("recording_failed: {error}"))
        }
    }
}

#[cfg(desktop)]
#[tauri::command]
pub async fn dictation_start(
    app: AppHandle,
    state: State<'_, DictationState>,
    transcription: State<'_, Arc<TranscriptionState>>,
    voice: State<'_, VoiceRecordingState>,
    language: Option<String>,
    on_event: tauri::ipc::Channel<DictationEvent>,
) -> Result<(), String> {
    let language = validate_language(language)?;
    {
        let mut slot = state.lock()?;
        start_is_allowed(slot.0.state()).map_err(str::to_string)?;
        slot.0 = Slot::Starting;
    }
    // Checked after the reservation so a concurrent voice recording start sees it too.
    let started = if !voice.is_idle() {
        Err(RecorderError::AlreadyRecording.code())
    } else {
        match BusyGuard::acquire(Arc::clone(transcription.inner())) {
            None => Err("transcription_busy".to_string()),
            // Resolved under the guard so a concurrent model select or delete cannot interleave.
            Some(guard) => match resolve_model_path(&app) {
                Err(error) => Err(error),
                Ok(model) => {
                    let transcription = Arc::clone(transcription.inner());
                    tauri::async_runtime::spawn_blocking(move || {
                        start_session(transcription, model, language, on_event, guard)
                    })
                    .await
                    .map_err(|error| format!("recording_failed: {error}"))
                    .and_then(|result| result)
                }
            },
        }
    };
    let mut slot = state.lock()?;
    match started {
        Ok(session) => {
            slot.0 = Slot::Active(session);
            Ok(())
        }
        Err(error) => {
            slot.0 = Slot::Idle;
            Err(error)
        }
    }
}

#[cfg(desktop)]
#[tauri::command]
pub async fn dictation_stop(state: State<'_, DictationState>) -> Result<(), String> {
    let (_, session) = state.take_active()?;
    let Some(session) = session else {
        return Err(RecorderError::NotRecording.code());
    };
    tauri::async_runtime::spawn_blocking(move || session.stop())
        .await
        .map_err(|error| format!("recording_failed: {error}"))
}

#[cfg(desktop)]
#[tauri::command]
pub async fn dictation_cancel(state: State<'_, DictationState>) -> Result<(), String> {
    let (slot_state, session) = state.take_active()?;
    let Some(session) = session else {
        return if slot_state == SlotState::Idle {
            Ok(())
        } else {
            Err(RecorderError::NotRecording.code())
        };
    };
    tauri::async_runtime::spawn_blocking(move || session.cancel())
        .await
        .map_err(|error| format!("recording_failed: {error}"))
}

#[cfg(mobile)]
#[tauri::command]
pub async fn dictation_start(
    _language: Option<String>,
    _on_event: tauri::ipc::Channel<DictationEvent>,
) -> Result<(), String> {
    Err("unsupported".to_string())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn dictation_stop(_state: State<'_, DictationState>) -> Result<(), String> {
    Err("unsupported".to_string())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn dictation_cancel(_state: State<'_, DictationState>) -> Result<(), String> {
    Err("unsupported".to_string())
}

#[cfg(all(test, desktop))]
mod tests {
    use super::segmenter::{Segmenter, SegmenterEvent};
    use super::*;

    #[test]
    fn start_allowed_only_from_idle() {
        assert_eq!(start_is_allowed(SlotState::Idle), Ok(()));
        assert_eq!(
            start_is_allowed(SlotState::Starting),
            Err("already_recording")
        );
        assert_eq!(
            start_is_allowed(SlotState::Active),
            Err("already_recording")
        );
    }

    #[test]
    fn stop_only_proceeds_from_active() {
        assert!(!stop_is_possible(SlotState::Idle));
        assert!(!stop_is_possible(SlotState::Starting));
        assert!(stop_is_possible(SlotState::Active));
    }

    #[test]
    fn idle_state_is_not_active_and_has_nothing_to_take() {
        let state = DictationState::default();
        assert!(!state.is_active());
        let (slot_state, session) = state.take_active().unwrap();
        assert_eq!(slot_state, SlotState::Idle);
        assert!(session.is_none());
        state.lock().unwrap().0 = Slot::Starting;
        assert!(state.is_active());
        let (slot_state, session) = state.take_active().unwrap();
        assert_eq!(slot_state, SlotState::Starting);
        assert!(session.is_none());
    }

    #[test]
    fn events_serialize_with_kind_tag() {
        let json = |event: DictationEvent| serde_json::to_string(&event).unwrap();
        assert_eq!(
            json(DictationEvent::Partial { text: "hi".into() }),
            r#"{"kind":"partial","text":"hi"}"#
        );
        assert_eq!(json(DictationEvent::Stopped), r#"{"kind":"stopped"}"#);
        assert_eq!(
            json(DictationEvent::Error { code: "x".into() }),
            r#"{"kind":"error","code":"x"}"#
        );
    }

    #[test]
    #[ignore = "requires pnpm model:prepare and NEVO_ASR_SAMPLE WAV path"]
    fn bundled_model_dictates_real_speech_in_chunks() {
        let audio = std::env::var_os("NEVO_ASR_SAMPLE").expect("set NEVO_ASR_SAMPLE");
        let mut reader = hound::WavReader::open(audio).unwrap();
        let spec = reader.spec();
        assert_eq!(spec.sample_rate, 16_000, "sample must be 16 kHz");
        let channels = usize::from(spec.channels);
        let samples: Vec<f32> = match spec.sample_format {
            hound::SampleFormat::Int => reader
                .samples::<i16>()
                .map(|s| f32::from(s.unwrap()) / 32_768.0)
                .collect(),
            hound::SampleFormat::Float => reader.samples::<f32>().map(Result::unwrap).collect(),
        };
        let mono: Vec<f32> = samples
            .chunks_exact(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
            .collect();
        let model =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/models/ggml-base.bin");
        let state = TranscriptionState::default();
        let ctx = whisper_context(&state, &model).unwrap();

        let mut segmenter = Segmenter::new();
        let mut segments = Vec::new();
        for chunk in mono.chunks(1_600) {
            for event in segmenter.push(chunk) {
                if let SegmenterEvent::Close(pcm) = event {
                    segments.push(pcm);
                }
            }
        }
        segments.extend(segmenter.finish());
        let text = segments
            .iter()
            .map(|pcm| crate::commands::transcription::recognize_text(&ctx, pcm, None, None, true))
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
            .join(" ")
            .to_lowercase();
        assert!(text.contains("ask not"), "unexpected recognition: {text}");
    }
}
