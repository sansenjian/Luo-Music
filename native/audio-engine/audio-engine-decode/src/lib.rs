const BASE_SUPPORTED_AUDIO_EXTENSIONS: &[&str] = &[
    ".aac", ".aif", ".aiff", ".ape", ".caf", ".flac", ".m2a", ".m4a", ".mka", ".mp1", ".mp2",
    ".mp3", ".mpa", ".oga", ".ogg", ".wav",
];

const BASE_DECODE_CAPABILITIES: &[&str] = &["symphonia-decode", "growing-file-source"];

pub fn supported_audio_extensions() -> Vec<String> {
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

pub fn decode_capabilities() -> Vec<String> {
    let mut capabilities = BASE_DECODE_CAPABILITIES
        .iter()
        .map(|capability| (*capability).to_string())
        .collect::<Vec<_>>();

    if cfg!(feature = "opus") {
        capabilities.push("opus-decode".to_string());
    }

    capabilities
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
    }
}
