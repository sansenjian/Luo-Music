use std::io::{self, BufRead};

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use serde_json::Value;

use super::*;

pub(crate) fn run() -> Result<()> {
    let sink = EventSink::new();
    sink.emit(&HelperEvent::Ready {
        payload: ReadyPayload {
            protocol_version: PROTOCOL_VERSION,
            capabilities: helper_capabilities(),
            supported_extensions: supported_audio_extensions(),
            supported_modes: supported_audio_modes(),
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

pub(crate) fn handle_command(
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
