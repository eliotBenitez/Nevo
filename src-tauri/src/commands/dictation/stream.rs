//! Live microphone input for dictation: mono f32 chunks at the device rate,
//! never written to disk. `cpal::Stream` is `!Send`, so it lives on its own thread.

use std::sync::mpsc;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

use crate::commands::voice_recording::capture::{
    downmix_to_i16, log_stream_error, select_input_config, ToI16Sample,
};
use crate::commands::voice_recording::session::RecorderError;

const START_TIMEOUT: Duration = Duration::from_secs(10);

pub(super) struct InputStream {
    stop_tx: mpsc::Sender<()>,
    thread: Option<std::thread::JoinHandle<()>>,
    pub(super) sample_rate: u32,
}

fn build<T: ToI16Sample + cpal::SizedSample>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    channels: u16,
    chunks: mpsc::Sender<Vec<f32>>,
) -> Result<cpal::Stream, cpal::BuildStreamError> {
    let mut scratch: Vec<i16> = Vec::new();
    device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            scratch.clear();
            downmix_to_i16(data, channels, &mut scratch);
            let chunk = scratch.iter().map(|&s| f32::from(s) / 32_768.0).collect();
            // The worker may already be gone (error/cancel); nothing to do then.
            let _ = chunks.send(chunk);
        },
        log_stream_error,
        None,
    )
}

fn open(chunks: mpsc::Sender<Vec<f32>>) -> Result<(cpal::Stream, u32), RecorderError> {
    let device = cpal::default_host()
        .default_input_device()
        .ok_or(RecorderError::NoDevice)?;
    let supported = select_input_config(&device)?;
    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels();
    let format = supported.sample_format();
    let config: cpal::StreamConfig = supported.config();
    let stream = match format {
        cpal::SampleFormat::F32 => build::<f32>(&device, &config, channels, chunks),
        cpal::SampleFormat::I16 => build::<i16>(&device, &config, channels, chunks),
        cpal::SampleFormat::U16 => build::<u16>(&device, &config, channels, chunks),
        _ => {
            return Err(RecorderError::Other(
                "unsupported sample format".to_string(),
            ))
        }
    }
    .map_err(|error| RecorderError::Other(error.to_string()))?;
    stream
        .play()
        .map_err(|error| RecorderError::Other(error.to_string()))?;
    Ok((stream, sample_rate))
}

impl InputStream {
    pub(super) fn start(chunks: mpsc::Sender<Vec<f32>>) -> Result<Self, RecorderError> {
        let (ready_tx, ready_rx) = mpsc::channel::<Result<u32, RecorderError>>();
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let thread = std::thread::spawn(move || {
            let (stream, rate) = match open(chunks) {
                Ok(opened) => opened,
                Err(error) => {
                    let _ = ready_tx.send(Err(error));
                    return;
                }
            };
            let _ = ready_tx.send(Ok(rate));
            let _ = stop_rx.recv();
            // Pause before drop so the OS "microphone in use" indicator clears.
            let _ = stream.pause();
            drop(stream);
        });

        match ready_rx.recv_timeout(START_TIMEOUT) {
            Ok(Ok(sample_rate)) => Ok(Self {
                stop_tx,
                thread: Some(thread),
                sample_rate,
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
                let _ = stop_tx.send(());
                std::thread::spawn(move || {
                    let _ = thread.join();
                });
                Err(RecorderError::Other("capture start timed out".to_string()))
            }
        }
    }

    /// Stops the stream and joins its thread; this drops the chunk sender,
    /// which is what lets the worker see the end of input.
    pub(super) fn stop(mut self) {
        let _ = self.stop_tx.send(());
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
