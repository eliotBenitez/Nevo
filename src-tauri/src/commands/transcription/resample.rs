const TARGET_SAMPLE_RATE: u32 = 16_000;

pub(crate) struct StreamingResampler {
    sample_rate: u32,
    input_frames: u64,
    next_sample: u64,
    previous: f32,
    samples: Vec<f32>,
}

impl StreamingResampler {
    pub(crate) fn new(sample_rate: u32) -> Option<Self> {
        (sample_rate > 0).then(|| Self {
            sample_rate,
            input_frames: 0,
            next_sample: 0,
            previous: 0.0,
            samples: Vec::new(),
        })
    }

    pub(crate) fn input_frames(&self) -> u64 {
        self.input_frames
    }

    pub(crate) fn push(&mut self, sample: f32) {
        let frame_index = self.input_frames;
        let frame_position = frame_index * u64::from(TARGET_SAMPLE_RATE);
        while self.next_sample * u64::from(self.sample_rate) <= frame_position {
            let position = self.next_sample * u64::from(self.sample_rate);
            let fraction =
                (position % u64::from(TARGET_SAMPLE_RATE)) as f32 / TARGET_SAMPLE_RATE as f32;
            let output = if frame_index == 0 || fraction == 0.0 {
                sample
            } else {
                self.previous * (1.0 - fraction) + sample * fraction
            };
            self.samples.push(output);
            self.next_sample += 1;
        }
        self.previous = sample;
        self.input_frames += 1;
    }

    /// Returns and clears the 16 kHz samples produced so far (streaming use).
    pub(crate) fn drain(&mut self) -> Vec<f32> {
        std::mem::take(&mut self.samples)
    }

    pub(crate) fn finish(mut self) -> Vec<f32> {
        let length = (self.input_frames * u64::from(TARGET_SAMPLE_RATE)
            / u64::from(self.sample_rate)) as usize;
        self.samples.resize(length, self.previous);
        self.samples
    }
}

#[cfg(test)]
mod tests {
    use super::StreamingResampler;

    #[test]
    fn resamples_mono_at_non_sixteen_kilohertz_rates() {
        let mut resampler = StreamingResampler::new(48_000).unwrap();
        for _ in 0..48_000 {
            resampler.push(0.5);
        }
        let output = resampler.finish();
        assert_eq!(output.len(), 16_000);
        assert!(output.iter().all(|sample| (*sample - 0.5).abs() < 0.0001));
    }

    #[test]
    fn rejects_empty_or_invalid_sample_rates() {
        assert!(StreamingResampler::new(48_000).unwrap().finish().is_empty());
        assert!(StreamingResampler::new(0).is_none());
    }

    #[test]
    fn interpolates_across_packet_boundaries_and_clamps_the_final_sample() {
        let mut resampler = StreamingResampler::new(8_000).unwrap();
        resampler.push(0.0);
        resampler.push(1.0);
        resampler.push(0.0);
        assert_eq!(resampler.finish(), vec![0.0, 0.5, 1.0, 0.5, 0.0, 0.0]);
    }

    #[test]
    fn high_rate_audio_retains_only_sixteen_kilohertz_samples() {
        let mut resampler = StreamingResampler::new(192_000).unwrap();
        for _ in 0..192_000 {
            resampler.push(0.25);
        }
        assert_eq!(resampler.samples.len(), 16_000);
        assert!(resampler.samples.iter().all(|sample| *sample == 0.25));
    }

    #[test]
    fn drain_returns_and_clears_produced_samples() {
        let mut resampler = StreamingResampler::new(16_000).unwrap();
        resampler.push(0.1);
        resampler.push(0.2);
        assert_eq!(resampler.drain(), vec![0.1, 0.2]);
        assert!(resampler.drain().is_empty());
        resampler.push(0.3);
        assert_eq!(resampler.drain(), vec![0.3]);
    }
}
