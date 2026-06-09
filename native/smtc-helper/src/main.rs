use std::io::{self, BufRead, Write};
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const PROTOCOL_VERSION: u32 = 1;
const LUO_MUSIC_APP_USER_MODEL_ID: &str = "com.sansenjian.luo-music";

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

    fn log(&self, level: &str, message: impl Into<String>) {
        let _ = self.emit(&HelperEvent::Log {
            level: level.to_string(),
            message: message.into(),
        });
    }

    fn error(&self, message: impl Into<String>) {
        let _ = self.emit(&HelperEvent::Error {
            message: message.into(),
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
#[allow(dead_code)]
struct InitializePayload {
    #[serde(rename = "appName")]
    app_name: Option<String>,
    #[serde(rename = "protocolVersion")]
    protocol_version: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct MetadataPayload {
    title: String,
    artist: Option<String>,
    album: Option<String>,
    #[serde(rename = "artworkUrl")]
    artwork_url: Option<String>,
    #[serde(rename = "sourceId")]
    _source_id: Option<Value>,
    #[serde(rename = "durationMs")]
    _duration_ms: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct PlaybackStatePayload {
    state: PlaybackState,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
enum PlaybackState {
    Playing,
    Paused,
    Stopped,
}

#[derive(Debug, Deserialize)]
struct TimelinePayload {
    #[serde(rename = "positionMs")]
    position_ms: i64,
    #[serde(rename = "durationMs")]
    duration_ms: i64,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct PlayModePayload {
    shuffle: bool,
    repeat: String,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum HelperEvent {
    #[serde(rename = "ready")]
    Ready { payload: ReadyPayload },
    #[serde(rename = "play")]
    Play,
    #[serde(rename = "pause")]
    Pause,
    #[serde(rename = "stop")]
    Stop,
    #[serde(rename = "nextTrack")]
    NextTrack,
    #[serde(rename = "previousTrack")]
    PreviousTrack,
    #[serde(rename = "seek")]
    Seek {
        #[serde(rename = "positionMs")]
        position_ms: i64,
    },
    #[serde(rename = "log")]
    Log { level: String, message: String },
    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Serialize)]
struct ReadyPayload {
    #[serde(rename = "protocolVersion")]
    protocol_version: u32,
}

fn main() -> Result<()> {
    let sink = EventSink::new();
    sink.emit(&HelperEvent::Ready {
        payload: ReadyPayload {
            protocol_version: PROTOCOL_VERSION,
        },
    })?;

    let mut smtc = platform::NativeSmtc::new(sink.clone())?;
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

        if let Err(error) = handle_command(&mut smtc, &sink, command) {
            sink.error(error.to_string());
        }
    }

    Ok(())
}

fn handle_command(
    smtc: &mut platform::NativeSmtc,
    sink: &EventSink,
    command: IncomingCommand,
) -> Result<()> {
    match command.command_type.as_str() {
        "initialize" => {
            let payload = parse_payload::<InitializePayload>(command.payload)?;
            if payload.protocol_version != Some(PROTOCOL_VERSION) {
                let message = format!(
                    "Unsupported SMTC protocol version: expected {}, received {:?}",
                    PROTOCOL_VERSION, payload.protocol_version
                );
                sink.log("error", message.clone());
                return Err(anyhow!(message));
            }
            if let Some(app_name) = payload.app_name {
                sink.log("info", format!("Initialized SMTC helper for {app_name}"));
            }
            Ok(())
        }
        "enable" => smtc.enable(),
        "disable" => smtc.disable(),
        "metadata" => smtc.update_metadata(parse_payload(command.payload)?),
        "playbackState" => smtc.update_playback_state(parse_payload(command.payload)?),
        "timeline" => smtc.update_timeline(parse_payload(command.payload)?),
        "playMode" => smtc.update_play_mode(parse_payload(command.payload)?),
        "shutdown" => {
            smtc.disable()?;
            std::process::exit(0);
        }
        other => Err(anyhow!("Unknown command type: {other}")),
    }
}

fn parse_payload<T>(payload: Value) -> Result<T>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_value(payload).context("Invalid command payload")
}

#[cfg(windows)]
mod platform {
    use std::env;

    use super::{
        EventSink, HelperEvent, MetadataPayload, PlayModePayload, PlaybackState,
        PlaybackStatePayload, TimelinePayload, LUO_MUSIC_APP_USER_MODEL_ID,
    };
    use anyhow::Result;
    use windows::core::HSTRING;
    use windows::Foundation::{TimeSpan, TypedEventHandler, Uri};
    use windows::Media::Playback::MediaPlayer;
    use windows::Media::{
        MediaPlaybackStatus, MediaPlaybackType, PlaybackPositionChangeRequestedEventArgs,
        SystemMediaTransportControls, SystemMediaTransportControlsButton,
        SystemMediaTransportControlsButtonPressedEventArgs,
        SystemMediaTransportControlsTimelineProperties,
    };
    use windows::Storage::Streams::RandomAccessStreamReference;
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    pub struct NativeSmtc {
        _player: MediaPlayer,
        smtc: SystemMediaTransportControls,
        _button_token: i64,
        _position_token: Option<i64>,
    }

    impl NativeSmtc {
        pub fn new(sink: EventSink) -> Result<Self> {
            set_helper_shell_identity(&sink);

            let player = MediaPlayer::new()?;
            let smtc = player.SystemMediaTransportControls()?;
            configure_buttons(&smtc)?;

            let button_sink = sink.clone();
            let button_token = smtc.ButtonPressed(&TypedEventHandler::<
                SystemMediaTransportControls,
                SystemMediaTransportControlsButtonPressedEventArgs,
            >::new(move |_, args| {
                let args = args.ok()?;
                let button = args.Button()?;
                let event = if button == SystemMediaTransportControlsButton::Play {
                    Some(HelperEvent::Play)
                } else if button == SystemMediaTransportControlsButton::Pause {
                    Some(HelperEvent::Pause)
                } else if button == SystemMediaTransportControlsButton::Stop {
                    Some(HelperEvent::Stop)
                } else if button == SystemMediaTransportControlsButton::Next {
                    Some(HelperEvent::NextTrack)
                } else if button == SystemMediaTransportControlsButton::Previous {
                    Some(HelperEvent::PreviousTrack)
                } else {
                    None
                };

                if let Some(event) = event {
                    button_sink.emit(&event).ok();
                }
                Ok(())
            }))?;

            let position_sink = sink.clone();
            let position_token = smtc
                .PlaybackPositionChangeRequested(&TypedEventHandler::<
                    SystemMediaTransportControls,
                    PlaybackPositionChangeRequestedEventArgs,
                >::new(move |_, args| {
                    let args = args.ok()?;
                    let position = args.RequestedPlaybackPosition()?;
                    position_sink
                        .emit(&HelperEvent::Seek {
                            position_ms: position.Duration / 10_000,
                        })
                        .ok();
                    Ok(())
                }))
                .ok();

            Ok(Self {
                _player: player,
                smtc,
                _button_token: button_token,
                _position_token: position_token,
            })
        }

        pub fn enable(&mut self) -> Result<()> {
            self.smtc.SetIsEnabled(true)?;
            Ok(())
        }

        pub fn disable(&mut self) -> Result<()> {
            self.smtc.SetIsEnabled(false)?;
            self.smtc.SetPlaybackStatus(MediaPlaybackStatus::Stopped)?;
            Ok(())
        }

        pub fn update_metadata(&mut self, payload: MetadataPayload) -> Result<()> {
            let updater = self.smtc.DisplayUpdater()?;
            updater.ClearAll()?;
            updater.SetType(MediaPlaybackType::Music)?;

            let music = updater.MusicProperties()?;
            music.SetTitle(&HSTRING::from(payload.title))?;

            if let Some(artist) = payload.artist {
                music.SetArtist(&HSTRING::from(artist))?;
            }

            if let Some(album) = payload.album {
                music.SetAlbumTitle(&HSTRING::from(album))?;
            }

            if let Some(artwork_url) = payload.artwork_url {
                if artwork_url.starts_with("http://") || artwork_url.starts_with("https://") {
                    let uri = Uri::CreateUri(&HSTRING::from(artwork_url))?;
                    let thumbnail = RandomAccessStreamReference::CreateFromUri(&uri)?;
                    updater.SetThumbnail(&thumbnail)?;
                }
            }

            updater.Update()?;
            Ok(())
        }

        pub fn update_playback_state(&mut self, payload: PlaybackStatePayload) -> Result<()> {
            let status = match payload.state {
                PlaybackState::Playing => MediaPlaybackStatus::Playing,
                PlaybackState::Paused => MediaPlaybackStatus::Paused,
                PlaybackState::Stopped => MediaPlaybackStatus::Stopped,
            };

            self.smtc.SetPlaybackStatus(status)?;
            Ok(())
        }

        pub fn update_timeline(&mut self, payload: TimelinePayload) -> Result<()> {
            let duration = payload.duration_ms.max(0);
            let position = payload.position_ms.clamp(0, duration);
            let timeline = SystemMediaTransportControlsTimelineProperties::new()?;

            timeline.SetStartTime(ms_to_time_span(0))?;
            timeline.SetMinSeekTime(ms_to_time_span(0))?;
            timeline.SetPosition(ms_to_time_span(position))?;
            timeline.SetMaxSeekTime(ms_to_time_span(duration))?;
            timeline.SetEndTime(ms_to_time_span(duration))?;

            self.smtc.UpdateTimelineProperties(&timeline)?;
            Ok(())
        }

        pub fn update_play_mode(&mut self, _payload: PlayModePayload) -> Result<()> {
            Ok(())
        }
    }

    fn configure_buttons(smtc: &SystemMediaTransportControls) -> Result<()> {
        smtc.SetIsEnabled(false)?;
        smtc.SetIsPlayEnabled(true)?;
        smtc.SetIsPauseEnabled(true)?;
        smtc.SetIsStopEnabled(true)?;
        smtc.SetIsNextEnabled(true)?;
        smtc.SetIsPreviousEnabled(true)?;
        Ok(())
    }

    fn ms_to_time_span(value: i64) -> TimeSpan {
        TimeSpan {
            Duration: value.saturating_mul(10_000),
        }
    }

    fn set_helper_shell_identity(sink: &EventSink) {
        let app_id = env::var("LUO_SMTC_APP_USER_MODEL_ID")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| LUO_MUSIC_APP_USER_MODEL_ID.to_string());
        let app_id = HSTRING::from(app_id);
        if let Err(error) = unsafe { SetCurrentProcessExplicitAppUserModelID(&app_id) } {
            sink.log(
                "warn",
                format!("Failed to set helper AppUserModelId: {error}"),
            );
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::{
        EventSink, MetadataPayload, PlayModePayload, PlaybackStatePayload, TimelinePayload,
    };
    use anyhow::{anyhow, Result};

    pub struct NativeSmtc {
        sink: EventSink,
    }

    impl NativeSmtc {
        pub fn new(sink: EventSink) -> Result<Self> {
            sink.log("warn", "Native SMTC helper is only functional on Windows.");
            Ok(Self { sink })
        }

        pub fn enable(&mut self) -> Result<()> {
            Err(anyhow!("Native SMTC helper is only supported on Windows."))
        }

        pub fn disable(&mut self) -> Result<()> {
            Ok(())
        }

        pub fn update_metadata(&mut self, _payload: MetadataPayload) -> Result<()> {
            self.sink
                .log("debug", "Ignored metadata update on non-Windows platform.");
            Ok(())
        }

        pub fn update_playback_state(&mut self, _payload: PlaybackStatePayload) -> Result<()> {
            Ok(())
        }

        pub fn update_timeline(&mut self, _payload: TimelinePayload) -> Result<()> {
            Ok(())
        }

        pub fn update_play_mode(&mut self, _payload: PlayModePayload) -> Result<()> {
            Ok(())
        }
    }
}
