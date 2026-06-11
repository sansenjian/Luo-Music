use anyhow::{anyhow, Result};

#[cfg(feature = "ffmpeg")]
mod ffmpeg;

const BASE_SUPPORTED_AUDIO_EXTENSIONS: &[&str] = &[
    ".aac", ".aif", ".aiff", ".ape", ".caf", ".flac", ".m2a", ".m4a", ".mka", ".mp1", ".mp2",
    ".mp3", ".mpa", ".oga", ".ogg", ".wav",
];

const BASE_DECODE_CAPABILITIES: &[&str] = &["symphonia-decode", "growing-file-source"];
const FFMPEG_SUPPORTED_AUDIO_EXTENSIONS: &[&str] = &[
    ".ac3", ".amr", ".dts", ".eac3", ".ra", ".rm", ".rmvb", ".wma", ".wmv",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DecodedSampleFormat {
    F32Interleaved,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DecodedAudioFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_format: DecodedSampleFormat,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DecodedF32Audio {
    pub format: DecodedAudioFormat,
    pub samples: Vec<f32>,
    pub source: &'static str,
}

pub trait AudioDecoder {
    fn decode_to_f32(self) -> Result<DecodedF32Audio>;
}

pub fn supported_audio_extensions() -> Vec<String> {
    let mut extensions = BASE_SUPPORTED_AUDIO_EXTENSIONS
        .iter()
        .map(|extension| (*extension).to_string())
        .collect::<Vec<_>>();

    if cfg!(feature = "opus") {
        extensions.push(".opus".to_string());
        extensions.push(".webm".to_string());
    }
    if cfg!(feature = "ffmpeg") {
        extensions.extend(
            FFMPEG_SUPPORTED_AUDIO_EXTENSIONS
                .iter()
                .map(|extension| (*extension).to_string()),
        );
        extensions.sort();
        extensions.dedup();
    }

    extensions
}

pub fn decode_capabilities() -> Vec<String> {
    let mut capabilities = BASE_DECODE_CAPABILITIES
        .iter()
        .map(|capability| (*capability).to_string())
        .collect::<Vec<_>>();

    if cfg!(feature = "opus") {
        capabilities.push("opus-decode".to_string());
    }
    if cfg!(feature = "ffmpeg") {
        capabilities.push("ffmpeg-decode".to_string());
        capabilities.push("ffmpeg-fallback-decode".to_string());
    }

    capabilities
}

pub fn decode_file_to_f32_with_ffmpeg(path: &str, start_seconds: f64) -> Result<DecodedF32Audio> {
    decode_file_to_f32_with_ffmpeg_impl(path, start_seconds)
}

#[cfg(feature = "ffmpeg")]
fn decode_file_to_f32_with_ffmpeg_impl(path: &str, start_seconds: f64) -> Result<DecodedF32Audio> {
    ffmpeg::FfmpegAudioDecoder::open(path, start_seconds)?.decode_to_f32()
}

#[cfg(not(feature = "ffmpeg"))]
fn decode_file_to_f32_with_ffmpeg_impl(
    _path: &str,
    _start_seconds: f64,
) -> Result<DecodedF32Audio> {
    Err(anyhow!(
        "FFmpeg audio decode fallback is not enabled for this helper build."
    ))
}

#[cfg(test)]
mod tests {
    use super::{decode_capabilities, supported_audio_extensions};

    #[test]
    fn reports_base_decode_capabilities() {
        let capabilities = decode_capabilities();

        assert!(capabilities.contains(&"symphonia-decode".to_string()));
        assert!(capabilities.contains(&"growing-file-source".to_string()));

        if cfg!(feature = "opus") {
            assert!(capabilities.contains(&"opus-decode".to_string()));
        } else {
            assert!(!capabilities.contains(&"opus-decode".to_string()));
        }
        if cfg!(feature = "ffmpeg") {
            assert!(capabilities.contains(&"ffmpeg-decode".to_string()));
            assert!(capabilities.contains(&"ffmpeg-fallback-decode".to_string()));
        } else {
            assert!(!capabilities.contains(&"ffmpeg-decode".to_string()));
            assert!(!capabilities.contains(&"ffmpeg-fallback-decode".to_string()));
        }
    }

    #[test]
    fn reports_supported_audio_extensions() {
        let extensions = supported_audio_extensions();

        assert!(extensions.contains(&".mp3".to_string()));
        assert!(extensions.contains(&".flac".to_string()));
        assert!(extensions.contains(&".ape".to_string()));

        if cfg!(feature = "opus") {
            assert!(extensions.contains(&".opus".to_string()));
            assert!(extensions.contains(&".webm".to_string()));
        } else {
            assert!(!extensions.contains(&".opus".to_string()));
            assert!(!extensions.contains(&".webm".to_string()));
        }
        if cfg!(feature = "ffmpeg") {
            assert!(extensions.contains(&".wma".to_string()));
            assert!(extensions.contains(&".ra".to_string()));
        } else {
            assert!(!extensions.contains(&".wma".to_string()));
            assert!(!extensions.contains(&".ra".to_string()));
        }
    }

    #[test]
    fn ffmpeg_decode_reports_disabled_without_feature() {
        if !cfg!(feature = "ffmpeg") {
            let error =
                super::decode_file_to_f32_with_ffmpeg("missing.wma", 0.0).expect_err("disabled");
            assert!(error.to_string().contains("not enabled"));
        }
    }
}
