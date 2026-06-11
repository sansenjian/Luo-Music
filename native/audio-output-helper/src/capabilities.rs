pub(crate) const PROTOCOL_VERSION: u32 = 2;

const BASE_SUPPORTED_AUDIO_EXTENSIONS: &[&str] = &[
    ".aac", ".aif", ".aiff", ".ape", ".caf", ".flac", ".m2a", ".m4a", ".mka", ".mp1", ".mp2",
    ".mp3", ".mpa", ".oga", ".ogg", ".wav",
];

const BASE_HELPER_CAPABILITIES: &[&str] = &[
    "symphonia-decode",
    "streaming-pcm-buffer",
    "growing-file-source",
    "raw-pcm-passthrough",
    "bit-perfect-diagnostics",
    "cpal-shared-output",
];

pub(crate) fn supported_audio_extensions() -> Vec<String> {
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

pub(crate) fn helper_capabilities() -> Vec<String> {
    let mut capabilities = BASE_HELPER_CAPABILITIES
        .iter()
        .map(|capability| (*capability).to_string())
        .collect::<Vec<_>>();

    if cfg!(windows) {
        capabilities.push("wasapi-exclusive-output".to_string());
        capabilities.push("voicemeeter-route".to_string());
    }
    if cfg!(feature = "opus") {
        capabilities.push("opus-decode".to_string());
    }

    capabilities
}
