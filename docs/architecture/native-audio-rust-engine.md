# Rust Native Audio Engine

LUO Music uses a Rust helper as the native audio backend for shared output,
WASAPI exclusive output, Voicemeeter routing, streaming decode, and bit-perfect
diagnostics. The native audio engine now lives in `native/audio-engine`, which
is a Cargo workspace. New native-audio work should prefer small engine crates
instead of growing the helper `main.rs` further.

## Current Shape

- `native/audio-engine/audio-output-helper/src/main.rs` remains the helper
  binary entrypoint. It delegates the JSON-line command loop to
  `audio-output-helper/src/command_loop.rs`; runtime state, playback
  orchestration, concrete file/network decode paths, and concrete
  CPAL/WASAPI/Voicemeeter output paths are still being moved out of the helper
  crate in later Phase 0 slices.
- `native/audio-engine/audio-engine-core` owns shared protocol types and pure
  helper logic: protocol version, output modes, bit-perfect diagnostics, format
  diagnostics, and the streaming PCM buffer.
- `native/audio-engine/audio-engine-decode` owns the decode manifest surfaced
  to Electron, including supported extensions and optional Opus/WebM feature
  reporting. Its optional `ffmpeg` feature adds an FFmpeg fallback decoder and
  extra uncommon-container extensions; the default helper remains pure
  Symphonia/APE and does not link FFmpeg.
- `native/audio-engine/audio-engine-output` owns the output manifest surfaced
  to Electron, including platform-gated native output modes and output
  capability names.
- `native/audio-engine/audio-engine-resample` and
  `native/audio-engine/audio-engine-dsp` are Phase 1 placeholder crates. They
  currently report no capabilities and do not affect playback. The
  TypeScript/Electron protocol can already persist DSP intent, but the Rust DSP
  crate is not yet inserted into the PCM render path.
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

## DSP Settings Contract

`packages/shared/audioOutput/protocol.ts` now carries optional DSP settings:

```ts
type AudioOutputDspSettings = {
  enabled: boolean
  headroomDb: number
  eq: Array<{
    id: string
    type: 'peaking' | 'lowShelf' | 'highShelf'
    frequencyHz: number
    gainDb: number
    q: number
    enabled: boolean
  }>
}
```

The sanitizer clamps the user-facing range before settings reach Electron:

| Field         | Range           |
| ------------- | --------------- |
| `headroomDb`  | `-24` to `0`    |
| `frequencyHz` | `20` to `20000` |
| `gainDb`      | `-12` to `12`   |
| `q`           | `0.1` to `18`   |
| `eq`          | up to 12 bands  |

When `bitPerfectRequired` is true, DSP is forced off and EQ bands are dropped
from the sanitized settings. This keeps the bit-perfect candidate path from
being silently polluted by volume headroom or EQ processing. The current
first-party audio output settings UI exposes `dspEnabled` and `dspHeadroomDb`
as compatibility settings; EQ bands are protocol-ready but do not yet have a
full editor or Rust processing path.

## FFmpeg Fallback

`audio-engine-decode` exposes an optional `ffmpeg` feature. When
`audio-output-helper` is built with that feature, local complete files first try
the normal Symphonia/APE decode path; if Symphonia cannot open or decode the
file, the helper falls back to FFmpeg and converts decoded audio to interleaved
f32 PCM for the existing streaming buffer. Growing online cache files keep the
current Symphonia path and do not use FFmpeg fallback until a complete local
cache exists.

The default helper binary is still `audio-output-helper(.exe)` and has no
external FFmpeg dependency. The full build can be produced with
`npm run build:audio-output-helper:ffmpeg`; when copying resources with the
build script's `--copy-resource`, the FFmpeg build is written as
`audio-output-helper-ffmpeg(.exe)`. On Windows this requires either a vcpkg
FFmpeg installation discoverable through `VCPKG_ROOT`, or FFmpeg development
libraries plus `pkg-config` configured for `libavutil`, `libavcodec`,
`libavformat`, and `libswresample`.

## Near-Term Roadmap

1. Keep extracting low-risk helper modules such as protocol, buffers, decode,
   and diagnostics without changing playback behavior.
2. Continue extracting concrete Symphonia/raw PCM/growing-file decode logic into
   `audio-engine-decode`.
3. Introduce output/decode/resample traits once the module boundaries are stable.
4. Add `rubato` resampling as the default pure-Rust high-quality resampler.
5. Keep ASIO and DSD behind later feature flags unless real hardware validation
   exists.
