//! Consumes microphone chunks, segments them and recognizes each segment.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

use tauri::ipc::Channel;
use whisper_rs::WhisperContext;

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

pub(super) struct WorkerConfig {
    pub sample_rate: u32,
    pub language: Option<String>,
    pub cancelled: Arc<AtomicBool>,
}

struct Worker<'a> {
    ctx: &'a WhisperContext,
    language: Option<String>,
    events: Channel<DictationEvent>,
    finalized: String,
}

impl Worker<'_> {
    fn prompt(&self) -> Option<&str> {
        let total = self.finalized.chars().count();
        if total == 0 {
            return None;
        }
        let skip = total.saturating_sub(PROMPT_CHARS);
        let start = self
            .finalized
            .char_indices()
            .nth(skip)
            .map_or(0, |(index, _)| index);
        Some(&self.finalized[start..])
    }

    fn recognize(&self, pcm: &[f32]) -> Result<String, String> {
        recognize_text(self.ctx, pcm, self.language.as_deref(), self.prompt())
    }

    fn finalize(&mut self, pcm: &[f32]) -> Result<(), String> {
        if !is_audible(pcm) {
            return Ok(());
        }
        let text = self.recognize(pcm)?;
        if !text.is_empty() {
            if !self.finalized.is_empty() {
                self.finalized.push(' ');
            }
            self.finalized.push_str(&text);
            let _ = self.events.send(DictationEvent::Final { text });
        }
        Ok(())
    }

    fn partial(&self, pcm: &[f32]) -> Result<(), String> {
        if !is_audible(pcm) {
            return Ok(());
        }
        let text = self.recognize(pcm)?;
        if !text.is_empty() {
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
        ctx,
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
    use super::is_audible;

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
