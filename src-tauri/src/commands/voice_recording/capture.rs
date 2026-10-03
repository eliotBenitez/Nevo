//! In-house microphone capture: no third-party Tauri plugin. `cpal` owns the
//! input stream and `hound` writes the WAV file. Desktop-only for v1 — the
//! pure helpers below compile and test on every target, but `CaptureSession`
//! and everything that touches `cpal`/`hound` is `#[cfg(desktop)]`; mobile
//! command stubs return `RecorderError::Unsupported` instead (see `mod.rs`).

use std::path::Path;

#[cfg(desktop)]
use std::fs::File;
#[cfg(desktop)]
use std::io::BufWriter;
#[cfg(desktop)]
use std::path::PathBuf;
#[cfg(desktop)]
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
#[cfg(desktop)]
use std::sync::{mpsc, Arc, Mutex};

#[cfg(desktop)]
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

#[cfg(desktop)]
use super::session::{RecorderError, StoppedRecording};

pub const PREFERRED_SAMPLE_RATE: u32 = 16_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(mobile, allow(dead_code))]
pub struct ConfigCandidate {
    pub channels: u16,
    pub min_rate: u32,
    pub max_rate: u32,
}

/// Index of the candidate to use at `preferred` Hz (fewest channels wins), or
/// None when no candidate covers that rate.
#[cfg_attr(mobile, allow(dead_code))]
pub fn pick_config(candidates: &[ConfigCandidate], preferred: u32) -> Option<(usize, u32)> {
    candidates
        .iter()
        .enumerate()
        .filter(|(_, c)| c.channels > 0 && c.min_rate <= preferred && preferred <= c.max_rate)
        .min_by_key(|(_, c)| c.channels)
        .map(|(index, _)| (index, preferred))
}

/// Fallback when no candidate covers `PREFERRED_SAMPLE_RATE`: prefer a
/// candidate that covers the device's own default rate (still picked from
/// `candidates`, so the format is one we can actually decode — see the
/// `open_capture` filtering comment), else fall back to the fewest-channel
/// candidate's own top rate. `None` only when `candidates` is empty.
#[cfg_attr(mobile, allow(dead_code))]
pub fn fallback_config(
    candidates: &[ConfigCandidate],
    default_rate: Option<u32>,
) -> Option<(usize, u32)> {
    if let Some(rate) = default_rate {
        if let Some(found) = pick_config(candidates, rate) {
            return Some(found);
        }
    }
    candidates
        .iter()
        .enumerate()
        .filter(|(_, c)| c.channels > 0)
        .min_by_key(|(_, c)| c.channels)
        .map(|(index, c)| (index, c.max_rate))
}

#[cfg_attr(mobile, allow(dead_code))]
pub trait ToI16Sample: Copy {
    fn to_i16_sample(self) -> i32;
}
impl ToI16Sample for f32 {
    fn to_i16_sample(self) -> i32 {
        (self.clamp(-1.0, 1.0) * i16::MAX as f32) as i32
    }
}
impl ToI16Sample for i16 {
    fn to_i16_sample(self) -> i32 {
        self as i32
    }
}
impl ToI16Sample for u16 {
    fn to_i16_sample(self) -> i32 {
        self as i32 - 32_768
    }
}

/// Averages each interleaved frame into one i16 sample; a trailing partial
/// frame is dropped.
#[cfg_attr(mobile, allow(dead_code))]
pub fn downmix_to_i16<T: ToI16Sample>(data: &[T], channels: u16, out: &mut Vec<i16>) {
    let channels = channels.max(1) as usize;
    for frame in data.chunks_exact(channels) {
        let sum: i32 = frame.iter().map(|s| s.to_i16_sample()).sum();
        out.push((sum / channels as i32).clamp(i16::MIN as i32, i16::MAX as i32) as i16);
    }
}

#[cfg_attr(mobile, allow(dead_code))]
pub fn duration_ms(frames: u64, sample_rate: u32) -> u64 {
    if sample_rate == 0 {
        0
    } else {
        frames * 1000 / sample_rate as u64
    }
}

#[cfg(desktop)]
pub fn create_wav_writer(
    path: &Path,
    sample_rate: u32,
) -> Result<hound::WavWriter<BufWriter<File>>, String> {
    hound::WavWriter::create(
        path,
        hound::WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )
    .map_err(|e| e.to_string())
}

#[cfg(desktop)]
type SharedWriter = Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>;

/// Downmixes and writes one callback's worth of samples, tracking how many
/// mono samples actually made it to disk (used for `duration_ms`). Stops
/// writing for the rest of the session once a write fails (e.g. disk full)
/// instead of retrying forever on every subsequent callback.
#[cfg(desktop)]
fn write_downmixed<T: ToI16Sample>(
    data: &[T],
    channels: u16,
    scratch: &mut Vec<i16>,
    writer: &SharedWriter,
    write_error: &AtomicBool,
    frames: &AtomicU64,
) {
    if write_error.load(Ordering::Relaxed) {
        return;
    }
    scratch.clear();
    downmix_to_i16(data, channels, scratch);
    let mut written = 0u64;
    if let Ok(mut guard) = writer.lock() {
        if let Some(w) = guard.as_mut() {
            for &sample in scratch.iter() {
                match w.write_sample(sample) {
                    Ok(()) => written += 1,
                    Err(_) => {
                        write_error.store(true, Ordering::Relaxed);
                        break;
                    }
                }
            }
        }
    }
    frames.fetch_add(written, Ordering::Relaxed);
}

/// Removes the header-only WAV file left behind when `open_capture` fails
/// after `create_wav_writer` already created it (e.g. `build_stream`/`play()`
/// error). Mirrors `session::discard_temp_file`'s tolerate-missing + log
/// pattern.
#[cfg(desktop)]
fn cleanup_failed_wav(path: &Path) {
    if let Err(error) = std::fs::remove_file(path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            let logger = crate::logging::logger();
            let _ = logger.warn(
                "tauri.voice_recording",
                "cleanup_failed_wav",
                "Failed to remove header-only WAV file after a failed capture start",
                false,
                crate::logging::LogContext::default().with_error(crate::logging::LogError {
                    kind: Some("io".to_string()),
                    message: format!("{}: {}", path.display(), error),
                    details: None,
                }),
            );
        }
    }
}

#[cfg(desktop)]
fn log_stream_error(error: cpal::StreamError) {
    let logger = crate::logging::logger();
    let _ = logger.error(
        "tauri.voice_recording",
        "capture_stream",
        "Audio input stream error",
        crate::logging::LogContext::default().with_error(crate::logging::LogError {
            kind: Some("audio".to_string()),
            message: error.to_string(),
            details: None,
        }),
    );
}

#[cfg(desktop)]
fn build_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sample_format: cpal::SampleFormat,
    channels: u16,
    writer: SharedWriter,
    write_error: Arc<AtomicBool>,
    frames: Arc<AtomicU64>,
) -> Result<cpal::Stream, RecorderError> {
    let built = match sample_format {
        cpal::SampleFormat::F32 => {
            let mut scratch: Vec<i16> = Vec::new();
            device.build_input_stream(
                config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    write_downmixed(data, channels, &mut scratch, &writer, &write_error, &frames);
                },
                log_stream_error,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let mut scratch: Vec<i16> = Vec::new();
            device.build_input_stream(
                config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    write_downmixed(data, channels, &mut scratch, &writer, &write_error, &frames);
                },
                log_stream_error,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let mut scratch: Vec<i16> = Vec::new();
            device.build_input_stream(
                config,
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    write_downmixed(data, channels, &mut scratch, &writer, &write_error, &frames);
                },
                log_stream_error,
                None,
            )
        }
        _ => {
            return Err(RecorderError::Other(
                "unsupported sample format".to_string(),
            ))
        }
    };
    built.map_err(|error| RecorderError::Other(error.to_string()))
}

/// Everything the capture thread needs to produce before signalling "ready":
/// the live stream (kept alive until stop), the writer it feeds, the frame
/// counter, the final WAV path, and the sample rate (for `duration_ms`).
#[cfg(desktop)]
fn open_capture(
    output_base: &Path,
) -> Result<(cpal::Stream, SharedWriter, Arc<AtomicU64>, PathBuf, u32), RecorderError> {
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or(RecorderError::NoDevice)?;

    // Some devices (observed on a virtual/dummy ALSA input in this sandbox)
    // advertise the identical channel/rate range under several sample
    // formats. `ConfigCandidate` intentionally carries no format field (see
    // its doc + tests), so `pick_config` can't distinguish between them by
    // itself; filtering to formats `build_stream` can actually decode before
    // building candidates guarantees the winning index always maps to a
    // buildable config, instead of possibly landing on an I32/U8 entry that
    // happens to tie on channels/rate with a usable F32/I16/U16 one.
    let supported_configs: Vec<_> = device
        .supported_input_configs()
        .map_err(|error| match error {
            cpal::SupportedStreamConfigsError::DeviceNotAvailable => RecorderError::NoDevice,
            other => RecorderError::Other(other.to_string()),
        })?
        .filter(|c| {
            matches!(
                c.sample_format(),
                cpal::SampleFormat::F32 | cpal::SampleFormat::I16 | cpal::SampleFormat::U16
            )
        })
        .collect();

    let candidates: Vec<ConfigCandidate> = supported_configs
        .iter()
        .map(|c| ConfigCandidate {
            channels: c.channels(),
            min_rate: c.min_sample_rate().0,
            max_rate: c.max_sample_rate().0,
        })
        .collect();

    let supported_config = match pick_config(&candidates, PREFERRED_SAMPLE_RATE) {
        Some((index, rate)) => supported_configs[index]
            .clone()
            .with_sample_rate(cpal::SampleRate(rate)),
        // No candidate covers 16 kHz. Falling straight to
        // `device.default_input_config()` here used to be able to pick a
        // format `build_stream` can't decode (I32/F64/...) even though a
        // usable F32/I16/U16 range existed at some other rate — fall back
        // within the already-filtered `candidates` instead, and only reach
        // for the device's raw default when we have no filtered candidate at
        // all to choose from.
        None if !candidates.is_empty() => {
            let default_rate = device
                .default_input_config()
                .ok()
                .map(|config| config.sample_rate().0);
            let (index, rate) = fallback_config(&candidates, default_rate)
                .expect("candidates is non-empty, so fallback_config always returns Some");
            supported_configs[index]
                .clone()
                .with_sample_rate(cpal::SampleRate(rate))
        }
        None => device
            .default_input_config()
            .map_err(|error| RecorderError::Other(error.to_string()))?,
    };

    let sample_rate = supported_config.sample_rate().0;
    let channels = supported_config.channels();
    let sample_format = supported_config.sample_format();
    let stream_config: cpal::StreamConfig = supported_config.config();

    let path = output_base.with_extension("wav");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| RecorderError::Other(error.to_string()))?;
    }
    let writer = create_wav_writer(&path, sample_rate).map_err(RecorderError::Other)?;
    let writer: SharedWriter = Arc::new(Mutex::new(Some(writer)));
    let frames = Arc::new(AtomicU64::new(0));
    let write_error = Arc::new(AtomicBool::new(false));

    let stream = match build_stream(
        &device,
        &stream_config,
        sample_format,
        channels,
        Arc::clone(&writer),
        write_error,
        Arc::clone(&frames),
    ) {
        Ok(stream) => stream,
        Err(error) => {
            // `create_wav_writer` already wrote a (header-only) file; don't
            // leave it behind for a recording that never started.
            drop(writer);
            cleanup_failed_wav(&path);
            return Err(error);
        }
    };
    if let Err(error) = stream.play() {
        drop(stream);
        drop(writer);
        cleanup_failed_wav(&path);
        return Err(RecorderError::Other(error.to_string()));
    }

    Ok((stream, writer, frames, path, sample_rate))
}

#[cfg(desktop)]
fn capture_thread(
    output_base: PathBuf,
    stop_rx: mpsc::Receiver<()>,
    ready_tx: mpsc::Sender<Result<(), RecorderError>>,
    done_tx: mpsc::Sender<Result<StoppedRecording, RecorderError>>,
) {
    let (stream, writer, frames, path, sample_rate) = match open_capture(&output_base) {
        Ok(value) => value,
        Err(error) => {
            let _ = ready_tx.send(Err(error));
            return;
        }
    };

    if ready_tx.send(Ok(())).is_err() {
        // `start()` already timed out and returned an error to its caller
        // (see `START_TIMEOUT`), so nobody is listening on `ready_rx` any
        // more — but it also sent a stop signal before giving up, which
        // `stop_rx.recv()` below will pick up immediately, tearing the
        // stream down the same as a normal stop.
    }

    // Blocks until `stop()` sends, or returns immediately if the sender was
    // dropped (e.g. the CaptureSession was dropped without calling stop()).
    let _ = stop_rx.recv();

    // Pausing before dropping avoids leaving the input device open on
    // platforms where a stream's device-disconnect listener outlives a bare
    // drop (macOS/cpal 0.15's device-in-use indicator can otherwise stick).
    let _ = stream.pause();
    drop(stream);

    // A poisoned lock (some other holder of this `Arc` panicked while
    // holding it — the audio callback, in practice) must not be treated the
    // same as "nothing to finalize": that would silently report success for
    // a WAV that was never finalized (wrong/placeholder header sizes).
    let finalize_result = match writer.lock() {
        Ok(mut guard) => match guard.take() {
            Some(w) => w
                .finalize()
                .map_err(|error| RecorderError::Other(error.to_string())),
            None => Ok(()),
        },
        Err(_) => Err(RecorderError::Other("writer poisoned".to_string())),
    };

    let outcome = match finalize_result {
        Ok(()) => Ok(StoppedRecording {
            file_path: path,
            duration_ms: duration_ms(frames.load(Ordering::SeqCst), sample_rate),
        }),
        Err(error) => Err(error),
    };

    let _ = done_tx.send(outcome);
}

/// Owns the capture thread. `cpal::Stream` is `!Send`, so the stream itself
/// never leaves the dedicated thread it's created on; this handle only holds
/// the `Send` channels + `JoinHandle` needed to talk to that thread, so it can
/// sit in `VoiceRecordingState` behind a `Mutex`.
#[cfg(desktop)]
pub struct CaptureSession {
    stop_tx: mpsc::Sender<()>,
    done_rx: mpsc::Receiver<Result<StoppedRecording, RecorderError>>,
    thread: Option<std::thread::JoinHandle<()>>,
}

#[cfg(desktop)]
impl CaptureSession {
    /// Starts capturing into `<output_base>.wav`. Returns once the stream is
    /// playing, or with the error that prevented it.
    pub fn start(output_base: &Path) -> Result<Self, RecorderError> {
        const START_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

        let output_base = output_base.to_path_buf();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), RecorderError>>();
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let (done_tx, done_rx) = mpsc::channel::<Result<StoppedRecording, RecorderError>>();

        let thread = std::thread::spawn(move || {
            capture_thread(output_base, stop_rx, ready_tx, done_tx);
        });

        match ready_rx.recv_timeout(START_TIMEOUT) {
            Ok(Ok(())) => Ok(Self {
                stop_tx,
                done_rx,
                thread: Some(thread),
            }),
            Ok(Err(error)) => {
                let _ = thread.join();
                Err(error)
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let _ = thread.join();
                Err(RecorderError::Other("capture thread exited".to_string()))
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // Something (device open, driver init) is taking too long.
                // Signal stop so the thread exits — cleanly finalizing
                // whatever it has — if it ever does become ready, instead of
                // leaking a live thread with an open input stream. Join it on
                // a detached thread rather than blocking here: we've already
                // decided to time out, so a hung driver must not also hang
                // this command.
                let _ = stop_tx.send(());
                std::thread::spawn(move || {
                    let _ = thread.join();
                });
                Err(RecorderError::Other("capture start timed out".to_string()))
            }
        }
    }

    /// Stops the stream, finalizes the WAV, joins the thread.
    pub fn stop(mut self) -> Result<StoppedRecording, RecorderError> {
        let _ = self.stop_tx.send(());
        let result = self
            .done_rx
            .recv()
            .unwrap_or_else(|_| Err(RecorderError::Other("capture thread exited".to_string())));
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        result
    }
}

#[cfg(desktop)]
impl Drop for CaptureSession {
    // Only runs if `stop()` was never called (e.g. the session was dropped
    // directly): signal the thread to stop and join it so nothing leaks. The
    // WAV file it already wrote stays in the cache dir — nobody here knows
    // the destination workspace to import it into, and it is safe to leave
    // for now (never inside workspace assets, so asset GC can't touch it).
    fn drop(&mut self) {
        if let Some(thread) = self.thread.take() {
            let _ = self.stop_tx.send(());
            let _ = thread.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cand(channels: u16, min: u32, max: u32) -> ConfigCandidate {
        ConfigCandidate {
            channels,
            min_rate: min,
            max_rate: max,
        }
    }

    #[test]
    fn picks_16k_with_fewest_channels() {
        let c = [cand(2, 8_000, 48_000), cand(1, 8_000, 48_000)];
        assert_eq!(pick_config(&c, PREFERRED_SAMPLE_RATE), Some((1, 16_000)));
    }

    #[test]
    fn returns_none_when_16k_unsupported() {
        let c = [cand(2, 44_100, 48_000)];
        assert_eq!(pick_config(&c, PREFERRED_SAMPLE_RATE), None);
    }

    #[test]
    fn fallback_config_prefers_a_candidate_covering_the_default_rate() {
        let c = [cand(2, 8_000, 48_000), cand(1, 44_100, 44_100)];
        // Neither candidate covers 16 kHz (only the fallback path is under
        // test here), but the second covers the device's reported default
        // of 44_100 Hz exactly, and has fewer channels — it should win.
        assert_eq!(fallback_config(&c, Some(44_100)), Some((1, 44_100)));
    }

    #[test]
    fn fallback_config_falls_back_to_fewest_channel_top_rate_without_a_default_match() {
        let c = [cand(2, 8_000, 48_000), cand(4, 8_000, 96_000)];
        // No default rate given, and even if one were, neither candidate
        // covers it (irrelevant here) — fewest channels (2) wins, using the
        // top of its own range.
        assert_eq!(fallback_config(&c, None), Some((0, 48_000)));
        assert_eq!(fallback_config(&c, Some(192_000)), Some((0, 48_000)));
    }

    #[test]
    fn fallback_config_is_none_for_empty_candidates() {
        assert_eq!(fallback_config(&[], Some(44_100)), None);
        assert_eq!(fallback_config(&[], None), None);
    }

    #[test]
    fn downmixes_stereo_f32_to_mono_i16() {
        let mut out = Vec::new();
        downmix_to_i16(&[1.0f32, 0.0, -1.0, -1.0], 2, &mut out);
        assert_eq!(out, vec![16_383, -32_767]);
    }

    #[test]
    fn downmixes_i16_and_u16() {
        let mut out = Vec::new();
        downmix_to_i16(&[100i16, 300], 2, &mut out);
        assert_eq!(out, vec![200]);
        out.clear();
        downmix_to_i16(&[32_768u16], 1, &mut out);
        assert_eq!(out, vec![0]);
    }

    #[test]
    fn mono_passthrough_and_partial_frame_dropped() {
        let mut out = Vec::new();
        downmix_to_i16(&[0.5f32, 0.25, 0.1], 2, &mut out); // trailing half-frame ignored
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn duration_from_frames() {
        assert_eq!(duration_ms(16_000, 16_000), 1_000);
        assert_eq!(duration_ms(24_000, 48_000), 500);
        assert_eq!(duration_ms(10, 0), 0);
    }

    #[test]
    #[cfg(desktop)]
    fn wav_writer_round_trip() {
        let dir = std::env::temp_dir().join(format!("nevo-capture-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.wav");
        let mut writer = create_wav_writer(&path, 16_000).unwrap();
        for s in [1i16, -1, 2] {
            writer.write_sample(s).unwrap();
        }
        writer.finalize().unwrap();
        let reader = hound::WavReader::open(&path).unwrap();
        let spec = reader.spec();
        assert_eq!(
            (spec.channels, spec.sample_rate, spec.bits_per_sample),
            (1, 16_000, 16)
        );
        assert_eq!(reader.len(), 3);
    }

    /// Optional manual smoke test: requires a real input device, so it's
    /// `#[ignore]`d by default. Run with `-- --ignored capture_smoke`.
    #[test]
    #[ignore]
    #[cfg(desktop)]
    fn capture_smoke() {
        let dir = std::env::temp_dir().join(format!("nevo-capture-smoke-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let base = dir.join("smoke");
        match CaptureSession::start(&base) {
            Ok(session) => {
                std::thread::sleep(std::time::Duration::from_millis(300));
                let stopped = session.stop().expect("stop should finalize the WAV");
                let reader =
                    hound::WavReader::open(&stopped.file_path).expect("WAV file should exist");
                assert!(reader.len() > 0, "expected at least one recorded sample");
            }
            Err(RecorderError::NoDevice) => {
                // No input device on this machine/CI runner — acceptable.
            }
            Err(other) => panic!("unexpected capture error: {:?}", other),
        }
    }
}
