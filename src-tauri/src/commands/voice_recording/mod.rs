//! In-house voice recording: no third-party Tauri plugin. `capture::CaptureSession`
//! (desktop-only, `cpal` + `hound`) drives the microphone; these commands are
//! the only thing that ever sees a recording path, and that path is always
//! generated in Rust inside the app cache dir — the frontend never supplies
//! one (see `docs/superpowers/specs/2026-09-27-voice-recording-block-design.md`
//! for why: a plugin's own commands accepting an arbitrary path is exactly the
//! footgun this module exists to avoid). Desktop-only for v1: the mobile
//! command stubs below return `unsupported` without touching any audio API.
//!
//! Concurrency: a naive "check idle, await start, store" sequence would let
//! two overlapping `voice_recording_start` calls both open the microphone
//! (the second silently orphaning the first's WAV), and let `stop`/`cancel`
//! racing an in-flight start see `not_recording` while a recording then
//! starts untracked. `Slot::Starting` closes that window: the reservation is
//! taken under the lock *before* the (awaited) device open, so a second
//! `start` during that window is rejected the same as one during an active
//! recording, and `stop`/`cancel` treat `Starting` as nothing-to-take.

mod capture;
mod session;

use session::RecordedAudioAsset;

#[cfg(mobile)]
use session::RecorderError;

#[cfg(desktop)]
use session::{
    discard_temp_file, display_file_name, finalize_recording, temp_output_base, ImportedAudio,
    RecorderError, VOICE_IMPORT_MAX_BYTES,
};

use tauri::State;
#[cfg(desktop)]
use tauri::{AppHandle, Manager};

/// The command-layer recording lifecycle. Only `Idle` allows a new
/// recording; only `Active` has a session to stop/cancel. `Starting` is the
/// reservation held across the `await` in `voice_recording_start` between
/// "we decided to record" and "the device is actually open".
#[cfg(desktop)]
enum Slot {
    Idle,
    Starting,
    Active(capture::CaptureSession),
}

#[cfg(desktop)]
impl Default for Slot {
    fn default() -> Self {
        Slot::Idle
    }
}

/// A cheap, `CaptureSession`-free classification of `Slot`, so the dispatch
/// rules below can be unit tested without a microphone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(mobile, allow(dead_code))]
enum SlotState {
    Idle,
    Starting,
    Active,
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

/// Whether `voice_recording_start` may proceed from this state. Only `Idle`
/// does; `Starting` (another start already in flight) and `Active` both
/// reject the same way a real "already recording" does.
#[cfg_attr(mobile, allow(dead_code))]
fn start_is_allowed(state: SlotState) -> Result<(), RecorderError> {
    match state {
        SlotState::Idle => Ok(()),
        SlotState::Starting | SlotState::Active => Err(RecorderError::AlreadyRecording),
    }
}

/// What `stop`/`cancel` should do when trying to take the active session out
/// of the slot.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(mobile, allow(dead_code))]
enum TakeOutcome {
    /// Nothing was ever started.
    Idle,
    /// A start is in flight on another task. The frontend serializes
    /// recording calls (see the module doc), so a stop/cancel racing an
    /// in-flight start is not an expected client sequence; treating it as
    /// "not recording yet" is simpler and safer than trying to cancel a
    /// device-open that's already talking to the OS on another thread.
    Starting,
    /// A session was active and has been taken; the slot is now `Idle`.
    Active,
}

#[cfg_attr(mobile, allow(dead_code))]
fn take_outcome(state: SlotState) -> TakeOutcome {
    match state {
        SlotState::Idle => TakeOutcome::Idle,
        SlotState::Starting => TakeOutcome::Starting,
        SlotState::Active => TakeOutcome::Active,
    }
}

#[derive(Default)]
pub struct VoiceRecordingState {
    #[cfg(desktop)]
    active: std::sync::Mutex<Slot>,
}

#[cfg(desktop)]
fn lock_active(state: &VoiceRecordingState) -> Result<std::sync::MutexGuard<'_, Slot>, String> {
    state
        .active
        .lock()
        .map_err(|_| "recording_failed: state poisoned".to_string())
}

/// Takes the active session out of the slot, resetting it to `Idle`, if (and
/// only if) `TakeOutcome::Active`. Shared by `stop` and `cancel`, which only
/// differ in how they react to `Idle`/`Starting` (see call sites).
#[cfg(desktop)]
fn try_take_active(
    state: &VoiceRecordingState,
) -> Result<(TakeOutcome, Option<capture::CaptureSession>), String> {
    let mut guard = lock_active(state)?;
    let outcome = take_outcome(guard.state());
    if outcome != TakeOutcome::Active {
        return Ok((outcome, None));
    }
    match std::mem::replace(&mut *guard, Slot::Idle) {
        Slot::Active(session) => Ok((outcome, Some(session))),
        _ => unreachable!("take_outcome(guard.state()) just confirmed Active"),
    }
}

#[cfg(desktop)]
async fn start_capture(app: &AppHandle) -> Result<capture::CaptureSession, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("recording_failed: {}", e))?;
    let base = temp_output_base(&cache_dir, &uuid::Uuid::new_v4().to_string());
    tauri::async_runtime::spawn_blocking(move || capture::CaptureSession::start(&base))
        .await
        .map_err(|e| format!("recording_failed: {}", e))?
        .map_err(|e| e.code())
}

#[cfg(desktop)]
#[tauri::command]
pub async fn voice_recording_start(
    app: AppHandle,
    state: State<'_, VoiceRecordingState>,
) -> Result<(), String> {
    {
        let mut guard = lock_active(&state)?;
        start_is_allowed(guard.state()).map_err(|e| e.code())?;
        *guard = Slot::Starting;
    }

    match start_capture(&app).await {
        Ok(session) => {
            *lock_active(&state)? = Slot::Active(session);
            Ok(())
        }
        Err(error) => {
            // Release the reservation regardless of *why* starting failed
            // (bad cache dir, join failure, device error) — otherwise the
            // slot would be stuck in `Starting` forever and every future
            // start/stop/cancel would misbehave.
            *lock_active(&state)? = Slot::Idle;
            Err(error)
        }
    }
}

#[cfg(desktop)]
#[tauri::command]
pub async fn voice_recording_stop(
    state: State<'_, VoiceRecordingState>,
    workspace_path: String,
    label: String,
) -> Result<RecordedAudioAsset, String> {
    let (outcome, session) = try_take_active(&state)?;
    let Some(session) = session else {
        // Both `Idle` and `Starting` mean "nothing to stop yet".
        debug_assert_ne!(outcome, TakeOutcome::Active);
        return Err(RecorderError::NotRecording.code());
    };
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H-%M").to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let stopped = session.stop().map_err(|e| e.code())?;
        let file_name = display_file_name(&label, &timestamp, &stopped.file_path);
        finalize_recording(&stopped, &file_name, |source, name| {
            crate::commands::note::import_asset_by_path_with_limit(
                workspace_path.clone(),
                source.to_string(),
                name.to_string(),
                VOICE_IMPORT_MAX_BYTES,
            )
            .map(|asset| ImportedAudio {
                src: asset.src,
                bytes: asset.bytes as u64,
            })
        })
    })
    .await
    .map_err(|e| format!("recording_failed: {}", e))?
}

#[cfg(desktop)]
#[tauri::command]
pub async fn voice_recording_cancel(state: State<'_, VoiceRecordingState>) -> Result<(), String> {
    let (outcome, session) = try_take_active(&state)?;
    let session = match session {
        Some(session) => session,
        // Unlike `stop`, cancelling an idle slot is a harmless no-op (the
        // frontend may cancel defensively without knowing whether anything
        // was ever started). `Starting` is still rejected: there is a
        // device-open in flight on another task that this call cannot
        // reasonably interrupt.
        None if outcome == TakeOutcome::Idle => return Ok(()),
        None => return Err(RecorderError::NotRecording.code()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let stopped = session.stop().map_err(|e| e.code())?;
        discard_temp_file(&stopped.file_path);
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("recording_failed: {}", e))?
}

// Mobile: no `cpal` capture in v1. Same JS-visible signatures as the desktop
// commands (so the frontend never needs to branch on platform), all
// rejecting with the same stable `unsupported` code.
#[cfg(mobile)]
#[tauri::command]
pub async fn voice_recording_start(_state: State<'_, VoiceRecordingState>) -> Result<(), String> {
    Err(RecorderError::Unsupported.code())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn voice_recording_stop(
    _state: State<'_, VoiceRecordingState>,
    _workspace_path: String,
    _label: String,
) -> Result<RecordedAudioAsset, String> {
    Err(RecorderError::Unsupported.code())
}

#[cfg(mobile)]
#[tauri::command]
pub async fn voice_recording_cancel(_state: State<'_, VoiceRecordingState>) -> Result<(), String> {
    Err(RecorderError::Unsupported.code())
}

#[cfg(all(test, desktop))]
mod tests {
    use super::*;

    #[test]
    fn start_allowed_only_from_idle() {
        assert_eq!(start_is_allowed(SlotState::Idle), Ok(()));
        assert_eq!(
            start_is_allowed(SlotState::Starting),
            Err(RecorderError::AlreadyRecording)
        );
        assert_eq!(
            start_is_allowed(SlotState::Active),
            Err(RecorderError::AlreadyRecording)
        );
    }

    #[test]
    fn take_outcome_matches_slot_state() {
        assert_eq!(take_outcome(SlotState::Idle), TakeOutcome::Idle);
        assert_eq!(take_outcome(SlotState::Starting), TakeOutcome::Starting);
        assert_eq!(take_outcome(SlotState::Active), TakeOutcome::Active);
    }

    #[test]
    fn stop_only_proceeds_from_active() {
        // Simulates `voice_recording_stop`'s dispatch: everything except
        // `Active` must be treated as "not recording", whether nothing was
        // ever started or a start is still in flight.
        for state in [SlotState::Idle, SlotState::Starting] {
            assert_ne!(take_outcome(state), TakeOutcome::Active);
        }
        assert_eq!(take_outcome(SlotState::Active), TakeOutcome::Active);
    }

    #[test]
    fn cancel_is_a_noop_only_when_idle_not_when_starting() {
        // `cancel`'s special case vs. `stop`: an idle slot is success
        // (no-op), but `Starting` must not be conflated with `Idle` — it
        // still needs the `not_recording` rejection.
        assert_eq!(take_outcome(SlotState::Idle), TakeOutcome::Idle);
        assert_ne!(take_outcome(SlotState::Starting), TakeOutcome::Idle);
    }
}
