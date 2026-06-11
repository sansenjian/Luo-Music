use audio_engine_core::AudioOutputMode;

const BASE_OUTPUT_CAPABILITIES: &[&str] = &["cpal-shared-output"];

pub fn supported_audio_modes() -> Vec<AudioOutputMode> {
    let mut modes = vec![AudioOutputMode::Shared];
    if supports_native_exclusive_family() {
        modes.push(AudioOutputMode::Exclusive);
        modes.push(AudioOutputMode::Voicemeeter);
    }

    modes
}

pub fn output_capabilities() -> Vec<String> {
    let mut capabilities = BASE_OUTPUT_CAPABILITIES
        .iter()
        .map(|capability| (*capability).to_string())
        .collect::<Vec<_>>();

    if supports_native_exclusive_family() {
        capabilities.push("wasapi-exclusive-output".to_string());
        capabilities.push("voicemeeter-route".to_string());
    }

    capabilities
}

fn supports_native_exclusive_family() -> bool {
    cfg!(windows)
}

#[cfg(test)]
mod tests {
    use super::{output_capabilities, supported_audio_modes};
    use audio_engine_core::AudioOutputMode;

    #[test]
    fn reports_output_capabilities_for_current_platform() {
        let capabilities = output_capabilities();

        assert!(capabilities.contains(&"cpal-shared-output".to_string()));
        if cfg!(windows) {
            assert!(capabilities.contains(&"wasapi-exclusive-output".to_string()));
            assert!(capabilities.contains(&"voicemeeter-route".to_string()));
        } else {
            assert!(!capabilities.contains(&"wasapi-exclusive-output".to_string()));
            assert!(!capabilities.contains(&"voicemeeter-route".to_string()));
        }
    }

    #[test]
    fn reports_output_modes_for_current_platform() {
        let modes = supported_audio_modes();

        assert!(modes.contains(&AudioOutputMode::Shared));
        if cfg!(windows) {
            assert!(modes.contains(&AudioOutputMode::Exclusive));
            assert!(modes.contains(&AudioOutputMode::Voicemeeter));
        } else {
            assert_eq!(modes, vec![AudioOutputMode::Shared]);
        }
    }
}
