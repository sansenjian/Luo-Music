use std::collections::VecDeque;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use cpal::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use symphonia::core::audio::sample::Sample;
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::codecs::registry::CodecRegistry;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, SeekMode, SeekTo, TrackType};
use symphonia::core::io::{MediaSource, MediaSourceStream};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::units::Time;

const PROTOCOL_VERSION: u32 = 2;
const DEFAULT_BUFFER_FRAMES: u32 = 960;
const DEFAULT_TEST_TONE_DURATION_MS: u64 = 500;
const DEFAULT_TEST_TONE_FREQUENCY_HZ: f32 = 440.0;
const DEFAULT_PLAYBACK_VOLUME: f32 = 1.0;
const PLAYBACK_POLL_INTERVAL_MS: u64 = 40;
const STREAMING_PCM_BUFFER_SECONDS: usize = 4;
const STREAMING_PCM_PRODUCER_SLEEP_MS: u64 = 5;
const GROWING_FILE_READ_SLEEP_MS: u64 = 20;
const DEFAULT_VOICEMEETER_BUS: &str = "A1";
const DEFAULT_VOICEMEETER_HARDWARE_OUT_BUS: &str = "A1";
const DEFAULT_VOICEMEETER_HARDWARE_OUT_DRIVER: &str = "wdm";
const BASE_SUPPORTED_AUDIO_EXTENSIONS: &[&str] = &[
    ".aac", ".aif", ".aiff", ".ape", ".caf", ".flac", ".m2a", ".m4a", ".mka", ".mp1", ".mp2",
    ".mp3", ".mpa", ".oga", ".ogg", ".wav",
];
const WAVE_FORMAT_PCM_TAG: u16 = 0x0001;
const WAVE_FORMAT_IEEE_FLOAT_TAG: u16 = 0x0003;

fn format_error_chain(error: &anyhow::Error) -> String {
    let mut parts = Vec::new();
    for cause in error.chain() {
        let message = cause.to_string();
        if !message.is_empty() && parts.last() != Some(&message) {
            parts.push(message);
        }
    }

    parts.join(": ")
}

fn supported_audio_extensions() -> Vec<String> {
    let mut extensions = BASE_SUPPORTED_AUDIO_EXTENSIONS
        .iter()
        .map(|extension| (*extension).to_string())
        .collect::<Vec<_>>();

    if cfg!(feature = "opus") {
        extensions.push(".opus".to_string());
        extensions.push(".webm".to_string());
    }

    extensions
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RawPcmSampleKind {
    Float,
    Pcm,
}

impl RawPcmSampleKind {
    fn label(self) -> &'static str {
        match self {
            RawPcmSampleKind::Float => "float",
            RawPcmSampleKind::Pcm => "pcm",
        }
    }
}

#[derive(Clone)]
struct RawPcmAudio {
    sample_rate: u32,
    channels: u16,
    bit_depth: u16,
    block_align: u16,
    sample_kind: RawPcmSampleKind,
    source: &'static str,
    frame_count: usize,
    data: Arc<Vec<u8>>,
}

impl RawPcmAudio {
    fn source_format(&self) -> AudioFormatDiagnostics {
        AudioFormatDiagnostics {
            sample_rate: self.sample_rate,
            channels: self.channels,
            sample_format: self.sample_kind.label().to_string(),
            bit_depth: Some(self.bit_depth),
            source: Some(self.source.to_string()),
        }
    }

    fn sample_count(&self) -> usize {
        self.frame_count
            .saturating_mul(usize::from(self.channels.max(1)))
    }
}

#[derive(Clone)]
struct EventSink {
    out: Arc<Mutex<Box<dyn Write + Send>>>,
}

impl EventSink {
    fn new() -> Self {
        Self::from_writer(io::stdout())
    }

    fn from_writer(writer: impl Write + Send + 'static) -> Self {
        Self {
            out: Arc::new(Mutex::new(Box::new(writer))),
        }
    }

    #[cfg(test)]
    fn test() -> Self {
        Self::from_writer(io::sink())
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
        position_seconds: Option<f64>,
        playback_token: Option<String>,
        reason: Option<String>,
    ) {
        self.emit_playback_with_error(
            state,
            running,
            paused,
            source,
            position_seconds,
            playback_token,
            reason,
            None,
        );
    }

    #[allow(clippy::too_many_arguments)]
    fn emit_playback_with_error(
        &self,
        state: PlaybackState,
        running: bool,
        paused: bool,
        source: Option<String>,
        position_seconds: Option<f64>,
        playback_token: Option<String>,
        reason: Option<String>,
        native_playback_error: Option<NativePlaybackError>,
    ) {
        let _ = self.emit(&HelperEvent::Playback {
            payload: PlaybackEventPayload {
                state,
                running,
                paused,
                source,
                position_seconds,
                playback_token,
                native_playback_error,
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

impl TestTonePayload {
    fn normalized(self) -> Self {
        Self {
            duration_ms: self.duration_ms.clamp(120, 2000),
            frequency_hz: self.frequency_hz.clamp(120.0, 2000.0),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayFilePayload {
    path: String,
    #[serde(rename = "startSeconds", default)]
    start_seconds: f64,
    #[serde(default = "default_playback_volume")]
    volume: f32,
    #[serde(rename = "growingExpectedBytes", default)]
    growing_expected_bytes: Option<u64>,
    #[serde(rename = "playbackToken", default)]
    playback_token: Option<String>,
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
    #[serde(rename = "bitPerfectRequired", default)]
    bit_perfect_required: bool,
    #[serde(rename = "voicemeeterBus", default = "default_voicemeeter_bus")]
    voicemeeter_bus: String,
    #[serde(
        rename = "voicemeeterHardwareOutBus",
        default = "default_voicemeeter_hardware_out_bus"
    )]
    voicemeeter_hardware_out_bus: String,
    #[serde(
        rename = "voicemeeterHardwareOutDriver",
        default = "default_voicemeeter_hardware_out_driver"
    )]
    voicemeeter_hardware_out_driver: String,
    #[serde(rename = "voicemeeterHardwareOutDevice", default)]
    voicemeeter_hardware_out_device: String,
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

fn supported_audio_modes() -> Vec<AudioOutputMode> {
    let mut modes = vec![AudioOutputMode::Shared];
    if platform::supports_exclusive_output() {
        modes.push(AudioOutputMode::Exclusive);
        modes.push(AudioOutputMode::Voicemeeter);
    }

    modes
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
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

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum AudioOutputDeviceBackend {
    #[cfg_attr(windows, allow(dead_code))]
    Cpal,
    Wasapi,
    Voicemeeter,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum VoicemeeterRemoteKind {
    Standard,
    Banana,
    Potato,
    Unknown,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct VoicemeeterLevelProbe {
    active: bool,
    target: String,
    bus: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    strip: Option<i32>,
    #[serde(rename = "levelType")]
    level_type: i32,
    channel_start: i32,
    channels: i32,
    samples: u32,
    active_samples: u32,
    max_level: f32,
    threshold: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct VoicemeeterRemoteStatus {
    available: bool,
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    route_applied: Option<bool>,
    #[serde(rename = "routeManaged", skip_serializing_if = "Option::is_none")]
    route_managed: Option<bool>,
    #[serde(rename = "routeBus", skip_serializing_if = "Option::is_none")]
    route_bus: Option<String>,
    #[serde(rename = "hardwareOutApplied", skip_serializing_if = "Option::is_none")]
    hardware_out_applied: Option<bool>,
    #[serde(rename = "hardwareOutBus", skip_serializing_if = "Option::is_none")]
    hardware_out_bus: Option<String>,
    #[serde(rename = "hardwareOutDriver", skip_serializing_if = "Option::is_none")]
    hardware_out_driver: Option<String>,
    #[serde(rename = "hardwareOutDevice", skip_serializing_if = "Option::is_none")]
    hardware_out_device: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    kind: Option<VoicemeeterRemoteKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    virtual_input_strip: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dll_path: Option<String>,
    #[serde(rename = "levelProbe", skip_serializing_if = "Option::is_none")]
    level_probe: Option<VoicemeeterLevelProbe>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

impl VoicemeeterRemoteStatus {
    fn unavailable(reason: impl Into<String>) -> Self {
        Self {
            available: false,
            connected: false,
            route_applied: None,
            route_managed: None,
            route_bus: None,
            hardware_out_applied: None,
            hardware_out_bus: None,
            hardware_out_driver: None,
            hardware_out_device: None,
            kind: None,
            version: None,
            virtual_input_strip: None,
            dll_path: None,
            level_probe: None,
            reason: Some(reason.into()),
        }
    }
}

#[derive(Clone, Debug)]
struct VoicemeeterTestToneResult {
    device_id: String,
    level_probe: Option<VoicemeeterLevelProbe>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct VoicemeeterHardwareOutConfig {
    bus: String,
    driver: String,
    device: String,
}

#[derive(Clone, Debug, PartialEq)]
struct VoicemeeterRouteSnapshot {
    resolved_device_id: String,
    selected_name_hint: String,
    strip: i32,
    bus: String,
    previous_value: f32,
}

impl VoicemeeterRouteSnapshot {
    fn matches_request(
        &self,
        resolved_device_id: &str,
        selected_name_hint: &str,
        bus: &str,
    ) -> bool {
        self.resolved_device_id == resolved_device_id
            && self.selected_name_hint == selected_name_hint
            && self.bus == normalize_voicemeeter_bus(bus)
    }
}

#[derive(Clone, Debug)]
struct VoicemeeterRoutePrepareResult {
    status: VoicemeeterRemoteStatus,
    snapshot: Option<VoicemeeterRouteSnapshot>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum ExclusiveProbeStatus {
    Passed,
    Failed,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum ExclusiveProbeSecondOpen {
    DeviceInUse,
    UnexpectedSuccess,
    UnexpectedError,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExclusiveProbeResult {
    status: ExclusiveProbeStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    device_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    buffer_frames: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    buffer_duration_hns: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    second_open: Option<ExclusiveProbeSecondOpen>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

impl ExclusiveProbeResult {
    fn failed(reason: impl Into<String>) -> Self {
        Self {
            status: ExclusiveProbeStatus::Failed,
            device_name: None,
            format: None,
            buffer_frames: None,
            buffer_duration_hns: None,
            source: None,
            second_open: None,
            error_code: None,
            reason: Some(reason.into()),
        }
    }

    fn summary(&self) -> String {
        match self.status {
            ExclusiveProbeStatus::Passed => format!(
                "device={}, format={}, buffer={} frames, source={}, secondOpen=AUDCLNT_E_DEVICE_IN_USE.",
                self.device_name.as_deref().unwrap_or("selected WASAPI output device"),
                self.format.as_deref().unwrap_or("unknown format"),
                self.buffer_frames.unwrap_or_default(),
                self.source.as_deref().unwrap_or("unknown")
            ),
            ExclusiveProbeStatus::Failed => self
                .reason
                .clone()
                .unwrap_or_else(|| "exclusive lock probe failed".to_string()),
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum BitPerfectStatus {
    Candidate,
    NotCandidate,
    Unverified,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct AudioFormatDiagnostics {
    sample_rate: u32,
    channels: u16,
    sample_format: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    bit_depth: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct BitPerfectDiagnostics {
    status: BitPerfectStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_format: Option<AudioFormatDiagnostics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_format: Option<AudioFormatDiagnostics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    volume: Option<f32>,
    reason: String,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum NativePlaybackErrorCode {
    WasapiExclusiveFailed,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct NativePlaybackError {
    code: NativePlaybackErrorCode,
    #[serde(rename = "nativeErrorCode", skip_serializing_if = "Option::is_none")]
    native_error_code: Option<String>,
    retryable: bool,
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
    #[serde(rename = "supportedExtensions")]
    supported_extensions: Vec<String>,
    #[serde(rename = "supportedModes")]
    supported_modes: Vec<AudioOutputMode>,
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
    #[serde(
        rename = "nativePlaybackPositionSeconds",
        skip_serializing_if = "Option::is_none"
    )]
    native_playback_position_seconds: Option<f64>,
    #[serde(
        rename = "nativePlaybackToken",
        skip_serializing_if = "Option::is_none"
    )]
    native_playback_token: Option<String>,
    #[serde(
        rename = "nativePlaybackError",
        skip_serializing_if = "Option::is_none"
    )]
    native_playback_error: Option<NativePlaybackError>,
    #[serde(rename = "exclusiveProbe", skip_serializing_if = "Option::is_none")]
    exclusive_probe: Option<ExclusiveProbeResult>,
    #[serde(rename = "bitPerfect", skip_serializing_if = "Option::is_none")]
    bit_perfect: Option<BitPerfectDiagnostics>,
    #[serde(rename = "voicemeeterRemote", skip_serializing_if = "Option::is_none")]
    voicemeeter_remote: Option<VoicemeeterRemoteStatus>,
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
    #[serde(rename = "positionSeconds", skip_serializing_if = "Option::is_none")]
    position_seconds: Option<f64>,
    #[serde(rename = "playbackToken", skip_serializing_if = "Option::is_none")]
    playback_token: Option<String>,
    #[serde(
        rename = "nativePlaybackError",
        skip_serializing_if = "Option::is_none"
    )]
    native_playback_error: Option<NativePlaybackError>,
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
    playback_token: Option<String>,
    native_playback_error: Option<NativePlaybackError>,
    voicemeeter_route: Option<VoicemeeterRouteSnapshot>,
}

#[derive(Clone, Debug)]
struct ModeProbe {
    requested_mode: AudioOutputMode,
    backend: AudioOutputBackend,
    backend_available: bool,
    active_mode: Option<AudioOutputMode>,
    exclusive_probe: Option<ExclusiveProbeResult>,
    bit_perfect: Option<BitPerfectDiagnostics>,
    voicemeeter_remote: Option<VoicemeeterRemoteStatus>,
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
            playback_token: None,
            native_playback_error: None,
            voicemeeter_route: None,
        }
    }

    fn configure(&mut self, payload: ConfigurePayload) {
        self.stop_playback(false);
        self.shared_stream = None;
        let _ = self.restore_voicemeeter_route();
        self.enabled = payload.enabled;
        self.settings = payload.settings.normalized();
        self.stream_reason = None;
        self.mode_probe = None;
        self.native_playback_error = None;

        if !self.enabled {
            return;
        }

        self.reopen_shared_stream_if_needed();
    }

    fn reopen_shared_stream_if_needed(&mut self) {
        self.shared_stream = None;
        self.stream_reason = None;

        if self.settings.mode == AudioOutputMode::Voicemeeter {
            self.probe_voicemeeter_route_for_configure();
            return;
        }

        if self.should_use_shared_stream() {
            let stream_result = platform::open_shared_silence_stream(&self.settings.device_id);

            match stream_result {
                Ok(stream) => {
                    self.shared_stream = Some(stream);
                }
                Err(error) => {
                    self.stream_reason = Some(error.to_string());
                }
            }
        }
    }

    fn probe_voicemeeter_route_for_configure(&mut self) {
        let selected_name_hint = self.settings.device_id.clone();
        let voicemeeter_bus = self.settings.voicemeeter_bus.clone();
        let remote_status =
            match platform::resolve_voicemeeter_output_device_id(&selected_name_hint) {
                Ok(resolved_device_id) => {
                    let route_name_hint =
                        voicemeeter_route_name_hint(&selected_name_hint, &resolved_device_id);
                    self.prepare_voicemeeter_route(
                        &resolved_device_id,
                        &route_name_hint,
                        &voicemeeter_bus,
                        self.settings.voicemeeter_hardware_out_config().as_ref(),
                    )
                }
                Err(error) => VoicemeeterRemoteStatus::unavailable(format!(
                    "Voicemeeter virtual input device is unavailable: {error}"
                )),
            };

        let probe = Self::create_voicemeeter_configure_probe(remote_status);
        if !probe.backend_available {
            self.stream_reason = Some(probe.reason.clone());
        }
        self.mode_probe = Some(probe);
    }

    fn create_voicemeeter_configure_probe(remote_status: VoicemeeterRemoteStatus) -> ModeProbe {
        let route_ready = voicemeeter_route_ready(&remote_status);
        let reason = remote_status.reason.clone().unwrap_or_else(|| {
            if route_ready {
                "Voicemeeter virtual input route is available.".to_string()
            } else {
                "Voicemeeter virtual input route is unavailable.".to_string()
            }
        });

        ModeProbe {
            requested_mode: AudioOutputMode::Voicemeeter,
            backend: if route_ready {
                AudioOutputBackend::Native
            } else {
                AudioOutputBackend::Unavailable
            },
            backend_available: route_ready,
            active_mode: route_ready.then_some(AudioOutputMode::Voicemeeter),
            exclusive_probe: None,
            bit_perfect: None,
            voicemeeter_remote: Some(remote_status),
            reason,
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
                supported_extensions: supported_audio_extensions(),
                supported_modes: supported_audio_modes(),
                native_playback_running: playback.running,
                native_playback_paused: playback.paused,
                native_playback_source: playback.source,
                native_playback_state: playback.state,
                native_playback_position_seconds: playback.position_seconds,
                native_playback_token: playback.token,
                native_playback_error: self.native_playback_error.clone(),
                exclusive_probe: None,
                bit_perfect: None,
                voicemeeter_remote: None,
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
                supported_extensions: supported_audio_extensions(),
                supported_modes: supported_audio_modes(),
                native_playback_running: playback.running,
                native_playback_paused: playback.paused,
                native_playback_source: playback.source,
                native_playback_state: playback.state,
                native_playback_position_seconds: playback.position_seconds,
                native_playback_token: playback.token,
                native_playback_error: self.native_playback_error.clone(),
                exclusive_probe: None,
                bit_perfect: None,
                voicemeeter_remote: None,
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
                supported_extensions: supported_audio_extensions(),
                supported_modes: supported_audio_modes(),
                native_playback_running: playback.running,
                native_playback_paused: playback.paused,
                native_playback_source: playback.source,
                native_playback_state: playback.state,
                native_playback_position_seconds: playback.position_seconds,
                native_playback_token: playback.token,
                native_playback_error: self.native_playback_error.clone(),
                exclusive_probe: probe.exclusive_probe.clone(),
                bit_perfect: probe.bit_perfect.clone(),
                voicemeeter_remote: probe.voicemeeter_remote.clone(),
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
                supported_extensions: supported_audio_extensions(),
                supported_modes: supported_audio_modes(),
                native_playback_running: playback.running,
                native_playback_paused: playback.paused,
                native_playback_source: playback.source,
                native_playback_state: playback.state,
                native_playback_position_seconds: playback.position_seconds,
                native_playback_token: playback.token,
                native_playback_error: self.native_playback_error.clone(),
                exclusive_probe: None,
                bit_perfect: None,
                voicemeeter_remote: None,
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
                supported_extensions: supported_audio_extensions(),
                supported_modes: supported_audio_modes(),
                native_playback_running: playback.running,
                native_playback_paused: playback.paused,
                native_playback_source: playback.source,
                native_playback_state: playback.state,
                native_playback_position_seconds: playback.position_seconds,
                native_playback_token: playback.token,
                native_playback_error: self.native_playback_error.clone(),
                exclusive_probe: None,
                bit_perfect: None,
                voicemeeter_remote: None,
                reason: Some(
                    "Shared output stream initialized with silent native probe.".to_string(),
                ),
            },
            AudioOutputMode::Exclusive => {
                if !platform::supports_exclusive_output() {
                    let reason = if self.settings.fallback_to_shared {
                        "WASAPI exclusive output is only available on Windows; using shared fallback."
                    } else {
                        "WASAPI exclusive output is only available on Windows."
                    };

                    return AudioOutputStatus {
                        enabled: true,
                        backend: if self.settings.fallback_to_shared {
                            AudioOutputBackend::Native
                        } else {
                            AudioOutputBackend::Unavailable
                        },
                        backend_available: self.settings.fallback_to_shared,
                        requested_mode: AudioOutputMode::Exclusive,
                        active_mode: if self.settings.fallback_to_shared {
                            Some(AudioOutputMode::Shared)
                        } else {
                            None
                        },
                        device_id: selected_device_id,
                        devices,
                        supported_extensions: supported_audio_extensions(),
                        supported_modes: supported_audio_modes(),
                        native_playback_running: playback.running,
                        native_playback_paused: playback.paused,
                        native_playback_source: playback.source,
                        native_playback_state: playback.state,
                        native_playback_position_seconds: playback.position_seconds,
                        native_playback_token: playback.token,
                        native_playback_error: self.native_playback_error.clone(),
                        exclusive_probe: None,
                        bit_perfect: Some(create_unverified_bit_perfect_diagnostics(reason)),
                        voicemeeter_remote: None,
                        reason: Some(reason.to_string()),
                    };
                }

                if self.settings.fallback_to_shared {
                    AudioOutputStatus {
                        enabled: true,
                        backend: AudioOutputBackend::Native,
                        backend_available: true,
                        requested_mode: AudioOutputMode::Exclusive,
                        active_mode: Some(AudioOutputMode::Shared),
                        device_id: selected_device_id,
                        devices,
                        supported_extensions: supported_audio_extensions(),
                        supported_modes: supported_audio_modes(),
                        native_playback_running: playback.running,
                        native_playback_paused: playback.paused,
                        native_playback_source: playback.source,
                        native_playback_state: playback.state,
                        native_playback_position_seconds: playback.position_seconds,
                        native_playback_token: playback.token,
                        native_playback_error: self.native_playback_error.clone(),
                        exclusive_probe: None,
                        bit_perfect: Some(create_unverified_bit_perfect_diagnostics(
                            "Bit-perfect diagnostics are available after WASAPI exclusive native file playback starts.",
                        )),
                        voicemeeter_remote: None,
                        reason: Some(
                            "WASAPI exclusive initialization is pending; using shared fallback."
                                .to_string(),
                        ),
                    }
                } else {
                    AudioOutputStatus {
                        enabled: true,
                        backend: AudioOutputBackend::Native,
                        backend_available: true,
                        requested_mode: AudioOutputMode::Exclusive,
                        active_mode: None,
                        device_id: selected_device_id,
                        devices,
                        supported_extensions: supported_audio_extensions(),
                        supported_modes: supported_audio_modes(),
                        native_playback_running: playback.running,
                        native_playback_paused: playback.paused,
                        native_playback_source: playback.source,
                        native_playback_state: playback.state,
                        native_playback_position_seconds: playback.position_seconds,
                        native_playback_token: playback.token,
                        native_playback_error: self.native_playback_error.clone(),
                        exclusive_probe: None,
                        bit_perfect: Some(create_unverified_bit_perfect_diagnostics(
                            "Bit-perfect diagnostics are available after WASAPI exclusive native file playback starts.",
                        )),
                        voicemeeter_remote: None,
                        reason: Some("WASAPI exclusive initialization is pending.".to_string()),
                    }
                }
            }
            AudioOutputMode::Voicemeeter => {
                if let Ok(resolved_device_id) =
                    platform::resolve_voicemeeter_output_device_id(&self.settings.device_id)
                {
                    let remote_status = platform::probe_voicemeeter_remote_api(
                        &resolved_device_id,
                        &self.settings.voicemeeter_bus,
                        self.settings.voicemeeter_hardware_out_config().as_ref(),
                    );
                    let route_ready = voicemeeter_route_ready(&remote_status);
                    let reason = remote_status.reason.clone().unwrap_or_else(|| {
                        if route_ready {
                            "Voicemeeter virtual input route is available.".to_string()
                        } else {
                            "Voicemeeter virtual input route is unavailable.".to_string()
                        }
                    });
                    AudioOutputStatus {
                        enabled: true,
                        backend: if route_ready {
                            AudioOutputBackend::Native
                        } else {
                            AudioOutputBackend::Unavailable
                        },
                        backend_available: route_ready,
                        requested_mode: AudioOutputMode::Voicemeeter,
                        active_mode: route_ready.then_some(AudioOutputMode::Voicemeeter),
                        device_id: selected_device_id,
                        devices,
                        supported_extensions: supported_audio_extensions(),
                        supported_modes: supported_audio_modes(),
                        native_playback_running: playback.running,
                        native_playback_paused: playback.paused,
                        native_playback_source: playback.source,
                        native_playback_state: playback.state,
                        native_playback_position_seconds: playback.position_seconds,
                        native_playback_token: playback.token,
                        native_playback_error: self.native_playback_error.clone(),
                        exclusive_probe: None,
                        bit_perfect: None,
                        voicemeeter_remote: Some(remote_status),
                        reason: Some(reason),
                    }
                } else {
                    AudioOutputStatus {
                        enabled: true,
                        backend: AudioOutputBackend::Unavailable,
                        backend_available: false,
                        requested_mode: AudioOutputMode::Voicemeeter,
                        active_mode: None,
                        device_id: selected_device_id,
                        devices,
                        supported_extensions: supported_audio_extensions(),
                        supported_modes: supported_audio_modes(),
                        native_playback_running: playback.running,
                        native_playback_paused: playback.paused,
                        native_playback_source: playback.source,
                        native_playback_state: playback.state,
                        native_playback_position_seconds: playback.position_seconds,
                        native_playback_token: playback.token,
                        native_playback_error: self.native_playback_error.clone(),
                        exclusive_probe: None,
                        bit_perfect: None,
                        voicemeeter_remote: Some(VoicemeeterRemoteStatus::unavailable(
                            "Voicemeeter virtual input device is unavailable.",
                        )),
                        reason: Some(
                            "Voicemeeter virtual input device is unavailable.".to_string(),
                        ),
                    }
                }
            }
        }
    }

    fn play_test_tone(&mut self, payload: TestTonePayload) -> Result<()> {
        if !self.enabled {
            return Err(anyhow!(
                "Native audio output must be enabled before playing a test tone."
            ));
        }

        let payload = payload.normalized();
        let duration_ms = payload.duration_ms;
        let frequency_hz = payload.frequency_hz;

        match self.settings.mode {
            AudioOutputMode::Shared => {
                platform::play_test_tone(&self.settings.device_id, duration_ms, frequency_hz)?;
                self.mode_probe = Some(ModeProbe {
                    requested_mode: AudioOutputMode::Shared,
                    backend: AudioOutputBackend::Native,
                    backend_available: true,
                    active_mode: Some(AudioOutputMode::Shared),
                    exclusive_probe: None,
                    bit_perfect: None,
                    voicemeeter_remote: None,
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
                            exclusive_probe: None,
                            bit_perfect: None,
                            voicemeeter_remote: None,
                            reason: format!("WASAPI exclusive test tone completed. {summary}"),
                        });
                    }
                    Err(exclusive_error) if self.settings.fallback_to_shared => {
                        let exclusive_reason = format_error_chain(&exclusive_error);
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
                                    exclusive_probe: None,
                                    bit_perfect: None,
                                    voicemeeter_remote: None,
                                    reason: format!(
                                        "WASAPI exclusive test tone failed: {exclusive_reason}; shared fallback test tone completed."
                                    ),
                                });
                            }
                            Err(shared_error) => {
                                let shared_reason = format_error_chain(&shared_error);
                                self.mode_probe = Some(ModeProbe {
                                    requested_mode: AudioOutputMode::Exclusive,
                                    backend: AudioOutputBackend::Unavailable,
                                    backend_available: false,
                                    active_mode: None,
                                    exclusive_probe: None,
                                    bit_perfect: None,
                                    voicemeeter_remote: None,
                                    reason: format!(
                                        "WASAPI exclusive test tone failed: {exclusive_reason}; shared fallback test tone failed: {shared_reason}"
                                    ),
                                });
                            }
                        }
                    }
                    Err(exclusive_error) => {
                        let exclusive_reason = format_error_chain(&exclusive_error);
                        self.mode_probe = Some(ModeProbe {
                            requested_mode: AudioOutputMode::Exclusive,
                            backend: AudioOutputBackend::Unavailable,
                            backend_available: false,
                            active_mode: None,
                            exclusive_probe: None,
                            bit_perfect: None,
                            voicemeeter_remote: None,
                            reason: format!(
                                "WASAPI exclusive test tone failed: {exclusive_reason}"
                            ),
                        });
                    }
                }
            }
            AudioOutputMode::Voicemeeter => {
                let selected_name_hint = self.settings.device_id.clone();
                let voicemeeter_bus = self.settings.voicemeeter_bus.clone();
                let remote_status =
                    match platform::resolve_voicemeeter_output_device_id(&selected_name_hint) {
                        Ok(resolved_device_id) => {
                            let route_name_hint = voicemeeter_route_name_hint(
                                &selected_name_hint,
                                &resolved_device_id,
                            );
                            self.prepare_voicemeeter_route(
                                &resolved_device_id,
                                &route_name_hint,
                                &voicemeeter_bus,
                                self.settings.voicemeeter_hardware_out_config().as_ref(),
                            )
                        }
                        Err(error) => VoicemeeterRemoteStatus::unavailable(format!(
                            "Voicemeeter virtual input device is unavailable: {error}"
                        )),
                    };
                match platform::play_voicemeeter_test_tone(
                    &self.settings.device_id,
                    duration_ms,
                    frequency_hz,
                    &voicemeeter_bus,
                ) {
                    Ok(test_tone_result) => {
                        let mut remote_status = remote_status;
                        remote_status.level_probe = test_tone_result.level_probe;
                        self.mode_probe = Some(ModeProbe {
                            requested_mode: AudioOutputMode::Voicemeeter,
                            backend: AudioOutputBackend::Native,
                            backend_available: true,
                            active_mode: Some(AudioOutputMode::Voicemeeter),
                            exclusive_probe: None,
                            bit_perfect: None,
                            voicemeeter_remote: Some(remote_status),
                            reason: format!(
                                "Voicemeeter test tone completed through virtual input: {}",
                                test_tone_result.device_id
                            ),
                        });
                    }
                    Err(error) => {
                        self.mode_probe = Some(ModeProbe {
                            requested_mode: AudioOutputMode::Voicemeeter,
                            backend: AudioOutputBackend::Unavailable,
                            backend_available: false,
                            active_mode: None,
                            exclusive_probe: None,
                            bit_perfect: None,
                            voicemeeter_remote: Some(remote_status),
                            reason: format!(
                                "Voicemeeter test tone failed: {}",
                                format_error_chain(&error)
                            ),
                        });
                    }
                }
            }
        }

        if self.settings.mode == AudioOutputMode::Exclusive && self.settings.fallback_to_shared {
            self.reopen_shared_stream_if_needed();
        }

        Ok(())
    }

    fn probe_exclusive_lock(&mut self) -> Result<()> {
        if !self.enabled {
            return Err(anyhow!(
                "Native audio output must be enabled before probing WASAPI exclusive lock."
            ));
        }

        if self.settings.mode != AudioOutputMode::Exclusive {
            self.mode_probe = Some(ModeProbe {
                requested_mode: self.settings.mode,
                backend: AudioOutputBackend::Unavailable,
                backend_available: false,
                active_mode: None,
                exclusive_probe: None,
                bit_perfect: None,
                voicemeeter_remote: None,
                reason: "WASAPI exclusive lock probe requires true exclusive mode.".to_string(),
            });
            return Ok(());
        }

        if self.playback.is_some() {
            self.mode_probe = Some(ModeProbe {
                requested_mode: AudioOutputMode::Exclusive,
                backend: AudioOutputBackend::Unavailable,
                backend_available: false,
                active_mode: None,
                exclusive_probe: None,
                bit_perfect: None,
                voicemeeter_remote: None,
                reason: "Stop native playback before probing WASAPI exclusive lock.".to_string(),
            });
            return Ok(());
        }

        self.shared_stream = None;
        match platform::probe_exclusive_lock(&self.settings.device_id, self.settings.buffer_frames)
        {
            Ok(probe_result) => {
                let probe_passed = probe_result.status == ExclusiveProbeStatus::Passed;
                let reason_prefix = if probe_passed {
                    "WASAPI exclusive lock probe passed."
                } else {
                    "WASAPI exclusive lock probe failed:"
                };
                self.mode_probe = Some(ModeProbe {
                    requested_mode: AudioOutputMode::Exclusive,
                    backend: if probe_passed {
                        AudioOutputBackend::Native
                    } else {
                        AudioOutputBackend::Unavailable
                    },
                    backend_available: probe_passed,
                    active_mode: probe_passed.then_some(AudioOutputMode::Exclusive),
                    exclusive_probe: Some(probe_result.clone()),
                    bit_perfect: None,
                    voicemeeter_remote: None,
                    reason: format!("{reason_prefix} {}", probe_result.summary()),
                });
            }
            Err(error) => {
                let reason = format_error_chain(&error);
                self.mode_probe = Some(ModeProbe {
                    requested_mode: AudioOutputMode::Exclusive,
                    backend: AudioOutputBackend::Unavailable,
                    backend_available: false,
                    active_mode: None,
                    exclusive_probe: Some(ExclusiveProbeResult::failed(reason.clone())),
                    bit_perfect: None,
                    voicemeeter_remote: None,
                    reason: format!("WASAPI exclusive lock probe failed: {reason}"),
                });
            }
        }
        self.reopen_shared_stream_if_needed();

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
            AudioOutputMode::Shared if self.settings.bit_perfect_required => Err(anyhow!(
                "Bit-perfect required playback needs WASAPI exclusive raw PCM passthrough; shared mode is not allowed."
            )),
            AudioOutputMode::Shared => self.start_shared_file_playback(path, payload, sink),
            AudioOutputMode::Exclusive => {
                let fallback_to_shared =
                    self.settings.fallback_to_shared && !self.settings.bit_perfect_required;
                match self.start_exclusive_file_playback(
                    path.clone(),
                    payload.clone(),
                    sink.clone(),
                ) {
                    Ok(()) => Ok(()),
                    Err(exclusive_error) if fallback_to_shared => {
                        let exclusive_reason = format_error_chain(&exclusive_error);
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
            AudioOutputMode::Voicemeeter if self.settings.bit_perfect_required => Err(anyhow!(
                "Bit-perfect required playback needs WASAPI exclusive raw PCM passthrough; Voicemeeter routing is not allowed."
            )),
            AudioOutputMode::Voicemeeter => self.start_voicemeeter_file_playback(path, payload, sink),
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
            self.playback_token = None;
            self.native_playback_error = None;
            return;
        }

        if mark_stopped {
            self.playback_state = PlaybackState::Stopped;
            self.playback_source = None;
            self.playback_token = None;
            self.native_playback_error = None;
        }
    }

    fn stop_current_mode(&mut self) {
        self.stop_playback(true);
        self.shared_stream = None;
        self.mode_probe = self
            .restore_voicemeeter_route()
            .map(Self::create_voicemeeter_restore_probe);
    }

    fn shutdown(&mut self) {
        self.stop_playback(true);
        self.shared_stream = None;
        let _ = self.restore_voicemeeter_route();
        self.enabled = false;
        self.stream_reason = None;
        self.mode_probe = None;
    }

    fn prepare_voicemeeter_route(
        &mut self,
        resolved_device_id: &str,
        selected_name_hint: &str,
        bus: &str,
        hardware_out_config: Option<&VoicemeeterHardwareOutConfig>,
    ) -> VoicemeeterRemoteStatus {
        let route_already_managed = self.voicemeeter_route.as_ref().is_some_and(|snapshot| {
            snapshot.matches_request(resolved_device_id, selected_name_hint, bus)
        });
        if !route_already_managed {
            let _ = self.restore_voicemeeter_route();
        }

        let result = platform::prepare_voicemeeter_remote_route(
            resolved_device_id,
            selected_name_hint,
            bus,
            hardware_out_config,
        );
        self.remember_prepared_voicemeeter_route(
            result.snapshot,
            resolved_device_id,
            selected_name_hint,
            bus,
        );

        let mut status = result.status;
        if self.voicemeeter_route.as_ref().is_some_and(|snapshot| {
            snapshot.matches_request(resolved_device_id, selected_name_hint, bus)
        }) {
            status.route_managed = Some(status.route_applied.unwrap_or(false));
        }

        status
    }

    fn remember_prepared_voicemeeter_route(
        &mut self,
        prepared_snapshot: Option<VoicemeeterRouteSnapshot>,
        resolved_device_id: &str,
        selected_name_hint: &str,
        bus: &str,
    ) {
        if self.voicemeeter_route.as_ref().is_some_and(|snapshot| {
            snapshot.matches_request(resolved_device_id, selected_name_hint, bus)
        }) {
            return;
        }

        if let Some(snapshot) = prepared_snapshot {
            self.voicemeeter_route = Some(snapshot);
        }
    }

    fn restore_voicemeeter_route(&mut self) -> Option<VoicemeeterRemoteStatus> {
        if let Some(snapshot) = self.voicemeeter_route.take() {
            #[cfg(test)]
            {
                return Some(VoicemeeterRemoteStatus {
                    available: true,
                    connected: true,
                    route_applied: Some(true),
                    route_managed: Some(false),
                    route_bus: Some(normalize_voicemeeter_bus(&snapshot.bus).to_string()),
                    hardware_out_applied: None,
                    hardware_out_bus: None,
                    hardware_out_driver: None,
                    hardware_out_device: None,
                    kind: None,
                    version: None,
                    virtual_input_strip: Some(snapshot.strip),
                    dll_path: None,
                    level_probe: None,
                    reason: Some(format!(
                        "Voicemeeter Remote API restored Strip[{}].{}.",
                        snapshot.strip,
                        normalize_voicemeeter_bus(&snapshot.bus)
                    )),
                });
            }
            #[cfg(not(test))]
            {
                return Some(platform::restore_voicemeeter_remote_route(&snapshot));
            }
        }

        None
    }

    fn create_voicemeeter_restore_probe(status: VoicemeeterRemoteStatus) -> ModeProbe {
        let restored = status.available && status.connected && status.route_applied == Some(true);
        let reason = status.reason.clone().unwrap_or_else(|| {
            if restored {
                "Voicemeeter route restored.".to_string()
            } else {
                "Voicemeeter route restore failed.".to_string()
            }
        });

        ModeProbe {
            requested_mode: AudioOutputMode::Voicemeeter,
            backend: if restored {
                AudioOutputBackend::Native
            } else {
                AudioOutputBackend::Unavailable
            },
            backend_available: restored,
            active_mode: None,
            exclusive_probe: None,
            bit_perfect: None,
            voicemeeter_remote: Some(status),
            reason,
        }
    }

    fn set_playback_volume(&mut self, payload: PlaybackVolumePayload) {
        if let Some(playback) = &self.playback {
            playback
                .volume_bits
                .store(payload.volume.clamp(0.0, 1.0).to_bits(), Ordering::SeqCst);
        }
    }

    fn mark_playback_error(
        &mut self,
        source: Option<String>,
        playback_token: Option<String>,
        reason: String,
        sink: &EventSink,
    ) {
        let playback_token = playback_token.or_else(|| self.playback_token.clone());
        let previous_voicemeeter_remote_status = self
            .mode_probe
            .as_ref()
            .filter(|probe| probe.requested_mode == AudioOutputMode::Voicemeeter)
            .and_then(|probe| probe.voicemeeter_remote.clone());
        self.stop_playback(false);
        let voicemeeter_restore_status = self.restore_voicemeeter_route();
        let combined_reason = voicemeeter_restore_status
            .as_ref()
            .and_then(|status| status.reason.as_ref())
            .map(|restore_reason| format!("{reason}; {restore_reason}"))
            .unwrap_or_else(|| reason.clone());
        let voicemeeter_remote_status =
            voicemeeter_restore_status.or(previous_voicemeeter_remote_status);
        self.playback_state = PlaybackState::Error;
        self.playback_source = source.clone();
        self.playback_token = playback_token.clone();
        self.native_playback_error =
            create_native_playback_error_for_mode(self.settings.mode, &reason);
        self.mode_probe = Some(ModeProbe {
            requested_mode: self.settings.mode,
            backend: AudioOutputBackend::Unavailable,
            backend_available: false,
            active_mode: None,
            exclusive_probe: None,
            bit_perfect: None,
            voicemeeter_remote: voicemeeter_remote_status,
            reason: combined_reason,
        });
        sink.emit_playback_with_error(
            PlaybackState::Error,
            false,
            false,
            source,
            None,
            playback_token,
            Some(reason),
            self.native_playback_error.clone(),
        );
    }

    fn current_voicemeeter_route_error(&self) -> Option<String> {
        if self.settings.mode != AudioOutputMode::Voicemeeter {
            return None;
        }

        let probe = self
            .mode_probe
            .as_ref()
            .filter(|probe| probe.requested_mode == AudioOutputMode::Voicemeeter)?;
        if probe.backend_available {
            return None;
        }

        Some(
            probe
                .voicemeeter_remote
                .as_ref()
                .and_then(|status| status.reason.clone())
                .unwrap_or_else(|| probe.reason.clone()),
        )
    }

    fn start_shared_file_playback(
        &mut self,
        path: String,
        payload: PlayFilePayload,
        sink: EventSink,
    ) -> Result<()> {
        self.start_shared_file_playback_on_device(
            path,
            payload,
            sink,
            self.settings.device_id.clone(),
            Some(AudioOutputMode::Shared),
            None,
            "Shared native file playback is running.",
        )
    }

    fn start_voicemeeter_file_playback(
        &mut self,
        path: String,
        payload: PlayFilePayload,
        sink: EventSink,
    ) -> Result<()> {
        if let Some(reason) = self.current_voicemeeter_route_error() {
            return Err(anyhow!(reason));
        }

        let device_id = platform::resolve_voicemeeter_output_device_id(&self.settings.device_id)?;
        let selected_name_hint = self.settings.device_id.clone();
        let route_name_hint = voicemeeter_route_name_hint(&selected_name_hint, &device_id);
        let voicemeeter_bus = self.settings.voicemeeter_bus.clone();
        let remote_status = self.prepare_voicemeeter_route(
            &device_id,
            &route_name_hint,
            &voicemeeter_bus,
            self.settings.voicemeeter_hardware_out_config().as_ref(),
        );
        if !voicemeeter_route_ready(&remote_status) {
            return Err(anyhow!(remote_status.reason.clone().unwrap_or_else(|| {
                "Voicemeeter virtual input route is unavailable.".to_string()
            })));
        }

        self.start_shared_file_playback_on_device(
            path,
            payload,
            sink,
            device_id,
            Some(AudioOutputMode::Voicemeeter),
            Some(remote_status),
            "Voicemeeter native file playback is running.",
        )
    }

    fn start_shared_file_playback_on_device(
        &mut self,
        path: String,
        payload: PlayFilePayload,
        sink: EventSink,
        device_id: String,
        active_mode: Option<AudioOutputMode>,
        voicemeeter_remote: Option<VoicemeeterRemoteStatus>,
        reason: &'static str,
    ) -> Result<()> {
        self.stop_playback(true);
        self.shared_stream = None;

        let playback_token = payload.playback_token.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let paused = Arc::new(AtomicBool::new(false));
        let ended = Arc::new(AtomicBool::new(false));
        let cursor = Arc::new(AtomicUsize::new(0));
        let volume_bits = Arc::new(AtomicU32::new(payload.volume.clamp(0.0, 1.0).to_bits()));
        let sample_len = usize::MAX;
        let source = Arc::new(path);

        platform::validate_shared_playback_device(&device_id)?;
        let output_format = platform::describe_shared_output_format(&device_id)?;
        let decoded_stream = start_streaming_file_decode(
            source.as_ref().clone(),
            payload.start_seconds,
            payload.growing_expected_bytes,
            Arc::clone(&stop),
            playback_token.clone(),
            sink.clone(),
        )?;
        let bit_perfect = evaluate_bit_perfect(
            active_mode.unwrap_or(self.settings.mode),
            decoded_stream.source_format.clone(),
            output_format,
            payload.volume,
        );
        let stream = platform::build_shared_streaming_file_stream(
            &device_id,
            decoded_stream.sample_rate,
            decoded_stream.channels as u16,
            Arc::clone(&decoded_stream.pcm_buffer),
            Arc::clone(&cursor),
            Arc::clone(&paused),
            Arc::clone(&stop),
            Arc::clone(&ended),
            Arc::clone(&volume_bits),
        )
        .inspect_err(|_| {
            stop.store(true, Ordering::SeqCst);
        });
        let stream = match stream {
            Ok(stream) => stream,
            Err(error) => {
                let _ = decoded_stream.producer.join();
                return Err(error);
            }
        };
        self.stream_reason = None;
        let playback_sink = sink.clone();
        let playback_source = Arc::clone(&source);
        let playback_stop = Arc::clone(&stop);
        let playback_paused = Arc::clone(&paused);
        let playback_cursor = Arc::clone(&cursor);
        let playback_ended = Arc::clone(&ended);
        let payload_start_seconds = payload.start_seconds;
        let playback_source_sample_rate = decoded_stream.sample_rate;
        let playback_source_channels = decoded_stream.channels;
        let playback_token_for_monitor = playback_token.clone();
        let monitor = thread::spawn(move || {
            playback_sink.emit_playback(
                PlaybackState::Playing,
                true,
                false,
                Some(playback_source.as_ref().clone()),
                None,
                playback_token_for_monitor.clone(),
                Some("Native file playback is running.".to_string()),
            );

            while !playback_stop.load(Ordering::SeqCst)
                && !playback_ended.load(Ordering::SeqCst)
                && playback_cursor.load(Ordering::SeqCst) < sample_len
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
                    Some(playback_position_seconds(
                        payload_start_seconds,
                        playback_cursor.load(Ordering::SeqCst),
                        playback_source_sample_rate,
                        playback_source_channels,
                    )),
                    playback_token_for_monitor.clone(),
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
                    Some(playback_position_seconds(
                        payload_start_seconds,
                        playback_cursor.load(Ordering::SeqCst),
                        playback_source_sample_rate,
                        playback_source_channels,
                    )),
                    playback_token_for_monitor.clone(),
                    Some("Native file playback stopped.".to_string()),
                );
            } else {
                playback_sink.emit_playback(
                    PlaybackState::Ended,
                    false,
                    false,
                    Some(playback_source.as_ref().clone()),
                    Some(playback_position_seconds(
                        payload_start_seconds,
                        playback_cursor.load(Ordering::SeqCst),
                        playback_source_sample_rate,
                        playback_source_channels,
                    )),
                    playback_token_for_monitor.clone(),
                    Some("Native file playback completed.".to_string()),
                );
            }
        });

        self.playback = Some(PlaybackHandle {
            stop,
            paused,
            cursor,
            sample_len,
            start_seconds: payload.start_seconds,
            sample_rate: decoded_stream.sample_rate,
            channels: decoded_stream.channels,
            ended: Some(ended),
            volume_bits,
            token: playback_token.clone(),
            _stream: Some(stream),
            monitor: Some(monitor),
            producer: Some(decoded_stream.producer),
        });
        self.playback_state = PlaybackState::Starting;
        self.playback_source = Some(source.as_ref().clone());
        self.playback_token = playback_token;
        self.mode_probe = Some(ModeProbe {
            requested_mode: self.settings.mode,
            backend: AudioOutputBackend::Native,
            backend_available: true,
            active_mode,
            exclusive_probe: None,
            bit_perfect: Some(bit_perfect),
            voicemeeter_remote,
            reason: reason.to_string(),
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

        let playback_token = payload.playback_token.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let paused = Arc::new(AtomicBool::new(false));
        let ended = Arc::new(AtomicBool::new(false));
        let cursor = Arc::new(AtomicUsize::new(0));
        let volume_bits = Arc::new(AtomicU32::new(payload.volume.clamp(0.0, 1.0).to_bits()));
        let sample_len = usize::MAX;
        let source = Arc::new(path);
        let device_id = self.settings.device_id.clone();
        let buffer_frames = self.settings.buffer_frames;

        let exclusive_device_name = platform::describe_exclusive_playback_device(&device_id)?;
        if self.try_start_exclusive_raw_pcm_playback(
            Arc::clone(&source),
            &payload,
            sink.clone(),
            device_id.clone(),
            buffer_frames,
            exclusive_device_name.clone(),
        )? {
            return Ok(());
        }
        if self.settings.bit_perfect_required {
            return Err(anyhow!(
                "Bit-perfect required playback could not start because the source was not a WASAPI exclusive raw PCM passthrough candidate."
            ));
        }

        let decoded_stream = start_streaming_file_decode(
            source.as_ref().clone(),
            payload.start_seconds,
            payload.growing_expected_bytes,
            Arc::clone(&stop),
            playback_token.clone(),
            sink.clone(),
        )?;
        let source_sample_rate = decoded_stream.sample_rate;
        let source_channels = decoded_stream.channels as u16;
        let output_format = match platform::describe_exclusive_output_format(
            &device_id,
            source_sample_rate,
            source_channels,
        ) {
            Ok(output_format) => output_format,
            Err(error) => {
                stop.store(true, Ordering::SeqCst);
                let _ = decoded_stream.producer.join();
                return Err(error);
            }
        };
        let bit_perfect = evaluate_bit_perfect(
            AudioOutputMode::Exclusive,
            decoded_stream.source_format.clone(),
            output_format,
            payload.volume,
        );
        let playback_sink = sink.clone();
        let playback_source = Arc::clone(&source);
        let playback_stop = Arc::clone(&stop);
        let playback_paused = Arc::clone(&paused);
        let playback_cursor = Arc::clone(&cursor);
        let playback_ended = Arc::clone(&ended);
        let playback_pcm_buffer = Arc::clone(&decoded_stream.pcm_buffer);
        let playback_volume_bits = Arc::clone(&volume_bits);
        let playback_device_name = exclusive_device_name.clone();
        let payload_start_seconds = payload.start_seconds;
        let playback_source_sample_rate = decoded_stream.sample_rate;
        let playback_source_channels = decoded_stream.channels;
        let playback_token_for_monitor = playback_token.clone();
        let monitor = thread::spawn(move || {
            playback_sink.emit_playback(
                PlaybackState::Starting,
                true,
                false,
                Some(playback_source.as_ref().clone()),
                Some(payload_start_seconds),
                playback_token_for_monitor.clone(),
                Some(format!(
                    "Native WASAPI exclusive file playback is starting on device: {playback_device_name}"
                )),
            );

            let started_sink = playback_sink.clone();
            let started_source = Arc::clone(&playback_source);
            let started_token = playback_token_for_monitor.clone();
            let started_device_name = playback_device_name.clone();
            match platform::play_exclusive_file(
                &device_id,
                buffer_frames,
                source_sample_rate,
                source_channels,
                Arc::clone(&playback_pcm_buffer),
                Arc::clone(&playback_cursor),
                Arc::clone(&playback_paused),
                Arc::clone(&playback_stop),
                Arc::clone(&playback_ended),
                Arc::clone(&playback_volume_bits),
                move || {
                    started_sink.emit_playback(
                        PlaybackState::Playing,
                        true,
                        false,
                        Some(started_source.as_ref().clone()),
                        Some(payload_start_seconds),
                        started_token,
                        Some(format!(
                            "Native WASAPI exclusive file playback is running on device: {started_device_name}"
                        )),
                    );
                },
            ) {
                Ok(PlaybackCompletion::Ended) => playback_sink.emit_playback(
                    PlaybackState::Ended,
                    false,
                    false,
                    Some(playback_source.as_ref().clone()),
                    Some(playback_position_seconds(
                        payload_start_seconds,
                        playback_cursor.load(Ordering::SeqCst),
                        playback_source_sample_rate,
                        playback_source_channels,
                    )),
                    playback_token_for_monitor.clone(),
                    Some("Native WASAPI exclusive file playback completed.".to_string()),
                ),
                Ok(PlaybackCompletion::Stopped) => playback_sink.emit_playback(
                    PlaybackState::Stopped,
                    false,
                    false,
                    Some(playback_source.as_ref().clone()),
                    Some(playback_position_seconds(
                        payload_start_seconds,
                        playback_cursor.load(Ordering::SeqCst),
                        playback_source_sample_rate,
                        playback_source_channels,
                    )),
                    playback_token_for_monitor.clone(),
                    Some("Native WASAPI exclusive file playback stopped.".to_string()),
                ),
                Err(error) => {
                    let reason = format_error_chain(&error);
                    let native_playback_error =
                        create_native_playback_error_for_mode(AudioOutputMode::Exclusive, &reason);
                    playback_stop.store(true, Ordering::SeqCst);
                    playback_ended.store(true, Ordering::SeqCst);
                    playback_sink.emit_playback_with_error(
                        PlaybackState::Error,
                        false,
                        false,
                        Some(playback_source.as_ref().clone()),
                        Some(playback_position_seconds(
                            payload_start_seconds,
                            playback_cursor.load(Ordering::SeqCst),
                            playback_source_sample_rate,
                            playback_source_channels,
                        )),
                        playback_token_for_monitor.clone(),
                        Some(format!(
                            "Native WASAPI exclusive file playback failed: {reason}"
                        )),
                        native_playback_error,
                    );
                }
            }
        });

        self.playback = Some(PlaybackHandle {
            stop,
            paused,
            cursor,
            sample_len,
            start_seconds: payload.start_seconds,
            sample_rate: decoded_stream.sample_rate,
            channels: decoded_stream.channels,
            ended: Some(ended),
            volume_bits,
            token: playback_token.clone(),
            _stream: None,
            monitor: Some(monitor),
            producer: Some(decoded_stream.producer),
        });
        self.playback_state = PlaybackState::Starting;
        self.playback_source = Some(source.as_ref().clone());
        self.playback_token = playback_token;
        self.mode_probe = Some(ModeProbe {
            requested_mode: AudioOutputMode::Exclusive,
            backend: AudioOutputBackend::Native,
            backend_available: true,
            active_mode: Some(AudioOutputMode::Exclusive),
            exclusive_probe: None,
            bit_perfect: Some(bit_perfect),
            voicemeeter_remote: None,
            reason: format!(
                "WASAPI exclusive native file playback is running on device: {exclusive_device_name}"
            ),
        });

        Ok(())
    }

    fn try_start_exclusive_raw_pcm_playback(
        &mut self,
        source: Arc<String>,
        payload: &PlayFilePayload,
        sink: EventSink,
        device_id: String,
        buffer_frames: u32,
        exclusive_device_name: String,
    ) -> Result<bool> {
        if payload.growing_expected_bytes.is_some() {
            return Ok(false);
        }

        let Ok(raw_pcm_audio) =
            load_raw_pcm_for_passthrough(source.as_ref(), payload.start_seconds)
        else {
            return Ok(false);
        };
        let Ok(output_format) = platform::describe_exclusive_output_format(
            &device_id,
            raw_pcm_audio.sample_rate,
            raw_pcm_audio.channels,
        ) else {
            return Ok(false);
        };
        let bit_perfect = evaluate_bit_perfect(
            AudioOutputMode::Exclusive,
            raw_pcm_audio.source_format(),
            output_format,
            payload.volume,
        );
        if bit_perfect.status != BitPerfectStatus::Candidate {
            return Ok(false);
        }
        self.start_exclusive_raw_pcm_playback(
            source,
            Arc::new(raw_pcm_audio),
            bit_perfect,
            sink,
            device_id,
            buffer_frames,
            exclusive_device_name,
            payload.volume,
            payload.start_seconds,
            payload.playback_token.clone(),
        );

        Ok(true)
    }

    fn start_exclusive_raw_pcm_playback(
        &mut self,
        source: Arc<String>,
        raw_pcm_audio: Arc<RawPcmAudio>,
        bit_perfect: BitPerfectDiagnostics,
        sink: EventSink,
        device_id: String,
        buffer_frames: u32,
        exclusive_device_name: String,
        volume: f32,
        start_seconds: f64,
        playback_token: Option<String>,
    ) {
        let stop = Arc::new(AtomicBool::new(false));
        let paused = Arc::new(AtomicBool::new(false));
        let ended = Arc::new(AtomicBool::new(false));
        let cursor = Arc::new(AtomicUsize::new(0));
        let volume_bits = Arc::new(AtomicU32::new(volume.clamp(0.0, 1.0).to_bits()));
        let sample_len = raw_pcm_audio.sample_count();

        let playback_sink = sink.clone();
        let playback_source = Arc::clone(&source);
        let playback_stop = Arc::clone(&stop);
        let playback_paused = Arc::clone(&paused);
        let playback_cursor = Arc::clone(&cursor);
        let playback_ended = Arc::clone(&ended);
        let playback_volume_bits = Arc::clone(&volume_bits);
        let playback_raw_pcm_audio = Arc::clone(&raw_pcm_audio);
        let playback_device_name = exclusive_device_name.clone();
        let playback_start_seconds = start_seconds;
        let playback_source_sample_rate = raw_pcm_audio.sample_rate;
        let playback_source_channels = usize::from(raw_pcm_audio.channels.max(1));
        let playback_token_for_monitor = playback_token.clone();
        let monitor = thread::spawn(move || {
            playback_sink.emit_playback(
                PlaybackState::Starting,
                true,
                false,
                Some(playback_source.as_ref().clone()),
                Some(playback_start_seconds),
                playback_token_for_monitor.clone(),
                Some(format!(
                    "Native WASAPI exclusive raw PCM playback is starting on device: {playback_device_name}"
                )),
            );

            let started_sink = playback_sink.clone();
            let started_source = Arc::clone(&playback_source);
            let started_token = playback_token_for_monitor.clone();
            let started_device_name = playback_device_name.clone();
            match platform::play_exclusive_raw_pcm_file(
                &device_id,
                buffer_frames,
                playback_raw_pcm_audio,
                Arc::clone(&playback_cursor),
                Arc::clone(&playback_paused),
                Arc::clone(&playback_stop),
                Arc::clone(&playback_ended),
                Arc::clone(&playback_volume_bits),
                move || {
                    started_sink.emit_playback(
                        PlaybackState::Playing,
                        true,
                        false,
                        Some(started_source.as_ref().clone()),
                        Some(playback_start_seconds),
                        started_token,
                        Some(format!(
                            "Native WASAPI exclusive raw PCM playback is running on device: {started_device_name}"
                        )),
                    );
                },
            ) {
                Ok(PlaybackCompletion::Ended) => playback_sink.emit_playback(
                    PlaybackState::Ended,
                    false,
                    false,
                    Some(playback_source.as_ref().clone()),
                    Some(playback_position_seconds(
                        playback_start_seconds,
                        playback_cursor.load(Ordering::SeqCst),
                        playback_source_sample_rate,
                        playback_source_channels,
                    )),
                    playback_token_for_monitor.clone(),
                    Some("Native WASAPI exclusive raw PCM playback completed.".to_string()),
                ),
                Ok(PlaybackCompletion::Stopped) => playback_sink.emit_playback(
                    PlaybackState::Stopped,
                    false,
                    false,
                    Some(playback_source.as_ref().clone()),
                    Some(playback_position_seconds(
                        playback_start_seconds,
                        playback_cursor.load(Ordering::SeqCst),
                        playback_source_sample_rate,
                        playback_source_channels,
                    )),
                    playback_token_for_monitor.clone(),
                    Some("Native WASAPI exclusive raw PCM playback stopped.".to_string()),
                ),
                Err(error) => {
                    let reason = format_error_chain(&error);
                    let native_playback_error =
                        create_native_playback_error_for_mode(AudioOutputMode::Exclusive, &reason);
                    playback_stop.store(true, Ordering::SeqCst);
                    playback_ended.store(true, Ordering::SeqCst);
                    playback_sink.emit_playback_with_error(
                        PlaybackState::Error,
                        false,
                        false,
                        Some(playback_source.as_ref().clone()),
                        Some(playback_position_seconds(
                            playback_start_seconds,
                            playback_cursor.load(Ordering::SeqCst),
                            playback_source_sample_rate,
                            playback_source_channels,
                        )),
                        playback_token_for_monitor.clone(),
                        Some(format!(
                            "Native WASAPI exclusive raw PCM playback failed: {reason}"
                        )),
                        native_playback_error,
                    );
                }
            }
        });

        self.playback = Some(PlaybackHandle {
            stop,
            paused,
            cursor,
            sample_len,
            start_seconds,
            sample_rate: raw_pcm_audio.sample_rate,
            channels: usize::from(raw_pcm_audio.channels.max(1)),
            ended: Some(ended),
            volume_bits,
            token: playback_token.clone(),
            _stream: None,
            monitor: Some(monitor),
            producer: None,
        });
        self.playback_state = PlaybackState::Starting;
        self.playback_source = Some(source.as_ref().clone());
        self.playback_token = playback_token;
        self.mode_probe = Some(ModeProbe {
            requested_mode: AudioOutputMode::Exclusive,
            backend: AudioOutputBackend::Native,
            backend_available: true,
            active_mode: Some(AudioOutputMode::Exclusive),
            exclusive_probe: None,
            bit_perfect: Some(bit_perfect),
            voicemeeter_remote: None,
            reason: format!(
                "WASAPI exclusive raw PCM playback is running on device: {exclusive_device_name}"
            ),
        });
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
            position_seconds: self
                .playback
                .as_ref()
                .map(|playback| playback.position_seconds()),
            token: self
                .playback
                .as_ref()
                .and_then(|playback| playback.token.clone())
                .or_else(|| self.playback_token.clone()),
        }
    }
}

fn create_native_playback_error_for_mode(
    mode: AudioOutputMode,
    reason: &str,
) -> Option<NativePlaybackError> {
    if mode != AudioOutputMode::Exclusive || !reason.to_ascii_lowercase().contains("wasapi") {
        return None;
    }

    Some(NativePlaybackError {
        code: NativePlaybackErrorCode::WasapiExclusiveFailed,
        native_error_code: extract_native_audio_error_code(reason),
        retryable: false,
    })
}

fn extract_native_audio_error_code(reason: &str) -> Option<String> {
    reason
        .split(|character: char| {
            !(character.is_ascii_alphanumeric() || character == '_' || character == 'x')
        })
        .find(|part| part.starts_with("AUDCLNT_E_") || part.starts_with("0x"))
        .filter(|part| !part.is_empty())
        .map(ToString::to_string)
}

impl Drop for AudioOutputRuntime {
    fn drop(&mut self) {
        self.stop_playback(true);
        self.shared_stream = None;
        let _ = self.restore_voicemeeter_route();
    }
}

struct PlaybackSnapshot {
    running: bool,
    paused: bool,
    source: Option<String>,
    state: PlaybackState,
    position_seconds: Option<f64>,
    token: Option<String>,
}

struct PlaybackHandle {
    stop: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    cursor: Arc<AtomicUsize>,
    sample_len: usize,
    start_seconds: f64,
    sample_rate: u32,
    channels: usize,
    ended: Option<Arc<AtomicBool>>,
    volume_bits: Arc<AtomicU32>,
    token: Option<String>,
    _stream: Option<Stream>,
    monitor: Option<JoinHandle<()>>,
    producer: Option<JoinHandle<()>>,
}

impl PlaybackHandle {
    fn is_ended(&self) -> bool {
        if self
            .ended
            .as_ref()
            .is_some_and(|ended| ended.load(Ordering::SeqCst))
        {
            return true;
        }

        self.cursor.load(Ordering::SeqCst) >= self.sample_len
    }

    fn is_running(&self) -> bool {
        !self.stop.load(Ordering::SeqCst) && !self.is_ended()
    }

    fn join(&mut self) {
        if let Some(monitor) = self.monitor.take() {
            let _ = monitor.join();
        }
        if let Some(producer) = self.producer.take() {
            let _ = producer.join();
        }
    }

    fn position_seconds(&self) -> f64 {
        playback_position_seconds(
            self.start_seconds,
            self.cursor.load(Ordering::SeqCst),
            self.sample_rate,
            self.channels,
        )
    }
}

fn playback_position_seconds(
    start_seconds: f64,
    cursor_samples: usize,
    sample_rate: u32,
    channels: usize,
) -> f64 {
    let normalized_start = if start_seconds.is_finite() && start_seconds > 0.0 {
        start_seconds
    } else {
        0.0
    };
    if sample_rate == 0 || channels == 0 {
        return normalized_start;
    }

    normalized_start + cursor_samples as f64 / channels.max(1) as f64 / sample_rate.max(1) as f64
}

impl Default for AudioOutputSettings {
    fn default() -> Self {
        Self {
            mode: AudioOutputMode::Shared,
            device_id: String::new(),
            buffer_frames: DEFAULT_BUFFER_FRAMES,
            fallback_to_shared: true,
            bit_perfect_required: false,
            voicemeeter_bus: DEFAULT_VOICEMEETER_BUS.to_string(),
            voicemeeter_hardware_out_bus: DEFAULT_VOICEMEETER_HARDWARE_OUT_BUS.to_string(),
            voicemeeter_hardware_out_driver: DEFAULT_VOICEMEETER_HARDWARE_OUT_DRIVER.to_string(),
            voicemeeter_hardware_out_device: String::new(),
            diagnostics_enabled: false,
        }
    }
}

impl AudioOutputSettings {
    fn normalized(mut self) -> Self {
        self.device_id = self.device_id.trim().to_string();
        self.buffer_frames = self.buffer_frames.clamp(128, 8192);
        self.voicemeeter_bus = normalize_voicemeeter_bus(&self.voicemeeter_bus).to_string();
        self.voicemeeter_hardware_out_bus =
            normalize_voicemeeter_hardware_out_bus(&self.voicemeeter_hardware_out_bus).to_string();
        self.voicemeeter_hardware_out_driver =
            normalize_voicemeeter_hardware_out_driver(&self.voicemeeter_hardware_out_driver)
                .to_string();
        self.voicemeeter_hardware_out_device =
            self.voicemeeter_hardware_out_device.trim().to_string();
        if self.mode != AudioOutputMode::Exclusive {
            self.bit_perfect_required = false;
        }
        self
    }

    fn voicemeeter_hardware_out_config(&self) -> Option<VoicemeeterHardwareOutConfig> {
        let device = self.voicemeeter_hardware_out_device.trim();
        if device.is_empty() {
            return None;
        }

        Some(VoicemeeterHardwareOutConfig {
            bus: normalize_voicemeeter_hardware_out_bus(&self.voicemeeter_hardware_out_bus)
                .to_string(),
            driver: normalize_voicemeeter_hardware_out_driver(
                &self.voicemeeter_hardware_out_driver,
            )
            .to_string(),
            device: device.to_string(),
        })
    }
}

fn normalize_voicemeeter_bus(value: &str) -> &'static str {
    match value.trim().to_ascii_uppercase().as_str() {
        "A1" => "A1",
        "A2" => "A2",
        "A3" => "A3",
        "B1" => "B1",
        "B2" => "B2",
        "B3" => "B3",
        _ => DEFAULT_VOICEMEETER_BUS,
    }
}

fn normalize_voicemeeter_hardware_out_bus(value: &str) -> &'static str {
    match value.trim().to_ascii_uppercase().as_str() {
        "A1" => "A1",
        "A2" => "A2",
        "A3" => "A3",
        _ => DEFAULT_VOICEMEETER_HARDWARE_OUT_BUS,
    }
}

fn normalize_voicemeeter_hardware_out_driver(value: &str) -> &'static str {
    match value.trim().to_ascii_lowercase().as_str() {
        "wdm" => "wdm",
        "mme" => "mme",
        "ks" => "ks",
        "asio" => "asio",
        _ => DEFAULT_VOICEMEETER_HARDWARE_OUT_DRIVER,
    }
}

fn voicemeeter_hardware_out_bus_index(bus: &str) -> usize {
    match normalize_voicemeeter_hardware_out_bus(bus) {
        "A2" => 1,
        "A3" => 2,
        _ => 0,
    }
}

fn voicemeeter_hardware_out_parameter_name(config: &VoicemeeterHardwareOutConfig) -> String {
    format!(
        "Bus[{}].Device.{}",
        voicemeeter_hardware_out_bus_index(&config.bus),
        normalize_voicemeeter_hardware_out_driver(&config.driver)
    )
}

fn voicemeeter_route_ready(status: &VoicemeeterRemoteStatus) -> bool {
    status.available
        && status.connected
        && status.route_applied.unwrap_or(true)
        && status.hardware_out_applied.unwrap_or(true)
}

fn voicemeeter_route_name_hint(selected_name_hint: &str, resolved_device_id: &str) -> String {
    let selected_name_hint = selected_name_hint.trim();
    if selected_name_hint.is_empty() {
        return resolved_device_id.to_string();
    }

    selected_name_hint.to_string()
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

        match handle_command(&mut runtime, &sink, command) {
            Ok(true) => {}
            Ok(false) => break,
            Err(error) => sink.error(format_error_chain(&error)),
        }
    }

    Ok(())
}

fn handle_command(
    runtime: &mut AudioOutputRuntime,
    sink: &EventSink,
    command: IncomingCommand,
) -> Result<bool> {
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
            emit_status(runtime, sink)?;
            Ok(true)
        }
        "configure" => {
            runtime.configure(parse_payload(command.payload)?);
            emit_status(runtime, sink)?;
            Ok(true)
        }
        "playTestTone" => {
            runtime.play_test_tone(parse_payload(command.payload)?)?;
            emit_status(runtime, sink)?;
            Ok(true)
        }
        "probeExclusiveLock" => {
            runtime.probe_exclusive_lock()?;
            emit_status(runtime, sink)?;
            Ok(true)
        }
        "playFile" => {
            let payload = parse_payload::<PlayFilePayload>(command.payload)?;
            let source = payload.path.trim().to_string();
            let playback_token = payload.playback_token.clone();
            match runtime.play_file(payload, sink.clone()) {
                Ok(()) => {
                    emit_status(runtime, sink)?;
                    Ok(true)
                }
                Err(error) => {
                    let reason = format_error_chain(&error);
                    runtime.mark_playback_error(
                        (!source.is_empty()).then_some(source),
                        playback_token,
                        reason,
                        sink,
                    );
                    emit_status(runtime, sink)?;
                    Ok(true)
                }
            }
        }
        "pausePlayback" => {
            runtime.pause_playback();
            emit_status(runtime, sink)?;
            Ok(true)
        }
        "resumePlayback" => {
            runtime.resume_playback();
            emit_status(runtime, sink)?;
            Ok(true)
        }
        "stopPlaybackOnly" => {
            runtime.stop_playback(true);
            emit_status(runtime, sink)?;
            Ok(true)
        }
        "stopPlayback" => {
            runtime.stop_current_mode();
            emit_status(runtime, sink)?;
            Ok(true)
        }
        "setPlaybackVolume" => {
            runtime.set_playback_volume(parse_payload(command.payload)?);
            emit_status(runtime, sink)?;
            Ok(true)
        }
        "enumerateDevices" => {
            emit_devices(runtime, sink)?;
            Ok(true)
        }
        "shutdown" => {
            runtime.shutdown();
            emit_status(runtime, sink)?;
            Ok(false)
        }
        other => Err(anyhow!("Unknown command type: {other}")),
    }
}

#[cfg(test)]
mod runtime_tests {
    use super::*;

    #[test]
    fn shutdown_command_stops_runtime_and_requests_main_loop_exit() {
        let mut runtime = AudioOutputRuntime::new();
        runtime.enabled = true;
        runtime.playback_state = PlaybackState::Playing;
        runtime.playback_source = Some("D:\\Music\\track.wav".to_string());

        let should_continue = handle_command(
            &mut runtime,
            &EventSink::test(),
            IncomingCommand {
                command_type: "shutdown".to_string(),
                payload: Value::Null,
            },
        )
        .unwrap();

        assert!(!should_continue);
        assert!(!runtime.enabled);
        assert_eq!(runtime.playback_state, PlaybackState::Stopped);
        assert!(runtime.playback_source.is_none());
        assert!(runtime.shared_stream.is_none());
        assert!(runtime.mode_probe.is_none());
    }

    #[test]
    fn exclusive_lock_probe_command_requires_exclusive_mode() {
        let mut runtime = AudioOutputRuntime::new();
        runtime.enabled = true;

        let should_continue = handle_command(
            &mut runtime,
            &EventSink::test(),
            IncomingCommand {
                command_type: "probeExclusiveLock".to_string(),
                payload: Value::Null,
            },
        )
        .unwrap();

        assert!(should_continue);
        let probe = runtime.mode_probe.as_ref().unwrap();
        assert_eq!(probe.requested_mode, AudioOutputMode::Shared);
        assert!(!probe.backend_available);
        assert_eq!(
            probe.reason,
            "WASAPI exclusive lock probe requires true exclusive mode."
        );
    }

    #[test]
    fn normalizes_voicemeeter_bus_settings() {
        assert_eq!(normalize_voicemeeter_bus(" b2 "), "B2");
        assert_eq!(normalize_voicemeeter_bus("z9"), DEFAULT_VOICEMEETER_BUS);
    }

    #[test]
    fn normalizes_voicemeeter_hardware_out_settings() {
        let settings = AudioOutputSettings {
            voicemeeter_hardware_out_bus: " a3 ".to_string(),
            voicemeeter_hardware_out_driver: " ASIO ".to_string(),
            voicemeeter_hardware_out_device: "  USB DAC  ".to_string(),
            ..AudioOutputSettings::default()
        }
        .normalized();

        assert_eq!(settings.voicemeeter_hardware_out_bus, "A3");
        assert_eq!(settings.voicemeeter_hardware_out_driver, "asio");
        assert_eq!(settings.voicemeeter_hardware_out_device, "USB DAC");

        let config = settings.voicemeeter_hardware_out_config().unwrap();
        assert_eq!(config.bus, "A3");
        assert_eq!(config.driver, "asio");
        assert_eq!(config.device, "USB DAC");
    }

    #[test]
    fn skips_voicemeeter_hardware_out_when_device_name_is_empty() {
        let settings = AudioOutputSettings {
            voicemeeter_hardware_out_bus: "A2".to_string(),
            voicemeeter_hardware_out_driver: "ks".to_string(),
            voicemeeter_hardware_out_device: "   ".to_string(),
            ..AudioOutputSettings::default()
        }
        .normalized();

        assert!(settings.voicemeeter_hardware_out_config().is_none());
    }

    #[test]
    fn normalizes_bit_perfect_required_to_exclusive_only() {
        let shared_settings = AudioOutputSettings {
            mode: AudioOutputMode::Shared,
            bit_perfect_required: true,
            ..AudioOutputSettings::default()
        }
        .normalized();
        let voicemeeter_settings = AudioOutputSettings {
            mode: AudioOutputMode::Voicemeeter,
            bit_perfect_required: true,
            ..AudioOutputSettings::default()
        }
        .normalized();
        let exclusive_settings = AudioOutputSettings {
            mode: AudioOutputMode::Exclusive,
            bit_perfect_required: true,
            ..AudioOutputSettings::default()
        }
        .normalized();

        assert!(!shared_settings.bit_perfect_required);
        assert!(!voicemeeter_settings.bit_perfect_required);
        assert!(exclusive_settings.bit_perfect_required);
    }

    #[test]
    fn maps_voicemeeter_hardware_out_parameters() {
        let cases = [
            ("A1", "wdm", "Bus[0].Device.wdm"),
            ("A2", "mme", "Bus[1].Device.mme"),
            ("A3", "asio", "Bus[2].Device.asio"),
        ];

        for (bus, driver, expected) in cases {
            let config = VoicemeeterHardwareOutConfig {
                bus: bus.to_string(),
                driver: driver.to_string(),
                device: "USB DAC".to_string(),
            };

            assert_eq!(voicemeeter_hardware_out_parameter_name(&config), expected);
        }
    }

    #[test]
    fn voicemeeter_route_ready_requires_connected_route_and_hardware_out() {
        let mut status = VoicemeeterRemoteStatus {
            available: true,
            connected: true,
            route_applied: Some(true),
            route_managed: Some(true),
            route_bus: Some("A1".to_string()),
            hardware_out_applied: None,
            hardware_out_bus: None,
            hardware_out_driver: None,
            hardware_out_device: None,
            kind: Some(VoicemeeterRemoteKind::Banana),
            version: None,
            virtual_input_strip: Some(3),
            dll_path: None,
            level_probe: None,
            reason: None,
        };

        assert!(voicemeeter_route_ready(&status));

        status.connected = false;
        assert!(!voicemeeter_route_ready(&status));

        status.connected = true;
        status.route_applied = Some(false);
        assert!(!voicemeeter_route_ready(&status));

        status.route_applied = Some(true);
        status.hardware_out_applied = Some(false);
        assert!(!voicemeeter_route_ready(&status));
    }

    #[test]
    fn voicemeeter_route_name_hint_uses_resolved_device_when_selection_is_empty() {
        assert_eq!(
            voicemeeter_route_name_hint("", "0:Voicemeeter Input (VB-Audio Voicemeeter VAIO)"),
            "0:Voicemeeter Input (VB-Audio Voicemeeter VAIO)"
        );
        assert_eq!(
            voicemeeter_route_name_hint("  ", "0:Voicemeeter Input (VB-Audio Voicemeeter VAIO)"),
            "0:Voicemeeter Input (VB-Audio Voicemeeter VAIO)"
        );
    }

    #[test]
    fn voicemeeter_route_name_hint_preserves_explicit_selection() {
        assert_eq!(
            voicemeeter_route_name_hint(
                "14:Voicemeeter AUX Input (VB-Audio Voicemeeter VAIO)",
                "0:Voicemeeter Input (VB-Audio Voicemeeter VAIO)"
            ),
            "14:Voicemeeter AUX Input (VB-Audio Voicemeeter VAIO)"
        );
    }

    #[test]
    fn voicemeeter_configure_probe_reports_unavailable_for_remote_timeout() {
        let status = VoicemeeterRemoteStatus {
            available: true,
            connected: false,
            route_applied: Some(false),
            route_managed: Some(false),
            route_bus: Some("A1".to_string()),
            hardware_out_applied: None,
            hardware_out_bus: None,
            hardware_out_driver: None,
            hardware_out_device: None,
            kind: None,
            version: None,
            virtual_input_strip: None,
            dll_path: None,
            level_probe: None,
            reason: Some("Voicemeeter Remote API route timed out after 20000 ms.".to_string()),
        };

        let probe = AudioOutputRuntime::create_voicemeeter_configure_probe(status);

        assert_eq!(probe.requested_mode, AudioOutputMode::Voicemeeter);
        assert_eq!(probe.backend, AudioOutputBackend::Unavailable);
        assert!(!probe.backend_available);
        assert_eq!(probe.active_mode, None);
        assert_eq!(
            probe.reason,
            "Voicemeeter Remote API route timed out after 20000 ms."
        );
    }

    #[test]
    fn voicemeeter_configure_probe_accepts_ready_remote_route() {
        let status = VoicemeeterRemoteStatus {
            available: true,
            connected: true,
            route_applied: Some(true),
            route_managed: Some(true),
            route_bus: Some("B2".to_string()),
            hardware_out_applied: Some(true),
            hardware_out_bus: Some("A1".to_string()),
            hardware_out_driver: Some("wdm".to_string()),
            hardware_out_device: Some("USB DAC".to_string()),
            kind: Some(VoicemeeterRemoteKind::Banana),
            version: Some("1.2.3.4".to_string()),
            virtual_input_strip: Some(3),
            dll_path: Some("C:\\VoicemeeterRemote64.dll".to_string()),
            level_probe: None,
            reason: Some("Voicemeeter Remote API connected and routed Strip[3].B2.".to_string()),
        };

        let probe = AudioOutputRuntime::create_voicemeeter_configure_probe(status);

        assert_eq!(probe.backend, AudioOutputBackend::Native);
        assert!(probe.backend_available);
        assert_eq!(probe.active_mode, Some(AudioOutputMode::Voicemeeter));
        assert_eq!(
            probe.reason,
            "Voicemeeter Remote API connected and routed Strip[3].B2."
        );
    }

    #[test]
    fn voicemeeter_play_file_fails_fast_when_configure_route_is_unavailable() {
        let mut runtime = AudioOutputRuntime::new();
        runtime.enabled = true;
        runtime.settings.mode = AudioOutputMode::Voicemeeter;
        runtime.mode_probe = Some(ModeProbe {
            requested_mode: AudioOutputMode::Voicemeeter,
            backend: AudioOutputBackend::Unavailable,
            backend_available: false,
            active_mode: None,
            exclusive_probe: None,
            bit_perfect: None,
            voicemeeter_remote: Some(VoicemeeterRemoteStatus {
                available: true,
                connected: false,
                route_applied: None,
                route_managed: None,
                route_bus: Some("A1".to_string()),
                hardware_out_applied: None,
                hardware_out_bus: None,
                hardware_out_driver: None,
                hardware_out_device: None,
                kind: None,
                version: None,
                virtual_input_strip: None,
                dll_path: Some(
                    "C:\\Program Files (x86)\\VB\\Voicemeeter\\VoicemeeterRemote64.dll".to_string(),
                ),
                level_probe: None,
                reason: Some(
                    "VBVMR_Login returned -2: Voicemeeter Remote API server is unavailable"
                        .to_string(),
                ),
            }),
            reason: "VBVMR_Login returned -2: Voicemeeter Remote API server is unavailable"
                .to_string(),
        });

        let error = runtime
            .play_file(
                PlayFilePayload {
                    path: "D:\\Music\\track.wav".to_string(),
                    start_seconds: 0.0,
                    volume: 1.0,
                    growing_expected_bytes: None,
                    playback_token: Some("token-voicemeeter".to_string()),
                },
                EventSink::test(),
            )
            .unwrap_err();

        assert_eq!(
            format_error_chain(&error),
            "VBVMR_Login returned -2: Voicemeeter Remote API server is unavailable"
        );
        assert_eq!(runtime.playback_state, PlaybackState::Idle);
    }

    #[test]
    fn bit_perfect_required_rejects_shared_file_playback() {
        let mut runtime = AudioOutputRuntime::new();
        runtime.enabled = true;
        runtime.settings.bit_perfect_required = true;

        let error = runtime
            .play_file(
                PlayFilePayload {
                    path: "D:\\Music\\track.wav".to_string(),
                    start_seconds: 0.0,
                    volume: 1.0,
                    growing_expected_bytes: None,
                    playback_token: None,
                },
                EventSink::test(),
            )
            .unwrap_err();

        assert_eq!(
            format_error_chain(&error),
            "Bit-perfect required playback needs WASAPI exclusive raw PCM passthrough; shared mode is not allowed."
        );
        assert_eq!(runtime.playback_state, PlaybackState::Idle);
    }

    #[test]
    fn bit_perfect_required_rejects_voicemeeter_file_playback() {
        let mut runtime = AudioOutputRuntime::new();
        runtime.enabled = true;
        runtime.settings.mode = AudioOutputMode::Voicemeeter;
        runtime.settings.bit_perfect_required = true;

        let error = runtime
            .play_file(
                PlayFilePayload {
                    path: "D:\\Music\\track.wav".to_string(),
                    start_seconds: 0.0,
                    volume: 1.0,
                    growing_expected_bytes: None,
                    playback_token: None,
                },
                EventSink::test(),
            )
            .unwrap_err();

        assert_eq!(
            format_error_chain(&error),
            "Bit-perfect required playback needs WASAPI exclusive raw PCM passthrough; Voicemeeter routing is not allowed."
        );
        assert_eq!(runtime.playback_state, PlaybackState::Idle);
    }

    #[test]
    fn normalizes_test_tone_payload_limits() {
        let payload = TestTonePayload {
            duration_ms: 50,
            frequency_hz: 5_000.0,
        }
        .normalized();

        assert_eq!(payload.duration_ms, 120);
        assert_eq!(payload.frequency_hz, 2_000.0);

        let payload = TestTonePayload {
            duration_ms: 9_999,
            frequency_hz: 20.0,
        }
        .normalized();

        assert_eq!(payload.duration_ms, 2_000);
        assert_eq!(payload.frequency_hz, 120.0);
    }

    #[test]
    fn matches_voicemeeter_route_snapshot_requests() {
        let snapshot = VoicemeeterRouteSnapshot {
            resolved_device_id: "2:VoiceMeeter Input".to_string(),
            selected_name_hint: "VoiceMeeter Input".to_string(),
            strip: 3,
            bus: "B2".to_string(),
            previous_value: 0.0,
        };

        assert!(snapshot.matches_request("2:VoiceMeeter Input", "VoiceMeeter Input", " b2 "));
        assert!(!snapshot.matches_request("3:VoiceMeeter Aux Input", "VoiceMeeter Input", "B2"));
        assert!(!snapshot.matches_request("2:VoiceMeeter Input", "VoiceMeeter Input", "A1"));
    }

    #[test]
    fn repeated_voicemeeter_route_prepare_preserves_original_previous_value() {
        let mut runtime = AudioOutputRuntime::new();
        runtime.voicemeeter_route = Some(test_voicemeeter_route_snapshot());

        runtime.remember_prepared_voicemeeter_route(
            Some(VoicemeeterRouteSnapshot {
                resolved_device_id: "2:VoiceMeeter Input".to_string(),
                selected_name_hint: "VoiceMeeter Input".to_string(),
                strip: 3,
                bus: "B2".to_string(),
                previous_value: 1.0,
            }),
            "2:VoiceMeeter Input",
            "VoiceMeeter Input",
            "B2",
        );

        let snapshot = runtime.voicemeeter_route.as_ref().unwrap();
        assert_eq!(snapshot.previous_value, 0.0);
    }

    #[test]
    fn voicemeeter_route_prepare_records_new_unmanaged_snapshot() {
        let mut runtime = AudioOutputRuntime::new();

        runtime.remember_prepared_voicemeeter_route(
            Some(VoicemeeterRouteSnapshot {
                resolved_device_id: "3:VoiceMeeter Aux Input".to_string(),
                selected_name_hint: "VoiceMeeter Aux Input".to_string(),
                strip: 4,
                bus: "A1".to_string(),
                previous_value: 0.0,
            }),
            "3:VoiceMeeter Aux Input",
            "VoiceMeeter Aux Input",
            "A1",
        );

        let snapshot = runtime.voicemeeter_route.as_ref().unwrap();
        assert_eq!(snapshot.resolved_device_id, "3:VoiceMeeter Aux Input");
        assert_eq!(snapshot.strip, 4);
        assert_eq!(snapshot.bus, "A1");
    }

    #[test]
    fn serializes_voicemeeter_route_managed_status() {
        let status = VoicemeeterRemoteStatus {
            available: true,
            connected: true,
            route_applied: Some(true),
            route_managed: Some(true),
            route_bus: Some("B1".to_string()),
            hardware_out_applied: Some(true),
            hardware_out_bus: Some("A1".to_string()),
            hardware_out_driver: Some("wdm".to_string()),
            hardware_out_device: Some("Speakers".to_string()),
            kind: Some(VoicemeeterRemoteKind::Banana),
            version: Some("1.2.3.4".to_string()),
            virtual_input_strip: Some(3),
            dll_path: None,
            level_probe: Some(VoicemeeterLevelProbe {
                active: true,
                target: "virtualInput".to_string(),
                bus: "B1".to_string(),
                strip: Some(3),
                level_type: 0,
                channel_start: 24,
                channels: 2,
                samples: 8,
                active_samples: 3,
                max_level: 0.12,
                threshold: 0.001,
                reason: Some("Voicemeeter output level activity detected.".to_string()),
            }),
            reason: Some("Voicemeeter Remote API connected and routed Strip[3].B1.".to_string()),
        };

        let value = serde_json::to_value(status).unwrap();

        assert_eq!(value["routeApplied"], true);
        assert_eq!(value["routeManaged"], true);
        assert_eq!(value["routeBus"], "B1");
        assert_eq!(value["hardwareOutApplied"], true);
        assert_eq!(value["hardwareOutBus"], "A1");
        assert_eq!(value["hardwareOutDriver"], "wdm");
        assert_eq!(value["hardwareOutDevice"], "Speakers");
        assert_eq!(value["levelProbe"]["active"], true);
        assert_eq!(value["levelProbe"]["target"], "virtualInput");
        assert_eq!(value["levelProbe"]["bus"], "B1");
        assert_eq!(value["levelProbe"]["strip"], 3);
        assert_eq!(
            value["levelProbe"]["maxLevel"].as_f64().unwrap(),
            0.12f32 as f64
        );
    }

    #[test]
    fn reports_supported_audio_extensions_from_enabled_decoders() {
        let extensions = supported_audio_extensions();

        assert!(extensions.contains(&".m2a".to_string()));
        assert!(extensions.contains(&".mp3".to_string()));
        assert!(extensions.contains(&".oga".to_string()));
        assert!(extensions.contains(&".ape".to_string()));
        #[cfg(feature = "opus")]
        {
            assert!(extensions.contains(&".opus".to_string()));
            assert!(extensions.contains(&".webm".to_string()));
        }
        #[cfg(not(feature = "opus"))]
        {
            assert!(!extensions.contains(&".opus".to_string()));
            assert!(!extensions.contains(&".webm".to_string()));
        }
    }

    #[test]
    fn reports_supported_audio_modes_for_current_platform() {
        let modes = supported_audio_modes();

        assert!(modes.contains(&AudioOutputMode::Shared));
        if cfg!(windows) {
            assert!(modes.contains(&AudioOutputMode::Exclusive));
            assert!(modes.contains(&AudioOutputMode::Voicemeeter));
        } else {
            assert_eq!(modes, vec![AudioOutputMode::Shared]);
        }
    }

    fn test_voicemeeter_route_snapshot() -> VoicemeeterRouteSnapshot {
        VoicemeeterRouteSnapshot {
            resolved_device_id: "2:VoiceMeeter Input".to_string(),
            selected_name_hint: "VoiceMeeter Input".to_string(),
            strip: 3,
            bus: "B2".to_string(),
            previous_value: 0.0,
        }
    }

    #[test]
    fn internal_stop_playback_preserves_managed_voicemeeter_route() {
        let mut runtime = AudioOutputRuntime::new();
        runtime.voicemeeter_route = Some(test_voicemeeter_route_snapshot());

        runtime.stop_playback(true);

        assert!(runtime.voicemeeter_route.is_some());
        assert_eq!(runtime.playback_state, PlaybackState::Stopped);
    }

    #[test]
    fn stop_playback_command_restores_managed_voicemeeter_route() {
        let mut runtime = AudioOutputRuntime::new();
        runtime.enabled = true;
        runtime.settings.mode = AudioOutputMode::Voicemeeter;
        runtime.voicemeeter_route = Some(test_voicemeeter_route_snapshot());
        runtime.mode_probe = Some(ModeProbe {
            requested_mode: AudioOutputMode::Voicemeeter,
            backend: AudioOutputBackend::Native,
            backend_available: true,
            active_mode: Some(AudioOutputMode::Voicemeeter),
            exclusive_probe: None,
            bit_perfect: None,
            voicemeeter_remote: Some(VoicemeeterRemoteStatus {
                available: true,
                connected: true,
                route_applied: Some(true),
                route_managed: Some(true),
                route_bus: Some("B2".to_string()),
                hardware_out_applied: None,
                hardware_out_bus: None,
                hardware_out_driver: None,
                hardware_out_device: None,
                kind: Some(VoicemeeterRemoteKind::Banana),
                version: None,
                virtual_input_strip: Some(3),
                dll_path: None,
                level_probe: None,
                reason: Some(
                    "Voicemeeter Remote API connected and routed Strip[3].B2.".to_string(),
                ),
            }),
            reason: "Voicemeeter native file playback is running.".to_string(),
        });

        let should_continue = handle_command(
            &mut runtime,
            &EventSink::test(),
            IncomingCommand {
                command_type: "stopPlayback".to_string(),
                payload: Value::Null,
            },
        )
        .unwrap();

        assert!(should_continue);
        assert!(runtime.voicemeeter_route.is_none());
        assert!(runtime.shared_stream.is_none());
        let probe = runtime.mode_probe.as_ref().unwrap();
        assert_eq!(probe.requested_mode, AudioOutputMode::Voicemeeter);
        assert_eq!(probe.backend, AudioOutputBackend::Native);
        assert_eq!(probe.active_mode, None);
        assert_eq!(probe.reason, "Voicemeeter Remote API restored Strip[3].B2.");
        let remote_status = probe.voicemeeter_remote.as_ref().unwrap();
        assert_eq!(remote_status.route_applied, Some(true));
        assert_eq!(remote_status.route_managed, Some(false));
        assert_eq!(runtime.playback_state, PlaybackState::Stopped);
    }

    #[test]
    fn stop_playback_only_command_preserves_managed_voicemeeter_route() {
        let mut runtime = AudioOutputRuntime::new();
        runtime.enabled = true;
        runtime.settings.mode = AudioOutputMode::Voicemeeter;
        runtime.voicemeeter_route = Some(test_voicemeeter_route_snapshot());
        runtime.playback_state = PlaybackState::Playing;
        runtime.playback_source = Some("D:\\Music\\track.wav".to_string());
        runtime.mode_probe = Some(ModeProbe {
            requested_mode: AudioOutputMode::Voicemeeter,
            backend: AudioOutputBackend::Native,
            backend_available: true,
            active_mode: Some(AudioOutputMode::Voicemeeter),
            exclusive_probe: None,
            bit_perfect: None,
            voicemeeter_remote: Some(VoicemeeterRemoteStatus {
                available: true,
                connected: true,
                route_applied: Some(true),
                route_managed: Some(true),
                route_bus: Some("B2".to_string()),
                hardware_out_applied: None,
                hardware_out_bus: None,
                hardware_out_driver: None,
                hardware_out_device: None,
                kind: Some(VoicemeeterRemoteKind::Banana),
                version: None,
                virtual_input_strip: Some(3),
                dll_path: None,
                level_probe: None,
                reason: Some(
                    "Voicemeeter Remote API connected and routed Strip[3].B2.".to_string(),
                ),
            }),
            reason: "Voicemeeter native file playback is running.".to_string(),
        });

        let should_continue = handle_command(
            &mut runtime,
            &EventSink::test(),
            IncomingCommand {
                command_type: "stopPlaybackOnly".to_string(),
                payload: Value::Null,
            },
        )
        .unwrap();

        assert!(should_continue);
        assert!(runtime.voicemeeter_route.is_some());
        assert_eq!(runtime.playback_state, PlaybackState::Stopped);
        assert!(runtime.playback_source.is_none());
        let probe = runtime.mode_probe.as_ref().unwrap();
        assert_eq!(probe.active_mode, Some(AudioOutputMode::Voicemeeter));
        let remote_status = probe.voicemeeter_remote.as_ref().unwrap();
        assert_eq!(remote_status.route_managed, Some(true));
    }

    #[test]
    fn playback_error_restores_managed_voicemeeter_route() {
        let mut runtime = AudioOutputRuntime::new();
        runtime.settings.mode = AudioOutputMode::Voicemeeter;
        runtime.voicemeeter_route = Some(test_voicemeeter_route_snapshot());
        runtime.mode_probe = Some(ModeProbe {
            requested_mode: AudioOutputMode::Voicemeeter,
            backend: AudioOutputBackend::Native,
            backend_available: true,
            active_mode: Some(AudioOutputMode::Voicemeeter),
            exclusive_probe: None,
            bit_perfect: None,
            voicemeeter_remote: Some(VoicemeeterRemoteStatus {
                available: true,
                connected: true,
                route_applied: Some(true),
                route_managed: Some(true),
                route_bus: Some("B2".to_string()),
                hardware_out_applied: None,
                hardware_out_bus: None,
                hardware_out_driver: None,
                hardware_out_device: None,
                kind: Some(VoicemeeterRemoteKind::Banana),
                version: None,
                virtual_input_strip: Some(3),
                dll_path: None,
                level_probe: None,
                reason: Some(
                    "Voicemeeter Remote API connected and routed Strip[3].B2.".to_string(),
                ),
            }),
            reason: "Voicemeeter native file playback is running.".to_string(),
        });

        runtime.mark_playback_error(
            Some("D:\\Music\\track.wav".to_string()),
            None,
            "decode failed".to_string(),
            &EventSink::test(),
        );

        assert!(runtime.voicemeeter_route.is_none());
        assert_eq!(runtime.playback_state, PlaybackState::Error);
        assert_eq!(
            runtime.playback_source,
            Some("D:\\Music\\track.wav".to_string())
        );
        let probe = runtime.mode_probe.as_ref().unwrap();
        assert_eq!(probe.backend, AudioOutputBackend::Unavailable);
        assert_eq!(probe.active_mode, None);
        let remote_status = probe.voicemeeter_remote.as_ref().unwrap();
        assert_eq!(remote_status.route_applied, Some(true));
        assert_eq!(remote_status.route_managed, Some(false));
        assert_eq!(
            probe.reason,
            "decode failed; Voicemeeter Remote API restored Strip[3].B2."
        );
    }

    #[test]
    fn growing_file_media_source_waits_for_appended_bytes() {
        let path = std::env::temp_dir().join(format!(
            "luo-growing-audio-source-{}-wait.bin",
            std::process::id()
        ));
        std::fs::write(&path, b"abc").unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let mut source = GrowingFileMediaSource::open(&path, 6, Arc::clone(&stop)).unwrap();

        let mut first = [0; 3];
        source.read_exact(&mut first).unwrap();
        assert_eq!(&first, b"abc");

        let writer_path = path.clone();
        let writer = thread::spawn(move || {
            thread::sleep(Duration::from_millis(GROWING_FILE_READ_SLEEP_MS * 2));
            let mut file = std::fs::OpenOptions::new()
                .append(true)
                .open(writer_path)
                .unwrap();
            file.write_all(b"def").unwrap();
        });

        let mut second = [0; 3];
        source.read_exact(&mut second).unwrap();
        writer.join().unwrap();
        assert_eq!(&second, b"def");

        let mut tail = [0; 1];
        assert_eq!(source.read(&mut tail).unwrap(), 0);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn growing_file_media_source_stops_waiting_when_canceled() {
        let path = std::env::temp_dir().join(format!(
            "luo-growing-audio-source-{}-stop.bin",
            std::process::id()
        ));
        std::fs::write(&path, b"ab").unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let mut source = GrowingFileMediaSource::open(&path, 4, Arc::clone(&stop)).unwrap();

        let mut first = [0; 2];
        source.read_exact(&mut first).unwrap();
        assert_eq!(&first, b"ab");

        stop.store(true, Ordering::SeqCst);
        let mut pending = [0; 2];
        assert_eq!(source.read(&mut pending).unwrap(), 0);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn streaming_decode_reads_from_growing_wav_file() {
        let samples = [0i16, 16_384, -16_384, 8_192];
        let wav = create_pcm16_mono_wav(&samples);
        let split_at = 44 + 2;
        let path = std::env::temp_dir().join(format!(
            "luo-growing-audio-source-{}-decode.wav",
            std::process::id()
        ));
        std::fs::write(&path, &wav[..split_at]).unwrap();

        let writer_path = path.clone();
        let tail = wav[split_at..].to_vec();
        let writer = thread::spawn(move || {
            thread::sleep(Duration::from_millis(GROWING_FILE_READ_SLEEP_MS * 2));
            let mut file = std::fs::OpenOptions::new()
                .append(true)
                .open(writer_path)
                .unwrap();
            file.write_all(&tail).unwrap();
        });

        let stop = Arc::new(AtomicBool::new(false));
        let mut ready_sender = None;
        let mut pcm_buffer = None;
        decode_streaming_file_to_buffer(
            path.to_str().unwrap(),
            0.0,
            Some(wav.len() as u64),
            &stop,
            &mut ready_sender,
            &mut pcm_buffer,
        )
        .unwrap();
        writer.join().unwrap();

        let pcm_buffer = pcm_buffer.unwrap();
        let mut decoded = [0.0; 4];
        assert_eq!(pcm_buffer.pop_samples(&mut decoded), samples.len());
        assert!(decoded[1] > 0.4);
        assert!(decoded[2] < -0.4);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn raw_pcm_wav_parser_preserves_source_format_and_start_offset() {
        let samples = [0i16, 16_384, -16_384, 8_192];
        let wav = create_pcm16_mono_wav(&samples);
        let path = std::env::temp_dir().join(format!(
            "luo-raw-pcm-source-{}-parser.wav",
            std::process::id()
        ));
        std::fs::write(&path, wav).unwrap();

        let raw = load_raw_pcm_wav(path.to_str().unwrap(), 1.0 / 44_100.0).unwrap();
        assert_eq!(raw.sample_rate, 44_100);
        assert_eq!(raw.channels, 1);
        assert_eq!(raw.bit_depth, 16);
        assert_eq!(raw.sample_kind, RawPcmSampleKind::Pcm);
        assert_eq!(raw.frame_count, 3);
        assert_eq!(&raw.data[..2], &16_384i16.to_le_bytes());
        assert_eq!(
            raw.source_format(),
            AudioFormatDiagnostics {
                sample_rate: 44_100,
                channels: 1,
                sample_format: "pcm".to_string(),
                bit_depth: Some(16),
                source: Some("WAV raw PCM passthrough".to_string()),
            }
        );

        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn streaming_pcm_buffer_preserves_order_and_capacity() {
        let buffer = StreamingPcmBuffer::with_capacity(4);

        assert_eq!(buffer.push_samples(&[0.1, 0.2, 0.3]), 3);
        assert_eq!(buffer.push_samples(&[0.4, 0.5]), 1);
        assert_eq!(buffer.buffered_samples(), 4);

        let mut output = [0.0; 3];
        assert_eq!(buffer.pop_samples(&mut output), 3);
        assert_eq!(output, [0.1, 0.2, 0.3]);
        assert_eq!(buffer.buffered_samples(), 1);

        assert_eq!(buffer.push_samples(&[0.5, 0.6]), 2);
        let mut output = [0.0; 3];
        assert_eq!(buffer.pop_samples(&mut output), 3);
        assert_eq!(output, [0.4, 0.5, 0.6]);
    }

    #[test]
    fn streaming_pcm_buffer_reports_closed_after_drain() {
        let buffer = StreamingPcmBuffer::with_capacity(2);

        assert_eq!(buffer.push_samples(&[1.0, 0.5]), 2);
        buffer.close();
        assert_eq!(buffer.push_samples(&[0.25]), 0);
        assert!(!buffer.is_closed_and_empty());

        let mut output = [0.0; 4];
        assert_eq!(buffer.pop_samples(&mut output), 2);
        assert_eq!(output, [1.0, 0.5, 0.0, 0.0]);
        assert!(buffer.is_closed_and_empty());
        assert_eq!(buffer.pop_samples(&mut output), 0);
    }

    #[test]
    fn streaming_pcm_render_state_maps_channels_and_drains() {
        let buffer = StreamingPcmBuffer::with_capacity(4);
        assert_eq!(buffer.push_samples(&[0.1, 0.2, 0.3, 0.4]), 4);
        buffer.close();

        let mut render = StreamingPcmRenderState::new(48_000, 48_000, 2, 2);
        let mut output = [1.0; 6];

        assert_eq!(
            render.fill_output(&buffer, &mut output, 1.0),
            StreamingPcmRenderStatus::Ended
        );
        assert_eq!(output, [0.1, 0.2, 0.3, 0.4, 0.0, 0.0]);
    }

    #[test]
    fn streaming_pcm_render_state_repeats_frames_when_output_rate_is_higher() {
        let buffer = StreamingPcmBuffer::with_capacity(1);
        assert_eq!(buffer.push_samples(&[0.25]), 1);
        buffer.close();

        let mut render = StreamingPcmRenderState::new(24_000, 48_000, 1, 1);
        let mut output = [1.0; 3];

        assert_eq!(
            render.fill_output(&buffer, &mut output, 1.0),
            StreamingPcmRenderStatus::Ended
        );
        assert_eq!(output, [0.25, 0.25, 0.0]);
    }

    #[test]
    fn streaming_pcm_render_state_reports_source_sample_cursor() {
        let buffer = StreamingPcmBuffer::with_capacity(4);
        assert_eq!(buffer.push_samples(&[0.1, 0.2, 0.3, 0.4]), 4);
        let mut render = StreamingPcmRenderState::new(48_000, 48_000, 2, 2);
        let mut output = [0.0; 2];

        assert_eq!(render.cursor_samples(), 0);
        assert_eq!(
            render.fill_output(&buffer, &mut output, 1.0),
            StreamingPcmRenderStatus::Playing
        );
        assert_eq!(render.cursor_samples(), 2);
    }

    #[test]
    fn streaming_pcm_render_state_keeps_position_during_underrun() {
        let buffer = StreamingPcmBuffer::with_capacity(2);
        let mut render = StreamingPcmRenderState::new(48_000, 48_000, 1, 1);
        let mut output = [1.0; 2];

        assert_eq!(
            render.fill_output(&buffer, &mut output, 1.0),
            StreamingPcmRenderStatus::Underrun
        );
        assert_eq!(output, [0.0, 0.0]);

        assert_eq!(buffer.push_samples(&[0.75]), 1);
        let mut output = [1.0; 1];

        assert_eq!(
            render.fill_output(&buffer, &mut output, 1.0),
            StreamingPcmRenderStatus::Playing
        );
        assert_eq!(output, [0.75]);
    }

    #[test]
    fn streaming_pcm_render_state_waits_for_complete_source_frames() {
        let buffer = StreamingPcmBuffer::with_capacity(2);
        assert_eq!(buffer.push_samples(&[0.25]), 1);
        let mut render = StreamingPcmRenderState::new(48_000, 48_000, 2, 2);
        let mut output = [1.0; 2];

        assert_eq!(
            render.fill_output(&buffer, &mut output, 1.0),
            StreamingPcmRenderStatus::Underrun
        );
        assert_eq!(output, [0.0, 0.0]);
        assert_eq!(buffer.buffered_samples(), 1);

        assert_eq!(buffer.push_samples(&[0.5]), 1);

        assert_eq!(
            render.fill_output(&buffer, &mut output, 1.0),
            StreamingPcmRenderStatus::Playing
        );
        assert_eq!(output, [0.25, 0.5]);
    }

    #[test]
    fn bit_perfect_candidate_requires_exclusive_matching_format_and_unity_volume() {
        let diagnostics = evaluate_bit_perfect(
            AudioOutputMode::Exclusive,
            test_format_diagnostics(44_100, 2, "f32"),
            test_format_diagnostics(44_100, 2, "float"),
            1.0,
        );

        assert_eq!(diagnostics.status, BitPerfectStatus::Candidate);
        assert!(diagnostics
            .reason
            .contains("loopback or DAC verification is still required"));
    }

    #[test]
    fn bit_perfect_candidate_accepts_raw_pcm_wav_passthrough_source() {
        let raw = RawPcmAudio {
            sample_rate: 44_100,
            channels: 2,
            bit_depth: 16,
            block_align: 4,
            sample_kind: RawPcmSampleKind::Pcm,
            source: "WAV raw PCM passthrough",
            frame_count: 1,
            data: Arc::new(vec![0; 4]),
        };
        let diagnostics = evaluate_bit_perfect(
            AudioOutputMode::Exclusive,
            raw.source_format(),
            test_format_diagnostics_with_depth(44_100, 2, "pcm", 16),
            1.0,
        );

        assert_eq!(diagnostics.status, BitPerfectStatus::Candidate);
        assert!(diagnostics
            .reason
            .contains("loopback or DAC verification is still required"));
    }

    #[test]
    fn bit_perfect_candidate_accepts_raw_pcm_ape_passthrough_source() {
        let raw = RawPcmAudio {
            sample_rate: 44_100,
            channels: 2,
            bit_depth: 24,
            block_align: 6,
            sample_kind: RawPcmSampleKind::Pcm,
            source: "APE decoded PCM raw passthrough",
            frame_count: 1,
            data: Arc::new(vec![0; 6]),
        };
        let diagnostics = evaluate_bit_perfect(
            AudioOutputMode::Exclusive,
            raw.source_format(),
            test_format_diagnostics_with_depth(44_100, 2, "pcm", 24),
            1.0,
        );

        assert_eq!(diagnostics.status, BitPerfectStatus::Candidate);
        assert_eq!(
            diagnostics
                .source_format
                .as_ref()
                .and_then(|format| format.source.as_deref()),
            Some("APE decoded PCM raw passthrough")
        );
    }

    #[test]
    fn bit_perfect_rejects_helper_decoded_streaming_pcm() {
        let diagnostics = evaluate_bit_perfect(
            AudioOutputMode::Exclusive,
            AudioFormatDiagnostics {
                sample_rate: 44_100,
                channels: 2,
                sample_format: "decoded-f32".to_string(),
                bit_depth: Some(32),
                source: Some("Symphonia streaming decoded PCM".to_string()),
            },
            test_format_diagnostics(44_100, 2, "float"),
            1.0,
        );

        assert_eq!(diagnostics.status, BitPerfectStatus::NotCandidate);
        assert_eq!(
            diagnostics.reason,
            "Source samples are flowing through the helper's decoded-f32 streaming pipeline, so the original file sample bits are not preserved for bit-perfect output."
        );
    }

    #[test]
    fn bit_perfect_rejects_shared_playback() {
        let diagnostics = evaluate_bit_perfect(
            AudioOutputMode::Shared,
            test_format_diagnostics(44_100, 2, "decoded-f32"),
            test_format_diagnostics(44_100, 2, "f32"),
            1.0,
        );

        assert_eq!(diagnostics.status, BitPerfectStatus::NotCandidate);
        assert_eq!(
            diagnostics.reason,
            "Only WASAPI exclusive playback can be a bit-perfect candidate."
        );
    }

    #[test]
    fn bit_perfect_rejects_scaled_volume() {
        let diagnostics = evaluate_bit_perfect(
            AudioOutputMode::Exclusive,
            test_format_diagnostics(44_100, 2, "decoded-f32"),
            test_format_diagnostics(44_100, 2, "float"),
            0.8,
        );

        assert_eq!(diagnostics.status, BitPerfectStatus::NotCandidate);
        assert_eq!(
            diagnostics.reason,
            "Playback volume is not unity, so samples are scaled before output."
        );
    }

    #[test]
    fn bit_perfect_rejects_sample_rate_mismatch() {
        let diagnostics = evaluate_bit_perfect(
            AudioOutputMode::Exclusive,
            test_format_diagnostics(44_100, 2, "decoded-f32"),
            test_format_diagnostics(48_000, 2, "float"),
            1.0,
        );

        assert_eq!(diagnostics.status, BitPerfectStatus::NotCandidate);
        assert_eq!(
            diagnostics.reason,
            "Source sample rate 44100 Hz does not match output sample rate 48000 Hz."
        );
    }

    #[test]
    fn bit_perfect_rejects_sample_format_conversion() {
        let diagnostics = evaluate_bit_perfect(
            AudioOutputMode::Exclusive,
            test_format_diagnostics(44_100, 2, "f32"),
            test_format_diagnostics_with_depth(44_100, 2, "pcm", 24),
            1.0,
        );

        assert_eq!(diagnostics.status, BitPerfectStatus::NotCandidate);
        assert_eq!(
            diagnostics.reason,
            "Source sample format 32-bit f32 does not match output sample format 24-bit pcm; helper sample conversion would be required."
        );
    }

    #[test]
    fn ape_pcm_conversion_normalizes_integer_samples() {
        let info = test_ape_info(16, 2, false, false, false);
        let mut output = Vec::new();

        append_ape_pcm_as_f32(
            &[
                0x00, 0x80, // -32768
                0x00, 0x00, // 0
                0xFF, 0x7F, // 32767
            ],
            &info,
            &mut output,
        )
        .unwrap();

        assert_eq!(output, vec![-1.0, 0.0, 1.0]);
    }

    #[test]
    fn ape_source_format_rejects_unimplemented_post_processing_flags() {
        for info in [
            test_ape_info(16, 2, true, false, false),
            test_ape_info(16, 2, false, true, false),
            test_ape_info(8, 2, false, false, true),
        ] {
            assert!(validate_ape_source_format(&info)
                .unwrap_err()
                .to_string()
                .contains("post-processing flags"));
        }
    }

    fn test_format_diagnostics(
        sample_rate: u32,
        channels: u16,
        sample_format: &str,
    ) -> AudioFormatDiagnostics {
        test_format_diagnostics_with_depth(sample_rate, channels, sample_format, 32)
    }

    fn test_format_diagnostics_with_depth(
        sample_rate: u32,
        channels: u16,
        sample_format: &str,
        bit_depth: u16,
    ) -> AudioFormatDiagnostics {
        AudioFormatDiagnostics {
            sample_rate,
            channels,
            sample_format: sample_format.to_string(),
            bit_depth: Some(bit_depth),
            source: None,
        }
    }

    fn test_ape_info(
        bits_per_sample: u16,
        channels: u16,
        is_big_endian: bool,
        is_floating_point: bool,
        is_signed_8bit: bool,
    ) -> ape_decoder::ApeInfo {
        let bytes_per_sample = bits_per_sample / 8;
        ape_decoder::ApeInfo {
            version: 3990,
            compression_level: 2000,
            sample_rate: 44_100,
            channels,
            bits_per_sample,
            total_samples: 4,
            total_frames: 1,
            blocks_per_frame: 4,
            final_frame_blocks: 4,
            duration_ms: 1,
            block_align: bytes_per_sample.saturating_mul(channels),
            format_flags: 0,
            bytes_per_sample,
            average_bitrate_kbps: 0,
            decompressed_bitrate_kbps: 0,
            file_size_bytes: 0,
            is_big_endian,
            is_floating_point,
            is_signed_8bit,
            source_format: ape_decoder::SourceFormat::Wav,
        }
    }

    fn create_pcm16_mono_wav(samples: &[i16]) -> Vec<u8> {
        let data_len = samples.len() as u32 * 2;
        let mut bytes = Vec::with_capacity(44 + data_len as usize);
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&44_100u32.to_le_bytes());
        bytes.extend_from_slice(&(44_100u32 * 2).to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_len.to_le_bytes());
        for sample in samples {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }

        bytes
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

fn default_voicemeeter_bus() -> String {
    DEFAULT_VOICEMEETER_BUS.to_string()
}

fn default_voicemeeter_hardware_out_bus() -> String {
    DEFAULT_VOICEMEETER_HARDWARE_OUT_BUS.to_string()
}

fn default_voicemeeter_hardware_out_driver() -> String {
    DEFAULT_VOICEMEETER_HARDWARE_OUT_DRIVER.to_string()
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

struct StreamingDecodedAudio {
    sample_rate: u32,
    channels: usize,
    source_format: AudioFormatDiagnostics,
    pcm_buffer: Arc<StreamingPcmBuffer>,
    producer: JoinHandle<()>,
}

struct StreamingDecodeReady {
    sample_rate: u32,
    channels: usize,
    source_format: AudioFormatDiagnostics,
    pcm_buffer: Arc<StreamingPcmBuffer>,
}

fn start_streaming_file_decode(
    path: String,
    start_seconds: f64,
    growing_expected_bytes: Option<u64>,
    stop: Arc<AtomicBool>,
    playback_token: Option<String>,
    sink: EventSink,
) -> Result<StreamingDecodedAudio> {
    let (ready_sender, ready_receiver) = mpsc::sync_channel(1);
    let producer_path = path.clone();
    let producer_stop = Arc::clone(&stop);
    let producer = thread::spawn(move || {
        run_streaming_file_decode_producer(
            producer_path,
            start_seconds,
            growing_expected_bytes,
            producer_stop,
            ready_sender,
            playback_token,
            sink,
        );
    });

    let ready_message = match ready_receiver.recv() {
        Ok(message) => message,
        Err(error) => {
            stop.store(true, Ordering::SeqCst);
            let _ = producer.join();
            return Err(error).context("Native streaming decoder exited before it became ready.");
        }
    };

    let ready = match ready_message {
        Ok(ready) => ready,
        Err(reason) => {
            stop.store(true, Ordering::SeqCst);
            let _ = producer.join();
            return Err(anyhow!(reason));
        }
    };

    Ok(StreamingDecodedAudio {
        sample_rate: ready.sample_rate,
        channels: ready.channels,
        source_format: ready.source_format,
        pcm_buffer: ready.pcm_buffer,
        producer,
    })
}

fn run_streaming_file_decode_producer(
    path: String,
    start_seconds: f64,
    growing_expected_bytes: Option<u64>,
    stop: Arc<AtomicBool>,
    ready_sender: mpsc::SyncSender<Result<StreamingDecodeReady, String>>,
    playback_token: Option<String>,
    sink: EventSink,
) {
    let mut ready_sender = Some(ready_sender);
    let mut pcm_buffer = None;
    let result = decode_streaming_file_to_buffer(
        &path,
        start_seconds,
        growing_expected_bytes,
        &stop,
        &mut ready_sender,
        &mut pcm_buffer,
    );

    if let Some(buffer) = &pcm_buffer {
        buffer.close();
    }

    if let Err(error) = result {
        let reason = format_error_chain(&error);
        if let Some(sender) = ready_sender.take() {
            let _ = sender.send(Err(reason));
        } else if !stop.load(Ordering::SeqCst) {
            sink.emit_playback(
                PlaybackState::Error,
                false,
                false,
                Some(path),
                None,
                playback_token,
                Some(reason),
            );
        }
    }
}

fn create_streaming_media_source(
    path: &Path,
    growing_expected_bytes: Option<u64>,
    stop: Arc<AtomicBool>,
) -> Result<Box<dyn MediaSource>> {
    if let Some(expected_bytes) =
        growing_expected_bytes.filter(|expected_bytes| *expected_bytes > 0)
    {
        return Ok(Box::new(GrowingFileMediaSource::open(
            path,
            expected_bytes,
            stop,
        )?));
    }

    Ok(Box::new(File::open(path)?))
}

struct GrowingFileMediaSource {
    file: File,
    expected_bytes: u64,
    stop: Arc<AtomicBool>,
}

impl GrowingFileMediaSource {
    fn open(path: &Path, expected_bytes: u64, stop: Arc<AtomicBool>) -> io::Result<Self> {
        Ok(Self {
            file: File::open(path)?,
            expected_bytes,
            stop,
        })
    }

    fn available_len(&self) -> io::Result<u64> {
        Ok(self.file.metadata()?.len())
    }

    fn wait_for_available_len(&self, required_len: u64) -> io::Result<()> {
        while self.available_len()? < required_len {
            if self.stop.load(Ordering::SeqCst) {
                return Err(io::Error::new(
                    io::ErrorKind::Interrupted,
                    "growing audio file read was stopped",
                ));
            }

            thread::sleep(Duration::from_millis(GROWING_FILE_READ_SLEEP_MS));
        }

        Ok(())
    }

    fn resolve_seek_position(&mut self, position: SeekFrom) -> io::Result<u64> {
        let target = match position {
            SeekFrom::Start(position) => position as i128,
            SeekFrom::Current(offset) => self.file.stream_position()? as i128 + offset as i128,
            SeekFrom::End(offset) => self.expected_bytes as i128 + offset as i128,
        };

        if target < 0 || target > self.expected_bytes as i128 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "growing audio file seek target is outside the expected byte range",
            ));
        }

        Ok(target as u64)
    }
}

impl Read for GrowingFileMediaSource {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        if buffer.is_empty() {
            return Ok(0);
        }

        loop {
            let position = self.file.stream_position()?;
            if position >= self.expected_bytes {
                return Ok(0);
            }

            let remaining = self.expected_bytes.saturating_sub(position);
            let read_len = buffer.len().min(remaining.min(usize::MAX as u64) as usize);
            let read = self.file.read(&mut buffer[..read_len])?;
            if read > 0 {
                return Ok(read);
            }

            if self.stop.load(Ordering::SeqCst) {
                return Ok(0);
            }

            thread::sleep(Duration::from_millis(GROWING_FILE_READ_SLEEP_MS));
        }
    }
}

impl Seek for GrowingFileMediaSource {
    fn seek(&mut self, position: SeekFrom) -> io::Result<u64> {
        let target = self.resolve_seek_position(position)?;
        self.wait_for_available_len(target)?;
        self.file.seek(SeekFrom::Start(target))
    }
}

impl MediaSource for GrowingFileMediaSource {
    fn is_seekable(&self) -> bool {
        true
    }

    fn byte_len(&self) -> Option<u64> {
        Some(self.expected_bytes)
    }
}

fn create_audio_codec_registry() -> CodecRegistry {
    let mut registry = CodecRegistry::new();
    symphonia::default::register_enabled_codecs(&mut registry);
    register_optional_audio_decoders(&mut registry);
    registry
}

#[cfg(feature = "opus")]
fn register_optional_audio_decoders(registry: &mut CodecRegistry) {
    registry.register_audio_decoder::<symphonia_adapter_libopus::OpusDecoder>();
}

#[cfg(not(feature = "opus"))]
fn register_optional_audio_decoders(_registry: &mut CodecRegistry) {}

fn load_raw_pcm_for_passthrough(path: &str, start_seconds: f64) -> Result<RawPcmAudio> {
    match load_raw_pcm_wav(path, start_seconds) {
        Ok(raw_pcm_audio) => Ok(raw_pcm_audio),
        Err(_) if is_ape_file_path(Path::new(path)) => load_raw_pcm_ape(path, start_seconds),
        Err(wav_error) => Err(wav_error),
    }
}

fn load_raw_pcm_wav(path: &str, start_seconds: f64) -> Result<RawPcmAudio> {
    let bytes = std::fs::read(path).with_context(|| format!("Failed to read WAV file: {path}"))?;
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err(anyhow!("File is not a RIFF/WAVE file."));
    }

    let fmt_chunk = find_wave_chunk(&bytes, b"fmt ")?.context("WAV file is missing fmt chunk.")?;
    let data_chunk =
        find_wave_chunk(&bytes, b"data")?.context("WAV file is missing data chunk.")?;
    if fmt_chunk.size < 16 {
        return Err(anyhow!("WAV fmt chunk is too small."));
    }

    let audio_format = read_le_u16(&bytes, fmt_chunk.offset)?;
    let channels = read_le_u16(&bytes, fmt_chunk.offset + 2)?;
    let sample_rate = read_le_u32(&bytes, fmt_chunk.offset + 4)?;
    let block_align = read_le_u16(&bytes, fmt_chunk.offset + 12)?;
    let bit_depth = read_le_u16(&bytes, fmt_chunk.offset + 14)?;
    let sample_kind = match audio_format {
        WAVE_FORMAT_PCM_TAG => RawPcmSampleKind::Pcm,
        WAVE_FORMAT_IEEE_FLOAT_TAG => RawPcmSampleKind::Float,
        other => {
            return Err(anyhow!(
                "Only PCM/IEEE-float WAV can use raw passthrough; format tag={other}."
            ));
        }
    };

    let bytes_per_sample = bit_depth / 8;
    if channels == 0 || sample_rate == 0 || bit_depth == 0 || bytes_per_sample == 0 {
        return Err(anyhow!("Invalid WAV format metadata."));
    }
    if block_align != channels.saturating_mul(bytes_per_sample) {
        return Err(anyhow!(
            "Unsupported WAV block alignment: blockAlign={}, channels={}, bytesPerSample={}.",
            block_align,
            channels,
            bytes_per_sample
        ));
    }

    let aligned_data_size = data_chunk.size - (data_chunk.size % usize::from(block_align));
    let data_end = data_chunk.offset.saturating_add(aligned_data_size);
    let total_frames = aligned_data_size / usize::from(block_align);
    let start_frame = frame_index_for_seconds(start_seconds, sample_rate).min(total_frames);
    let start_offset = data_chunk
        .offset
        .saturating_add(start_frame.saturating_mul(usize::from(block_align)));
    if start_offset > data_end {
        return Err(anyhow!("WAV start offset is outside the data chunk."));
    }

    let raw_data = bytes[start_offset..data_end].to_vec();
    let frame_count = raw_data.len() / usize::from(block_align);
    if frame_count == 0 {
        return Err(anyhow!(
            "WAV raw PCM data is empty after the requested start offset."
        ));
    }

    Ok(RawPcmAudio {
        sample_rate,
        channels,
        bit_depth,
        block_align,
        sample_kind,
        source: "WAV raw PCM passthrough",
        frame_count,
        data: Arc::new(raw_data),
    })
}

fn load_raw_pcm_ape(path: &str, start_seconds: f64) -> Result<RawPcmAudio> {
    let file = File::open(path).with_context(|| format!("Failed to open APE file: {path}"))?;
    let mut decoder = ape_decoder::ApeDecoder::new(BufReader::new(file))
        .with_context(|| format!("Failed to parse APE file: {path}"))?;
    let info = decoder.info().clone();
    validate_ape_source_format(&info)?;

    let start_sample = u64::try_from(frame_index_for_seconds(start_seconds, info.sample_rate))
        .unwrap_or(u64::MAX)
        .min(info.total_samples);
    if start_sample >= info.total_samples {
        return Err(anyhow!(
            "APE decoded PCM data is empty after the requested start offset."
        ));
    }

    let raw_data = decoder
        .decode_range(start_sample, info.total_samples)
        .context("Failed to decode APE PCM data for raw passthrough.")?;
    let frame_count = raw_data.len() / usize::from(info.block_align);
    if frame_count == 0 {
        return Err(anyhow!(
            "APE decoded PCM data is empty after the requested start offset."
        ));
    }

    Ok(RawPcmAudio {
        sample_rate: info.sample_rate,
        channels: info.channels,
        bit_depth: info.bits_per_sample,
        block_align: info.block_align,
        sample_kind: RawPcmSampleKind::Pcm,
        source: "APE decoded PCM raw passthrough",
        frame_count,
        data: Arc::new(raw_data),
    })
}

#[derive(Clone, Copy)]
struct WaveChunk {
    offset: usize,
    size: usize,
}

fn find_wave_chunk(bytes: &[u8], chunk_id: &[u8; 4]) -> Result<Option<WaveChunk>> {
    let mut offset = 12usize;
    while offset.saturating_add(8) <= bytes.len() {
        let id = &bytes[offset..offset + 4];
        let size = read_le_u32(bytes, offset + 4)? as usize;
        let data_offset = offset + 8;
        let data_end = data_offset.saturating_add(size);
        if data_end > bytes.len() {
            return Err(anyhow!("Invalid WAV chunk size."));
        }
        if id == chunk_id {
            return Ok(Some(WaveChunk {
                offset: data_offset,
                size,
            }));
        }
        offset = data_end + (size % 2);
    }

    Ok(None)
}

fn read_le_u16(bytes: &[u8], offset: usize) -> Result<u16> {
    let slice = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| anyhow!("Unexpected end of WAV data."))?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_le_u32(bytes: &[u8], offset: usize) -> Result<u32> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| anyhow!("Unexpected end of WAV data."))?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn is_ape_file_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("ape"))
}

fn decode_ape_streaming_file_to_buffer(
    path: &str,
    start_seconds: f64,
    stop: &Arc<AtomicBool>,
    ready_sender: &mut Option<mpsc::SyncSender<Result<StreamingDecodeReady, String>>>,
    pcm_buffer: &mut Option<Arc<StreamingPcmBuffer>>,
) -> Result<()> {
    let file = File::open(path).with_context(|| format!("Failed to open APE file: {path}"))?;
    let mut decoder = ape_decoder::ApeDecoder::new(BufReader::new(file))
        .with_context(|| format!("Failed to parse APE file: {path}"))?;
    let info = decoder.info().clone();
    validate_ape_source_format(&info)?;

    let channels = usize::from(info.channels.max(1));
    let start_sample = u64::try_from(frame_index_for_seconds(start_seconds, info.sample_rate))
        .unwrap_or(u64::MAX)
        .min(info.total_samples);
    if start_sample >= info.total_samples {
        return Err(anyhow!(
            "APE decoded audio is empty after the requested start offset."
        ));
    }

    let seek_position = decoder
        .seek(start_sample)
        .context("Failed to seek APE decoder.")?;
    let buffer = create_streaming_decode_ready(
        ready_sender,
        info.sample_rate,
        channels,
        "APE streaming decoded PCM",
    )?;
    *pcm_buffer = Some(Arc::clone(&buffer));

    let mut skip_bytes = usize::try_from(seek_position.skip_samples)
        .unwrap_or(usize::MAX)
        .saturating_mul(usize::from(info.block_align));
    for frame_index in seek_position.frame_index..info.total_frames {
        if stop.load(Ordering::SeqCst) {
            break;
        }

        let frame_pcm = decoder
            .decode_frame(frame_index)
            .with_context(|| format!("Failed to decode APE frame {frame_index}."))?;
        let frame_bytes = if skip_bytes > 0 {
            if skip_bytes >= frame_pcm.len() {
                skip_bytes -= frame_pcm.len();
                continue;
            }

            let bytes = &frame_pcm[skip_bytes..];
            skip_bytes = 0;
            bytes
        } else {
            frame_pcm.as_slice()
        };
        if frame_bytes.is_empty() {
            continue;
        }

        let mut decoded =
            Vec::with_capacity(frame_bytes.len() / usize::from(info.bytes_per_sample));
        append_ape_pcm_as_f32(frame_bytes, &info, &mut decoded)?;
        if !decoded.is_empty() && !push_samples_until_stopped(&buffer, &decoded, stop) {
            break;
        }
    }

    Ok(())
}

fn validate_ape_source_format(info: &ape_decoder::ApeInfo) -> Result<()> {
    if info.sample_rate == 0 || info.channels == 0 || info.total_samples == 0 {
        return Err(anyhow!("APE audio metadata is incomplete."));
    }
    if info.is_big_endian || info.is_floating_point || info.is_signed_8bit {
        return Err(anyhow!(
            "APE files with big-endian, floating-point, or signed-8-bit post-processing flags are not supported yet."
        ));
    }
    if !matches!(info.bits_per_sample, 8 | 16 | 24 | 32) {
        return Err(anyhow!(
            "Unsupported APE bit depth: {}.",
            info.bits_per_sample
        ));
    }
    let expected_bytes_per_sample = info.bits_per_sample / 8;
    if info.bytes_per_sample != expected_bytes_per_sample
        || info.block_align != expected_bytes_per_sample.saturating_mul(info.channels)
    {
        return Err(anyhow!(
            "Invalid APE block alignment: blockAlign={}, channels={}, bytesPerSample={}.",
            info.block_align,
            info.channels,
            info.bytes_per_sample
        ));
    }

    Ok(())
}

fn append_ape_pcm_as_f32(
    bytes: &[u8],
    info: &ape_decoder::ApeInfo,
    output: &mut Vec<f32>,
) -> Result<()> {
    let bytes_per_sample = usize::from(info.bytes_per_sample);
    if bytes_per_sample == 0 || bytes.len() % bytes_per_sample != 0 {
        return Err(anyhow!("APE decoded PCM bytes are not sample-aligned."));
    }

    match info.bits_per_sample {
        8 => {
            output.extend(
                bytes
                    .iter()
                    .map(|sample| ((*sample as f32 - 128.0) / 128.0).clamp(-1.0, 1.0)),
            );
        }
        16 => {
            for sample in bytes.chunks_exact(2) {
                let value = i16::from_le_bytes([sample[0], sample[1]]) as i32;
                output.push(pcm_signed_to_f32(value, i16::MAX as f32, 32_768.0));
            }
        }
        24 => {
            for sample in bytes.chunks_exact(3) {
                let raw =
                    (sample[0] as i32) | ((sample[1] as i32) << 8) | ((sample[2] as i32) << 16);
                let value = (raw << 8) >> 8;
                output.push(pcm_signed_to_f32(value, 8_388_607.0, 8_388_608.0));
            }
        }
        32 => {
            for sample in bytes.chunks_exact(4) {
                let value = i32::from_le_bytes([sample[0], sample[1], sample[2], sample[3]]);
                output.push(pcm_signed_to_f32(value, i32::MAX as f32, 2_147_483_648.0));
            }
        }
        bit_depth => {
            return Err(anyhow!("Unsupported APE bit depth: {bit_depth}."));
        }
    }

    Ok(())
}

fn pcm_signed_to_f32(value: i32, positive_scale: f32, negative_scale: f32) -> f32 {
    if value < 0 {
        (value as f32 / negative_scale).clamp(-1.0, 0.0)
    } else {
        (value as f32 / positive_scale).clamp(0.0, 1.0)
    }
}

fn decode_streaming_file_to_buffer(
    path: &str,
    start_seconds: f64,
    growing_expected_bytes: Option<u64>,
    stop: &Arc<AtomicBool>,
    ready_sender: &mut Option<mpsc::SyncSender<Result<StreamingDecodeReady, String>>>,
    pcm_buffer: &mut Option<Arc<StreamingPcmBuffer>>,
) -> Result<()> {
    let path_ref = Path::new(path);
    if is_ape_file_path(path_ref) {
        if growing_expected_bytes.is_some() {
            return Err(anyhow!(
                "APE native playback requires a complete local cache before decoding."
            ));
        }

        return decode_ape_streaming_file_to_buffer(
            path,
            start_seconds,
            stop,
            ready_sender,
            pcm_buffer,
        );
    }

    let media_source = MediaSourceStream::new(
        create_streaming_media_source(path_ref, growing_expected_bytes, Arc::clone(stop))
            .with_context(|| format!("Failed to open audio file: {path}"))?,
        Default::default(),
    );
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
    let track_time_base = track.time_base;
    let (mut sample_rate, mut channels) = track
        .codec_params
        .as_ref()
        .and_then(|codec_params| codec_params.audio())
        .map(|audio_params| {
            (
                audio_params.sample_rate.unwrap_or_default(),
                audio_params
                    .channels
                    .as_ref()
                    .map_or(0, |channels| channels.count()),
            )
        })
        .unwrap_or_default();
    let codec_registry = create_audio_codec_registry();
    let mut decoder = codec_registry
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

    let mut remaining_samples_to_skip = 0usize;
    if sample_rate != 0 && channels != 0 {
        remaining_samples_to_skip = seek_streaming_decode_start(
            &mut format,
            &mut decoder,
            start_seconds,
            track_id,
            track_time_base,
            sample_rate,
            channels,
        );
        *pcm_buffer = Some(create_streaming_decode_ready(
            ready_sender,
            sample_rate,
            channels,
            "Symphonia streaming decoded PCM",
        )?);
    }

    loop {
        if stop.load(Ordering::SeqCst) {
            break;
        }

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
                if sample_rate == 0 || channels == 0 {
                    continue;
                }
                if pcm_buffer.is_none() {
                    remaining_samples_to_skip = frame_index_for_seconds(start_seconds, sample_rate)
                        .saturating_mul(channels);
                    *pcm_buffer = Some(create_streaming_decode_ready(
                        ready_sender,
                        sample_rate,
                        channels,
                        "Symphonia streaming decoded PCM",
                    )?);
                }

                let mut decoded = vec![f32::MID; audio_buffer.samples_interleaved()];
                audio_buffer.copy_to_slice_interleaved(&mut decoded);
                if decoded.is_empty() {
                    continue;
                }

                let sample_offset = remaining_samples_to_skip.min(decoded.len());
                remaining_samples_to_skip -= sample_offset;
                if sample_offset == decoded.len() {
                    continue;
                }

                if let Some(buffer) = pcm_buffer.as_ref() {
                    push_samples_until_stopped(buffer, &decoded[sample_offset..], stop);
                }
            }
            Err(SymphoniaError::DecodeError(_)) | Err(SymphoniaError::IoError(_)) => continue,
            Err(SymphoniaError::ResetRequired) => break,
            Err(error) => return Err(error).context("Failed to decode audio packet."),
        }
    }

    if pcm_buffer.is_none() {
        return Err(anyhow!("Decoded audio file is empty."));
    }

    Ok(())
}

fn create_streaming_decode_ready(
    ready_sender: &mut Option<mpsc::SyncSender<Result<StreamingDecodeReady, String>>>,
    sample_rate: u32,
    channels: usize,
    source: impl Into<String>,
) -> Result<Arc<StreamingPcmBuffer>> {
    if sample_rate == 0 {
        return Err(anyhow!("Decoded audio sample rate is unavailable."));
    }
    if channels == 0 {
        return Err(anyhow!("Decoded audio channel count is unavailable."));
    }

    let pcm_buffer = Arc::new(StreamingPcmBuffer::with_capacity(
        streaming_pcm_buffer_capacity_samples(sample_rate, channels),
    ));
    if let Some(sender) = ready_sender.take() {
        sender
            .send(Ok(StreamingDecodeReady {
                sample_rate,
                channels,
                source_format: AudioFormatDiagnostics {
                    sample_rate,
                    channels: channels.min(u16::MAX as usize) as u16,
                    sample_format: "decoded-f32".to_string(),
                    bit_depth: Some(32),
                    source: Some(source.into()),
                },
                pcm_buffer: Arc::clone(&pcm_buffer),
            }))
            .map_err(|_| {
                anyhow!("Native streaming playback was canceled before decoder became ready.")
            })?;
    }

    Ok(pcm_buffer)
}

fn seek_streaming_decode_start(
    format: &mut Box<dyn symphonia::core::formats::FormatReader>,
    decoder: &mut Box<dyn symphonia::core::codecs::audio::AudioDecoder>,
    start_seconds: f64,
    track_id: u32,
    track_time_base: Option<symphonia::core::units::TimeBase>,
    sample_rate: u32,
    channels: usize,
) -> usize {
    let start_frame = frame_index_for_seconds(start_seconds, sample_rate);
    let default_skip = start_frame.saturating_mul(channels);
    let Some(time) = time_from_seconds(start_seconds) else {
        return default_skip;
    };

    match format.seek(
        SeekMode::Accurate,
        SeekTo::Time {
            time,
            track_id: Some(track_id),
        },
    ) {
        Ok(seeked_to) => {
            decoder.reset();
            if seeked_to.track_id != track_id {
                return 0;
            }
            let Some(actual_seconds) = track_time_base
                .and_then(|time_base| time_base.calc_time(seeked_to.actual_ts))
                .map(|time| time.as_secs_f64())
            else {
                return 0;
            };
            frame_index_for_seconds((start_seconds - actual_seconds).max(0.0), sample_rate)
                .saturating_mul(channels)
        }
        Err(_) => default_skip,
    }
}

fn time_from_seconds(seconds: f64) -> Option<Time> {
    if !seconds.is_finite() || seconds <= 0.0 {
        return None;
    }

    let whole_seconds = seconds.trunc();
    if whole_seconds < i64::MIN as f64 || whole_seconds > i64::MAX as f64 {
        return None;
    }
    let nanos = ((seconds - whole_seconds) * 1_000_000_000.0).round() as u32;
    if nanos >= 1_000_000_000 {
        Time::try_new(whole_seconds as i64 + 1, nanos - 1_000_000_000)
    } else {
        Time::try_new(whole_seconds as i64, nanos)
    }
}

fn frame_index_for_seconds(seconds: f64, sample_rate: u32) -> usize {
    if !seconds.is_finite() || seconds <= 0.0 {
        return 0;
    }

    (seconds * sample_rate as f64).floor() as usize
}

fn streaming_pcm_buffer_capacity_samples(sample_rate: u32, channels: usize) -> usize {
    usize::try_from(sample_rate)
        .unwrap_or(usize::MAX / STREAMING_PCM_BUFFER_SECONDS)
        .saturating_mul(channels.max(1))
        .saturating_mul(STREAMING_PCM_BUFFER_SECONDS)
        .max(
            channels
                .max(1)
                .saturating_mul(DEFAULT_BUFFER_FRAMES as usize),
        )
}

fn push_samples_until_stopped(
    buffer: &StreamingPcmBuffer,
    samples: &[f32],
    stop: &AtomicBool,
) -> bool {
    let mut offset = 0usize;
    while offset < samples.len() && !stop.load(Ordering::SeqCst) {
        let written = buffer.push_samples(&samples[offset..]);
        if written == 0 {
            thread::sleep(Duration::from_millis(STREAMING_PCM_PRODUCER_SLEEP_MS));
        } else {
            offset += written;
        }
    }

    offset == samples.len()
}

#[cfg_attr(not(test), allow(dead_code))]
struct StreamingPcmBuffer {
    inner: Mutex<StreamingPcmBufferState>,
}

#[cfg_attr(not(test), allow(dead_code))]
struct StreamingPcmBufferState {
    samples: VecDeque<f32>,
    capacity_samples: usize,
    closed: bool,
}

#[cfg_attr(not(test), allow(dead_code))]
impl StreamingPcmBuffer {
    fn with_capacity(capacity_samples: usize) -> Self {
        Self {
            inner: Mutex::new(StreamingPcmBufferState {
                samples: VecDeque::with_capacity(capacity_samples.max(1)),
                capacity_samples: capacity_samples.max(1),
                closed: false,
            }),
        }
    }

    fn push_samples(&self, samples: &[f32]) -> usize {
        if samples.is_empty() {
            return 0;
        }

        let mut state = self.lock_state();
        if state.closed {
            return 0;
        }

        let writable = state.capacity_samples.saturating_sub(state.samples.len());
        let write_count = writable.min(samples.len());
        state
            .samples
            .extend(samples.iter().take(write_count).copied());
        write_count
    }

    fn pop_samples(&self, output: &mut [f32]) -> usize {
        if output.is_empty() {
            return 0;
        }

        let mut state = self.lock_state();
        let mut read_count = 0usize;
        for slot in output.iter_mut() {
            let Some(sample) = state.samples.pop_front() else {
                break;
            };

            *slot = sample;
            read_count += 1;
        }

        read_count
    }

    fn pop_exact_samples(&self, output: &mut [f32]) -> bool {
        if output.is_empty() {
            return true;
        }

        let mut state = self.lock_state();
        if state.samples.len() < output.len() {
            return false;
        }

        for slot in output.iter_mut() {
            *slot = state
                .samples
                .pop_front()
                .expect("buffer length was checked before pop");
        }

        true
    }

    fn close(&self) {
        self.lock_state().closed = true;
    }

    fn buffered_samples(&self) -> usize {
        self.lock_state().samples.len()
    }

    fn is_closed_and_empty(&self) -> bool {
        let state = self.lock_state();
        state.closed && state.samples.is_empty()
    }

    fn lock_state(&self) -> std::sync::MutexGuard<'_, StreamingPcmBufferState> {
        self.inner.lock().unwrap_or_else(|error| error.into_inner())
    }
}

#[cfg_attr(not(test), allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StreamingPcmRenderStatus {
    Playing,
    Underrun,
    Ended,
}

#[cfg_attr(not(test), allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StreamingPcmFrameRead {
    Ready,
    Underrun,
    Ended,
}

#[cfg_attr(not(test), allow(dead_code))]
struct StreamingPcmRenderState {
    source_channels: usize,
    output_channels: usize,
    frame_step: f64,
    source_frame_position: f64,
    consumed_source_frames: usize,
    current_frame: Vec<f32>,
}

#[cfg_attr(not(test), allow(dead_code))]
impl StreamingPcmRenderState {
    fn new(
        source_sample_rate: u32,
        output_sample_rate: u32,
        source_channels: usize,
        output_channels: usize,
    ) -> Self {
        let source_channels = source_channels.max(1);
        Self {
            source_channels,
            output_channels: output_channels.max(1),
            frame_step: source_sample_rate.max(1) as f64 / output_sample_rate.max(1) as f64,
            source_frame_position: 0.0,
            consumed_source_frames: 0,
            current_frame: vec![0.0; source_channels],
        }
    }

    fn fill_output(
        &mut self,
        buffer: &StreamingPcmBuffer,
        output: &mut [f32],
        volume: f32,
    ) -> StreamingPcmRenderStatus {
        let volume = volume.clamp(0.0, 1.0);
        let mut status = StreamingPcmRenderStatus::Playing;

        for frame in output.chunks_mut(self.output_channels) {
            let source_frame_index = self.source_frame_position.floor().max(0.0) as usize;
            match self.ensure_source_frame(buffer, source_frame_index) {
                StreamingPcmFrameRead::Ready => {
                    for (channel_index, sample) in frame.iter_mut().enumerate() {
                        let source_channel = if self.source_channels == 1 {
                            0
                        } else {
                            channel_index.min(self.source_channels - 1)
                        };
                        *sample = self.current_frame[source_channel] * volume;
                    }
                    self.source_frame_position += self.frame_step;
                }
                StreamingPcmFrameRead::Underrun => {
                    frame.fill(0.0);
                    if status == StreamingPcmRenderStatus::Playing {
                        status = StreamingPcmRenderStatus::Underrun;
                    }
                }
                StreamingPcmFrameRead::Ended => {
                    frame.fill(0.0);
                    status = StreamingPcmRenderStatus::Ended;
                }
            }
        }

        status
    }

    fn ensure_source_frame(
        &mut self,
        buffer: &StreamingPcmBuffer,
        target_frame_index: usize,
    ) -> StreamingPcmFrameRead {
        while self.consumed_source_frames <= target_frame_index {
            let mut next_frame = vec![0.0; self.source_channels];
            if buffer.pop_exact_samples(&mut next_frame) {
                self.current_frame = next_frame;
                self.consumed_source_frames += 1;
                continue;
            }

            if buffer.is_closed_and_empty() {
                return StreamingPcmFrameRead::Ended;
            }

            return StreamingPcmFrameRead::Underrun;
        }

        StreamingPcmFrameRead::Ready
    }

    fn cursor_samples(&self) -> usize {
        (self.source_frame_position.floor().max(0.0) as usize).saturating_mul(self.source_channels)
    }
}

fn evaluate_bit_perfect(
    active_mode: AudioOutputMode,
    source_format: AudioFormatDiagnostics,
    output_format: AudioFormatDiagnostics,
    volume: f32,
) -> BitPerfectDiagnostics {
    let volume = volume.clamp(0.0, 1.0);
    let status;
    let reason;

    if active_mode != AudioOutputMode::Exclusive {
        status = BitPerfectStatus::NotCandidate;
        reason = "Only WASAPI exclusive playback can be a bit-perfect candidate.".to_string();
    } else if (volume - 1.0).abs() > f32::EPSILON {
        status = BitPerfectStatus::NotCandidate;
        reason = "Playback volume is not unity, so samples are scaled before output.".to_string();
    } else if source_format.sample_rate != output_format.sample_rate {
        status = BitPerfectStatus::NotCandidate;
        reason = format!(
            "Source sample rate {} Hz does not match output sample rate {} Hz.",
            source_format.sample_rate, output_format.sample_rate
        );
    } else if source_format.channels != output_format.channels {
        status = BitPerfectStatus::NotCandidate;
        reason = format!(
            "Source channel count {} does not match output channel count {}.",
            source_format.channels, output_format.channels
        );
    } else if source_format_is_helper_decoded_pcm(&source_format) {
        status = BitPerfectStatus::NotCandidate;
        reason = "Source samples are flowing through the helper's decoded-f32 streaming pipeline, so the original file sample bits are not preserved for bit-perfect output.".to_string();
    } else if !audio_formats_are_bit_perfect_compatible(&source_format, &output_format) {
        status = BitPerfectStatus::NotCandidate;
        reason = format!(
            "Source sample format {} does not match output sample format {}; helper sample conversion would be required.",
            audio_format_summary(&source_format),
            audio_format_summary(&output_format)
        );
    } else {
        status = BitPerfectStatus::Candidate;
        reason = "WASAPI exclusive output format matches source sample rate/channels/sample format and playback volume is unity; loopback or DAC verification is still required.".to_string();
    }

    BitPerfectDiagnostics {
        status,
        source_format: Some(source_format),
        output_format: Some(output_format),
        volume: Some(volume),
        reason,
    }
}

fn audio_formats_are_bit_perfect_compatible(
    source_format: &AudioFormatDiagnostics,
    output_format: &AudioFormatDiagnostics,
) -> bool {
    let source_kind = normalized_audio_sample_format(&source_format.sample_format);
    let output_kind = normalized_audio_sample_format(&output_format.sample_format);

    match (source_kind, output_kind) {
        (Some(AudioSampleFormatKind::Float), Some(AudioSampleFormatKind::Float)) => {
            source_format.bit_depth == Some(32) && output_format.bit_depth == Some(32)
        }
        (Some(AudioSampleFormatKind::Pcm), Some(AudioSampleFormatKind::Pcm)) => {
            source_format.bit_depth.is_some() && source_format.bit_depth == output_format.bit_depth
        }
        _ => false,
    }
}

fn source_format_is_helper_decoded_pcm(source_format: &AudioFormatDiagnostics) -> bool {
    source_format
        .sample_format
        .trim()
        .eq_ignore_ascii_case("decoded-f32")
        || source_format.source.as_ref().is_some_and(|source| {
            source
                .trim()
                .eq_ignore_ascii_case("Symphonia streaming decoded PCM")
        })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AudioSampleFormatKind {
    Float,
    Pcm,
}

fn normalized_audio_sample_format(sample_format: &str) -> Option<AudioSampleFormatKind> {
    match sample_format.trim().to_ascii_lowercase().as_str() {
        "decoded-f32" | "f32" | "float" => Some(AudioSampleFormatKind::Float),
        "pcm" | "i8" | "i16" | "i24" | "i32" | "u8" | "u16" | "u32" => {
            Some(AudioSampleFormatKind::Pcm)
        }
        _ => None,
    }
}

fn audio_format_summary(format: &AudioFormatDiagnostics) -> String {
    match format.bit_depth {
        Some(bit_depth) => format!("{}-bit {}", bit_depth, format.sample_format),
        None => format.sample_format.clone(),
    }
}

fn create_unverified_bit_perfect_diagnostics(reason: impl Into<String>) -> BitPerfectDiagnostics {
    BitPerfectDiagnostics {
        status: BitPerfectStatus::Unverified,
        source_format: None,
        output_format: None,
        volume: None,
        reason: reason.into(),
    }
}

mod shared_cpal {
    use std::sync::{
        atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering},
        Arc, Mutex,
    };
    use std::time::Duration;

    use anyhow::{Context, Result};
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::{FromSample, Sample, SampleFormat, Stream};

    use super::{
        AudioFormatDiagnostics, AudioOutputDevice, AudioOutputDeviceBackend, StreamingPcmBuffer,
        StreamingPcmRenderState, StreamingPcmRenderStatus,
    };

    const TEST_TONE_GAIN: f32 = 0.18;

    pub fn enumerate_output_devices(
        backend_for_name: impl Fn(&str) -> AudioOutputDeviceBackend,
    ) -> Result<Vec<AudioOutputDevice>> {
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
                    id: output_device_id(index, &name),
                    is_default: default_name.as_deref() == Some(name.as_str()),
                    backend: backend_for_name(&name),
                    name,
                })
            })
            .collect())
    }

    pub fn open_silence_stream(device_id: &str) -> Result<Stream> {
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

    pub fn validate_playback_device(device_id: &str) -> Result<()> {
        let _ = find_output_device(device_id)?;
        Ok(())
    }

    pub fn describe_output_format(device_id: &str) -> Result<AudioFormatDiagnostics> {
        let device = find_output_device(device_id)?;
        let supported_config = device
            .default_output_config()
            .context("Failed to read default output config")?;
        let sample_format = supported_config.sample_format();
        let config = supported_config.config();

        Ok(AudioFormatDiagnostics {
            sample_rate: config.sample_rate.0,
            channels: config.channels,
            sample_format: sample_format_label(sample_format),
            bit_depth: sample_format_bit_depth(sample_format),
            source: Some("CPAL shared default output config".to_string()),
        })
    }

    #[allow(dead_code, clippy::too_many_arguments)]
    pub fn build_file_stream(
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
            SampleFormat::F32 => build_file_stream_for_sample::<f32>(
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
            SampleFormat::F64 => build_file_stream_for_sample::<f64>(
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
            SampleFormat::I8 => build_file_stream_for_sample::<i8>(
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
            SampleFormat::I16 => build_file_stream_for_sample::<i16>(
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
            SampleFormat::I24 => build_file_stream_for_sample::<cpal::I24>(
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
            SampleFormat::I32 => build_file_stream_for_sample::<i32>(
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
            SampleFormat::I64 => build_file_stream_for_sample::<i64>(
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
            SampleFormat::U8 => build_file_stream_for_sample::<u8>(
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
            SampleFormat::U16 => build_file_stream_for_sample::<u16>(
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
            SampleFormat::U32 => build_file_stream_for_sample::<u32>(
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
            SampleFormat::U64 => build_file_stream_for_sample::<u64>(
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

    #[allow(dead_code, clippy::too_many_arguments)]
    pub fn build_streaming_file_stream(
        device_id: &str,
        source_sample_rate: u32,
        source_channels: u16,
        pcm_buffer: Arc<StreamingPcmBuffer>,
        cursor: Arc<AtomicUsize>,
        paused: Arc<AtomicBool>,
        stop: Arc<AtomicBool>,
        ended: Arc<AtomicBool>,
        volume_bits: Arc<AtomicU32>,
    ) -> Result<Stream> {
        let device = find_output_device(device_id)?;
        let supported_config = device
            .default_output_config()
            .context("Failed to read default output config")?;
        let sample_format = supported_config.sample_format();
        let config = supported_config.config();
        let render_state = Arc::new(Mutex::new(StreamingPcmRenderState::new(
            source_sample_rate,
            config.sample_rate.0,
            usize::from(source_channels.max(1)),
            usize::from(config.channels.max(1)),
        )));
        let stream = match sample_format {
            SampleFormat::F32 => build_streaming_file_stream_for_sample::<f32>(
                &device,
                &config,
                Arc::clone(&pcm_buffer),
                Arc::clone(&render_state),
                cursor,
                paused,
                stop,
                ended,
                volume_bits,
            ),
            SampleFormat::F64 => build_streaming_file_stream_for_sample::<f64>(
                &device,
                &config,
                Arc::clone(&pcm_buffer),
                Arc::clone(&render_state),
                cursor,
                paused,
                stop,
                ended,
                volume_bits,
            ),
            SampleFormat::I8 => build_streaming_file_stream_for_sample::<i8>(
                &device,
                &config,
                Arc::clone(&pcm_buffer),
                Arc::clone(&render_state),
                cursor,
                paused,
                stop,
                ended,
                volume_bits,
            ),
            SampleFormat::I16 => build_streaming_file_stream_for_sample::<i16>(
                &device,
                &config,
                Arc::clone(&pcm_buffer),
                Arc::clone(&render_state),
                cursor,
                paused,
                stop,
                ended,
                volume_bits,
            ),
            SampleFormat::I24 => build_streaming_file_stream_for_sample::<cpal::I24>(
                &device,
                &config,
                Arc::clone(&pcm_buffer),
                Arc::clone(&render_state),
                cursor,
                paused,
                stop,
                ended,
                volume_bits,
            ),
            SampleFormat::I32 => build_streaming_file_stream_for_sample::<i32>(
                &device,
                &config,
                Arc::clone(&pcm_buffer),
                Arc::clone(&render_state),
                cursor,
                paused,
                stop,
                ended,
                volume_bits,
            ),
            SampleFormat::I64 => build_streaming_file_stream_for_sample::<i64>(
                &device,
                &config,
                Arc::clone(&pcm_buffer),
                Arc::clone(&render_state),
                cursor,
                paused,
                stop,
                ended,
                volume_bits,
            ),
            SampleFormat::U8 => build_streaming_file_stream_for_sample::<u8>(
                &device,
                &config,
                Arc::clone(&pcm_buffer),
                Arc::clone(&render_state),
                cursor,
                paused,
                stop,
                ended,
                volume_bits,
            ),
            SampleFormat::U16 => build_streaming_file_stream_for_sample::<u16>(
                &device,
                &config,
                Arc::clone(&pcm_buffer),
                Arc::clone(&render_state),
                cursor,
                paused,
                stop,
                ended,
                volume_bits,
            ),
            SampleFormat::U32 => build_streaming_file_stream_for_sample::<u32>(
                &device,
                &config,
                Arc::clone(&pcm_buffer),
                Arc::clone(&render_state),
                cursor,
                paused,
                stop,
                ended,
                volume_bits,
            ),
            SampleFormat::U64 => build_streaming_file_stream_for_sample::<u64>(
                &device,
                &config,
                pcm_buffer,
                render_state,
                cursor,
                paused,
                stop,
                ended,
                volume_bits,
            ),
            other => anyhow::bail!("Unsupported shared output sample format: {other:?}"),
        }?;
        stream
            .play()
            .context("Failed to start native streaming file playback stream")?;
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

    pub fn output_device_id(index: usize, name: &str) -> String {
        format!("{index}:{name}")
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
                (output_device_id(index, &name) == device_id).then_some(device)
            })
            .context("Selected output device is unavailable")
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
                            * TEST_TONE_GAIN;
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

    #[allow(dead_code, clippy::too_many_arguments)]
    fn build_file_stream_for_sample<T>(
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

    #[allow(dead_code, clippy::too_many_arguments)]
    fn build_streaming_file_stream_for_sample<T>(
        device: &cpal::Device,
        config: &cpal::StreamConfig,
        pcm_buffer: Arc<StreamingPcmBuffer>,
        render_state: Arc<Mutex<StreamingPcmRenderState>>,
        cursor: Arc<AtomicUsize>,
        paused: Arc<AtomicBool>,
        stop: Arc<AtomicBool>,
        ended: Arc<AtomicBool>,
        volume_bits: Arc<AtomicU32>,
    ) -> Result<Stream>
    where
        T: Sample + FromSample<f32> + cpal::SizedSample,
    {
        device
            .build_output_stream(
                config,
                move |data: &mut [T], _| {
                    if stop.load(Ordering::SeqCst) || paused.load(Ordering::SeqCst) {
                        for sample in data {
                            *sample = T::EQUILIBRIUM;
                        }
                        return;
                    }

                    let volume = f32::from_bits(volume_bits.load(Ordering::SeqCst)).clamp(0.0, 1.0);
                    let mut rendered = vec![0.0f32; data.len()];
                    let (status, cursor_samples) = {
                        let mut render = render_state
                            .lock()
                            .unwrap_or_else(|error| error.into_inner());
                        let status = render.fill_output(&pcm_buffer, &mut rendered, volume);
                        (status, render.cursor_samples())
                    };
                    cursor.store(cursor_samples, Ordering::SeqCst);
                    if status == StreamingPcmRenderStatus::Ended {
                        ended.store(true, Ordering::SeqCst);
                    }

                    for (output_sample, rendered_sample) in data.iter_mut().zip(rendered) {
                        *output_sample = T::from_sample(rendered_sample.clamp(-1.0, 1.0));
                    }
                },
                |_| {},
                None,
            )
            .context("Failed to build native streaming file playback stream")
    }

    fn sample_format_label(sample_format: SampleFormat) -> String {
        match sample_format {
            SampleFormat::F32 => "f32".to_string(),
            SampleFormat::F64 => "f64".to_string(),
            SampleFormat::I8 => "i8".to_string(),
            SampleFormat::I16 => "i16".to_string(),
            SampleFormat::I24 => "i24".to_string(),
            SampleFormat::I32 => "i32".to_string(),
            SampleFormat::I64 => "i64".to_string(),
            SampleFormat::U8 => "u8".to_string(),
            SampleFormat::U16 => "u16".to_string(),
            SampleFormat::U32 => "u32".to_string(),
            SampleFormat::U64 => "u64".to_string(),
            other => format!("{other:?}"),
        }
    }

    fn sample_format_bit_depth(sample_format: SampleFormat) -> Option<u16> {
        match sample_format {
            SampleFormat::F32 => Some(32),
            SampleFormat::F64 => Some(64),
            SampleFormat::I8 | SampleFormat::U8 => Some(8),
            SampleFormat::I16 | SampleFormat::U16 => Some(16),
            SampleFormat::I24 => Some(24),
            SampleFormat::I32 | SampleFormat::U32 => Some(32),
            SampleFormat::I64 | SampleFormat::U64 => Some(64),
            _ => None,
        }
    }
}

#[cfg(windows)]
mod platform {
    use std::env;
    use std::ffi::{c_char, c_void, CString, OsStr};
    use std::iter;
    use std::os::windows::ffi::OsStrExt;
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    use std::slice;
    use std::sync::{
        atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering},
        mpsc, Arc,
    };
    use std::time::Duration;

    use anyhow::{anyhow, Context, Result};
    use cpal::traits::{DeviceTrait, HostTrait};
    use cpal::Stream;
    use windows::core::{HRESULT, PCSTR, PCWSTR};
    use windows::Win32::Devices::Properties::DEVPKEY_Device_FriendlyName;
    use windows::Win32::Foundation::{FreeLibrary, HMODULE, RPC_E_CHANGED_MODE};
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IAudioClient, IAudioRenderClient, IMMDevice, IMMDeviceEnumerator,
        MMDeviceEnumerator, AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED, AUDCLNT_E_DEVICE_IN_USE,
        AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED, AUDCLNT_E_UNSUPPORTED_FORMAT,
        AUDCLNT_SHAREMODE_EXCLUSIVE, DEVICE_STATE_ACTIVE, WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
        WAVE_FORMAT_PCM,
    };
    use windows::Win32::Media::KernelStreaming::{
        KSDATAFORMAT_SUBTYPE_PCM, WAVE_FORMAT_EXTENSIBLE,
    };
    use windows::Win32::Media::Multimedia::{
        KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, WAVE_FORMAT_IEEE_FLOAT,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
        COINIT_MULTITHREADED, STGM_READ,
    };
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    use windows::Win32::System::Variant::VT_LPWSTR;

    use super::{
        format_error_chain, normalize_voicemeeter_bus, shared_cpal,
        voicemeeter_hardware_out_parameter_name, AudioFormatDiagnostics, AudioOutputDevice,
        AudioOutputDeviceBackend, ExclusiveProbeResult, ExclusiveProbeSecondOpen,
        ExclusiveProbeStatus, PlaybackCompletion, RawPcmAudio, RawPcmSampleKind,
        StreamingPcmBuffer, StreamingPcmRenderState, StreamingPcmRenderStatus,
        VoicemeeterHardwareOutConfig, VoicemeeterLevelProbe, VoicemeeterRemoteKind,
        VoicemeeterRemoteStatus, VoicemeeterRoutePrepareResult, VoicemeeterRouteSnapshot,
        VoicemeeterTestToneResult,
    };

    const HNS_PER_SECOND: i64 = 10_000_000;
    const EXCLUSIVE_POLL_INTERVAL_MS: u64 = 5;
    const TEST_TONE_GAIN: f32 = 0.18;
    const VOICEMEETER_AUTO_LAUNCH_RETRY_ATTEMPTS: usize = 60;
    const VOICEMEETER_AUTO_LAUNCH_EXE_FALLBACK_AFTER_ATTEMPTS: usize = 8;
    const VOICEMEETER_AUTO_LAUNCH_RETRY_DELAY_MS: u64 = 250;
    const VOICEMEETER_REMOTE_API_TIMEOUT_MS: u64 = 20_000;

    pub fn enumerate_output_devices() -> Result<Vec<AudioOutputDevice>> {
        shared_cpal::enumerate_output_devices(output_device_backend)
    }

    pub fn supports_exclusive_output() -> bool {
        true
    }

    pub fn resolve_voicemeeter_output_device_id(device_id: &str) -> Result<String> {
        let (resolved_device_id, _) = find_voicemeeter_output_device(device_id)?;
        Ok(resolved_device_id)
    }

    pub fn probe_voicemeeter_remote_api(
        device_id: &str,
        bus: &str,
        hardware_out_config: Option<&VoicemeeterHardwareOutConfig>,
    ) -> VoicemeeterRemoteStatus {
        inspect_voicemeeter_remote_api_with_timeout(device_id, false, bus, hardware_out_config)
            .status
    }

    pub fn prepare_voicemeeter_remote_route(
        device_id: &str,
        selected_name_hint: &str,
        bus: &str,
        hardware_out_config: Option<&VoicemeeterHardwareOutConfig>,
    ) -> VoicemeeterRoutePrepareResult {
        let mut result = inspect_voicemeeter_remote_api_with_timeout(
            selected_name_hint,
            true,
            bus,
            hardware_out_config,
        );
        annotate_voicemeeter_route_snapshot(&mut result, device_id, selected_name_hint);
        if result.status.available && result.status.connected {
            return result;
        }

        if selected_name_hint == device_id {
            return result;
        }

        let mut fallback_result =
            inspect_voicemeeter_remote_api_with_timeout(device_id, true, bus, hardware_out_config);
        annotate_voicemeeter_route_snapshot(&mut fallback_result, device_id, selected_name_hint);
        fallback_result
    }

    #[cfg_attr(test, allow(dead_code))]
    pub fn restore_voicemeeter_remote_route(
        snapshot: &VoicemeeterRouteSnapshot,
    ) -> VoicemeeterRemoteStatus {
        match VoicemeeterRemoteLibrary::load() {
            Ok(mut library) => library.restore(snapshot),
            Err(error) => VoicemeeterRemoteStatus::unavailable(format!(
                "Voicemeeter Remote API unavailable during route restore: {error}"
            )),
        }
    }

    pub fn open_shared_silence_stream(device_id: &str) -> Result<Stream> {
        shared_cpal::open_silence_stream(device_id)
    }

    pub fn validate_shared_playback_device(device_id: &str) -> Result<()> {
        shared_cpal::validate_playback_device(device_id)
    }

    pub fn describe_shared_output_format(device_id: &str) -> Result<AudioFormatDiagnostics> {
        shared_cpal::describe_output_format(device_id)
    }

    pub fn describe_exclusive_playback_device(device_id: &str) -> Result<String> {
        let _com = ComGuard::initialize()?;
        unsafe {
            let device = find_wasapi_output_device(device_id)?;
            wasapi_device_friendly_name(&device)
        }
    }

    pub fn describe_exclusive_output_format(
        device_id: &str,
        source_sample_rate: u32,
        source_channels: u16,
    ) -> Result<AudioFormatDiagnostics> {
        let _com = ComGuard::initialize()?;
        unsafe {
            let device = find_wasapi_output_device(device_id)?;
            let audio_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .context("Failed to activate WASAPI audio client")?;
            let selected_format =
                select_exclusive_wave_format(&audio_client, source_sample_rate, source_channels)?;

            Ok(selected_format
                .format
                .diagnostics(format!("WASAPI exclusive {}", selected_format.source)))
        }
    }

    #[allow(dead_code)]
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
        shared_cpal::build_file_stream(
            device_id,
            source_sample_rate,
            source_channels,
            samples,
            cursor,
            paused,
            stop,
            volume_bits,
        )
    }

    pub fn build_shared_streaming_file_stream(
        device_id: &str,
        source_sample_rate: u32,
        source_channels: u16,
        pcm_buffer: Arc<StreamingPcmBuffer>,
        cursor: Arc<AtomicUsize>,
        paused: Arc<AtomicBool>,
        stop: Arc<AtomicBool>,
        ended: Arc<AtomicBool>,
        volume_bits: Arc<AtomicU32>,
    ) -> Result<Stream> {
        shared_cpal::build_streaming_file_stream(
            device_id,
            source_sample_rate,
            source_channels,
            pcm_buffer,
            cursor,
            paused,
            stop,
            ended,
            volume_bits,
        )
    }

    pub fn play_test_tone(device_id: &str, duration_ms: u64, frequency_hz: f32) -> Result<()> {
        shared_cpal::play_test_tone(device_id, duration_ms, frequency_hz)
    }

    fn play_test_tone_with_voicemeeter_level_probe(
        device_id: &str,
        duration_ms: u64,
        frequency_hz: f32,
        bus: &str,
        kind: VoicemeeterRemoteKind,
        strip: i32,
        input_channel_start: i32,
    ) -> Result<Option<VoicemeeterLevelProbe>> {
        let probe_bus = normalize_voicemeeter_bus(bus).to_string();
        let probe_duration_ms = duration_ms;
        let probe_handle = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(40));
            VoicemeeterRemoteLibrary::load()
                .map(|mut library| {
                    library.probe_level_activity(
                        &probe_bus,
                        kind,
                        strip,
                        input_channel_start,
                        probe_duration_ms,
                    )
                })
                .map_err(|error| format_error_chain(&error))
        });

        let play_result = play_test_tone(device_id, duration_ms, frequency_hz);
        let level_probe = match probe_handle.join() {
            Ok(Ok(probe)) => Some(probe),
            Ok(Err(reason)) => Some(create_failed_voicemeeter_level_probe(bus, reason)),
            Err(_) => Some(create_failed_voicemeeter_level_probe(
                bus,
                "Voicemeeter level probe thread panicked.".to_string(),
            )),
        };

        play_result?;
        Ok(level_probe)
    }

    pub fn play_voicemeeter_test_tone(
        device_id: &str,
        duration_ms: u64,
        frequency_hz: f32,
        bus: &str,
    ) -> Result<VoicemeeterTestToneResult> {
        let (resolved_device_id, _) = find_voicemeeter_output_device(device_id)?;
        let remote_kind =
            inspect_voicemeeter_remote_api_with_timeout(&resolved_device_id, false, bus, None)
                .status
                .kind
                .unwrap_or(VoicemeeterRemoteKind::Unknown);
        let virtual_input_strip = voicemeeter_virtual_input_strip(remote_kind, &resolved_device_id);
        let level_probe = play_test_tone_with_voicemeeter_level_probe(
            &resolved_device_id,
            duration_ms,
            frequency_hz,
            bus,
            remote_kind,
            virtual_input_strip,
            voicemeeter_virtual_input_channel_start(remote_kind, virtual_input_strip),
        )?;
        Ok(VoicemeeterTestToneResult {
            device_id: resolved_device_id,
            level_probe,
        })
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
            let selected_format = select_exclusive_wave_format(&audio_client, 0, 2)?;
            let format_ptr = selected_format.as_ptr();
            let format = selected_format.format;
            let buffer_duration =
                exclusive_buffer_duration_hns(&audio_client, buffer_frames, format.sample_rate_hz)?;

            let initialized_audio_client = initialize_exclusive_audio_client(
                &device,
                audio_client,
                format_ptr,
                &format,
                buffer_duration,
                "WASAPI exclusive output stream",
            )?;
            let audio_client = initialized_audio_client.audio_client;
            let buffer_size = initialized_audio_client.buffer_size;

            let render_client = audio_client
                .GetService::<IAudioRenderClient>()
                .context("Failed to create WASAPI render client")?;
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
                "format={}, buffer={} frames, source={}.",
                format.summary(),
                buffer_size,
                selected_format.source
            ))
        }
    }

    pub fn probe_exclusive_lock(
        device_id: &str,
        buffer_frames: u32,
    ) -> Result<ExclusiveProbeResult> {
        let _com = ComGuard::initialize()?;

        unsafe {
            let device = find_wasapi_output_device(device_id)?;
            let device_name = wasapi_device_friendly_name(&device)
                .unwrap_or_else(|_| "selected WASAPI output device".to_string());
            let audio_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .context("Failed to activate first WASAPI audio client")?;
            let selected_format = select_exclusive_wave_format(&audio_client, 0, 2)?;
            let format_ptr = selected_format.as_ptr();
            let format = selected_format.format;
            let buffer_duration =
                exclusive_buffer_duration_hns(&audio_client, buffer_frames, format.sample_rate_hz)?;

            let initialized_audio_client = initialize_exclusive_audio_client(
                &device,
                audio_client,
                format_ptr,
                &format,
                buffer_duration,
                "first WASAPI exclusive output stream",
            )?;
            let audio_client = initialized_audio_client.audio_client;
            let buffer_size = initialized_audio_client.buffer_size;
            let buffer_duration = initialized_audio_client.buffer_duration_hns;

            let render_client = audio_client
                .GetService::<IAudioRenderClient>()
                .context("Failed to create first WASAPI render client")?;
            write_silence_frames(&render_client, buffer_size, &format)?;
            audio_client
                .Start()
                .context("Failed to start first WASAPI exclusive output stream")?;

            std::thread::sleep(Duration::from_millis(EXCLUSIVE_POLL_INTERVAL_MS * 4));

            let second_audio_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .context("Failed to activate second WASAPI audio client")?;
            let second_initialize_result = second_audio_client.Initialize(
                AUDCLNT_SHAREMODE_EXCLUSIVE,
                0,
                buffer_duration,
                buffer_duration,
                format_ptr,
                None,
            );

            audio_client
                .Stop()
                .context("Failed to stop first WASAPI exclusive output stream")?;

            match second_initialize_result {
                Ok(()) => Ok(ExclusiveProbeResult {
                    status: ExclusiveProbeStatus::Failed,
                    device_name: Some(device_name),
                    format: Some(format.summary()),
                    buffer_frames: Some(buffer_size),
                    buffer_duration_hns: Some(buffer_duration),
                    source: Some(selected_format.source),
                    second_open: Some(ExclusiveProbeSecondOpen::UnexpectedSuccess),
                    error_code: None,
                    reason: Some(
                        "Second WASAPI exclusive stream opened successfully while the first stream was active."
                            .to_string(),
                    ),
                }),
                Err(error) if error.code() == AUDCLNT_E_DEVICE_IN_USE => {
                    Ok(ExclusiveProbeResult {
                        status: ExclusiveProbeStatus::Passed,
                        device_name: Some(device_name),
                        format: Some(format.summary()),
                        buffer_frames: Some(buffer_size),
                        buffer_duration_hns: Some(buffer_duration),
                        source: Some(selected_format.source),
                        second_open: Some(ExclusiveProbeSecondOpen::DeviceInUse),
                        error_code: Some("AUDCLNT_E_DEVICE_IN_USE".to_string()),
                        reason: None,
                    })
                }
                Err(error) => {
                    let reason = describe_wasapi_hresult(error.code());
                    Ok(ExclusiveProbeResult {
                        status: ExclusiveProbeStatus::Failed,
                        device_name: Some(device_name),
                        format: Some(format.summary()),
                        buffer_frames: Some(buffer_size),
                        buffer_duration_hns: Some(buffer_duration),
                        source: Some(selected_format.source),
                        second_open: Some(ExclusiveProbeSecondOpen::UnexpectedError),
                        error_code: Some(error.code().to_string()),
                        reason: Some(format!(
                            "Second WASAPI exclusive stream returned unexpected result: {reason}"
                        )),
                    })
                }
            }
        }
    }

    pub fn play_exclusive_file(
        device_id: &str,
        buffer_frames: u32,
        source_sample_rate: u32,
        source_channels: u16,
        pcm_buffer: Arc<StreamingPcmBuffer>,
        cursor: Arc<AtomicUsize>,
        paused: Arc<AtomicBool>,
        stop: Arc<AtomicBool>,
        ended: Arc<AtomicBool>,
        volume_bits: Arc<AtomicU32>,
        on_started: impl FnOnce(),
    ) -> Result<PlaybackCompletion> {
        let _com = ComGuard::initialize()?;
        let source_channels = source_channels.max(1);

        unsafe {
            let device = find_wasapi_output_device(device_id)?;
            let audio_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .context("Failed to activate WASAPI audio client")?;
            let selected_format =
                select_exclusive_wave_format(&audio_client, source_sample_rate, source_channels)?;
            let format_ptr = selected_format.as_ptr();
            let format = selected_format.format;
            let buffer_duration =
                exclusive_buffer_duration_hns(&audio_client, buffer_frames, format.sample_rate_hz)?;

            let initialized_audio_client = initialize_exclusive_audio_client(
                &device,
                audio_client,
                format_ptr,
                &format,
                buffer_duration,
                "WASAPI exclusive output stream",
            )?;
            let audio_client = initialized_audio_client.audio_client;
            let buffer_size = initialized_audio_client.buffer_size;

            let render_client = audio_client
                .GetService::<IAudioRenderClient>()
                .context("Failed to create WASAPI render client")?;
            let mut render_state = StreamingPcmRenderState::new(
                source_sample_rate,
                format.sample_rate_hz,
                usize::from(source_channels),
                usize::from(format.channels.max(1)),
            );

            let mut completion = write_streaming_file_frames(
                &render_client,
                buffer_size,
                &format,
                &pcm_buffer,
                &mut render_state,
                &cursor,
                &paused,
                &stop,
                &ended,
                &volume_bits,
            )?;

            if completion == Some(PlaybackCompletion::Stopped) {
                return Ok(PlaybackCompletion::Stopped);
            }

            audio_client
                .Start()
                .context("Failed to start WASAPI exclusive output stream")?;
            on_started();

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

                completion = write_streaming_file_frames(
                    &render_client,
                    available_frames,
                    &format,
                    &pcm_buffer,
                    &mut render_state,
                    &cursor,
                    &paused,
                    &stop,
                    &ended,
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

    pub fn play_exclusive_raw_pcm_file(
        device_id: &str,
        buffer_frames: u32,
        raw_pcm_audio: Arc<RawPcmAudio>,
        cursor: Arc<AtomicUsize>,
        paused: Arc<AtomicBool>,
        stop: Arc<AtomicBool>,
        ended: Arc<AtomicBool>,
        volume_bits: Arc<AtomicU32>,
        on_started: impl FnOnce(),
    ) -> Result<PlaybackCompletion> {
        let _com = ComGuard::initialize()?;

        unsafe {
            let device = find_wasapi_output_device(device_id)?;
            let audio_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .context("Failed to activate WASAPI audio client")?;
            let selected_format = select_exclusive_wave_format(
                &audio_client,
                raw_pcm_audio.sample_rate,
                raw_pcm_audio.channels,
            )?;
            let format_ptr = selected_format.as_ptr();
            let format = selected_format.format;
            ensure_raw_pcm_format_matches(&raw_pcm_audio, &format)?;
            let buffer_duration =
                exclusive_buffer_duration_hns(&audio_client, buffer_frames, format.sample_rate_hz)?;

            let initialized_audio_client = initialize_exclusive_audio_client(
                &device,
                audio_client,
                format_ptr,
                &format,
                buffer_duration,
                "WASAPI exclusive raw PCM stream",
            )?;
            let audio_client = initialized_audio_client.audio_client;
            let buffer_size = initialized_audio_client.buffer_size;

            let render_client = audio_client
                .GetService::<IAudioRenderClient>()
                .context("Failed to create WASAPI render client")?;
            let mut cursor_frames = 0usize;

            let mut completion = write_raw_pcm_file_frames(
                &render_client,
                buffer_size,
                &format,
                &raw_pcm_audio,
                &mut cursor_frames,
                &cursor,
                &paused,
                &stop,
                &ended,
                &volume_bits,
            )?;

            if completion == Some(PlaybackCompletion::Stopped) {
                return Ok(PlaybackCompletion::Stopped);
            }

            audio_client
                .Start()
                .context("Failed to start WASAPI exclusive raw PCM stream")?;
            on_started();

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

                completion = write_raw_pcm_file_frames(
                    &render_client,
                    available_frames,
                    &format,
                    &raw_pcm_audio,
                    &mut cursor_frames,
                    &cursor,
                    &paused,
                    &stop,
                    &ended,
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
                .context("Failed to stop WASAPI exclusive raw PCM stream")?;

            Ok(completion)
        }
    }

    type VbvmrLogin = unsafe extern "system" fn() -> i32;
    type VbvmrLogout = unsafe extern "system" fn() -> i32;
    type VbvmrGetVoicemeeterType = unsafe extern "system" fn(*mut i32) -> i32;
    type VbvmrGetVoicemeeterVersion = unsafe extern "system" fn(*mut i32) -> i32;
    type VbvmrIsParametersDirty = unsafe extern "system" fn() -> i32;
    type VbvmrGetParameterFloat = unsafe extern "system" fn(*mut c_char, *mut f32) -> i32;
    type VbvmrSetParameterFloat = unsafe extern "system" fn(*mut c_char, f32) -> i32;
    type VbvmrSetParameterStringA = unsafe extern "system" fn(*mut c_char, *mut c_char) -> i32;
    type VbvmrSetParameterStringW = unsafe extern "system" fn(*mut c_char, *mut u16) -> i32;
    type VbvmrGetLevel = unsafe extern "system" fn(i32, i32, *mut f32) -> i32;
    type VbvmrRunVoicemeeter = unsafe extern "system" fn(i32) -> i32;

    struct VoicemeeterRemoteLibrary {
        handle: HMODULE,
        path: String,
        login: VbvmrLogin,
        logout: VbvmrLogout,
        get_type: VbvmrGetVoicemeeterType,
        get_version: VbvmrGetVoicemeeterVersion,
        is_parameters_dirty: Option<VbvmrIsParametersDirty>,
        get_parameter_float: VbvmrGetParameterFloat,
        set_parameter_float: VbvmrSetParameterFloat,
        set_parameter_string_a: Option<VbvmrSetParameterStringA>,
        set_parameter_string_w: Option<VbvmrSetParameterStringW>,
        get_level: VbvmrGetLevel,
        run_voicemeeter: Option<VbvmrRunVoicemeeter>,
        logged_in: bool,
    }

    impl VoicemeeterRemoteLibrary {
        fn load() -> Result<Self> {
            let mut errors = Vec::new();
            for candidate in voicemeeter_remote_library_candidates() {
                match unsafe { Self::load_from_candidate(&candidate) } {
                    Ok(library) => return Ok(library),
                    Err(error) => errors.push(format!("{}: {error}", candidate.display())),
                }
            }

            Err(anyhow!(
                "Voicemeeter Remote API DLL was not found or could not be loaded. {}",
                errors.join("; ")
            ))
        }

        unsafe fn load_from_candidate(candidate: &PathBuf) -> Result<Self> {
            let wide = wide_null(candidate.as_os_str());
            let handle = LoadLibraryW(PCWSTR(wide.as_ptr()))
                .with_context(|| format!("Failed to load {}", candidate.display()))?;

            let load_result = (|| -> Result<Self> {
                Ok(Self {
                    handle,
                    path: candidate.display().to_string(),
                    login: load_voicemeeter_proc(handle, b"VBVMR_Login\0")?,
                    logout: load_voicemeeter_proc(handle, b"VBVMR_Logout\0")?,
                    get_type: load_voicemeeter_proc(handle, b"VBVMR_GetVoicemeeterType\0")?,
                    get_version: load_voicemeeter_proc(handle, b"VBVMR_GetVoicemeeterVersion\0")?,
                    is_parameters_dirty: load_optional_voicemeeter_proc(
                        handle,
                        b"VBVMR_IsParametersDirty\0",
                    ),
                    get_parameter_float: load_voicemeeter_proc(
                        handle,
                        b"VBVMR_GetParameterFloat\0",
                    )?,
                    set_parameter_float: load_voicemeeter_proc(
                        handle,
                        b"VBVMR_SetParameterFloat\0",
                    )?,
                    set_parameter_string_a: load_optional_voicemeeter_proc(
                        handle,
                        b"VBVMR_SetParameterStringA\0",
                    ),
                    set_parameter_string_w: load_optional_voicemeeter_proc(
                        handle,
                        b"VBVMR_SetParameterStringW\0",
                    ),
                    get_level: load_voicemeeter_proc(handle, b"VBVMR_GetLevel\0")?,
                    run_voicemeeter: load_optional_voicemeeter_proc(
                        handle,
                        b"VBVMR_RunVoicemeeter\0",
                    ),
                    logged_in: false,
                })
            })();

            if load_result.is_err() {
                let _ = FreeLibrary(handle);
            }

            load_result
        }

        fn inspect(
            &mut self,
            device_name: &str,
            apply_route: bool,
            bus: &str,
            hardware_out_config: Option<&VoicemeeterHardwareOutConfig>,
        ) -> VoicemeeterRoutePrepareResult {
            let bus = normalize_voicemeeter_bus(bus);
            let hardware_out_fields = hardware_out_config.cloned();
            let login_result = self.login_with_auto_launch();
            self.logged_in = login_result == 0;
            if login_result != 0 {
                return VoicemeeterRoutePrepareResult {
                    status: VoicemeeterRemoteStatus {
                        available: true,
                        connected: false,
                        route_applied: None,
                        route_managed: None,
                        route_bus: Some(bus.to_string()),
                        hardware_out_applied: None,
                        hardware_out_bus: hardware_out_fields
                            .as_ref()
                            .map(|config| config.bus.clone()),
                        hardware_out_driver: hardware_out_fields
                            .as_ref()
                            .map(|config| config.driver.clone()),
                        hardware_out_device: hardware_out_fields
                            .as_ref()
                            .map(|config| config.device.clone()),
                        kind: None,
                        version: None,
                        virtual_input_strip: None,
                        dll_path: Some(self.path.clone()),
                        level_probe: None,
                        reason: Some(format_voicemeeter_remote_result(
                            "VBVMR_Login",
                            login_result,
                        )),
                    },
                    snapshot: None,
                };
            }

            let mut raw_kind = 0;
            let type_result = unsafe { (self.get_type)(&mut raw_kind) };
            if type_result != 0 {
                return VoicemeeterRoutePrepareResult {
                    status: VoicemeeterRemoteStatus {
                        available: true,
                        connected: false,
                        route_applied: None,
                        route_managed: None,
                        route_bus: Some(bus.to_string()),
                        hardware_out_applied: None,
                        hardware_out_bus: hardware_out_fields
                            .as_ref()
                            .map(|config| config.bus.clone()),
                        hardware_out_driver: hardware_out_fields
                            .as_ref()
                            .map(|config| config.driver.clone()),
                        hardware_out_device: hardware_out_fields
                            .as_ref()
                            .map(|config| config.device.clone()),
                        kind: None,
                        version: None,
                        virtual_input_strip: None,
                        dll_path: Some(self.path.clone()),
                        level_probe: None,
                        reason: Some(format_voicemeeter_remote_result(
                            "VBVMR_GetVoicemeeterType",
                            type_result,
                        )),
                    },
                    snapshot: None,
                };
            }

            self.wait_for_parameters_ready();

            let kind = voicemeeter_remote_kind(raw_kind);
            let mut raw_version = 0;
            let version = (unsafe { (self.get_version)(&mut raw_version) } == 0)
                .then(|| format_voicemeeter_version(raw_version));
            let strip = voicemeeter_virtual_input_strip(kind, device_name);
            let (route_applied, snapshot) = if apply_route {
                let (applied, previous_value) = self.set_virtual_input_bus(strip, bus);
                let snapshot = if applied {
                    previous_value.map(|previous_value| VoicemeeterRouteSnapshot {
                        resolved_device_id: device_name.to_string(),
                        selected_name_hint: device_name.to_string(),
                        strip,
                        bus: bus.to_string(),
                        previous_value,
                    })
                } else {
                    None
                };

                (Some(applied), snapshot)
            } else {
                (None, None)
            };
            let hardware_out_applied = if apply_route {
                hardware_out_config.map(|config| self.set_hardware_out_device(config))
            } else {
                None
            };
            let reason = match route_applied {
                Some(true) => Some(create_voicemeeter_route_reason(
                    strip,
                    bus,
                    hardware_out_config,
                    hardware_out_applied,
                )),
                Some(false) => Some(format!(
                    "Voicemeeter Remote API connected, but routing Strip[{strip}].{bus} failed."
                )),
                None => Some("Voicemeeter Remote API connected.".to_string()),
            };

            VoicemeeterRoutePrepareResult {
                status: VoicemeeterRemoteStatus {
                    available: true,
                    connected: true,
                    route_applied,
                    route_managed: route_applied.map(|applied| applied && snapshot.is_some()),
                    route_bus: Some(bus.to_string()),
                    hardware_out_applied,
                    hardware_out_bus: hardware_out_config.map(|config| config.bus.clone()),
                    hardware_out_driver: hardware_out_config.map(|config| config.driver.clone()),
                    hardware_out_device: hardware_out_config.map(|config| config.device.clone()),
                    kind: Some(kind),
                    version,
                    virtual_input_strip: Some(strip),
                    dll_path: Some(self.path.clone()),
                    level_probe: None,
                    reason,
                },
                snapshot,
            }
        }

        fn set_virtual_input_bus(&self, strip: i32, bus: &str) -> (bool, Option<f32>) {
            let bus = normalize_voicemeeter_bus(bus);
            let Ok(parameter_name) = CString::new(format!("Strip[{strip}].{bus}")) else {
                return (false, None);
            };
            let previous_value = self.get_parameter_float(parameter_name.as_c_str());
            let applied =
                unsafe { (self.set_parameter_float)(parameter_name.as_ptr() as *mut c_char, 1.0) }
                    == 0;
            (applied, previous_value)
        }

        fn set_hardware_out_device(&self, config: &VoicemeeterHardwareOutConfig) -> bool {
            let parameter_name = voicemeeter_hardware_out_parameter_name(config);
            let Ok(parameter_name) = CString::new(parameter_name) else {
                return false;
            };

            if let Some(set_parameter_string_w) = self.set_parameter_string_w {
                let mut device = wide_null(OsStr::new(&config.device));
                let result = unsafe {
                    set_parameter_string_w(
                        parameter_name.as_ptr() as *mut c_char,
                        device.as_mut_ptr(),
                    )
                };
                return result == 0;
            }

            let Some(set_parameter_string_a) = self.set_parameter_string_a else {
                return false;
            };
            let Ok(device) = CString::new(config.device.as_str()) else {
                return false;
            };

            let result = unsafe {
                set_parameter_string_a(
                    parameter_name.as_ptr() as *mut c_char,
                    device.as_ptr() as *mut c_char,
                )
            };
            result == 0
        }

        fn get_parameter_float(&self, parameter_name: &std::ffi::CStr) -> Option<f32> {
            let mut value = 0.0;
            let result = unsafe {
                (self.get_parameter_float)(parameter_name.as_ptr() as *mut c_char, &mut value)
            };
            (result == 0).then_some(value)
        }

        fn wait_for_parameters_ready(&self) {
            let Some(is_parameters_dirty) = self.is_parameters_dirty else {
                return;
            };

            for _ in 0..VOICEMEETER_AUTO_LAUNCH_RETRY_ATTEMPTS {
                let result = unsafe { is_parameters_dirty() };
                if result == 0 {
                    return;
                }
                if result < 0 {
                    return;
                }
                std::thread::sleep(Duration::from_millis(
                    VOICEMEETER_AUTO_LAUNCH_RETRY_DELAY_MS,
                ));
            }
        }

        #[cfg_attr(test, allow(dead_code))]
        fn restore(&mut self, snapshot: &VoicemeeterRouteSnapshot) -> VoicemeeterRemoteStatus {
            let bus = normalize_voicemeeter_bus(&snapshot.bus);
            let login_result = self.login_with_auto_launch();
            self.logged_in = login_result == 0;
            if login_result != 0 {
                return VoicemeeterRemoteStatus {
                    available: true,
                    connected: false,
                    route_applied: None,
                    route_managed: None,
                    route_bus: Some(bus.to_string()),
                    hardware_out_applied: None,
                    hardware_out_bus: None,
                    hardware_out_driver: None,
                    hardware_out_device: None,
                    kind: None,
                    version: None,
                    virtual_input_strip: Some(snapshot.strip),
                    dll_path: Some(self.path.clone()),
                    level_probe: None,
                    reason: Some(format_voicemeeter_remote_result(
                        "VBVMR_Login",
                        login_result,
                    )),
                };
            }

            let restored = self.restore_virtual_input_bus(snapshot);

            VoicemeeterRemoteStatus {
                available: true,
                connected: true,
                route_applied: Some(restored),
                route_managed: Some(false),
                route_bus: Some(bus.to_string()),
                hardware_out_applied: None,
                hardware_out_bus: None,
                hardware_out_driver: None,
                hardware_out_device: None,
                kind: None,
                version: None,
                virtual_input_strip: Some(snapshot.strip),
                dll_path: Some(self.path.clone()),
                level_probe: None,
                reason: Some(if restored {
                    format!(
                        "Voicemeeter Remote API restored Strip[{}].{bus}.",
                        snapshot.strip
                    )
                } else {
                    format!(
                        "Voicemeeter Remote API connected, but restoring Strip[{}].{bus} failed.",
                        snapshot.strip
                    )
                }),
            }
        }

        #[cfg_attr(test, allow(dead_code))]
        fn restore_virtual_input_bus(&self, snapshot: &VoicemeeterRouteSnapshot) -> bool {
            let bus = normalize_voicemeeter_bus(&snapshot.bus);
            let Ok(parameter_name) = CString::new(format!("Strip[{}].{bus}", snapshot.strip))
            else {
                return false;
            };
            unsafe {
                (self.set_parameter_float)(
                    parameter_name.as_ptr() as *mut c_char,
                    snapshot.previous_value,
                ) == 0
            }
        }

        fn probe_level_activity(
            &mut self,
            bus: &str,
            kind: VoicemeeterRemoteKind,
            strip: i32,
            input_channel_start: i32,
            duration_ms: u64,
        ) -> VoicemeeterLevelProbe {
            let bus = normalize_voicemeeter_bus(bus);
            let login_result = self.login_with_auto_launch();
            self.logged_in = login_result == 0;
            if login_result != 0 {
                return create_failed_voicemeeter_level_probe(
                    bus,
                    format_voicemeeter_remote_result("VBVMR_Login", login_result),
                );
            }

            let mut best_probe = None;
            for channel_start in voicemeeter_bus_output_channel_starts(kind, bus) {
                let output_probe = self.probe_level_channels(
                    "outputBus",
                    bus,
                    None,
                    3,
                    channel_start,
                    duration_ms,
                );
                if output_probe.active {
                    return output_probe;
                }
                keep_stronger_voicemeeter_level_probe(&mut best_probe, output_probe);
            }

            for level_type in [0, 1, 2] {
                let input_probe = self.probe_level_channels(
                    "virtualInput",
                    bus,
                    Some(strip),
                    level_type,
                    input_channel_start,
                    duration_ms,
                );
                if input_probe.active {
                    return input_probe;
                }
                keep_stronger_voicemeeter_level_probe(&mut best_probe, input_probe);
            }

            best_probe.unwrap_or_else(|| {
                create_failed_voicemeeter_level_probe(bus, "No level probe was run.")
            })
        }

        fn probe_level_channels(
            &self,
            target: &str,
            bus: &str,
            strip: Option<i32>,
            level_type: i32,
            channel_start: i32,
            duration_ms: u64,
        ) -> VoicemeeterLevelProbe {
            const CHANNELS: i32 = 2;
            const THRESHOLD: f32 = 0.001;
            const INTERVAL_MS: u64 = 20;

            let sample_count = ((duration_ms.max(INTERVAL_MS) + INTERVAL_MS - 1) / INTERVAL_MS)
                .clamp(1, 200) as u32;
            let mut samples = 0;
            let mut active_samples = 0;
            let mut max_level = 0.0f32;
            let mut first_error = None;

            for index in 0..sample_count {
                let mut sample_active = false;
                for offset in 0..CHANNELS {
                    let mut value = 0.0f32;
                    let result =
                        unsafe { (self.get_level)(level_type, channel_start + offset, &mut value) };
                    if result == 0 {
                        let level = value.abs();
                        max_level = max_level.max(level);
                        sample_active |= level > THRESHOLD;
                    } else if first_error.is_none() {
                        first_error =
                            Some(format_voicemeeter_remote_result("VBVMR_GetLevel", result));
                    }
                }

                samples += 1;
                if sample_active {
                    active_samples += 1;
                }

                if index + 1 < sample_count {
                    std::thread::sleep(Duration::from_millis(INTERVAL_MS));
                }
            }

            let active = active_samples > 0;
            let reason = if active {
                Some(format_voicemeeter_level_probe_reason(
                    target, true, bus, strip, THRESHOLD,
                ))
            } else {
                first_error.or_else(|| {
                    Some(format_voicemeeter_level_probe_reason(
                        target, false, bus, strip, THRESHOLD,
                    ))
                })
            };

            VoicemeeterLevelProbe {
                active,
                target: target.to_string(),
                bus: bus.to_string(),
                strip,
                level_type,
                channel_start,
                channels: CHANNELS,
                samples,
                active_samples,
                max_level,
                threshold: THRESHOLD,
                reason,
            }
        }

        fn login_with_auto_launch(&self) -> i32 {
            let login_result = unsafe { (self.login)() };
            if login_result == 0 {
                return login_result;
            }
            if login_result == 1 {
                let (launched_with_remote_api, mut launched_with_exe_fallback) =
                    self.launch_voicemeeter_application();
                if !launched_with_remote_api && !launched_with_exe_fallback {
                    return login_result;
                }
                self.wait_for_voicemeeter_remote_ready_after_launch(
                    launched_with_remote_api,
                    &mut launched_with_exe_fallback,
                );
                return 0;
            }
            if !should_auto_launch_voicemeeter_after_login_result(login_result) {
                return login_result;
            }

            let (launched_with_remote_api, mut launched_with_exe_fallback) =
                self.launch_voicemeeter_application();
            if !launched_with_remote_api && !launched_with_exe_fallback {
                return login_result;
            }

            let mut last_result = login_result;
            for attempt in 0..VOICEMEETER_AUTO_LAUNCH_RETRY_ATTEMPTS {
                std::thread::sleep(Duration::from_millis(
                    VOICEMEETER_AUTO_LAUNCH_RETRY_DELAY_MS,
                ));
                let retry_result = unsafe { (self.login)() };
                if retry_result == 0 {
                    return retry_result;
                }
                if retry_result == 1 {
                    self.wait_for_voicemeeter_remote_ready_after_launch(
                        launched_with_remote_api,
                        &mut launched_with_exe_fallback,
                    );
                    return 0;
                }
                if !should_auto_launch_voicemeeter_after_login_result(retry_result) {
                    return retry_result;
                }
                last_result = retry_result;

                if launched_with_remote_api
                    && !launched_with_exe_fallback
                    && attempt + 1 == VOICEMEETER_AUTO_LAUNCH_EXE_FALLBACK_AFTER_ATTEMPTS
                {
                    launched_with_exe_fallback = launch_voicemeeter_application(&self.path);
                }
            }

            last_result
        }

        fn launch_voicemeeter_application(&self) -> (bool, bool) {
            let launched_with_remote_api = self.run_voicemeeter_application();
            let launched_with_exe_fallback = if launched_with_remote_api {
                false
            } else {
                launch_voicemeeter_application(&self.path)
            };

            (launched_with_remote_api, launched_with_exe_fallback)
        }

        fn wait_for_voicemeeter_remote_ready_after_launch(
            &self,
            launched_with_remote_api: bool,
            launched_with_exe_fallback: &mut bool,
        ) {
            for attempt in 0..VOICEMEETER_AUTO_LAUNCH_RETRY_ATTEMPTS {
                std::thread::sleep(Duration::from_millis(
                    VOICEMEETER_AUTO_LAUNCH_RETRY_DELAY_MS,
                ));

                let mut raw_kind = 0;
                if unsafe { (self.get_type)(&mut raw_kind) } == 0 {
                    return;
                }

                if launched_with_remote_api
                    && !*launched_with_exe_fallback
                    && attempt + 1 == VOICEMEETER_AUTO_LAUNCH_EXE_FALLBACK_AFTER_ATTEMPTS
                {
                    *launched_with_exe_fallback = launch_voicemeeter_application(&self.path);
                }
            }
        }

        fn run_voicemeeter_application(&self) -> bool {
            let Some(run_voicemeeter) = self.run_voicemeeter else {
                return false;
            };

            for run_type in voicemeeter_remote_run_type_candidates() {
                if unsafe { run_voicemeeter(*run_type) } == 0 {
                    return true;
                }
            }

            false
        }
    }

    impl Drop for VoicemeeterRemoteLibrary {
        fn drop(&mut self) {
            unsafe {
                if self.logged_in {
                    let _ = (self.logout)();
                }
                let _ = FreeLibrary(self.handle);
            }
        }
    }

    fn create_voicemeeter_route_reason(
        strip: i32,
        bus: &str,
        hardware_out_config: Option<&VoicemeeterHardwareOutConfig>,
        hardware_out_applied: Option<bool>,
    ) -> String {
        let mut reason =
            format!("Voicemeeter Remote API connected and routed Strip[{strip}].{bus}.");
        if let Some(config) = hardware_out_config {
            let driver = config.driver.to_ascii_uppercase();
            let outcome = match hardware_out_applied {
                Some(true) => "applied",
                Some(false) => "failed",
                None => "skipped",
            };
            reason.push_str(&format!(
                " HARDWARE OUT {} {driver}: {} {outcome}.",
                config.bus, config.device
            ));
        }
        reason
    }

    fn create_voicemeeter_remote_timeout_result(
        apply_route: bool,
        bus: &str,
        hardware_out_config: Option<&VoicemeeterHardwareOutConfig>,
    ) -> VoicemeeterRoutePrepareResult {
        let hardware_out_config = hardware_out_config.cloned();
        let operation = if apply_route { "route" } else { "probe" };

        VoicemeeterRoutePrepareResult {
            status: VoicemeeterRemoteStatus {
                available: true,
                connected: false,
                route_applied: apply_route.then_some(false),
                route_managed: apply_route.then_some(false),
                route_bus: Some(normalize_voicemeeter_bus(bus).to_string()),
                hardware_out_applied: hardware_out_config.as_ref().map(|_| false),
                hardware_out_bus: hardware_out_config.as_ref().map(|config| config.bus.clone()),
                hardware_out_driver: hardware_out_config
                    .as_ref()
                    .map(|config| config.driver.clone()),
                hardware_out_device: hardware_out_config
                    .as_ref()
                    .map(|config| config.device.clone()),
                kind: None,
                version: None,
                virtual_input_strip: None,
                dll_path: None,
                level_probe: None,
                reason: Some(format!(
                    "Voicemeeter Remote API {operation} timed out after {VOICEMEETER_REMOTE_API_TIMEOUT_MS} ms."
                )),
            },
            snapshot: None,
        }
    }

    fn inspect_voicemeeter_remote_api_with_timeout(
        device_name: &str,
        apply_route: bool,
        bus: &str,
        hardware_out_config: Option<&VoicemeeterHardwareOutConfig>,
    ) -> VoicemeeterRoutePrepareResult {
        let device_name = device_name.to_string();
        let bus = normalize_voicemeeter_bus(bus).to_string();
        let hardware_out_config = hardware_out_config.cloned();
        let timeout_result = create_voicemeeter_remote_timeout_result(
            apply_route,
            &bus,
            hardware_out_config.as_ref(),
        );
        let (sender, receiver) = mpsc::channel();

        std::thread::spawn(move || {
            let result = inspect_voicemeeter_remote_api(
                &device_name,
                apply_route,
                &bus,
                hardware_out_config.as_ref(),
            );
            let _ = sender.send(result);
        });

        receiver
            .recv_timeout(Duration::from_millis(VOICEMEETER_REMOTE_API_TIMEOUT_MS))
            .unwrap_or(timeout_result)
    }

    fn inspect_voicemeeter_remote_api(
        device_name: &str,
        apply_route: bool,
        bus: &str,
        hardware_out_config: Option<&VoicemeeterHardwareOutConfig>,
    ) -> VoicemeeterRoutePrepareResult {
        match VoicemeeterRemoteLibrary::load() {
            Ok(mut library) => library.inspect(device_name, apply_route, bus, hardware_out_config),
            Err(error) => VoicemeeterRoutePrepareResult {
                status: VoicemeeterRemoteStatus::unavailable(format!(
                    "Voicemeeter Remote API unavailable: {error}"
                )),
                snapshot: None,
            },
        }
    }

    fn annotate_voicemeeter_route_snapshot(
        result: &mut VoicemeeterRoutePrepareResult,
        resolved_device_id: &str,
        selected_name_hint: &str,
    ) {
        if let Some(snapshot) = result.snapshot.as_mut() {
            snapshot.resolved_device_id = resolved_device_id.to_string();
            snapshot.selected_name_hint = selected_name_hint.to_string();
        }
    }

    unsafe fn load_voicemeeter_proc<T: Copy>(handle: HMODULE, name: &'static [u8]) -> Result<T> {
        let proc = GetProcAddress(handle, PCSTR(name.as_ptr())).ok_or_else(|| {
            anyhow!(
                "Missing symbol {}",
                String::from_utf8_lossy(&name[..name.len() - 1])
            )
        })?;
        Ok(std::mem::transmute_copy(&proc))
    }

    unsafe fn load_optional_voicemeeter_proc<T: Copy>(
        handle: HMODULE,
        name: &'static [u8],
    ) -> Option<T> {
        GetProcAddress(handle, PCSTR(name.as_ptr())).map(|proc| std::mem::transmute_copy(&proc))
    }

    fn voicemeeter_remote_library_candidates() -> Vec<PathBuf> {
        let mut candidates = Vec::new();
        if let Ok(path) = env::var("LUO_VOICEMEETER_REMOTE_DLL") {
            let trimmed = path.trim();
            if !trimmed.is_empty() {
                candidates.push(PathBuf::from(trimmed));
            }
        }

        for root in [
            env::var("ProgramFiles").ok(),
            env::var("ProgramFiles(x86)").ok(),
        ]
        .into_iter()
        .flatten()
        {
            candidates.push(
                PathBuf::from(&root)
                    .join("VB")
                    .join("Voicemeeter")
                    .join("VoicemeeterRemote64.dll"),
            );
            candidates.push(
                PathBuf::from(&root)
                    .join("VB")
                    .join("Voicemeeter")
                    .join("VoicemeeterRemote.dll"),
            );
        }

        candidates.push(PathBuf::from("VoicemeeterRemote64.dll"));
        candidates.push(PathBuf::from("VoicemeeterRemote.dll"));
        candidates
    }

    fn voicemeeter_application_candidates(remote_dll_path: &str) -> Vec<PathBuf> {
        let mut candidates = Vec::new();
        if let Ok(path) = env::var("LUO_VOICEMEETER_EXE") {
            let trimmed = path.trim();
            if !trimmed.is_empty() {
                candidates.push(PathBuf::from(trimmed));
            }
        }

        let remote_dll = PathBuf::from(remote_dll_path);
        if let Some(parent) = remote_dll.parent() {
            push_voicemeeter_application_candidates_for_root(&mut candidates, parent.to_path_buf());
        }

        for root in [
            env::var("ProgramFiles").ok(),
            env::var("ProgramFiles(x86)").ok(),
        ]
        .into_iter()
        .flatten()
        {
            push_voicemeeter_application_candidates_for_root(
                &mut candidates,
                PathBuf::from(root).join("VB").join("Voicemeeter"),
            );
        }

        candidates
    }

    fn push_voicemeeter_application_candidates_for_root(
        candidates: &mut Vec<PathBuf>,
        root: PathBuf,
    ) {
        for executable in [
            "voicemeeter8x64.exe",
            "voicemeeter8.exe",
            "voicemeeterpro.exe",
            "voicemeeterpro64.exe",
            "voicemeeter.exe",
            "voicemeeter64.exe",
        ] {
            let candidate = root.join(executable);
            if !candidates.iter().any(|existing| existing == &candidate) {
                candidates.push(candidate);
            }
        }
    }

    fn launch_voicemeeter_application(remote_dll_path: &str) -> bool {
        for candidate in voicemeeter_application_candidates(remote_dll_path) {
            if !candidate.is_file() {
                continue;
            }

            if Command::new(candidate)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .is_ok()
            {
                return true;
            }
        }

        false
    }

    fn voicemeeter_remote_run_type_candidates() -> &'static [i32] {
        if cfg!(target_pointer_width = "64") {
            &[6, 5, 4, 3, 2, 1]
        } else {
            &[3, 2, 1, 6, 5, 4]
        }
    }

    fn should_auto_launch_voicemeeter_after_login_result(login_result: i32) -> bool {
        matches!(login_result, 1 | -2)
    }

    fn wide_null(value: &OsStr) -> Vec<u16> {
        value.encode_wide().chain(iter::once(0)).collect()
    }

    fn voicemeeter_remote_kind(raw_kind: i32) -> VoicemeeterRemoteKind {
        match raw_kind {
            1 => VoicemeeterRemoteKind::Standard,
            2 => VoicemeeterRemoteKind::Banana,
            3 | 6 => VoicemeeterRemoteKind::Potato,
            _ => VoicemeeterRemoteKind::Unknown,
        }
    }

    fn voicemeeter_virtual_input_strip(kind: VoicemeeterRemoteKind, device_name: &str) -> i32 {
        let normalized_name = normalize_device_name(device_name);
        if normalized_name.contains("aux") {
            return match kind {
                VoicemeeterRemoteKind::Potato => 6,
                VoicemeeterRemoteKind::Banana => 4,
                VoicemeeterRemoteKind::Standard | VoicemeeterRemoteKind::Unknown => 2,
            };
        }

        if normalized_name.contains("vaio3") || normalized_name.contains("vaio 3") {
            return match kind {
                VoicemeeterRemoteKind::Potato => 7,
                VoicemeeterRemoteKind::Banana => 4,
                VoicemeeterRemoteKind::Standard | VoicemeeterRemoteKind::Unknown => 2,
            };
        }

        match kind {
            VoicemeeterRemoteKind::Standard => 2,
            VoicemeeterRemoteKind::Banana => 3,
            VoicemeeterRemoteKind::Potato => 5,
            VoicemeeterRemoteKind::Unknown => 3,
        }
    }

    fn voicemeeter_bus_output_channel_starts(kind: VoicemeeterRemoteKind, bus: &str) -> Vec<i32> {
        let bus = normalize_voicemeeter_bus(bus);
        let primary = match kind {
            VoicemeeterRemoteKind::Standard => match bus {
                "B1" => 14,
                _ => 6,
            },
            VoicemeeterRemoteKind::Banana | VoicemeeterRemoteKind::Potato => match bus {
                "A2" => 8,
                "A3" => 16,
                "B1" => 24,
                "B2" => 32,
                "B3" => 40,
                _ => 0,
            },
            VoicemeeterRemoteKind::Unknown => match bus {
                "A2" => 8,
                "A3" => 16,
                "B1" => 24,
                "B2" => 32,
                "B3" => 40,
                _ => 0,
            },
        };
        let fallback = match bus {
            "A2" => 8,
            "A3" => 16,
            "B1" => 24,
            "B2" => 32,
            "B3" => 40,
            _ => 0,
        };

        if primary == fallback {
            vec![primary]
        } else {
            vec![primary, fallback]
        }
    }

    fn voicemeeter_virtual_input_channel_start(kind: VoicemeeterRemoteKind, strip: i32) -> i32 {
        match kind {
            VoicemeeterRemoteKind::Standard => 4,
            VoicemeeterRemoteKind::Banana => match strip {
                4 => 12,
                _ => 6,
            },
            VoicemeeterRemoteKind::Potato => match strip {
                6 => 16,
                7 => 24,
                _ => 10,
            },
            VoicemeeterRemoteKind::Unknown => strip.saturating_mul(2),
        }
    }

    fn keep_stronger_voicemeeter_level_probe(
        current: &mut Option<VoicemeeterLevelProbe>,
        candidate: VoicemeeterLevelProbe,
    ) {
        let should_replace = current
            .as_ref()
            .is_none_or(|existing| candidate.max_level > existing.max_level);
        if should_replace {
            *current = Some(candidate);
        }
    }

    fn create_failed_voicemeeter_level_probe(
        bus: &str,
        reason: impl Into<String>,
    ) -> VoicemeeterLevelProbe {
        let bus = normalize_voicemeeter_bus(bus);
        VoicemeeterLevelProbe {
            active: false,
            target: "outputBus".to_string(),
            bus: bus.to_string(),
            strip: None,
            level_type: 3,
            channel_start: voicemeeter_bus_output_channel_starts(
                VoicemeeterRemoteKind::Unknown,
                bus,
            )[0],
            channels: 2,
            samples: 0,
            active_samples: 0,
            max_level: 0.0,
            threshold: 0.001,
            reason: Some(reason.into()),
        }
    }

    fn format_voicemeeter_level_probe_reason(
        target: &str,
        active: bool,
        bus: &str,
        strip: Option<i32>,
        threshold: f32,
    ) -> String {
        match (target, active, strip) {
            ("virtualInput", true, Some(strip)) => {
                format!("Voicemeeter virtual input Strip[{strip}] level activity detected.")
            }
            ("virtualInput", false, Some(strip)) => {
                format!("No Voicemeeter virtual input Strip[{strip}] level exceeded {threshold}.")
            }
            (_, true, _) => format!("Voicemeeter output level activity detected on {bus}."),
            _ => format!("No Voicemeeter output level exceeded {threshold} on {bus}."),
        }
    }

    fn format_voicemeeter_version(raw_version: i32) -> String {
        format!(
            "{}.{}.{}.{}",
            (raw_version >> 24) & 0xff,
            (raw_version >> 16) & 0xff,
            (raw_version >> 8) & 0xff,
            raw_version & 0xff
        )
    }

    fn format_voicemeeter_remote_result(function_name: &str, result: i32) -> String {
        let meaning = match result {
            1 if function_name == "VBVMR_Login" => "Voicemeeter application is not launched",
            0 => "OK",
            -1 => "unexpected Remote API error",
            -2 => "Voicemeeter Remote API server is unavailable",
            -3 => "unknown Voicemeeter Remote API parameter",
            -4 => "Voicemeeter Remote API value is out of range",
            -5 => "Voicemeeter Remote API structure mismatch",
            _ => "unexpected Voicemeeter Remote API result",
        };
        format!("{function_name} returned {result}: {meaning}")
    }

    fn find_voicemeeter_output_device(device_id: &str) -> Result<(String, cpal::Device)> {
        let host = cpal::default_host();
        let requested_device_id = device_id.trim();
        let devices = host
            .output_devices()
            .context("Failed to enumerate output devices")?;

        for (index, device) in devices.enumerate() {
            let Ok(name) = device.name() else {
                continue;
            };
            let current_device_id = shared_cpal::output_device_id(index, &name);
            if !requested_device_id.is_empty() && current_device_id != requested_device_id {
                continue;
            }

            if output_device_backend(&name) == AudioOutputDeviceBackend::Voicemeeter {
                return Ok((current_device_id, device));
            }

            if !requested_device_id.is_empty() {
                return Err(anyhow!(
                    "Selected output device is not a Voicemeeter virtual input."
                ));
            }
        }

        Err(anyhow!("Voicemeeter virtual input device is unavailable."))
    }

    fn output_device_backend(name: &str) -> AudioOutputDeviceBackend {
        if is_voicemeeter_output_device_name(name) {
            AudioOutputDeviceBackend::Voicemeeter
        } else {
            AudioOutputDeviceBackend::Wasapi
        }
    }

    fn is_voicemeeter_output_device_name(name: &str) -> bool {
        normalize_device_name(name).contains("voicemeeter")
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

        let selected_device = parse_selected_device_id(device_id)?;
        let devices = enumerator
            .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
            .context("Failed to enumerate WASAPI output devices")?;
        let count = devices
            .GetCount()
            .context("Failed to read WASAPI output device count")?;

        if let Some(selected_index) = selected_device.index {
            if selected_index < count {
                let device = devices
                    .Item(selected_index)
                    .context("Selected WASAPI output device is unavailable")?;
                match selected_device.matches_wasapi_device(&device) {
                    Ok(true) => return Ok(device),
                    Ok(false) => {}
                    Err(error) if selected_device.name.is_none() => return Err(error),
                    Err(_) => {}
                }
            } else if selected_device.name.is_none() {
                return Err(anyhow!("Selected WASAPI output device is unavailable."));
            }
        }

        if let Some(expected_name) = selected_device.name.as_deref() {
            for index in 0..count {
                let device = devices
                    .Item(index)
                    .context("Selected WASAPI output device is unavailable")?;
                let Ok(name) = wasapi_device_friendly_name(&device) else {
                    continue;
                };
                if device_names_match(&name, expected_name) {
                    return Ok(device);
                }
            }
        }

        Err(anyhow!(
            "Selected WASAPI output device is unavailable or does not match the selected device name."
        ))
    }

    #[derive(Debug, PartialEq, Eq)]
    struct SelectedDeviceId {
        index: Option<u32>,
        name: Option<String>,
    }

    impl SelectedDeviceId {
        unsafe fn matches_wasapi_device(&self, device: &IMMDevice) -> Result<bool> {
            let Some(expected_name) = self.name.as_deref() else {
                return Ok(true);
            };
            let actual_name = wasapi_device_friendly_name(device)?;
            Ok(device_names_match(&actual_name, expected_name))
        }
    }

    fn parse_selected_device_id(device_id: &str) -> Result<SelectedDeviceId> {
        let trimmed = device_id.trim();
        if trimmed.is_empty() {
            return Ok(SelectedDeviceId {
                index: None,
                name: None,
            });
        }

        let (index, name) = trimmed
            .split_once(':')
            .map(|(index, name)| (index, Some(name.trim())))
            .unwrap_or((trimmed, None));
        let index = index
            .parse::<u32>()
            .context("Selected output device id does not include a valid WASAPI index")?;

        Ok(SelectedDeviceId {
            index: Some(index),
            name: name.and_then(|value| (!value.is_empty()).then(|| value.to_string())),
        })
    }

    unsafe fn wasapi_device_friendly_name(device: &IMMDevice) -> Result<String> {
        let property_store = device
            .OpenPropertyStore(STGM_READ)
            .context("Failed to open WASAPI device property store")?;
        let property_value = property_store
            .GetValue(&DEVPKEY_Device_FriendlyName as *const _ as *const _)
            .context("Failed to read WASAPI device friendly name")?;
        let prop_variant = &property_value.as_raw().Anonymous.Anonymous;

        if prop_variant.vt != VT_LPWSTR.0 {
            return Err(anyhow!(
                "WASAPI device friendly name has unsupported property type: {}.",
                prop_variant.vt
            ));
        }

        let ptr_utf16 = *(&prop_variant.Anonymous as *const _ as *const *const u16);
        if ptr_utf16.is_null() {
            return Err(anyhow!("WASAPI device friendly name pointer is null."));
        }

        let mut len = 0usize;
        while *ptr_utf16.add(len) != 0 {
            len += 1;
        }

        Ok(String::from_utf16_lossy(slice::from_raw_parts(
            ptr_utf16, len,
        )))
    }

    fn device_names_match(actual: &str, expected: &str) -> bool {
        normalize_device_name(actual) == normalize_device_name(expected)
    }

    fn normalize_device_name(name: &str) -> String {
        name.trim().to_lowercase()
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::sync::{
            atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering},
            Arc,
        };

        fn raw_pcm_test_format() -> WasapiFormat {
            WasapiFormat {
                sample_rate_hz: 44_100,
                channels: 2,
                block_align: 4,
                bits_per_sample: 16,
                bytes_per_sample: 2,
                sample_kind: WasapiSampleKind::Pcm,
            }
        }

        fn raw_pcm_test_audio(data: Vec<u8>) -> RawPcmAudio {
            RawPcmAudio {
                sample_rate: 44_100,
                channels: 2,
                bit_depth: 16,
                block_align: 4,
                sample_kind: RawPcmSampleKind::Pcm,
                source: "WAV raw PCM passthrough",
                frame_count: data.len() / 4,
                data: Arc::new(data),
            }
        }

        #[test]
        fn parses_index_and_name_device_id() {
            assert_eq!(
                parse_selected_device_id(" 12: USB DAC ").unwrap(),
                SelectedDeviceId {
                    index: Some(12),
                    name: Some("USB DAC".to_string())
                }
            );
        }

        #[test]
        fn parses_index_only_device_id() {
            assert_eq!(
                parse_selected_device_id("7").unwrap(),
                SelectedDeviceId {
                    index: Some(7),
                    name: None
                }
            );
        }

        #[test]
        fn rejects_non_numeric_device_index() {
            assert!(parse_selected_device_id("USB DAC").is_err());
        }

        #[test]
        fn matches_device_names_without_case_or_outer_whitespace() {
            assert!(device_names_match(
                " Speakers (Realtek) ",
                "speakers (REALTEK)"
            ));
        }

        #[test]
        fn maps_voicemeeter_remote_type_to_kind() {
            assert_eq!(voicemeeter_remote_kind(1), VoicemeeterRemoteKind::Standard);
            assert_eq!(voicemeeter_remote_kind(2), VoicemeeterRemoteKind::Banana);
            assert_eq!(voicemeeter_remote_kind(3), VoicemeeterRemoteKind::Potato);
            assert_eq!(voicemeeter_remote_kind(6), VoicemeeterRemoteKind::Potato);
            assert_eq!(voicemeeter_remote_kind(99), VoicemeeterRemoteKind::Unknown);
        }

        #[test]
        fn selects_primary_virtual_input_strip_for_voicemeeter_type() {
            assert_eq!(
                voicemeeter_virtual_input_strip(
                    VoicemeeterRemoteKind::Standard,
                    "VoiceMeeter Input"
                ),
                2
            );
            assert_eq!(
                voicemeeter_virtual_input_strip(VoicemeeterRemoteKind::Banana, "VoiceMeeter Input"),
                3
            );
            assert_eq!(
                voicemeeter_virtual_input_strip(VoicemeeterRemoteKind::Potato, "VoiceMeeter Input"),
                5
            );
        }

        #[test]
        fn selects_aux_and_vaio3_virtual_input_strips() {
            assert_eq!(
                voicemeeter_virtual_input_strip(
                    VoicemeeterRemoteKind::Banana,
                    "VoiceMeeter Aux Input"
                ),
                4
            );
            assert_eq!(
                voicemeeter_virtual_input_strip(
                    VoicemeeterRemoteKind::Potato,
                    "VoiceMeeter Aux Input"
                ),
                6
            );
            assert_eq!(
                voicemeeter_virtual_input_strip(
                    VoicemeeterRemoteKind::Potato,
                    "VoiceMeeter VAIO3 Input"
                ),
                7
            );
        }

        #[test]
        fn maps_voicemeeter_bus_output_level_channels_by_remote_kind() {
            assert_eq!(
                voicemeeter_bus_output_channel_starts(VoicemeeterRemoteKind::Standard, "A1"),
                vec![6, 0]
            );
            assert_eq!(
                voicemeeter_bus_output_channel_starts(VoicemeeterRemoteKind::Standard, "B1"),
                vec![14, 24]
            );
            assert_eq!(
                voicemeeter_bus_output_channel_starts(VoicemeeterRemoteKind::Banana, "A1"),
                vec![0]
            );
            assert_eq!(
                voicemeeter_bus_output_channel_starts(VoicemeeterRemoteKind::Banana, "A2"),
                vec![8]
            );
        }

        #[test]
        fn formats_voicemeeter_remote_version() {
            assert_eq!(format_voicemeeter_version(0x0102_0304), "1.2.3.4");
        }

        #[test]
        fn treats_not_launched_and_remote_server_unavailable_login_results_as_auto_launchable() {
            assert!(should_auto_launch_voicemeeter_after_login_result(1));
            assert!(should_auto_launch_voicemeeter_after_login_result(-2));
            assert!(!should_auto_launch_voicemeeter_after_login_result(0));
            assert!(!should_auto_launch_voicemeeter_after_login_result(-5));
        }

        #[test]
        fn orders_voicemeeter_run_types_for_helper_bitness() {
            let expected: &[i32] = if cfg!(target_pointer_width = "64") {
                &[6, 5, 4, 3, 2, 1]
            } else {
                &[3, 2, 1, 6, 5, 4]
            };

            assert_eq!(voicemeeter_remote_run_type_candidates(), expected);
        }

        #[test]
        fn keeps_exe_fallback_inside_voicemeeter_auto_launch_window() {
            assert!(VOICEMEETER_AUTO_LAUNCH_EXE_FALLBACK_AFTER_ATTEMPTS > 0);
            assert!(
                VOICEMEETER_AUTO_LAUNCH_EXE_FALLBACK_AFTER_ATTEMPTS
                    < VOICEMEETER_AUTO_LAUNCH_RETRY_ATTEMPTS
            );
        }

        #[test]
        fn creates_voicemeeter_remote_timeout_route_status() {
            let hardware_out = VoicemeeterHardwareOutConfig {
                bus: "A2".to_string(),
                driver: "ks".to_string(),
                device: "USB DAC".to_string(),
            };
            let result = create_voicemeeter_remote_timeout_result(true, "b2", Some(&hardware_out));

            assert!(result.snapshot.is_none());
            assert!(result.status.available);
            assert!(!result.status.connected);
            assert_eq!(result.status.route_applied, Some(false));
            assert_eq!(result.status.route_managed, Some(false));
            assert_eq!(result.status.route_bus.as_deref(), Some("B2"));
            assert_eq!(result.status.hardware_out_applied, Some(false));
            assert_eq!(result.status.hardware_out_bus.as_deref(), Some("A2"));
            assert_eq!(result.status.hardware_out_driver.as_deref(), Some("ks"));
            assert_eq!(
                result.status.hardware_out_device.as_deref(),
                Some("USB DAC")
            );
            assert_eq!(
                result.status.reason.as_deref(),
                Some("Voicemeeter Remote API route timed out after 20000 ms.")
            );
        }

        #[test]
        fn creates_voicemeeter_remote_timeout_probe_status() {
            let result = create_voicemeeter_remote_timeout_result(false, "A3", None);

            assert!(result.snapshot.is_none());
            assert!(result.status.available);
            assert!(!result.status.connected);
            assert_eq!(result.status.route_applied, None);
            assert_eq!(result.status.route_managed, None);
            assert_eq!(result.status.route_bus.as_deref(), Some("A3"));
            assert_eq!(
                result.status.reason.as_deref(),
                Some("Voicemeeter Remote API probe timed out after 20000 ms.")
            );
        }

        #[test]
        fn raw_pcm_file_buffer_copies_source_bytes_without_conversion() {
            let format = raw_pcm_test_format();
            let raw_pcm_audio = raw_pcm_test_audio(vec![
                0x01, 0x02, 0x03, 0x04, //
                0x10, 0x20, 0x30, 0x40,
            ]);
            let cursor = AtomicUsize::new(0);
            let paused = AtomicBool::new(false);
            let stop = AtomicBool::new(false);
            let ended = AtomicBool::new(false);
            let volume_bits = AtomicU32::new(1.0f32.to_bits());
            let mut cursor_frames = 0usize;
            let mut buffer = [0xAA; 12];

            let completion = fill_raw_pcm_file_buffer(
                &mut buffer,
                3,
                &format,
                &raw_pcm_audio,
                &mut cursor_frames,
                &cursor,
                &paused,
                &stop,
                &ended,
                &volume_bits,
            )
            .expect("raw PCM buffer should copy source bytes");

            assert_eq!(completion, Some(PlaybackCompletion::Ended));
            assert_eq!(
                buffer,
                [
                    0x01, 0x02, 0x03, 0x04, //
                    0x10, 0x20, 0x30, 0x40, //
                    0x00, 0x00, 0x00, 0x00,
                ]
            );
            assert_eq!(cursor_frames, 2);
            assert_eq!(cursor.load(Ordering::SeqCst), 4);
            assert!(ended.load(Ordering::SeqCst));
        }

        #[test]
        fn raw_pcm_file_buffer_writes_silence_without_advancing_when_paused() {
            let format = raw_pcm_test_format();
            let raw_pcm_audio = raw_pcm_test_audio(vec![0x01, 0x02, 0x03, 0x04]);
            let cursor = AtomicUsize::new(0);
            let paused = AtomicBool::new(true);
            let stop = AtomicBool::new(false);
            let ended = AtomicBool::new(false);
            let volume_bits = AtomicU32::new(1.0f32.to_bits());
            let mut cursor_frames = 0usize;
            let mut buffer = [0xAA; 4];

            let completion = fill_raw_pcm_file_buffer(
                &mut buffer,
                1,
                &format,
                &raw_pcm_audio,
                &mut cursor_frames,
                &cursor,
                &paused,
                &stop,
                &ended,
                &volume_bits,
            )
            .expect("paused raw PCM buffer should write silence");

            assert_eq!(completion, None);
            assert_eq!(buffer, [0x00, 0x00, 0x00, 0x00]);
            assert_eq!(cursor_frames, 0);
            assert_eq!(cursor.load(Ordering::SeqCst), 0);
            assert!(!ended.load(Ordering::SeqCst));
        }

        #[test]
        #[ignore]
        fn exclusive_lock_probe_blocks_second_wasapi_client() {
            let device_id = std::env::var("LUO_AUDIO_OUTPUT_TEST_DEVICE_ID").unwrap_or_default();
            let buffer_frames = std::env::var("LUO_AUDIO_OUTPUT_TEST_BUFFER_FRAMES")
                .ok()
                .and_then(|value| value.parse::<u32>().ok())
                .unwrap_or(crate::DEFAULT_BUFFER_FRAMES);

            let probe_result = probe_exclusive_lock(&device_id, buffer_frames)
                .expect("WASAPI exclusive lock probe should block the second client");
            assert_eq!(probe_result.status, ExclusiveProbeStatus::Passed);
            assert_eq!(
                probe_result.second_open,
                Some(ExclusiveProbeSecondOpen::DeviceInUse)
            );
            eprintln!("{}", probe_result.summary());
        }
    }

    struct SelectedExclusiveFormat {
        storage: SelectedExclusiveFormatStorage,
        format: WasapiFormat,
        source: String,
    }

    impl SelectedExclusiveFormat {
        fn as_ptr(&self) -> *const WAVEFORMATEX {
            match &self.storage {
                SelectedExclusiveFormatStorage::System { ptr, .. } => *ptr,
                SelectedExclusiveFormatStorage::Owned(format) => format as *const WAVEFORMATEX,
            }
        }
    }

    enum SelectedExclusiveFormatStorage {
        System {
            ptr: *mut WAVEFORMATEX,
            _guard: WaveFormatGuard,
        },
        Owned(WAVEFORMATEX),
    }

    struct InitializedExclusiveAudioClient {
        audio_client: IAudioClient,
        buffer_size: u32,
        buffer_duration_hns: i64,
    }

    unsafe fn select_exclusive_wave_format(
        audio_client: &IAudioClient,
        preferred_sample_rate_hz: u32,
        preferred_channels: u16,
    ) -> Result<SelectedExclusiveFormat> {
        let mix_format_ptr = audio_client
            .GetMixFormat()
            .context("Failed to read WASAPI mix format")?;
        let mix_format_guard = WaveFormatGuard(mix_format_ptr);
        let mix_format = WasapiFormat::from_waveformat(mix_format_ptr)?;
        let mix_support =
            audio_client.IsFormatSupported(AUDCLNT_SHAREMODE_EXCLUSIVE, mix_format_ptr, None);

        if mix_support.is_ok() {
            return Ok(SelectedExclusiveFormat {
                storage: SelectedExclusiveFormatStorage::System {
                    ptr: mix_format_ptr,
                    _guard: mix_format_guard,
                },
                format: mix_format,
                source: "mix format".to_string(),
            });
        }

        if let Some(format) = find_supported_pcm_exclusive_format(
            audio_client,
            &mix_format,
            preferred_sample_rate_hz,
            preferred_channels,
        ) {
            let fallback_format = WasapiFormat::from_waveformat(&format as *const WAVEFORMATEX)?;
            let format_summary = fallback_format.summary();
            return Ok(SelectedExclusiveFormat {
                storage: SelectedExclusiveFormatStorage::Owned(format),
                format: fallback_format,
                source: format!("PCM fallback from unsupported mix format ({format_summary})"),
            });
        }

        Err(anyhow!(
            "WASAPI exclusive output format is not supported: {}; {}",
            mix_format.summary(),
            describe_wasapi_hresult(mix_support)
        ))
    }

    unsafe fn find_supported_pcm_exclusive_format(
        audio_client: &IAudioClient,
        mix_format: &WasapiFormat,
        preferred_sample_rate_hz: u32,
        preferred_channels: u16,
    ) -> Option<WAVEFORMATEX> {
        let sample_rates = unique_nonzero([
            preferred_sample_rate_hz,
            mix_format.sample_rate_hz,
            48_000,
            44_100,
            96_000,
        ]);
        let channel_counts = unique_nonzero_u16([preferred_channels, mix_format.channels, 2, 1]);
        let bit_depths = [24u16, 16u16, 32u16];

        for sample_rate_hz in sample_rates {
            for channels in &channel_counts {
                for bits_per_sample in bit_depths {
                    let Some(format) =
                        create_pcm_wave_format(sample_rate_hz, *channels, bits_per_sample)
                    else {
                        continue;
                    };
                    let result = audio_client.IsFormatSupported(
                        AUDCLNT_SHAREMODE_EXCLUSIVE,
                        &format as *const WAVEFORMATEX,
                        None,
                    );
                    if result.is_ok() {
                        return Some(format);
                    }
                }
            }
        }

        None
    }

    fn unique_nonzero(values: [u32; 5]) -> Vec<u32> {
        let mut unique = Vec::new();
        for value in values {
            if value != 0 && !unique.contains(&value) {
                unique.push(value);
            }
        }
        unique
    }

    fn unique_nonzero_u16(values: [u16; 4]) -> Vec<u16> {
        let mut unique = Vec::new();
        for value in values {
            if value != 0 && !unique.contains(&value) {
                unique.push(value);
            }
        }
        unique
    }

    fn create_pcm_wave_format(
        sample_rate_hz: u32,
        channels: u16,
        bits_per_sample: u16,
    ) -> Option<WAVEFORMATEX> {
        let bytes_per_sample = bits_per_sample.checked_div(8)?;
        let block_align = channels.checked_mul(bytes_per_sample)?;
        let average_bytes_per_second = sample_rate_hz.checked_mul(u32::from(block_align))?;

        Some(WAVEFORMATEX {
            wFormatTag: WAVE_FORMAT_PCM as u16,
            nChannels: channels,
            nSamplesPerSec: sample_rate_hz,
            nAvgBytesPerSec: average_bytes_per_second,
            nBlockAlign: block_align,
            wBitsPerSample: bits_per_sample,
            cbSize: 0,
        })
    }

    fn describe_wasapi_hresult(result: HRESULT) -> String {
        let known = match result {
            AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED => Some(
                "AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED: exclusive buffer size is not aligned with the device period",
            ),
            AUDCLNT_E_DEVICE_IN_USE => Some(
                "AUDCLNT_E_DEVICE_IN_USE: another process is already using the endpoint",
            ),
            AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED => Some(
                "AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED: Windows has disabled exclusive control for this endpoint",
            ),
            AUDCLNT_E_UNSUPPORTED_FORMAT => Some(
                "AUDCLNT_E_UNSUPPORTED_FORMAT: the endpoint does not accept this exclusive format",
            ),
            _ => None,
        };
        let message = result.message();

        match (known, message.trim()) {
            (Some(known), "") => format!("{known} ({result})"),
            (Some(known), message) => format!("{known}; {message} ({result})"),
            (None, "") => format!("HRESULT {result}"),
            (None, message) => format!("{message} ({result})"),
        }
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

    unsafe fn initialize_exclusive_audio_client(
        device: &IMMDevice,
        audio_client: IAudioClient,
        format_ptr: *const WAVEFORMATEX,
        format: &WasapiFormat,
        buffer_duration_hns: i64,
        context_label: &str,
    ) -> Result<InitializedExclusiveAudioClient> {
        match audio_client.Initialize(
            AUDCLNT_SHAREMODE_EXCLUSIVE,
            0,
            buffer_duration_hns,
            buffer_duration_hns,
            format_ptr,
            None,
        ) {
            Ok(()) => {
                let buffer_size = audio_client
                    .GetBufferSize()
                    .with_context(|| format!("Failed to read {context_label} buffer size"))?;
                Ok(InitializedExclusiveAudioClient {
                    audio_client,
                    buffer_size,
                    buffer_duration_hns,
                })
            }
            Err(error) if error.code() == AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED => {
                let aligned_buffer_size = audio_client.GetBufferSize().with_context(|| {
                    format!(
                        "Failed to read aligned {context_label} buffer size after AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED"
                    )
                })?;
                let aligned_buffer_duration_hns =
                    frames_to_hns(aligned_buffer_size.max(1), format.sample_rate_hz).max(1);
                let aligned_audio_client: IAudioClient = device
                    .Activate(CLSCTX_ALL, None)
                    .with_context(|| {
                        format!(
                            "Failed to reactivate WASAPI audio client for {context_label} after buffer alignment retry"
                        )
                    })?;

                aligned_audio_client
                    .Initialize(
                        AUDCLNT_SHAREMODE_EXCLUSIVE,
                        0,
                        aligned_buffer_duration_hns,
                        aligned_buffer_duration_hns,
                        format_ptr,
                        None,
                    )
                    .with_context(|| {
                        format!(
                            "Failed to initialize {context_label} after buffer alignment retry: format={}, requestedBufferDuration={} hns, alignedBuffer={} frames, alignedBufferDuration={} hns, firstError={}",
                            format.summary(),
                            buffer_duration_hns,
                            aligned_buffer_size,
                            aligned_buffer_duration_hns,
                            describe_wasapi_hresult(error.code())
                        )
                    })?;

                let actual_buffer_size =
                    aligned_audio_client.GetBufferSize().with_context(|| {
                        format!("Failed to read aligned {context_label} buffer size")
                    })?;
                Ok(InitializedExclusiveAudioClient {
                    audio_client: aligned_audio_client,
                    buffer_size: actual_buffer_size,
                    buffer_duration_hns: aligned_buffer_duration_hns,
                })
            }
            Err(error) => Err(error).with_context(|| {
                format!(
                    "Failed to initialize {context_label}: format={}, bufferDuration={} hns",
                    format.summary(),
                    buffer_duration_hns
                )
            }),
        }
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

    unsafe fn write_silence_frames(
        render_client: &IAudioRenderClient,
        frame_count: u32,
        format: &WasapiFormat,
    ) -> Result<()> {
        if frame_count == 0 {
            return Ok(());
        }

        let data = render_client
            .GetBuffer(frame_count)
            .context("Failed to acquire WASAPI render buffer")?;
        let buffer_len = frame_count as usize * format.block_align as usize;
        let buffer = slice::from_raw_parts_mut(data, buffer_len);
        for frame_index in 0..frame_count as usize {
            write_silence_frame(buffer, frame_index, format)?;
        }
        render_client
            .ReleaseBuffer(frame_count, 0)
            .context("Failed to release WASAPI render buffer")
    }

    unsafe fn write_streaming_file_frames(
        render_client: &IAudioRenderClient,
        frame_count: u32,
        format: &WasapiFormat,
        pcm_buffer: &StreamingPcmBuffer,
        render_state: &mut StreamingPcmRenderState,
        cursor: &AtomicUsize,
        paused: &AtomicBool,
        stop: &AtomicBool,
        ended: &AtomicBool,
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
        let fill_result = fill_streaming_file_buffer(
            buffer,
            frame_count,
            format,
            pcm_buffer,
            render_state,
            cursor,
            paused,
            stop,
            ended,
            volume_bits,
        );
        let release_result = render_client
            .ReleaseBuffer(frame_count, 0)
            .context("Failed to release WASAPI render buffer");

        release_result?;
        fill_result
    }

    unsafe fn write_raw_pcm_file_frames(
        render_client: &IAudioRenderClient,
        frame_count: u32,
        format: &WasapiFormat,
        raw_pcm_audio: &RawPcmAudio,
        cursor_frames: &mut usize,
        cursor: &AtomicUsize,
        paused: &AtomicBool,
        stop: &AtomicBool,
        ended: &AtomicBool,
        volume_bits: &AtomicU32,
    ) -> Result<Option<PlaybackCompletion>> {
        if frame_count == 0 {
            return Ok(None);
        }

        let data = render_client
            .GetBuffer(frame_count)
            .context("Failed to acquire WASAPI raw PCM render buffer")?;
        let buffer_len = frame_count as usize * format.block_align as usize;
        let buffer = slice::from_raw_parts_mut(data, buffer_len);
        let fill_result = fill_raw_pcm_file_buffer(
            buffer,
            frame_count,
            format,
            raw_pcm_audio,
            cursor_frames,
            cursor,
            paused,
            stop,
            ended,
            volume_bits,
        );
        let release_result = render_client
            .ReleaseBuffer(frame_count, 0)
            .context("Failed to release WASAPI raw PCM render buffer");

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

    fn fill_streaming_file_buffer(
        buffer: &mut [u8],
        frame_count: u32,
        format: &WasapiFormat,
        pcm_buffer: &StreamingPcmBuffer,
        render_state: &mut StreamingPcmRenderState,
        cursor: &AtomicUsize,
        paused: &AtomicBool,
        stop: &AtomicBool,
        ended: &AtomicBool,
        volume_bits: &AtomicU32,
    ) -> Result<Option<PlaybackCompletion>> {
        if stop.load(Ordering::SeqCst) {
            for frame_index in 0..frame_count as usize {
                write_silence_frame(buffer, frame_index, format)?;
            }
            return Ok(Some(PlaybackCompletion::Stopped));
        }

        if paused.load(Ordering::SeqCst) {
            for frame_index in 0..frame_count as usize {
                write_silence_frame(buffer, frame_index, format)?;
            }
            return Ok(None);
        }

        let output_channels = usize::from(format.channels.max(1));
        let mut rendered = vec![0.0f32; frame_count as usize * output_channels];
        let volume = f32::from_bits(volume_bits.load(Ordering::SeqCst)).clamp(0.0, 1.0);
        let status = render_state.fill_output(pcm_buffer, &mut rendered, volume);
        cursor.store(render_state.cursor_samples(), Ordering::SeqCst);

        for (sample_index, sample) in rendered.iter().enumerate() {
            let frame_index = sample_index / output_channels;
            let channel_index = sample_index % output_channels;
            let offset = frame_index * format.block_align as usize
                + channel_index * format.bytes_per_sample as usize;
            write_sample(buffer, offset, *sample, format)?;
        }

        if status == StreamingPcmRenderStatus::Ended {
            ended.store(true, Ordering::SeqCst);
            return Ok(Some(PlaybackCompletion::Ended));
        }

        Ok(None)
    }

    fn fill_raw_pcm_file_buffer(
        buffer: &mut [u8],
        frame_count: u32,
        format: &WasapiFormat,
        raw_pcm_audio: &RawPcmAudio,
        cursor_frames: &mut usize,
        cursor: &AtomicUsize,
        paused: &AtomicBool,
        stop: &AtomicBool,
        ended: &AtomicBool,
        volume_bits: &AtomicU32,
    ) -> Result<Option<PlaybackCompletion>> {
        if stop.load(Ordering::SeqCst) {
            for frame_index in 0..frame_count as usize {
                write_silence_frame(buffer, frame_index, format)?;
            }
            return Ok(Some(PlaybackCompletion::Stopped));
        }

        if paused.load(Ordering::SeqCst) {
            for frame_index in 0..frame_count as usize {
                write_silence_frame(buffer, frame_index, format)?;
            }
            return Ok(None);
        }

        let volume = f32::from_bits(volume_bits.load(Ordering::SeqCst)).clamp(0.0, 1.0);
        if (volume - 1.0).abs() > f32::EPSILON {
            return Err(anyhow!(
                "Raw PCM passthrough requires unity volume; current volume={volume}."
            ));
        }

        let bytes_per_frame = usize::from(format.block_align);
        let remaining_frames = raw_pcm_audio.frame_count.saturating_sub(*cursor_frames);
        let frames_to_copy = remaining_frames.min(frame_count as usize);
        let bytes_to_copy = frames_to_copy.saturating_mul(bytes_per_frame);
        let source_offset = (*cursor_frames).saturating_mul(bytes_per_frame);
        let source_end = source_offset.saturating_add(bytes_to_copy);

        if bytes_to_copy > 0 {
            buffer[..bytes_to_copy].copy_from_slice(&raw_pcm_audio.data[source_offset..source_end]);
        }

        for frame_index in frames_to_copy..frame_count as usize {
            write_silence_frame(buffer, frame_index, format)?;
        }

        *cursor_frames = (*cursor_frames).saturating_add(frames_to_copy);
        cursor.store(
            (*cursor_frames).saturating_mul(usize::from(raw_pcm_audio.channels.max(1))),
            Ordering::SeqCst,
        );

        if *cursor_frames >= raw_pcm_audio.frame_count {
            ended.store(true, Ordering::SeqCst);
            return Ok(Some(PlaybackCompletion::Ended));
        }

        Ok(None)
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

    fn ensure_raw_pcm_format_matches(
        raw_pcm_audio: &RawPcmAudio,
        format: &WasapiFormat,
    ) -> Result<()> {
        let raw_sample_kind = match raw_pcm_audio.sample_kind {
            RawPcmSampleKind::Float => WasapiSampleKind::Float,
            RawPcmSampleKind::Pcm => WasapiSampleKind::Pcm,
        };

        if raw_pcm_audio.sample_rate != format.sample_rate_hz
            || raw_pcm_audio.channels != format.channels
            || raw_pcm_audio.bit_depth != format.bits_per_sample
            || raw_pcm_audio.block_align != format.block_align
            || raw_sample_kind != format.sample_kind
        {
            return Err(anyhow!(
                "Raw PCM passthrough requires exact source/output format match: source={} Hz/{}ch/{}-bit {}, output={}.",
                raw_pcm_audio.sample_rate,
                raw_pcm_audio.channels,
                raw_pcm_audio.bit_depth,
                raw_pcm_audio.sample_kind.label(),
                format.summary()
            ));
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

        fn summary(&self) -> String {
            format!(
                "{} Hz/{}ch/{}-bit {}",
                self.sample_rate_hz,
                self.channels,
                self.bits_per_sample,
                self.sample_kind.label()
            )
        }

        fn diagnostics(&self, source: impl Into<String>) -> AudioFormatDiagnostics {
            AudioFormatDiagnostics {
                sample_rate: self.sample_rate_hz,
                channels: self.channels,
                sample_format: self.sample_kind.label().to_string(),
                bit_depth: Some(self.bits_per_sample),
                source: Some(source.into()),
            }
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

    #[derive(Clone, Copy, PartialEq, Eq)]
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

    use super::{
        shared_cpal, AudioFormatDiagnostics, AudioOutputDevice, AudioOutputDeviceBackend,
        ExclusiveProbeResult, PlaybackCompletion, RawPcmAudio, StreamingPcmBuffer,
        VoicemeeterHardwareOutConfig, VoicemeeterRemoteStatus,
    };

    pub fn enumerate_output_devices() -> Result<Vec<AudioOutputDevice>> {
        shared_cpal::enumerate_output_devices(|_| AudioOutputDeviceBackend::Cpal)
    }

    pub fn supports_exclusive_output() -> bool {
        false
    }

    pub fn open_shared_silence_stream(device_id: &str) -> Result<Stream> {
        shared_cpal::open_silence_stream(device_id)
    }

    pub fn resolve_voicemeeter_output_device_id(_device_id: &str) -> Result<String> {
        Err(anyhow!("Voicemeeter routing is only available on Windows."))
    }

    pub fn probe_voicemeeter_remote_api(
        _device_id: &str,
        _bus: &str,
        _hardware_out_config: Option<&VoicemeeterHardwareOutConfig>,
    ) -> VoicemeeterRemoteStatus {
        VoicemeeterRemoteStatus::unavailable("Voicemeeter Remote API is only available on Windows.")
    }

    pub fn prepare_voicemeeter_remote_route(
        _device_id: &str,
        _selected_name_hint: &str,
        _bus: &str,
        _hardware_out_config: Option<&VoicemeeterHardwareOutConfig>,
    ) -> VoicemeeterRoutePrepareResult {
        VoicemeeterRoutePrepareResult {
            status: VoicemeeterRemoteStatus::unavailable(
                "Voicemeeter Remote API is only available on Windows.",
            ),
            snapshot: None,
        }
    }

    pub fn restore_voicemeeter_remote_route(
        _snapshot: &VoicemeeterRouteSnapshot,
    ) -> VoicemeeterRemoteStatus {
        VoicemeeterRemoteStatus::unavailable("Voicemeeter Remote API is only available on Windows.")
    }

    pub fn validate_shared_playback_device(device_id: &str) -> Result<()> {
        shared_cpal::validate_playback_device(device_id)
    }

    pub fn describe_shared_output_format(device_id: &str) -> Result<AudioFormatDiagnostics> {
        shared_cpal::describe_output_format(device_id)
    }

    pub fn describe_exclusive_playback_device(_device_id: &str) -> Result<String> {
        Err(anyhow!(
            "WASAPI exclusive output is only available on Windows."
        ))
    }

    pub fn describe_exclusive_output_format(
        _device_id: &str,
        _source_sample_rate: u32,
        _source_channels: u16,
    ) -> Result<AudioFormatDiagnostics> {
        Err(anyhow!(
            "WASAPI exclusive output is only available on Windows."
        ))
    }

    #[allow(dead_code)]
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
        shared_cpal::build_file_stream(
            device_id,
            source_sample_rate,
            source_channels,
            samples,
            cursor,
            paused,
            stop,
            volume_bits,
        )
    }

    pub fn build_shared_streaming_file_stream(
        device_id: &str,
        source_sample_rate: u32,
        source_channels: u16,
        pcm_buffer: Arc<StreamingPcmBuffer>,
        cursor: Arc<AtomicUsize>,
        paused: Arc<AtomicBool>,
        stop: Arc<AtomicBool>,
        ended: Arc<AtomicBool>,
        volume_bits: Arc<AtomicU32>,
    ) -> Result<Stream> {
        shared_cpal::build_streaming_file_stream(
            device_id,
            source_sample_rate,
            source_channels,
            pcm_buffer,
            cursor,
            paused,
            stop,
            ended,
            volume_bits,
        )
    }

    pub fn play_test_tone(device_id: &str, duration_ms: u64, frequency_hz: f32) -> Result<()> {
        shared_cpal::play_test_tone(device_id, duration_ms, frequency_hz)
    }

    pub fn play_voicemeeter_test_tone(
        _device_id: &str,
        _duration_ms: u64,
        _frequency_hz: f32,
        _bus: &str,
    ) -> Result<VoicemeeterTestToneResult> {
        Err(anyhow!("Voicemeeter routing is only available on Windows."))
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

    pub fn probe_exclusive_lock(
        _device_id: &str,
        _buffer_frames: u32,
    ) -> Result<ExclusiveProbeResult> {
        Err(anyhow!(
            "WASAPI exclusive output is only available on Windows."
        ))
    }

    pub fn play_exclusive_file(
        _device_id: &str,
        _buffer_frames: u32,
        _source_sample_rate: u32,
        _source_channels: u16,
        _pcm_buffer: Arc<StreamingPcmBuffer>,
        _cursor: Arc<AtomicUsize>,
        _paused: Arc<AtomicBool>,
        _stop: Arc<AtomicBool>,
        _ended: Arc<AtomicBool>,
        _volume_bits: Arc<AtomicU32>,
        _on_started: impl FnOnce(),
    ) -> Result<PlaybackCompletion> {
        Err(anyhow!(
            "WASAPI exclusive output is only available on Windows."
        ))
    }

    pub fn play_exclusive_raw_pcm_file(
        _device_id: &str,
        _buffer_frames: u32,
        _raw_pcm_audio: Arc<RawPcmAudio>,
        _cursor: Arc<AtomicUsize>,
        _paused: Arc<AtomicBool>,
        _stop: Arc<AtomicBool>,
        _ended: Arc<AtomicBool>,
        _volume_bits: Arc<AtomicU32>,
        _on_started: impl FnOnce(),
    ) -> Result<PlaybackCompletion> {
        Err(anyhow!(
            "WASAPI exclusive output is only available on Windows."
        ))
    }
}
