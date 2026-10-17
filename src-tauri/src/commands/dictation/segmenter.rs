//! Voice-activity segmentation of a 16 kHz mono stream. Pure and
//! platform-independent so it can be unit tested without audio hardware.

use std::collections::VecDeque;

const FRAME: usize = 480; // 30 ms at 16 kHz
const SAMPLE_RATE: usize = 16_000;
const OPEN_WINDOW_FRAMES: usize = 10; // 300 ms
const OPEN_MIN_SPEECH_FRAMES: usize = 7;
const PRE_ROLL_FRAMES: usize = 7; // ~200 ms
const CLOSE_SILENCE_FRAMES: usize = 24; // 720 ms >= 700 ms
const TRAILING_SILENCE_KEEP_FRAMES: usize = 7;
const PARTIAL_INTERVAL: usize = SAMPLE_RATE * 12 / 10;
const MAX_SEGMENT: usize = SAMPLE_RATE * 12;
const MIN_FINISH_SPEECH_FRAMES: usize = 10;
const MIN_FLOOR: f32 = 0.002;
const FLOOR_ALPHA: f32 = 0.05;
const FLOOR_FACTOR: f32 = 3.0;
const MIN_SPEECH_RMS: f32 = 0.01;

#[derive(Debug, Clone, PartialEq)]
pub enum SegmenterEvent {
    /// Snapshot of the whole open segment so far.
    Partial(Vec<f32>),
    /// The segment ended; it is complete.
    Close(Vec<f32>),
}

pub struct Segmenter {
    pending: Vec<f32>,
    floor: f32,
    last_rms: f32,
    /// Recent frames while no segment is open: (samples, is_speech).
    recent: VecDeque<(Vec<f32>, bool)>,
    open: bool,
    segment: Vec<f32>,
    speech_frames: usize,
    silence_run: usize,
    since_partial: usize,
}

impl Default for Segmenter {
    fn default() -> Self {
        Self::new()
    }
}

fn rms(frame: &[f32]) -> f32 {
    (frame.iter().map(|s| s * s).sum::<f32>() / frame.len().max(1) as f32).sqrt()
}

impl Segmenter {
    pub fn new() -> Self {
        Self {
            pending: Vec::new(),
            floor: MIN_FLOOR,
            last_rms: 0.0,
            recent: VecDeque::new(),
            open: false,
            segment: Vec::new(),
            speech_frames: 0,
            silence_run: 0,
            since_partial: 0,
        }
    }

    /// RMS of the most recent complete frame, for level metering.
    pub fn last_rms(&self) -> f32 {
        self.last_rms
    }

    pub fn push(&mut self, samples: &[f32]) -> Vec<SegmenterEvent> {
        let mut events = Vec::new();
        self.pending.extend_from_slice(samples);
        let full = self.pending.len() / FRAME * FRAME;
        let frames: Vec<f32> = self.pending.drain(..full).collect();
        for frame in frames.chunks_exact(FRAME) {
            self.frame(frame, &mut events);
        }
        events
    }

    /// Returns the open segment if it holds enough speech, and resets.
    pub fn finish(&mut self) -> Option<Vec<f32>> {
        let result = (self.open && self.speech_frames >= MIN_FINISH_SPEECH_FRAMES)
            .then(|| self.take_segment(true));
        self.reset_segment();
        self.pending.clear();
        result
    }

    fn frame(&mut self, frame: &[f32], events: &mut Vec<SegmenterEvent>) {
        let level = rms(frame);
        self.last_rms = level;
        let speech = level > (self.floor * FLOOR_FACTOR).max(MIN_SPEECH_RMS);
        if !speech {
            self.floor = (self.floor * (1.0 - FLOOR_ALPHA) + level * FLOOR_ALPHA).max(MIN_FLOOR);
        }

        if !self.open {
            self.recent.push_back((frame.to_vec(), speech));
            while self.recent.len() > OPEN_WINDOW_FRAMES + PRE_ROLL_FRAMES {
                self.recent.pop_front();
            }
            let speech_in_window = self
                .recent
                .iter()
                .rev()
                .take(OPEN_WINDOW_FRAMES)
                .filter(|(_, is_speech)| *is_speech)
                .count();
            if self.recent.len() >= OPEN_WINDOW_FRAMES && speech_in_window >= OPEN_MIN_SPEECH_FRAMES
            {
                self.open = true;
                self.speech_frames = self.recent.iter().filter(|(_, s)| *s).count();
                self.silence_run = self.recent.iter().rev().take_while(|(_, s)| !*s).count();
                self.segment = self.recent.drain(..).flat_map(|(f, _)| f).collect();
                self.since_partial = 0;
            }
            return;
        }

        self.segment.extend_from_slice(frame);
        self.since_partial += FRAME;
        if speech {
            self.speech_frames += 1;
            self.silence_run = 0;
        } else {
            self.silence_run += 1;
        }

        if self.silence_run >= CLOSE_SILENCE_FRAMES {
            events.push(SegmenterEvent::Close(self.take_segment(true)));
            self.reset_segment();
        } else if self.segment.len() >= MAX_SEGMENT {
            events.push(SegmenterEvent::Close(self.take_segment(false)));
            self.reset_segment();
        } else if self.since_partial >= PARTIAL_INTERVAL {
            self.since_partial = 0;
            events.push(SegmenterEvent::Partial(self.segment.clone()));
        }
    }

    fn take_segment(&mut self, trim_silence: bool) -> Vec<f32> {
        let mut segment = std::mem::take(&mut self.segment);
        if trim_silence && self.silence_run > TRAILING_SILENCE_KEEP_FRAMES {
            let excess = (self.silence_run - TRAILING_SILENCE_KEEP_FRAMES) * FRAME;
            segment.truncate(segment.len().saturating_sub(excess));
        }
        segment
    }

    fn reset_segment(&mut self) {
        self.open = false;
        self.segment.clear();
        self.speech_frames = 0;
        self.silence_run = 0;
        self.since_partial = 0;
        self.recent.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(seconds: f32) -> Vec<f32> {
        (0..(seconds * 16_000.0) as usize)
            .map(|i| 0.3 * (i as f32 * 440.0 * std::f32::consts::TAU / 16_000.0).sin())
            .collect()
    }

    fn silence(seconds: f32) -> Vec<f32> {
        vec![0.0; (seconds * 16_000.0) as usize]
    }

    fn feed(segmenter: &mut Segmenter, samples: &[f32]) -> Vec<SegmenterEvent> {
        samples
            .chunks(1_600)
            .flat_map(|chunk| segmenter.push(chunk))
            .collect()
    }

    #[test]
    fn silence_emits_nothing() {
        let mut segmenter = Segmenter::new();
        assert!(feed(&mut segmenter, &silence(5.0)).is_empty());
        assert!(segmenter.finish().is_none());
    }

    #[test]
    fn tone_burst_then_silence_closes_one_segment() {
        let mut segmenter = Segmenter::new();
        let mut input = tone(1.0);
        input.extend(silence(1.0));
        let closes: Vec<_> = feed(&mut segmenter, &input)
            .into_iter()
            .filter_map(|event| match event {
                SegmenterEvent::Close(samples) => Some(samples),
                _ => None,
            })
            .collect();
        assert_eq!(closes.len(), 1);
        let seconds = closes[0].len() as f32 / 16_000.0;
        assert!((1.1..1.3).contains(&seconds), "got {seconds}");
        assert!(segmenter.finish().is_none());
    }

    #[test]
    fn continuous_tone_closes_at_twelve_seconds() {
        let mut segmenter = Segmenter::new();
        let events = feed(&mut segmenter, &tone(15.0));
        let first_close = events
            .iter()
            .find_map(|event| match event {
                SegmenterEvent::Close(samples) => Some(samples.len()),
                _ => None,
            })
            .unwrap();
        assert_eq!(first_close, 12 * 16_000);
    }

    #[test]
    fn partials_appear_about_every_1_2_seconds() {
        let mut segmenter = Segmenter::new();
        let partials: Vec<_> = feed(&mut segmenter, &tone(5.0))
            .into_iter()
            .filter_map(|event| match event {
                SegmenterEvent::Partial(samples) => Some(samples.len()),
                _ => None,
            })
            .collect();
        assert_eq!(partials.len(), 3);
        assert!(partials.windows(2).all(|pair| pair[1] > pair[0]));
    }

    #[test]
    fn finish_returns_open_segment_and_none_for_short_noise() {
        let mut segmenter = Segmenter::new();
        assert!(feed(&mut segmenter, &tone(1.0)).is_empty());
        let segment = segmenter.finish().unwrap();
        assert!(segment.len() >= 15_000);

        let mut segmenter = Segmenter::new();
        feed(&mut segmenter, &tone(0.15));
        assert!(segmenter.finish().is_none());
    }

    #[test]
    fn reports_frame_level() {
        let mut segmenter = Segmenter::new();
        segmenter.push(&tone(0.1));
        assert!(segmenter.last_rms() > 0.1);
    }
}
