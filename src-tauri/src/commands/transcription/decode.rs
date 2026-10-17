use std::fs::File;
use std::io::ErrorKind;
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as AudioError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use super::resample::StreamingResampler;

const MAX_AUDIO_SECONDS: usize = 30 * 60;
const MAX_AUDIO_BYTES: u64 = 100 * 1024 * 1024;

pub(super) fn decode_audio(path: &Path) -> Result<Vec<f32>, String> {
    let file = File::open(path).map_err(|_| "audio_unavailable".to_string())?;
    if file.metadata().map_err(|_| "audio_unavailable")?.len() > MAX_AUDIO_BYTES {
        return Err("audio_too_large".to_string());
    }
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut format = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| "audio_unsupported".to_string())?
        .format;
    let track = format
        .tracks()
        .iter()
        .find(|track| track.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| "audio_unsupported".to_string())?;
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.ok_or("audio_unsupported")?;
    let mut resampler = StreamingResampler::new(sample_rate).ok_or("audio_unsupported")?;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|_| "audio_unsupported".to_string())?;
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(AudioError::IoError(error)) if error.kind() == ErrorKind::UnexpectedEof => break,
            Err(_) => return Err("audio_decode_failed".to_string()),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = decoder.decode(&packet).map_err(|_| "audio_decode_failed")?;
        let channels = decoded.spec().channels.count();
        if channels == 0 || decoded.spec().rate != sample_rate {
            return Err("audio_unsupported".to_string());
        }
        if resampler
            .input_frames()
            .saturating_add(decoded.frames() as u64)
            > MAX_AUDIO_SECONDS as u64 * u64::from(sample_rate)
        {
            return Err("audio_too_long".to_string());
        }
        let mut samples = SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
        samples.copy_interleaved_ref(decoded);
        for frame in samples.samples().chunks_exact(channels) {
            resampler.push(frame.iter().sum::<f32>() / channels as f32);
        }
    }
    if resampler.input_frames() == 0 {
        return Err("audio_decode_failed".to_string());
    }
    let pcm = resampler.finish();
    if pcm.is_empty() {
        return Err("audio_decode_failed".to_string());
    }
    Ok(pcm)
}

#[cfg(test)]
mod tests {
    use super::decode_audio;

    #[test]
    fn decodes_stereo_wav_to_sixteen_kilohertz_mono() {
        let path = std::env::temp_dir().join(format!("nevo_asr_{}.wav", uuid::Uuid::new_v4()));
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        for _ in 0..48_000 {
            writer.write_sample(16_384_i16).unwrap();
            writer.write_sample(0_i16).unwrap();
        }
        writer.finalize().unwrap();
        let pcm = decode_audio(&path).unwrap();
        assert_eq!(pcm.len(), 16_000);
        assert!(pcm.iter().all(|sample| (*sample - 0.25).abs() < 0.001));
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn rejects_invalid_audio_without_running_inference() {
        let path = std::env::temp_dir().join(format!("nevo_asr_{}.wav", uuid::Uuid::new_v4()));
        std::fs::write(&path, b"invalid").unwrap();
        assert!(decode_audio(&path).is_err());
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn rejects_audio_too_short_for_one_output_sample() {
        let path = std::env::temp_dir().join(format!("nevo_asr_{}.wav", uuid::Uuid::new_v4()));
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 48_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        writer.write_sample(1_000_i16).unwrap();
        writer.finalize().unwrap();
        assert_eq!(decode_audio(&path), Err("audio_decode_failed".to_string()));
        std::fs::remove_file(path).ok();
    }
}
