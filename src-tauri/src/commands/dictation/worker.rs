//! Consumes microphone chunks, segments them and recognizes each segment.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

use tauri::ipc::Channel;
use whisper_rs::{WhisperContext, WhisperState};

use super::segmenter::{Segmenter, SegmenterEvent};
use super::DictationEvent;
use crate::commands::transcription::recognize_text;
use crate::commands::transcription::resample::StreamingResampler;

const PROMPT_CHARS: usize = 200;
/// Below this overall RMS a segment is a noise burst (a click, a cough), not a voice.
const MIN_SEGMENT_RMS: f32 = 0.006;

fn is_audible(pcm: &[f32]) -> bool {
    let energy = pcm.iter().map(|s| s * s).sum::<f32>() / pcm.len().max(1) as f32;
    energy.sqrt() >= MIN_SEGMENT_RMS
}
const LEVEL_INTERVAL: Duration = Duration::from_millis(100);

fn words(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
        .collect()
}

/// Whisper tends to copy its prompt back for short or unclear audio, so a phrase
/// that only repeats the end of the already dictated text is dropped.
fn echoes_prompt(finalized: &str, text: &str) -> bool {
    let text = words(text);
    !text.is_empty() && words(finalized).ends_with(&text)
}

pub(super) struct WorkerConfig {
    pub sample_rate: u32,
    pub language: Option<String>,
    pub cancelled: Arc<AtomicBool>,
}

struct Worker {
    /// One whisper state for the whole session, so its buffers are not reallocated per phrase.
    whisper: WhisperState,
    language: Option<String>,
    events: Channel<DictationEvent>,
    finalized: String,
}

/// The last `PROMPT_CHARS` characters of the dictated text, used as the decoding prompt.
fn prompt_tail(finalized: &str) -> Option<&str> {
    let total = finalized.chars().count();
    if total == 0 {
        return None;
    }
    let skip = total.saturating_sub(PROMPT_CHARS);
    let start = finalized
        .char_indices()
        .nth(skip)
        .map_or(0, |(index, _)| index);
    Some(&finalized[start..])
}

impl Worker {
    fn recognize(&mut self, pcm: &[f32], precise: bool) -> Result<String, String> {
        recognize_text(
            &mut self.whisper,
            pcm,
            self.language.as_deref(),
            prompt_tail(&self.finalized),
            precise,
        )
    }

    fn finalize(&mut self, pcm: &[f32]) -> Result<(), String> {
        if !is_audible(pcm) {
            return Ok(());
        }
        let text = self.recognize(pcm, true)?;
        if !text.is_empty() && !echoes_prompt(&self.finalized, &text) {
            if !self.finalized.is_empty() {
                self.finalized.push(' ');
            }
            self.finalized.push_str(&text);
            let _ = self.events.send(DictationEvent::Final { text });
        }
        Ok(())
    }

    fn partial(&mut self, pcm: &[f32]) -> Result<(), String> {
        if !is_audible(pcm) {
            return Ok(());
        }
        let text = self.recognize(pcm, false)?;
        if !text.is_empty() && !echoes_prompt(&self.finalized, &text) {
            let _ = self.events.send(DictationEvent::Partial { text });
        }
        Ok(())
    }

    /// Closes are recognized in order; of the partials only the newest one that
    /// follows the last close is worth the time, so a partial never delays a close.
    fn handle(
        &mut self,
        events: Vec<SegmenterEvent>,
        cancelled: &AtomicBool,
    ) -> Result<(), String> {
        let mut latest_partial: Option<Vec<f32>> = None;
        let mut closes = Vec::new();
        for event in events {
            match event {
                SegmenterEvent::Close(pcm) => {
                    latest_partial = None;
                    closes.push(pcm);
                }
                SegmenterEvent::Partial(pcm) => latest_partial = Some(pcm),
            }
        }
        for pcm in closes {
            if cancelled.load(Ordering::Acquire) {
                return Ok(());
            }
            self.finalize(&pcm)?;
        }
        if let Some(pcm) = latest_partial {
            if !cancelled.load(Ordering::Acquire) {
                self.partial(&pcm)?;
            }
        }
        Ok(())
    }
}

pub(super) fn run(
    ctx: &WhisperContext,
    config: WorkerConfig,
    chunks: mpsc::Receiver<Vec<f32>>,
    events: Channel<DictationEvent>,
) {
    let outcome = process(ctx, &config, &chunks, &events);
    if let Err(code) = outcome {
        let _ = events.send(DictationEvent::Error { code });
    }
    let _ = events.send(DictationEvent::Stopped);
}

fn process(
    ctx: &WhisperContext,
    config: &WorkerConfig,
    chunks: &mpsc::Receiver<Vec<f32>>,
    events: &Channel<DictationEvent>,
) -> Result<(), String> {
    let mut resampler = StreamingResampler::new(config.sample_rate)
        .ok_or_else(|| "recording_failed: invalid sample rate".to_string())?;
    let mut segmenter = Segmenter::new();
    let mut worker = Worker {
        whisper: ctx
            .create_state()
            .map_err(|_| "inference_failed".to_string())?,
        language: config.language.clone(),
        events: events.clone(),
        finalized: String::new(),
    };
    let mut last_level = Instant::now() - LEVEL_INTERVAL;

    // Ends when the stream thread drops its sender (stop or cancel).
    while let Ok(first) = chunks.recv() {
        let mut batch = vec![first];
        // Audio queued while recognizing is segmented before the next recognition.
        batch.extend(chunks.try_iter());
        let mut segment_events = Vec::new();
        for chunk in batch {
            for sample in chunk {
                resampler.push(sample);
            }
            segment_events.extend(segmenter.push(&resampler.drain()));
        }
        if last_level.elapsed() >= LEVEL_INTERVAL {
            last_level = Instant::now();
            let _ = events.send(DictationEvent::Level {
                rms: segmenter.last_rms(),
            });
        }
        if config.cancelled.load(Ordering::Acquire) {
            return Ok(());
        }
        worker.handle(segment_events, &config.cancelled)?;
    }

    if !config.cancelled.load(Ordering::Acquire) {
        if let Some(pcm) = segmenter.finish() {
            worker.finalize(&pcm)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{echoes_prompt, is_audible};

    #[test]
    fn drops_a_phrase_that_repeats_the_dictated_tail() {
        let before = "Музыка. На индиктафон.";
        assert!(echoes_prompt(before, "На индиктафон"));
        assert!(echoes_prompt(before, "на индиктафон!"));
        assert!(!echoes_prompt(before, "Новая фраза"));
        assert!(!echoes_prompt(before, "Музыка"));
        assert!(!echoes_prompt("", "Алло"));
        assert!(!echoes_prompt(before, "..."));
    }

    #[test]
    fn quiet_noise_is_not_audible_but_speech_level_audio_is() {
        let noise: Vec<f32> = (0..16_000)
            .map(|i| if i % 50 == 0 { 0.02 } else { 0.0005 })
            .collect();
        assert!(!is_audible(&noise));
        let voice: Vec<f32> = (0..16_000).map(|i| (i as f32 * 0.05).sin() * 0.1).collect();
        assert!(is_audible(&voice));
        assert!(!is_audible(&[]));
    }
}
