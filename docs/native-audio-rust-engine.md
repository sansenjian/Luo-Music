# Rust Native Audio Engine

LUO Music uses a Rust helper as the native audio backend for shared output,
WASAPI exclusive output, Voicemeeter routing, streaming decode, and bit-perfect
diagnostics. The current helper still lives in
`native/audio-output-helper`, but new native-audio work should move toward
small, explicit modules instead of growing `src/main.rs` further.

## Current Shape

- `native/audio-output-helper/src/main.rs` owns the command loop, runtime state,
  decoding, streaming PCM buffer, output backends, and tests.
- `native/audio-output-helper/src/capabilities.rs` owns the helper protocol
  version, supported source extensions, and helper capability names surfaced in
  the `ready` event.
- `electron/main/audioOutputService.ts` starts the helper, sends JSON-line
  commands, tracks playback state, and now hydrates helper-supported formats and
  modes as soon as the helper reports ready.
- `packages/shared/audioOutput/protocol.ts` is the renderer/main/helper contract.

## Capability Handshake

The helper `ready` payload is intentionally additive:

```json
{
  "type": "ready",
  "payload": {
    "protocolVersion": 2,
    "capabilities": ["symphonia-decode", "cpal-shared-output"],
    "supportedExtensions": [".mp3", ".flac"],
    "supportedModes": ["shared"]
  }
}
```

Older helpers that only send `protocolVersion` are still accepted. New fields let
the Electron layer decide whether a future helper binary supports optional
features such as Opus, high-quality resampling, or FFmpeg fallback before the
first status payload arrives.

## Near-Term Roadmap

1. Keep extracting low-risk helper modules such as protocol, buffers, decode,
   and diagnostics without changing playback behavior.
2. Introduce output/decode/resample traits once the module boundaries are stable.
3. Add `rubato` resampling as the default pure-Rust high-quality resampler.
4. Treat FFmpeg as an optional fallback build, not a required dependency.
5. Keep ASIO and DSD behind later feature flags unless real hardware validation
   exists.
