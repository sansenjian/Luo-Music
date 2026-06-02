use std::fs::File;
use std::io::{self, BufRead, Write};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use cpal::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use symphonia::core::audio::sample::Sample;
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

const PROTOCOL_VERSION: u32 = 1;
const DEFAULT_BUFFER_FRAMES: u32 = 960;
const DEFAULT_TEST_TONE_DURATION_MS: u64 = 500;
const DEFAULT_TEST_TONE_FREQUENCY_HZ: f32 = 440.0;
const DEFAULT_PLAYBACK_VOLUME: f32 = 1.0;
const PLAYBACK_POLL_INTERVAL_MS: u64 = 40;

#[derive(Clone)]
struct EventSink {
    out: Arc<Mutex<io::Stdout>>,
}

impl EventSink {
    fn new() -> Self {
        Self {
            out: Arc::new(Mutex::new(io::stdout())),
        }
    }

    fn emit<T: Serialize>(&self, event: &T) -> Result<()> {
        let mut out = self
            .out
            .lock()
            .map_err(|_| anyhow!("stdout lock was poisoned"))?;
        serde_json::to_writer(&mut *out, event)?;
        out.write_all(b"\n")?;
        out.flush()?;
        Ok(())
    }

    fn log(&self, level: LogLevel, message: impl Into<String>) {
        let _ = self.emit(&HelperEvent::Log {
            level,
            message: message.into(),
        });
    }

    fn error(&self, message: impl Into<String>) {
        let _ = self.emit(&HelperEvent::Error {
            message: message.into(),
        });
    }

    fn emit_playback(
        &self,
        state: PlaybackState,
        running: bool,
        paused: bool,
        source: Option<String>,
        reason: Option<String>,
    ) {
        let _ = self.emit(&HelperEvent::Playback {
            payload: PlaybackEventPayload {
                state,
                running,
                paused,
                source,
                reason,
            },
        });
    }
}

#[derive(Debug, Deserialize)]
struct IncomingCommand {
    #[serde(rename = "type")]
    command_type: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Debug, Deserialize)]
struct InitializePayload {
    #[serde(rename = "protocolVersion")]
    protocol_version: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ConfigurePayload {
    enabled: bool,
    settings: AudioOutputSettings,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TestTonePayload {
    #[serde(rename = "durationMs", default = "default_test_tone_duration_ms")]
    duration_ms: u64,
    #[serde(rename = "frequencyHz", default = "default_test_tone_frequency_hz")]
    frequency_hz: f32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayFilePayload {
    path: String,
    #[serde(rename = "startSeconds", default)]
    start_seconds: f64,
    #[serde(default = "default_playback_volume")]
    volume: f32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackVolumePayload {
    #[serde(default = "default_playback_volume")]
    volume: f32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioOutputSettings {
    mode: AudioOutputMode,
    #[serde(rename = "deviceId", default)]
    device_id: String,
    #[serde(rename = "bufferFrames", default = "default_buffer_frames")]
    buffer_frames: u32,
    #[serde(rename = "fallbackToShared", default = "default_true")]
    fallback_to_shared: bool,
    #[serde(rename = "diagnosticsEnabled", default)]
    diagnostics_enabled: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum AudioOutputMode {
    Shared,
    Exclusive,
    Voicemeeter,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum AudioOutputBackend {
    Disabled,
    Native,
    Unavailable,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioOutputDevice {
    id: String,
    name: String,
    #[serde(rename = "isDefault")]
    is_default: bool,
    backend: AudioOutputDeviceBackend,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum AudioOutputDeviceBackend {
    Wasapi,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioOutputStatus {
    enabled: bool,
    backend: AudioOutputBackend,
    #[serde(rename = "backendAvailable")]
    backend_available: bool,
    #[serde(rename = "requestedMode")]
    requested_mode: AudioOutputMode,
    #[serde(rename = "activeMode", skip_serializing_if = "Option::is_none")]
    active_mode: Option<AudioOutputMode>,
    #[serde(rename = "deviceId", skip_serializing_if = "Option::is_none")]
    device_id: Option<String>,
    devices: Vec<AudioOutputDevice>,
    #[serde(rename = "nativePlaybackRunning")]
    native_playback_running: bool,
    #[serde(rename = "nativePlaybackPaused")]
    native_playback_paused: bool,
    #[serde(
        rename = "nativePlaybackSource",
        skip_serializing_if = "Option::is_none"
    )]
    native_playback_source: Option<String>,
    #[serde(rename = "nativePlaybackState")]
    native_playback_state: PlaybackState,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum PlaybackState {
    Idle,
    Starting,
    Playing,
    Paused,
    Stopped,
    Ended,
    Error,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PlaybackCompletion {
    Ended,
    Stopped,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackEventPayload {
    state: PlaybackState,
    running: bool,
    paused: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
enum LogLevel {
    Info,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum HelperEvent {
    #[serde(rename = "ready")]
    Ready { payload: ReadyPayload },
    #[serde(rename = "status")]
    Status { payload: AudioOutputStatus },
    #[serde(rename = "devices")]
    Devices { payload: DevicesPayload },
    #[serde(rename = "playback")]
    Playback { payload: PlaybackEventPayload },
    #[serde(rename = "log")]
    Log { level: LogLevel, message: String },
    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Serialize)]
struct ReadyPayload {
    #[serde(rename = "protocolVersion")]
    protocol_version: u32,
}

#[derive(Serialize)]
struct DevicesPayload {
    devices: Vec<AudioOutputDevice>,
}

struct AudioOutputRuntime {
    enabled: bool,
    settings: AudioOutputSettings,
    shared_stream: Option<Stream>,
    stream_reason: Option<String>,
    mode_probe: Option<ModeProbe>,
    playback: Option<PlaybackHandle>,
    playback_state: PlaybackState,
    playback_source: Option<String>,
}

#[derive(Clone, Debug)]
struct ModeProbe {
    requested_mode: AudioOutputMode,
    backend: AudioOutputBackend,
    backend_available: bool,
    active_mode: Option<AudioOutputMode>,
    reason: String,
}

impl AudioOutputRuntime {
    fn new() -> Self {
        Self {
            enabled: false,
            settings: AudioOutputSettings::default(),
            shared_stream: None,
            stream_reason: None,
            mode_probe: None,
            playback: None,
            playback_state: PlaybackState::Idle,
            playback_source: None,
        }
    }

    fn configure(&mut self, payload: ConfigurePayload) {
        self.stop_playback(false);
        self.enabled = payload.enabled;
        self.settings = payload.settings.normalized();
        self.shared_stream = None;
        self.stream_reason = None;
        self.mode_probe = None;

        if !self.enabled {
            return;
        }

        if self.should_use_shared_stream() {
            match platform::open_shared_silence_stream(&self.settings.device_id) {
                Ok(stream) => {
                    self.shared_stream = Some(stream);
                }
                Err(error) => {
                    self.stream_reason = Some(error.to_string());
                }
            }
        }
    }

    fn enumerate_devices(&self) -> Vec<AudioOutputDevice> {
        platform::enumerate_output_devices().unwrap_or_default()
    }

    fn should_use_shared_stream(&self) -> bool {
        self.settings.mode == AudioOutputMode::Shared
            || (self.settings.mode == AudioOutputMode::Exclusive
                && self.settings.fallback_to_shared)
    }

    fn create_status(&self) -> AudioOutputStatus {
        let devices = self.enumerate_devices();
        let playback = self.playback_snapshot();
        let has_device = devices.iter().any(|device| {
            self.settings.device_id.is_empty() || device.id == self.settings.device_id
        });
        let selected_device_id = if self.settings.device_id.is_empty() {
            None
        } else {
            Some(self.settings.device_id.clone())
        };

        if !self.enabled {
            return AudioOutputStatus {
                enabled: false,
                backend: AudioOutputBackend::Disabled,
                backend_available: false,
                requested_mode: self.settings.mode,
                active_mode: None,
                device_id: selected_device_id,
                devices,
                native_playback_running: playback.running,
                native_playback_paused: playback.paused,
                native_playback_source: playback.source,
                native_playback_state: playback.state,
                reason: None,
            };
        }

        if !has_device {
            return AudioOutputStatus {
                enabled: true,
                backend: AudioOutputBackend::Unavailable,
                backend_available: false,
                requested_mode: self.settings.mode,
                active_mode: None,
                device_id: selected_device_id,
                devices,
                native_playback_running: playback.running,
                native_playback_paused: playback.paused,
                native_playback_source: playback.source,
                native_playback_state: playback.state,
                reason: Some("Selected output device is unavailable.".to_string()),
            };
        }

        if let Some(probe) = self
            .mode_probe
            .as_ref()
            .filter(|probe| probe.requested_mode == self.settings.mode)
        {
            return AudioOutputStatus {
                enabled: true,
                backend: probe.backend,
                backend_available: probe.backend_available,
                requested_mode: self.settings.mode,
                active_mode: probe.active_mode,
                device_id: selected_device_id,
                devices,
                native_playback_running: playback.running,
                native_playback_paused: playback.paused,
                native_playback_source: playback.source,
                native_playback_state: playback.state,
                reason: Some(probe.reason.clone()),
            };
        }

        if self.should_use_shared_stream()
            && self.shared_stream.is_none()
            && self.stream_reason.is_some()
        {
            return AudioOutputStatus {
                enabled: true,
                backend: AudioOutputBackend::Unavailable,
                backend_available: false,
                requested_mode: self.settings.mode,
                active_mode: None,
                device_id: selected_device_id,
                devices,
                native_playback_running: playback.running,
                native_playback_paused: playback.paused,
                native_playback_source: playback.source,
                native_playback_state: playback.state,
                reason: self.stream_reason.clone().or_else(|| {
                    Some("Failed to initialize shared audio output stream.".to_string())
                }),
            };
        }

        match self.settings.mode {
            AudioOutputMode::Shared => AudioOutputStatus {
                enabled: true,
                backend: AudioOutputBackend::Native,
                backend_available: true,
                requested_mode: AudioOutputMode::Shared,
                active_mode: Some(AudioOutputMode::Shared),
                device_id: selected_device_id,
                devices,
                native_playback_running: playback.running,
                native_playback_paused: playback.paused,
                native_playback_source: playback.source,
                native_playback_state: playback.state,
                reason: Some(
                    "Shared output stream initialized with silent native probe.".to_string(),
                ),
            },
            AudioOutputMode::Exclusive => {
                if self.settings.fallback_to_shared {
                    AudioOutputStatus {
                        enabled: true,
                        backend: AudioOutputBackend::Native,
                        backend_available: true,
                        requested_mode: AudioOutputMode::Exclusive,
                        active_mode: Some(AudioOutputMode::Shared),
                        device_id: selected_device_id,
                        devices,
                        native_playback_running: playback.running,
                        native_playback_paused: playback.paused,
                        native_playback_source: playback.source,
                        native_playback_state: playback.state,
                        reason: Some(
                            "WASAPI exclusive initialization is pending; using shared fallback."
                                .to_string(),
                        ),
                    }
                } else {
                    AudioOutputStatus {
                        enabled: true,
                        backend: AudioOutputBackend::Unavailable,
                        backend_available: false,
                        requested_mode: AudioOutputMode::Exclusive,
                        active_mode: None,
                        device_id: selected_device_id,
                        devices,
                        native_playback_running: playback.running,
                        native_playback_paused: playback.paused,
                        native_playback_source: playback.source,
                        native_playback_state: playback.state,
                        reason: Some("WASAPI exclusive initialization is pending.".to_string()),
                    }
                }
            }
            AudioOutputMode::Voicemeeter => AudioOutputStatus {
                enabled: true,
                backend: AudioOutputBackend::Unavailable,
                backend_available: false,
                requested_mode: AudioOutputMode::Voicemeeter,
                active_mode: None,
                device_id: selected_device_id,
                devices,
                native_playback_running: playback.running,
                native_playback_paused: playback.paused,
                native_playback_source: playback.source,
                native_playback_state: playback.state,
                reason: Some("Voicemeeter routing is not implemented yet.".to_string()),
            },
        }
    }

    fn play_test_tone(&mut self, payload: TestTonePayload) -> Result<()> {
        if !self.enabled {
            return Err(anyhow!(
                "Native audio output must be enabled before playing a test tone."
            ));
        }

        let duration_ms = payload.duration_ms.clamp(120, 2000);
        let frequency_hz = payload.frequency_hz.clamp(120.0, 2000.0);

        match self.settings.mode {
            AudioOutputMode::Shared => {
                platform::play_test_tone(&self.settings.device_id, duration_ms, frequency_hz)?;
                self.mode_probe = Some(ModeProbe {
                    requested_mode: AudioOutputMode::Shared,
                    backend: AudioOutputBackend::Native,
                    backend_available: true,
                    active_mode: Some(AudioOutputMode::Shared),
                    reason: "Shared test tone completed.".to_string(),
                });
            }
            AudioOutputMode::Exclusive => {
                self.shared_stream = None;
                match platform::play_exclusive_test_tone(
                    &self.settings.device_id,
                    duration_ms,
                    frequency_hz,
                    self.settings.buffer_frames,
                ) {
                    Ok(summary) => {
                        self.mode_probe = Some(ModeProbe {
                            requested_mode: AudioOutputMode::Exclusive,
                            backend: AudioOutputBackend::Native,
                            backend_available: true,
                            active_mode: Some(AudioOutputMode::Exclusive),
                            reason: format!("WASAPI exclusive test tone completed. {summary}"),
                        });
                    }
                    Err(exclusive_error) if self.settings.fallback_to_shared => {
                        let exclusive_reason = exclusive_error.to_string();
                        match platform::play_test_tone(
                            &self.settings.device_id,
                            duration_ms,
                            frequency_hz,
                        ) {
                            Ok(()) => {
                                self.mode_probe = Some(ModeProbe {
                                    requested_mode: AudioOutputMode::Exclusive,
                                    backend: AudioOutputBackend::Native,
                                    backend_available: true,
                                    active_mode: Some(AudioOutputMode::Shared),
                                    reason: format!(
                                        "WASAPI exclusive test tone failed: {exclusive_reason}; shared fallback test tone completed."
                                    ),
                                });
                            }
                            Err(shared_error) => {
                                self.mode_probe = Some(ModeProbe {
                                    requested_mode: AudioOutputMode::Exclusive,
                                    backend: AudioOutputBackend::Unavailable,
                                    backend_available: false,
                                    active_mode: None,
                                    reason: format!(
                                        "WASAPI exclusive test tone failed: {exclusive_reason}; shared fallback test tone failed: {shared_error}"
                                    ),
                                });
                            }
                        }
                    }
                    Err(exclusive_error) => {
                        self.mode_probe = Some(ModeProbe {
                            requested_mode: AudioOutputMode::Exclusive,
                            backend: AudioOutputBackend::Unavailable,
                            backend_available: false,
                            active_mode: None,
                            reason: format!("WASAPI exclusive test tone failed: {exclusive_error}"),
                        });
                    }
                }
            }
            AudioOutputMode::Voicemeeter => {
                self.mode_probe = Some(ModeProbe {
                    requested_mode: AudioOutputMode::Voicemeeter,
                    backend: AudioOutputBackend::Unavailable,
                    backend_available: false,
                    active_mode: None,
                    reason: "Voicemeeter routing is not implemented yet.".to_string(),
                });
            }
        }

        Ok(())
    }

    fn play_file(&mut self, payload: PlayFilePayload, sink: EventSink) -> Result<()> {
        if !self.enabled {
            return Err(anyhow!(
                "Native audio output must be enabled before playing a file."
            ));
        }

        let path = payload.path.trim().to_string();
        if path.is_empty() {
            return Err(anyhow!(
                "Native audio output playback requires a local file path."
            ));
        }

        match self.settings.mode {
            AudioOutputMode::Shared => self.start_shared_file_playback(path, payload, sink),
            AudioOutputMode::Exclusive => {
                let fallback_to_shared = self.settings.fallback_to_shared;
                match self.start_exclusive_file_playback(
                    path.clone(),
                    payload.clone(),
                    sink.clone(),
                ) {
                    Ok(()) => Ok(()),
                    Err(exclusive_error) if fallback_to_shared => {
                        let exclusive_reason = exclusive_error.to_string();
                        sink.log(
                            LogLevel::Info,
                            format!(
                                "WASAPI exclusive file playback failed: {exclusive_reason}; using shared fallback."
                            ),
                        );
                        self.start_shared_file_playback(path, payload, sink)
                    }
                    Err(exclusive_error) => Err(exclusive_error),
                }
            }
            AudioOutputMode::Voicemeeter => Err(anyhow!(
                "Voicemeeter playback routing is not implemented yet."
            )),
        }
    }

    fn pause_playback(&mut self) {
        if let Some(playback) = &self.playback {
            playback.paused.store(true, Ordering::SeqCst);
            self.playback_state = PlaybackState::Paused;
        }
    }

    fn resume_playback(&mut self) {
        if let Some(playback) = &self.playback {
            playback.paused.store(false, Ordering::SeqCst);
            self.playback_state = PlaybackState::Playing;
        }
    }

    fn stop_playback(&mut self, mark_stopped: bool) {
        if let Some(mut playback) = self.playback.take() {
            playback.stop.store(true, Ordering::SeqCst);
            playback.join();
            self.playback_state = PlaybackState::Stopped;
            self.playback_source = None;
            return;
        }

        if mark_stopped {
            self.playback_state = PlaybackState::Stopped;
            self.playback_source = None;
        }
    }

    fn set_playback_volume(&mut self, payload: PlaybackVolumePayload) {
        if let Some(playback) = &self.playback {
            playback
                .volume_bits
                .store(payload.volume.clamp(0.0, 1.0).to_bits(), Ordering::SeqCst);
        }
    }

    fn mark_playback_error(&mut self, source: Option<String>, reason: String, sink: &EventSink) {
        self.stop_playback(false);
        self.playback_state = PlaybackState::Error;
        self.playback_source = source.clone();
        sink.emit_playback(PlaybackState::Error, false, false, source, Some(reason));
    }

    fn start_shared_file_playback(
        &mut self,
        path: String,
        payload: PlayFilePayload,
        sink: EventSink,
    ) -> Result<()> {
        self.stop_playback(true);
        self.shared_stream = None;

        let audio = DecodedAudio::read_from_path(&path)?;
        let start_frame = audio.frame_index_for_seconds(payload.start_seconds);
        let stop = Arc::new(AtomicBool::new(false));
        let paused = Arc::new(AtomicBool::new(false));
        let cursor = Arc::new(AtomicUsize::new(start_frame.saturating_mul(audio.channels)));
        let volume_bits = Arc::new(AtomicU32::new(payload.volume.clamp(0.0, 1.0).to_bits()));
        let samples = Arc::new(audio.samples);
        let source = Arc::new(path);

        platform::validate_shared_playback_device(&self.settings.device_id)?;
        let stream = platform::build_shared_file_stream(
            &self.settings.device_id,
            audio.sample_rate,
            audio.channels as u16,
            Arc::clone(&samples),
            Arc::clone(&cursor),
            Arc::clone(&paused),
            Arc::clone(&stop),
            Arc::clone(&volume_bits),
        )?;
        self.stream_reason = None;
        let playback_sink = sink.clone();
        let playback_source = Arc::clone(&source);
        let playback_stop = Arc::clone(&stop);
        let playback_paused = Arc::clone(&paused);
        let playback_cursor = Arc::clone(&cursor);
        let playback_samples = Arc::clone(&samples);
        let monitor = thread::spawn(move || {
            playback_sink.emit_playback(
                PlaybackState::Playing,
                true,
                false,
                Some(playback_source.as_ref().clone()),
                Some("Native file playback is running.".to_string()),
            );

            while !playback_stop.load(Ordering::SeqCst)
                && playback_cursor.load(Ordering::SeqCst) < playback_samples.len()
            {
                let current_paused = playback_paused.load(Ordering::SeqCst);
                let state = if current_paused {
                    PlaybackState::Paused
                } else {
                    PlaybackState::Playing
                };
                playback_sink.emit_playback(
                    state,
                    true,
                    current_paused,
                    Some(playback_source.as_ref().clone()),
                    None,
                );
                thread::sleep(Duration::from_millis(PLAYBACK_POLL_INTERVAL_MS));
            }

            if playback_stop.load(Ordering::SeqCst) {
                playback_sink.emit_playback(
                    PlaybackState::Stopped,
                    false,
                    false,
                    Some(playback_source.as_ref().clone()),
                    Some("Native file playback stopped.".to_string()),
                );
            } else {
                playback_sink.emit_playback(
                    PlaybackState::Ended,
                    false,
                    false,
                    Some(playback_source.as_ref().clone()),
                    Some("Native file playback completed.".to_string()),
                );
            }
        });

        self.playback = Some(PlaybackHandle {
            stop,
            paused,
            cursor,
            sample_len: samples.len(),
            volume_bits,
            _stream: Some(stream),
            monitor: Some(monitor),
        });
        self.playback_state = PlaybackState::Starting;
        self.playback_source = Some(source.as_ref().clone());
        self.mode_probe = Some(ModeProbe {
            requested_mode: self.settings.mode,
            backend: AudioOutputBackend::Native,
            backend_available: true,
            active_mode: Some(AudioOutputMode::Shared),
            reason: "Shared native file playback is running.".to_string(),
        });

        Ok(())
    }

    fn start_exclusive_file_playback(
        &mut self,
        path: String,
        payload: PlayFilePayload,
        sink: EventSink,
    ) -> Result<()> {
        self.stop_playback(true);
        self.shared_stream = None;

        let audio = DecodedAudio::read_from_path(&path)?;
        let start_frame = audio.frame_index_for_seconds(payload.start_seconds);
        let stop = Arc::new(AtomicBool::new(false));
        let paused = Arc::new(AtomicBool::new(false));
        let cursor = Arc::new(AtomicUsize::new(start_frame.saturating_mul(audio.channels)));
        let volume_bits = Arc::new(AtomicU32::new(payload.volume.clamp(0.0, 1.0).to_bits()));
        let samples = Arc::new(audio.samples);
        let source = Arc::new(path);
        let device_id = self.settings.device_id.clone();
        let buffer_frames = self.settings.buffer_frames;
        let source_sample_rate = audio.sample_rate;
        let source_channels = audio.channels as u16;

        platform::validate_exclusive_playback_device(&device_id)?;

        let playback_sink = sink.clone();
        let playback_source = Arc::clone(&source);
        let playback_stop = Arc::clone(&stop);
        let playback_paused = Arc::clone(&paused);
        let playback_cursor = Arc::clone(&cursor);
        let playback_samples = Arc::clone(&samples);
        let playback_volume_bits = Arc::clone(&volume_bits);
        let monitor = thread::spawn(move || {
            playback_sink.emit_playback(
                PlaybackState::Playing,
                true,
                false,
                Some(playback_source.as_ref().clone()),
                Some("Native WASAPI exclusive file playback is starting.".to_string()),
            );

            match platform::play_exclusive_file(
                &device_id,
                buffer_frames,
                source_sample_rate,
                source_channels,
                Arc::clone(&playback_samples),
                Arc::clone(&playback_cursor),
                Arc::clone(&playback_paused),
                Arc::clone(&playback_stop),
                Arc::clone(&playback_volume_bits),
            ) {
                Ok(PlaybackCompletion::Ended) => playback_sink.emit_playback(
                    PlaybackState::Ended,
                    false,
                    false,
                    Some(playback_source.as_ref().clone()),
                    Some("Native WASAPI exclusive file playback completed.".to_string()),
                ),
                Ok(PlaybackCompletion::Stopped) => playback_sink.emit_playback(
                    PlaybackState::Stopped,
                    false,
                    false,
                    Some(playback_source.as_ref().clone()),
                    Some("Native WASAPI exclusive file playback stopped.".to_string()),
                ),
                Err(error) => {
                    playback_stop.store(true, Ordering::SeqCst);
                    playback_cursor.store(playback_samples.len(), Ordering::SeqCst);
                    playback_sink.emit_playback(
                        PlaybackState::Error,
                        false,
                        false,
                        Some(playback_source.as_ref().clone()),
                        Some(format!(
                            "Native WASAPI exclusive file playback failed: {error}"
                        )),
                    );
                }
            }
        });

        self.playback = Some(PlaybackHandle {
            stop,
            paused,
            cursor,
            sample_len: samples.len(),
            volume_bits,
            _stream: None,
            monitor: Some(monitor),
        });
        self.playback_state = PlaybackState::Starting;
        self.playback_source = Some(source.as_ref().clone());
        self.mode_probe = Some(ModeProbe {
            requested_mode: AudioOutputMode::Exclusive,
            backend: AudioOutputBackend::Native,
            backend_available: true,
            active_mode: Some(AudioOutputMode::Exclusive),
            reason: "WASAPI exclusive native file playback is running.".to_string(),
        });

        Ok(())
    }

    fn playback_snapshot(&self) -> PlaybackSnapshot {
        let running = self
            .playback
            .as_ref()
            .is_some_and(|playback| playback.is_running());
        let paused = self
            .playback
            .as_ref()
            .is_some_and(|playback| playback.paused.load(Ordering::SeqCst));
        let state = match &self.playback {
            Some(playback) if playback.stop.load(Ordering::SeqCst) => PlaybackState::Stopped,
            Some(playback) if playback.is_ended() => PlaybackState::Ended,
            Some(_) if paused => PlaybackState::Paused,
            Some(_) => PlaybackState::Playing,
            None => self.playback_state,
        };

        PlaybackSnapshot {
            running,
            paused: running && paused,
            source: self.playback_source.clone(),
            state,
        }
    }
}

struct PlaybackSnapshot {
    running: bool,
    paused: bool,
    source: Option<String>,
    state: PlaybackState,
}

struct PlaybackHandle {
    stop: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    cursor: Arc<AtomicUsize>,
    sample_len: usize,
    volume_bits: Arc<AtomicU32>,
    _stream: Option<Stream>,
    monitor: Option<JoinHandle<()>>,
}

impl PlaybackHandle {
    fn is_ended(&self) -> bool {
        self.cursor.load(Ordering::SeqCst) >= self.sample_len
    }

    fn is_running(&self) -> bool {
        !self.stop.load(Ordering::SeqCst) && !self.is_ended()
    }

    fn join(&mut self) {
        if let Some(monitor) = self.monitor.take() {
            let _ = monitor.join();
        }
    }
}

impl Default for AudioOutputSettings {
    fn default() -> Self {
        Self {
            mode: AudioOutputMode::Shared,
            device_id: String::new(),
            buffer_frames: DEFAULT_BUFFER_FRAMES,
            fallback_to_shared: true,
            diagnostics_enabled: false,
        }
    }
}

impl AudioOutputSettings {
    fn normalized(mut self) -> Self {
        self.device_id = self.device_id.trim().to_string();
        self.buffer_frames = self.buffer_frames.clamp(128, 8192);
        self
    }
}

fn main() -> Result<()> {
    let sink = EventSink::new();
    sink.emit(&HelperEvent::Ready {
        payload: ReadyPayload {
            protocol_version: PROTOCOL_VERSION,
        },
    })?;

    let mut runtime = AudioOutputRuntime::new();
    let stdin = io::stdin();

    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        let command: IncomingCommand = match serde_json::from_str(&line) {
            Ok(command) => command,
            Err(error) => {
                sink.error(format!("Invalid command JSON: {error}"));
                continue;
            }
        };

        if let Err(error) = handle_command(&mut runtime, &sink, command) {
            sink.error(error.to_string());
        }
    }

    Ok(())
}

fn handle_command(
    runtime: &mut AudioOutputRuntime,
    sink: &EventSink,
    command: IncomingCommand,
) -> Result<()> {
    match command.command_type.as_str() {
        "initialize" => {
            let payload = parse_payload::<InitializePayload>(command.payload)?;
            if payload.protocol_version != Some(PROTOCOL_VERSION) {
                return Err(anyhow!(
                    "Unsupported audio output protocol version: expected {}, received {:?}",
                    PROTOCOL_VERSION,
                    payload.protocol_version
                ));
            }
            emit_devices(runtime, sink)?;
            emit_status(runtime, sink)
        }
        "configure" => {
            runtime.configure(parse_payload(command.payload)?);
            emit_status(runtime, sink)
        }
        "playTestTone" => {
            runtime.play_test_tone(parse_payload(command.payload)?)?;
            emit_status(runtime, sink)
        }
        "playFile" => {
            let payload = parse_payload::<PlayFilePayload>(command.payload)?;
            let source = payload.path.trim().to_string();
            match runtime.play_file(payload, sink.clone()) {
                Ok(()) => emit_status(runtime, sink),
                Err(error) => {
                    runtime.mark_playback_error(
                        (!source.is_empty()).then_some(source),
                        error.to_string(),
                        sink,
                    );
                    emit_status(runtime, sink)
                }
            }
        }
        "pausePlayback" => {
            runtime.pause_playback();
            emit_status(runtime, sink)
        }
        "resumePlayback" => {
            runtime.resume_playback();
            emit_status(runtime, sink)
        }
        "stopPlayback" => {
            runtime.stop_playback(true);
            emit_status(runtime, sink)
        }
        "setPlaybackVolume" => {
            runtime.set_playback_volume(parse_payload(command.payload)?);
            emit_status(runtime, sink)
        }
        "enumerateDevices" => emit_devices(runtime, sink),
        "shutdown" => std::process::exit(0),
        other => Err(anyhow!("Unknown command type: {other}")),
    }
}

fn emit_devices(runtime: &AudioOutputRuntime, sink: &EventSink) -> Result<()> {
    sink.emit(&HelperEvent::Devices {
        payload: DevicesPayload {
            devices: runtime.enumerate_devices(),
        },
    })
}

fn emit_status(runtime: &AudioOutputRuntime, sink: &EventSink) -> Result<()> {
    let status = runtime.create_status();
    if runtime.settings.diagnostics_enabled {
        sink.log(
            LogLevel::Info,
            format!(
                "Audio output status: enabled={}, requested={:?}, backend={:?}",
                status.enabled, status.requested_mode, status.backend
            ),
        );
    }
    sink.emit(&HelperEvent::Status { payload: status })
}

fn parse_payload<T>(payload: Value) -> Result<T>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_value(payload).context("Invalid command payload")
}

fn default_buffer_frames() -> u32 {
    DEFAULT_BUFFER_FRAMES
}

fn default_true() -> bool {
    true
}

fn default_test_tone_duration_ms() -> u64 {
    DEFAULT_TEST_TONE_DURATION_MS
}

fn default_test_tone_frequency_hz() -> f32 {
    DEFAULT_TEST_TONE_FREQUENCY_HZ
}

fn default_playback_volume() -> f32 {
    DEFAULT_PLAYBACK_VOLUME
}

struct DecodedAudio {
    sample_rate: u32,
    channels: usize,
    samples: Vec<f32>,
}

impl DecodedAudio {
    fn read_from_path(path: &str) -> Result<Self> {
        let path_ref = Path::new(path);
        let file =
            File::open(path_ref).with_context(|| format!("Failed to open audio file: {path}"))?;
        let media_source = MediaSourceStream::new(Box::new(file), Default::default());
        let mut hint = Hint::new();
        if let Some(extension) = path_ref
            .extension()
            .and_then(|extension| extension.to_str())
        {
            hint.with_extension(extension);
        }

        let format_options = FormatOptions::default();
        let metadata_options = MetadataOptions::default();
        let decoder_options = AudioDecoderOptions::default();
        let mut format = symphonia::default::get_probe()
            .probe(&hint, media_source, format_options, metadata_options)
            .with_context(|| format!("Failed to probe audio file: {path}"))?;
        let track = format
            .default_track(TrackType::Audio)
            .context("Audio file does not contain a playable audio track.")?;
        let track_id = track.id;
        let (fallback_sample_rate, fallback_channels) =
            if let Some(codec_params) = track.codec_params.as_ref() {
                if let Some(audio_params) = codec_params.audio() {
                    (
                        audio_params.sample_rate.unwrap_or_default(),
                        audio_params
                            .channels
                            .as_ref()
                            .map_or(0, |channels| channels.count()),
                    )
                } else {
                    (0, 0)
                }
            } else {
                (0, 0)
            };
        let mut decoder = symphonia::default::get_codecs()
            .make_audio_decoder(
                track
                    .codec_params
                    .as_ref()
                    .context("Audio track is missing codec parameters.")?
                    .audio()
                    .context("Audio track has invalid codec parameters.")?,
                &decoder_options,
            )
            .context("Failed to create audio decoder.")?;
        let mut samples: Vec<f32> = Vec::new();
        let mut sample_rate = 0u32;
        let mut channels = 0usize;

        loop {
            let packet = match format.next_packet() {
                Ok(Some(packet)) => packet,
                Ok(None) => break,
                Err(SymphoniaError::IoError(_)) => break,
                Err(SymphoniaError::ResetRequired) => break,
                Err(SymphoniaError::DecodeError(_)) => continue,
                Err(error) => return Err(error).context("Failed to read audio packet."),
            };

            if packet.track_id != track_id {
                continue;
            }

            match decoder.decode(&packet) {
                Ok(audio_buffer) => {
                    let spec = audio_buffer.spec();
                    if sample_rate == 0 {
                        sample_rate = spec.rate();
                    }
                    if channels == 0 {
                        channels = spec.channels().count();
                    }

                    let mut decoded = vec![f32::MID; audio_buffer.samples_interleaved()];
                    audio_buffer.copy_to_slice_interleaved(&mut decoded);
                    samples.extend(decoded);
                }
                Err(SymphoniaError::DecodeError(_)) | Err(SymphoniaError::IoError(_)) => continue,
                Err(SymphoniaError::ResetRequired) => break,
                Err(error) => return Err(error).context("Failed to decode audio packet."),
            }
        }

        if sample_rate == 0 || channels == 0 {
            sample_rate = sample_rate.max(fallback_sample_rate);
            if channels == 0 {
                channels = fallback_channels;
            }
        }

        if sample_rate == 0 {
            return Err(anyhow!("Decoded audio sample rate is unavailable."));
        }

        if channels == 0 {
            return Err(anyhow!("Decoded audio channel count is unavailable."));
        }

        if samples.is_empty() {
            return Err(anyhow!("Decoded audio file is empty."));
        }

        Ok(Self {
            sample_rate,
            channels,
            samples,
        })
    }

    fn frame_index_for_seconds(&self, seconds: f64) -> usize {
        if !seconds.is_finite() || seconds <= 0.0 {
            return 0;
        }

        let frame_count = self.samples.len() / self.channels.max(1);
        ((seconds * self.sample_rate as f64).floor() as usize).min(frame_count)
    }
}

#[cfg(windows)]
mod platform {
    use std::ffi::c_void;
    use std::slice;
    use std::sync::{
        atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering},
        Arc,
    };
    use std::time::Duration;

    use anyhow::{anyhow, Context, Result};
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::{FromSample, Sample, SampleFormat, Stream};
    use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IAudioClient, IAudioRenderClient, IMMDevice, IMMDeviceEnumerator,
        MMDeviceEnumerator, AUDCLNT_SHAREMODE_EXCLUSIVE, DEVICE_STATE_ACTIVE, WAVEFORMATEX,
        WAVEFORMATEXTENSIBLE, WAVE_FORMAT_PCM,
    };
    use windows::Win32::Media::KernelStreaming::{
        KSDATAFORMAT_SUBTYPE_PCM, WAVE_FORMAT_EXTENSIBLE,
    };
    use windows::Win32::Media::Multimedia::{
        KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, WAVE_FORMAT_IEEE_FLOAT,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
        COINIT_MULTITHREADED,
    };

    use super::{AudioOutputDevice, AudioOutputDeviceBackend, PlaybackCompletion};

    const HNS_PER_SECOND: i64 = 10_000_000;
    const EXCLUSIVE_POLL_INTERVAL_MS: u64 = 5;
    const TEST_TONE_GAIN: f32 = 0.18;

    pub fn enumerate_output_devices() -> Result<Vec<AudioOutputDevice>> {
        let host = cpal::default_host();
        let default_name = host
            .default_output_device()
            .and_then(|device| device.name().ok());
        let devices = host
            .output_devices()
            .context("Failed to enumerate output devices")?;

        Ok(devices
            .enumerate()
            .filter_map(|(index, device)| {
                let name = device.name().ok()?;
                Some(AudioOutputDevice {
                    id: format!("{index}:{name}"),
                    is_default: default_name.as_deref() == Some(name.as_str()),
                    name,
                    backend: AudioOutputDeviceBackend::Wasapi,
                })
            })
            .collect())
    }

    pub fn open_shared_silence_stream(device_id: &str) -> Result<Stream> {
        let device = find_output_device(device_id)?;
        let supported_config = device
            .default_output_config()
            .context("Failed to read default output config")?;
        let sample_format = supported_config.sample_format();
        let config = supported_config.config();
        let stream = match sample_format {
            SampleFormat::F32 => build_silence_stream::<f32>(&device, &config),
            SampleFormat::F64 => build_silence_stream::<f64>(&device, &config),
            SampleFormat::I8 => build_silence_stream::<i8>(&device, &config),
            SampleFormat::I16 => build_silence_stream::<i16>(&device, &config),
            SampleFormat::I24 => build_silence_stream::<cpal::I24>(&device, &config),
            SampleFormat::I32 => build_silence_stream::<i32>(&device, &config),
            SampleFormat::I64 => build_silence_stream::<i64>(&device, &config),
            SampleFormat::U8 => build_silence_stream::<u8>(&device, &config),
            SampleFormat::U16 => build_silence_stream::<u16>(&device, &config),
            SampleFormat::U32 => build_silence_stream::<u32>(&device, &config),
            SampleFormat::U64 => build_silence_stream::<u64>(&device, &config),
            other => anyhow::bail!("Unsupported shared output sample format: {other:?}"),
        }?;
        stream
            .play()
            .context("Failed to start shared output stream")?;
        Ok(stream)
    }

    pub fn validate_shared_playback_device(device_id: &str) -> Result<()> {
        let _ = find_output_device(device_id)?;
        Ok(())
    }

    pub fn validate_exclusive_playback_device(device_id: &str) -> Result<()> {
        let _com = ComGuard::initialize()?;
        unsafe {
            let _ = find_wasapi_output_device(device_id)?;
        }
        Ok(())
    }

    pub fn build_shared_file_stream(
        device_id: &str,
        source_sample_rate: u32,
        source_channels: u16,
        samples: Arc<Vec<f32>>,
        cursor: Arc<AtomicUsize>,
        paused: Arc<AtomicBool>,
        stop: Arc<AtomicBool>,
        volume_bits: Arc<AtomicU32>,
    ) -> Result<Stream> {
        let device = find_output_device(device_id)?;
        let supported_config = device
            .default_output_config()
            .context("Failed to read default output config")?;
        let sample_format = supported_config.sample_format();
        let config = supported_config.config();
        let stream = match sample_format {
            SampleFormat::F32 => build_file_stream::<f32>(
                &device,
                &config,
                source_sample_rate,
                source_channels,
                samples,
                cursor,
                paused,
                stop,
                volume_bits,
            ),
            SampleFormat::F64 => build_file_stream::<f64>(
                &device,
                &config,
                source_sample_rate,
                source_channels,
                samples,
                cursor,
                paused,
                stop,
                volume_bits,
            ),
            SampleFormat::I8 => build_file_stream::<i8>(
                &device,
                &config,
                source_sample_rate,
                source_channels,
                samples,
                cursor,
                paused,
                stop,
                volume_bits,
            ),
            SampleFormat::I16 => build_file_stream::<i16>(
                &device,
                &config,
                source_sample_rate,
                source_channels,
                samples,
                cursor,
                paused,
                stop,
                volume_bits,
            ),
            SampleFormat::I24 => build_file_stream::<cpal::I24>(
                &device,
                &config,
                source_sample_rate,
                source_channels,
                samples,
                cursor,
                paused,
                stop,
                volume_bits,
            ),
            SampleFormat::I32 => build_file_stream::<i32>(
                &device,
                &config,
                source_sample_rate,
                source_channels,
                samples,
                cursor,
                paused,
                stop,
                volume_bits,
            ),
            SampleFormat::I64 => build_file_stream::<i64>(
                &device,
                &config,
                source_sample_rate,
                source_channels,
                samples,
                cursor,
                paused,
                stop,
                volume_bits,
            ),
            SampleFormat::U8 => build_file_stream::<u8>(
                &device,
                &config,
                source_sample_rate,
                source_channels,
                samples,
                cursor,
                paused,
                stop,
                volume_bits,
            ),
            SampleFormat::U16 => build_file_stream::<u16>(
                &device,
                &config,
                source_sample_rate,
                source_channels,
                samples,
                cursor,
                paused,
                stop,
                volume_bits,
            ),
            SampleFormat::U32 => build_file_stream::<u32>(
                &device,
                &config,
                source_sample_rate,
                source_channels,
                samples,
                cursor,
                paused,
                stop,
                volume_bits,
            ),
            SampleFormat::U64 => build_file_stream::<u64>(
                &device,
                &config,
                source_sample_rate,
                source_channels,
                samples,
                cursor,
                paused,
                stop,
                volume_bits,
            ),
            other => anyhow::bail!("Unsupported shared output sample format: {other:?}"),
        }?;
        stream
            .play()
            .context("Failed to start native file playback stream")?;
        Ok(stream)
    }

    pub fn play_test_tone(device_id: &str, duration_ms: u64, frequency_hz: f32) -> Result<()> {
        let device = find_output_device(device_id)?;
        let supported_config = device
            .default_output_config()
            .context("Failed to read default output config")?;
        let sample_format = supported_config.sample_format();
        let config = supported_config.config();
        let stream = match sample_format {
            SampleFormat::F32 => build_test_tone_stream::<f32>(&device, &config, frequency_hz),
            SampleFormat::F64 => build_test_tone_stream::<f64>(&device, &config, frequency_hz),
            SampleFormat::I8 => build_test_tone_stream::<i8>(&device, &config, frequency_hz),
            SampleFormat::I16 => build_test_tone_stream::<i16>(&device, &config, frequency_hz),
            SampleFormat::I24 => {
                build_test_tone_stream::<cpal::I24>(&device, &config, frequency_hz)
            }
            SampleFormat::I32 => build_test_tone_stream::<i32>(&device, &config, frequency_hz),
            SampleFormat::I64 => build_test_tone_stream::<i64>(&device, &config, frequency_hz),
            SampleFormat::U8 => build_test_tone_stream::<u8>(&device, &config, frequency_hz),
            SampleFormat::U16 => build_test_tone_stream::<u16>(&device, &config, frequency_hz),
            SampleFormat::U32 => build_test_tone_stream::<u32>(&device, &config, frequency_hz),
            SampleFormat::U64 => build_test_tone_stream::<u64>(&device, &config, frequency_hz),
            other => anyhow::bail!("Unsupported shared output sample format: {other:?}"),
        }?;
        stream.play().context("Failed to start test tone stream")?;
        std::thread::sleep(Duration::from_millis(duration_ms));
        Ok(())
    }

    pub fn play_exclusive_test_tone(
        device_id: &str,
        duration_ms: u64,
        frequency_hz: f32,
        buffer_frames: u32,
    ) -> Result<String> {
        let _com = ComGuard::initialize()?;

        unsafe {
            let device = find_wasapi_output_device(device_id)?;
            let audio_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .context("Failed to activate WASAPI audio client")?;
            let format_ptr = audio_client
                .GetMixFormat()
                .context("Failed to read WASAPI mix format")?;
            let _format_guard = WaveFormatGuard(format_ptr);
            let format = WasapiFormat::from_waveformat(format_ptr)?;
            let buffer_duration =
                exclusive_buffer_duration_hns(&audio_client, buffer_frames, format.sample_rate_hz)?;

            audio_client
                .Initialize(
                    AUDCLNT_SHAREMODE_EXCLUSIVE,
                    0,
                    buffer_duration,
                    buffer_duration,
                    format_ptr,
                    None,
                )
                .context("Failed to initialize WASAPI exclusive output stream")?;

            let render_client = audio_client
                .GetService::<IAudioRenderClient>()
                .context("Failed to create WASAPI render client")?;
            let buffer_size = audio_client
                .GetBufferSize()
                .context("Failed to read WASAPI exclusive buffer size")?;
            let mut sample_clock = 0f32;
            let total_frames = frames_for_duration(duration_ms, format.sample_rate_hz);
            let initial_frames = total_frames.min(buffer_size);
            write_test_tone_frames(
                &render_client,
                initial_frames,
                &format,
                &mut sample_clock,
                frequency_hz,
            )?;
            let mut remaining_frames = total_frames.saturating_sub(initial_frames);

            audio_client
                .Start()
                .context("Failed to start WASAPI exclusive output stream")?;

            while remaining_frames > 0 {
                let padding = audio_client
                    .GetCurrentPadding()
                    .context("Failed to read WASAPI exclusive buffer padding")?;
                let available_frames = buffer_size.saturating_sub(padding);

                if available_frames == 0 {
                    std::thread::sleep(Duration::from_millis(EXCLUSIVE_POLL_INTERVAL_MS));
                    continue;
                }

                let frames_to_write = remaining_frames.min(available_frames);
                write_test_tone_frames(
                    &render_client,
                    frames_to_write,
                    &format,
                    &mut sample_clock,
                    frequency_hz,
                )?;
                remaining_frames = remaining_frames.saturating_sub(frames_to_write);
            }

            let drain_ms = frames_to_duration_ms(buffer_size, format.sample_rate_hz).max(20);
            std::thread::sleep(Duration::from_millis(drain_ms));
            audio_client
                .Stop()
                .context("Failed to stop WASAPI exclusive output stream")?;

            Ok(format!(
                "format={} Hz/{}ch/{}-bit {}, buffer={} frames.",
                format.sample_rate_hz,
                format.channels,
                format.bits_per_sample,
                format.sample_kind.label(),
                buffer_size
            ))
        }
    }

    pub fn play_exclusive_file(
        device_id: &str,
        buffer_frames: u32,
        source_sample_rate: u32,
        source_channels: u16,
        samples: Arc<Vec<f32>>,
        cursor: Arc<AtomicUsize>,
        paused: Arc<AtomicBool>,
        stop: Arc<AtomicBool>,
        volume_bits: Arc<AtomicU32>,
    ) -> Result<PlaybackCompletion> {
        let _com = ComGuard::initialize()?;
        let source_channels = source_channels.max(1);
        let source_channel_count = usize::from(source_channels);
        let source_frame_count = samples.len() / source_channel_count;
        let mut source_frame_position =
            cursor.load(Ordering::SeqCst) as f64 / source_channel_count as f64;

        if source_frame_count == 0 || source_frame_position >= source_frame_count as f64 {
            cursor.store(samples.len(), Ordering::SeqCst);
            return Ok(PlaybackCompletion::Ended);
        }

        unsafe {
            let device = find_wasapi_output_device(device_id)?;
            let audio_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .context("Failed to activate WASAPI audio client")?;
            let format_ptr = audio_client
                .GetMixFormat()
                .context("Failed to read WASAPI mix format")?;
            let _format_guard = WaveFormatGuard(format_ptr);
            let format = WasapiFormat::from_waveformat(format_ptr)?;
            let buffer_duration =
                exclusive_buffer_duration_hns(&audio_client, buffer_frames, format.sample_rate_hz)?;

            audio_client
                .Initialize(
                    AUDCLNT_SHAREMODE_EXCLUSIVE,
                    0,
                    buffer_duration,
                    buffer_duration,
                    format_ptr,
                    None,
                )
                .context("Failed to initialize WASAPI exclusive output stream")?;

            let render_client = audio_client
                .GetService::<IAudioRenderClient>()
                .context("Failed to create WASAPI render client")?;
            let buffer_size = audio_client
                .GetBufferSize()
                .context("Failed to read WASAPI exclusive buffer size")?;
            let frame_step = source_sample_rate.max(1) as f64 / format.sample_rate_hz.max(1) as f64;

            let mut completion = write_file_frames(
                &render_client,
                buffer_size,
                &format,
                frame_step,
                source_channels,
                samples.as_ref(),
                &mut source_frame_position,
                &cursor,
                &paused,
                &stop,
                &volume_bits,
            )?;

            if completion == Some(PlaybackCompletion::Stopped) {
                return Ok(PlaybackCompletion::Stopped);
            }

            audio_client
                .Start()
                .context("Failed to start WASAPI exclusive output stream")?;

            while completion.is_none() {
                if stop.load(Ordering::SeqCst) {
                    completion = Some(PlaybackCompletion::Stopped);
                    break;
                }

                let padding = audio_client
                    .GetCurrentPadding()
                    .context("Failed to read WASAPI exclusive buffer padding")?;
                let available_frames = buffer_size.saturating_sub(padding);

                if available_frames == 0 {
                    std::thread::sleep(Duration::from_millis(EXCLUSIVE_POLL_INTERVAL_MS));
                    continue;
                }

                completion = write_file_frames(
                    &render_client,
                    available_frames,
                    &format,
                    frame_step,
                    source_channels,
                    samples.as_ref(),
                    &mut source_frame_position,
                    &cursor,
                    &paused,
                    &stop,
                    &volume_bits,
                )?;
            }

            let completion = completion.unwrap_or(PlaybackCompletion::Stopped);
            if completion == PlaybackCompletion::Ended {
                let drain_ms = frames_to_duration_ms(buffer_size, format.sample_rate_hz).max(20);
                std::thread::sleep(Duration::from_millis(drain_ms));
            }

            audio_client
                .Stop()
                .context("Failed to stop WASAPI exclusive output stream")?;

            Ok(completion)
        }
    }

    fn find_output_device(device_id: &str) -> Result<cpal::Device> {
        let host = cpal::default_host();
        if device_id.trim().is_empty() {
            return host
                .default_output_device()
                .context("Default output device is unavailable");
        }

        host.output_devices()
            .context("Failed to enumerate output devices")?
            .enumerate()
            .find_map(|(index, device)| {
                let name = device.name().ok()?;
                (format!("{index}:{name}") == device_id).then_some(device)
            })
            .context("Selected output device is unavailable")
    }

    unsafe fn find_wasapi_output_device(device_id: &str) -> Result<IMMDevice> {
        let enumerator =
            CoCreateInstance::<_, IMMDeviceEnumerator>(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .context("Failed to create WASAPI device enumerator")?;

        if device_id.trim().is_empty() {
            return enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .context("Default WASAPI output device is unavailable");
        }

        let selected_index = parse_device_index(device_id)?;
        let devices = enumerator
            .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
            .context("Failed to enumerate WASAPI output devices")?;
        let count = devices
            .GetCount()
            .context("Failed to read WASAPI output device count")?;

        if selected_index >= count {
            return Err(anyhow!("Selected WASAPI output device is unavailable."));
        }

        devices
            .Item(selected_index)
            .context("Selected WASAPI output device is unavailable")
    }

    fn parse_device_index(device_id: &str) -> Result<u32> {
        device_id
            .split_once(':')
            .map(|(index, _)| index)
            .unwrap_or(device_id)
            .parse::<u32>()
            .context("Selected output device id does not include a valid WASAPI index")
    }

    fn build_silence_stream<T>(device: &cpal::Device, config: &cpal::StreamConfig) -> Result<Stream>
    where
        T: Sample + cpal::SizedSample,
    {
        device
            .build_output_stream(
                config,
                |data: &mut [T], _| {
                    for sample in data {
                        *sample = T::EQUILIBRIUM;
                    }
                },
                |_| {},
                None,
            )
            .context("Failed to build shared output stream")
    }

    fn build_test_tone_stream<T>(
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        frequency_hz: f32,
    ) -> Result<Stream>
    where
        T: Sample + FromSample<f32> + cpal::SizedSample,
    {
        let sample_rate = config.sample_rate.0 as f32;
        let channels = usize::from(config.channels.max(1));
        let mut sample_clock = 0f32;

        device
            .build_output_stream(
                config,
                move |data: &mut [T], _| {
                    for frame in data.chunks_mut(channels) {
                        sample_clock = (sample_clock + 1.0) % sample_rate;
                        let tone = (sample_clock * frequency_hz * 2.0 * std::f32::consts::PI
                            / sample_rate)
                            .sin()
                            * 0.18;
                        let sample = T::from_sample(tone);

                        for channel_sample in frame {
                            *channel_sample = sample;
                        }
                    }
                },
                |_| {},
                None,
            )
            .context("Failed to build test tone stream")
    }

    fn build_file_stream<T>(
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        source_sample_rate: u32,
        source_channels: u16,
        samples: Arc<Vec<f32>>,
        cursor: Arc<AtomicUsize>,
        paused: Arc<AtomicBool>,
        stop: Arc<AtomicBool>,
        volume_bits: Arc<AtomicU32>,
    ) -> Result<Stream>
    where
        T: Sample + FromSample<f32> + cpal::SizedSample,
    {
        let output_sample_rate = config.sample_rate.0.max(1) as f64;
        let output_channels = usize::from(config.channels.max(1));
        let source_channels = usize::from(source_channels.max(1));
        let source_frame_count = samples.len() / source_channels;
        let mut source_frame_position =
            cursor.load(Ordering::SeqCst) as f64 / source_channels as f64;
        let frame_step = source_sample_rate.max(1) as f64 / output_sample_rate;

        device
            .build_output_stream(
                config,
                move |data: &mut [T], _| {
                    for frame in data.chunks_mut(output_channels) {
                        if stop.load(Ordering::SeqCst)
                            || source_frame_position >= source_frame_count as f64
                        {
                            for channel_sample in frame {
                                *channel_sample = T::EQUILIBRIUM;
                            }
                            cursor.store(samples.len(), Ordering::SeqCst);
                            continue;
                        }

                        if paused.load(Ordering::SeqCst) {
                            for channel_sample in frame {
                                *channel_sample = T::EQUILIBRIUM;
                            }
                            continue;
                        }

                        let volume =
                            f32::from_bits(volume_bits.load(Ordering::SeqCst)).clamp(0.0, 1.0);
                        let source_frame_index = source_frame_position.floor() as usize;
                        for (channel_index, channel_sample) in frame.iter_mut().enumerate() {
                            let source_channel = if source_channels == 1 {
                                0
                            } else {
                                channel_index.min(source_channels - 1)
                            };
                            let sample_index =
                                source_frame_index * source_channels + source_channel;
                            let sample = samples.get(sample_index).copied().unwrap_or(0.0) * volume;
                            *channel_sample = T::from_sample(sample.clamp(-1.0, 1.0));
                        }

                        source_frame_position += frame_step;
                        let cursor_index = (source_frame_position.floor() as usize)
                            .saturating_mul(source_channels)
                            .min(samples.len());
                        cursor.store(cursor_index, Ordering::SeqCst);
                    }
                },
                |_| {},
                None,
            )
            .context("Failed to build native file playback stream")
    }

    unsafe fn exclusive_buffer_duration_hns(
        audio_client: &IAudioClient,
        requested_frames: u32,
        sample_rate_hz: u32,
    ) -> Result<i64> {
        let mut default_period = 0i64;
        let mut minimum_period = 0i64;
        audio_client
            .GetDevicePeriod(Some(&mut default_period), Some(&mut minimum_period))
            .context("Failed to read WASAPI device period")?;

        let requested_duration =
            frames_to_hns(requested_frames.max(128), sample_rate_hz).max(minimum_period);
        Ok(requested_duration.max(1))
    }

    unsafe fn write_test_tone_frames(
        render_client: &IAudioRenderClient,
        frame_count: u32,
        format: &WasapiFormat,
        sample_clock: &mut f32,
        frequency_hz: f32,
    ) -> Result<()> {
        if frame_count == 0 {
            return Ok(());
        }

        let data = render_client
            .GetBuffer(frame_count)
            .context("Failed to acquire WASAPI render buffer")?;
        let buffer_len = frame_count as usize * format.block_align as usize;
        let buffer = slice::from_raw_parts_mut(data, buffer_len);
        fill_test_tone_buffer(buffer, frame_count, format, sample_clock, frequency_hz)?;
        render_client
            .ReleaseBuffer(frame_count, 0)
            .context("Failed to release WASAPI render buffer")
    }

    unsafe fn write_file_frames(
        render_client: &IAudioRenderClient,
        frame_count: u32,
        format: &WasapiFormat,
        frame_step: f64,
        source_channels: u16,
        samples: &[f32],
        source_frame_position: &mut f64,
        cursor: &AtomicUsize,
        paused: &AtomicBool,
        stop: &AtomicBool,
        volume_bits: &AtomicU32,
    ) -> Result<Option<PlaybackCompletion>> {
        if frame_count == 0 {
            return Ok(None);
        }

        let data = render_client
            .GetBuffer(frame_count)
            .context("Failed to acquire WASAPI render buffer")?;
        let buffer_len = frame_count as usize * format.block_align as usize;
        let buffer = slice::from_raw_parts_mut(data, buffer_len);
        let fill_result = fill_file_buffer(
            buffer,
            frame_count,
            format,
            frame_step,
            source_channels,
            samples,
            source_frame_position,
            cursor,
            paused,
            stop,
            volume_bits,
        );
        let release_result = render_client
            .ReleaseBuffer(frame_count, 0)
            .context("Failed to release WASAPI render buffer");

        release_result?;
        fill_result
    }

    fn fill_test_tone_buffer(
        buffer: &mut [u8],
        frame_count: u32,
        format: &WasapiFormat,
        sample_clock: &mut f32,
        frequency_hz: f32,
    ) -> Result<()> {
        let sample_rate = format.sample_rate_hz as f32;

        for frame_index in 0..frame_count as usize {
            let tone = (*sample_clock * frequency_hz * 2.0 * std::f32::consts::PI / sample_rate)
                .sin()
                * TEST_TONE_GAIN;
            *sample_clock = (*sample_clock + 1.0) % sample_rate;

            for channel in 0..format.channels as usize {
                let offset = frame_index * format.block_align as usize
                    + channel * format.bytes_per_sample as usize;
                write_sample(buffer, offset, tone, format)?;
            }
        }

        Ok(())
    }

    fn fill_file_buffer(
        buffer: &mut [u8],
        frame_count: u32,
        format: &WasapiFormat,
        frame_step: f64,
        source_channels: u16,
        samples: &[f32],
        source_frame_position: &mut f64,
        cursor: &AtomicUsize,
        paused: &AtomicBool,
        stop: &AtomicBool,
        volume_bits: &AtomicU32,
    ) -> Result<Option<PlaybackCompletion>> {
        let output_channels = usize::from(format.channels.max(1));
        let source_channels = usize::from(source_channels.max(1));
        let source_frame_count = samples.len() / source_channels;
        let mut completion: Option<PlaybackCompletion> = None;

        for frame_index in 0..frame_count as usize {
            if completion == Some(PlaybackCompletion::Stopped) || stop.load(Ordering::SeqCst) {
                write_silence_frame(buffer, frame_index, format)?;
                completion = Some(PlaybackCompletion::Stopped);
                continue;
            }

            if *source_frame_position >= source_frame_count as f64 {
                cursor.store(samples.len(), Ordering::SeqCst);
                write_silence_frame(buffer, frame_index, format)?;
                completion.get_or_insert(PlaybackCompletion::Ended);
                continue;
            }

            if paused.load(Ordering::SeqCst) {
                write_silence_frame(buffer, frame_index, format)?;
                continue;
            }

            let volume = f32::from_bits(volume_bits.load(Ordering::SeqCst)).clamp(0.0, 1.0);
            let source_frame_index = source_frame_position.floor() as usize;
            for output_channel in 0..output_channels {
                let source_channel = if source_channels == 1 {
                    0
                } else {
                    output_channel.min(source_channels - 1)
                };
                let sample_index = source_frame_index * source_channels + source_channel;
                let sample = samples.get(sample_index).copied().unwrap_or(0.0) * volume;
                let offset = frame_index * format.block_align as usize
                    + output_channel * format.bytes_per_sample as usize;
                write_sample(buffer, offset, sample, format)?;
            }

            *source_frame_position += frame_step;
            let cursor_index = (source_frame_position.floor() as usize)
                .saturating_mul(source_channels)
                .min(samples.len());
            cursor.store(cursor_index, Ordering::SeqCst);
        }

        Ok(completion)
    }

    fn write_silence_frame(
        buffer: &mut [u8],
        frame_index: usize,
        format: &WasapiFormat,
    ) -> Result<()> {
        for channel in 0..format.channels as usize {
            let offset = frame_index * format.block_align as usize
                + channel * format.bytes_per_sample as usize;
            write_sample(buffer, offset, 0.0, format)?;
        }

        Ok(())
    }

    fn write_sample(
        buffer: &mut [u8],
        offset: usize,
        sample: f32,
        format: &WasapiFormat,
    ) -> Result<()> {
        let clamped = sample.clamp(-1.0, 1.0);

        match format.sample_kind {
            WasapiSampleKind::Float => match format.bytes_per_sample {
                4 => {
                    buffer[offset..offset + 4].copy_from_slice(&clamped.to_le_bytes());
                }
                8 => {
                    buffer[offset..offset + 8].copy_from_slice(&(clamped as f64).to_le_bytes());
                }
                bytes => {
                    return Err(anyhow!(
                        "Unsupported WASAPI float sample width: {} bytes.",
                        bytes
                    ));
                }
            },
            WasapiSampleKind::Pcm => match format.bytes_per_sample {
                1 => {
                    buffer[offset] = ((clamped * 0.5 + 0.5) * u8::MAX as f32).round() as u8;
                }
                2 => {
                    let value = (clamped * i16::MAX as f32).round() as i16;
                    buffer[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
                }
                3 => {
                    let value = (clamped * 8_388_607.0).round() as i32;
                    buffer[offset..offset + 3].copy_from_slice(&value.to_le_bytes()[..3]);
                }
                4 => {
                    let value = (clamped * i32::MAX as f32).round() as i32;
                    buffer[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
                }
                bytes => {
                    return Err(anyhow!(
                        "Unsupported WASAPI PCM sample width: {} bytes.",
                        bytes
                    ));
                }
            },
        }

        Ok(())
    }

    fn frames_for_duration(duration_ms: u64, sample_rate_hz: u32) -> u32 {
        let frames = duration_ms.saturating_mul(sample_rate_hz as u64) / 1000;
        frames.clamp(1, u32::MAX as u64) as u32
    }

    fn frames_to_hns(frames: u32, sample_rate_hz: u32) -> i64 {
        (frames as i64 * HNS_PER_SECOND) / sample_rate_hz.max(1) as i64
    }

    fn frames_to_duration_ms(frames: u32, sample_rate_hz: u32) -> u64 {
        ((frames as u64 * 1000) / sample_rate_hz.max(1) as u64).max(1)
    }

    struct ComGuard {
        should_uninitialize: bool,
    }

    impl ComGuard {
        fn initialize() -> Result<Self> {
            unsafe {
                let result = CoInitializeEx(None, COINIT_MULTITHREADED);
                if result.is_ok() {
                    return Ok(Self {
                        should_uninitialize: true,
                    });
                }

                if result == RPC_E_CHANGED_MODE {
                    return Ok(Self {
                        should_uninitialize: false,
                    });
                }

                result
                    .ok()
                    .context("Failed to initialize COM for WASAPI exclusive output")?;
                Ok(Self {
                    should_uninitialize: false,
                })
            }
        }
    }

    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.should_uninitialize {
                unsafe {
                    CoUninitialize();
                }
            }
        }
    }

    struct WaveFormatGuard(*mut WAVEFORMATEX);

    impl Drop for WaveFormatGuard {
        fn drop(&mut self) {
            unsafe {
                CoTaskMemFree(Some(self.0.cast::<c_void>()));
            }
        }
    }

    #[derive(Clone, Copy)]
    struct WasapiFormat {
        sample_rate_hz: u32,
        channels: u16,
        block_align: u16,
        bits_per_sample: u16,
        bytes_per_sample: u16,
        sample_kind: WasapiSampleKind,
    }

    impl WasapiFormat {
        unsafe fn from_waveformat(format_ptr: *const WAVEFORMATEX) -> Result<Self> {
            if format_ptr.is_null() {
                return Err(anyhow!("WASAPI mix format pointer is null."));
            }

            let format = *format_ptr;
            let format_tag = format.wFormatTag;
            let sample_rate_hz = format.nSamplesPerSec;
            let channels = format.nChannels;
            let block_align = format.nBlockAlign;
            let bits_per_sample = format.wBitsPerSample;
            let sample_kind = match u32::from(format_tag) {
                WAVE_FORMAT_PCM => WasapiSampleKind::Pcm,
                WAVE_FORMAT_IEEE_FLOAT => WasapiSampleKind::Float,
                WAVE_FORMAT_EXTENSIBLE => sample_kind_from_extensible(format_ptr)?,
                other => {
                    return Err(anyhow!("Unsupported WASAPI wave format tag: {other}."));
                }
            };
            let bytes_per_sample = bits_per_sample / 8;

            if sample_rate_hz == 0 || channels == 0 || block_align == 0 || bytes_per_sample == 0 {
                return Err(anyhow!(
                    "Invalid WASAPI mix format: {} Hz, {}ch, blockAlign={}, bits={}.",
                    sample_rate_hz,
                    channels,
                    block_align,
                    bits_per_sample
                ));
            }

            if block_align < channels.saturating_mul(bytes_per_sample) {
                return Err(anyhow!(
                    "Unsupported WASAPI block alignment: blockAlign={}, channels={}, bytesPerSample={}.",
                    block_align,
                    channels,
                    bytes_per_sample
                ));
            }

            Ok(Self {
                sample_rate_hz,
                channels,
                block_align,
                bits_per_sample,
                bytes_per_sample,
                sample_kind,
            })
        }
    }

    unsafe fn sample_kind_from_extensible(
        format_ptr: *const WAVEFORMATEX,
    ) -> Result<WasapiSampleKind> {
        let extensible = *(format_ptr as *const WAVEFORMATEXTENSIBLE);
        let sub_format = extensible.SubFormat;

        if sub_format == KSDATAFORMAT_SUBTYPE_PCM {
            Ok(WasapiSampleKind::Pcm)
        } else if sub_format == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT {
            Ok(WasapiSampleKind::Float)
        } else {
            Err(anyhow!("Unsupported WASAPI extensible sample subtype."))
        }
    }

    #[derive(Clone, Copy)]
    enum WasapiSampleKind {
        Float,
        Pcm,
    }

    impl WasapiSampleKind {
        fn label(self) -> &'static str {
            match self {
                WasapiSampleKind::Float => "float",
                WasapiSampleKind::Pcm => "pcm",
            }
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use anyhow::{anyhow, Result};
    use cpal::Stream;
    use std::sync::{
        atomic::{AtomicBool, AtomicU32, AtomicUsize},
        Arc,
    };

    use super::{AudioOutputDevice, PlaybackCompletion};

    pub fn enumerate_output_devices() -> Result<Vec<AudioOutputDevice>> {
        Ok(Vec::new())
    }

    pub fn open_shared_silence_stream(_device_id: &str) -> Result<Stream> {
        Err(anyhow!("Native audio output is only available on Windows."))
    }

    pub fn validate_shared_playback_device(_device_id: &str) -> Result<()> {
        Err(anyhow!("Native audio output is only available on Windows."))
    }

    pub fn validate_exclusive_playback_device(_device_id: &str) -> Result<()> {
        Err(anyhow!(
            "WASAPI exclusive output is only available on Windows."
        ))
    }

    pub fn build_shared_file_stream(
        _device_id: &str,
        _source_sample_rate: u32,
        _source_channels: u16,
        _samples: Arc<Vec<f32>>,
        _cursor: Arc<AtomicUsize>,
        _paused: Arc<AtomicBool>,
        _stop: Arc<AtomicBool>,
        _volume_bits: Arc<AtomicU32>,
    ) -> Result<Stream> {
        Err(anyhow!("Native audio output is only available on Windows."))
    }

    pub fn play_test_tone(_device_id: &str, _duration_ms: u64, _frequency_hz: f32) -> Result<()> {
        Err(anyhow!("Native audio output is only available on Windows."))
    }

    pub fn play_exclusive_test_tone(
        _device_id: &str,
        _duration_ms: u64,
        _frequency_hz: f32,
        _buffer_frames: u32,
    ) -> Result<String> {
        Err(anyhow!(
            "WASAPI exclusive output is only available on Windows."
        ))
    }

    pub fn play_exclusive_file(
        _device_id: &str,
        _buffer_frames: u32,
        _source_sample_rate: u32,
        _source_channels: u16,
        _samples: Arc<Vec<f32>>,
        _cursor: Arc<AtomicUsize>,
        _paused: Arc<AtomicBool>,
        _stop: Arc<AtomicBool>,
        _volume_bits: Arc<AtomicU32>,
    ) -> Result<PlaybackCompletion> {
        Err(anyhow!(
            "WASAPI exclusive output is only available on Windows."
        ))
    }
}
