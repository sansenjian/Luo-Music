use serde::Serialize;

use crate::format::{AudioFormatDiagnostics, AudioOutputMode};

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BitPerfectStatus {
    Candidate,
    NotCandidate,
    Unverified,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BitPerfectDiagnostics {
    pub status: BitPerfectStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_format: Option<AudioFormatDiagnostics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_format: Option<AudioFormatDiagnostics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub volume: Option<f32>,
    pub reason: String,
}

pub fn evaluate_bit_perfect(
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

pub fn create_unverified_bit_perfect_diagnostics(
    reason: impl Into<String>,
) -> BitPerfectDiagnostics {
    BitPerfectDiagnostics {
        status: BitPerfectStatus::Unverified,
        source_format: None,
        output_format: None,
        volume: None,
        reason: reason.into(),
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

#[cfg(test)]
mod tests {
    use super::{
        create_unverified_bit_perfect_diagnostics, evaluate_bit_perfect, BitPerfectStatus,
    };
    use crate::format::{AudioFormatDiagnostics, AudioOutputMode};

    fn pcm_format(source: &str) -> AudioFormatDiagnostics {
        AudioFormatDiagnostics {
            sample_rate: 44_100,
            channels: 2,
            sample_format: "pcm".to_string(),
            bit_depth: Some(16),
            source: Some(source.to_string()),
        }
    }

    #[test]
    fn exclusive_matching_pcm_is_candidate() {
        let diagnostics = evaluate_bit_perfect(
            AudioOutputMode::Exclusive,
            pcm_format("WAV raw PCM passthrough"),
            pcm_format("WASAPI exclusive"),
            1.0,
        );

        assert_eq!(diagnostics.status, BitPerfectStatus::Candidate);
    }

    #[test]
    fn helper_decoded_pcm_is_not_candidate() {
        let diagnostics = evaluate_bit_perfect(
            AudioOutputMode::Exclusive,
            AudioFormatDiagnostics {
                sample_format: "decoded-f32".to_string(),
                bit_depth: Some(32),
                source: Some("Symphonia streaming decoded PCM".to_string()),
                ..pcm_format("decoded")
            },
            AudioFormatDiagnostics {
                sample_format: "float".to_string(),
                bit_depth: Some(32),
                ..pcm_format("WASAPI exclusive")
            },
            1.0,
        );

        assert_eq!(diagnostics.status, BitPerfectStatus::NotCandidate);
    }

    #[test]
    fn unverified_diagnostics_preserve_reason() {
        let diagnostics = create_unverified_bit_perfect_diagnostics("needs hardware proof");

        assert_eq!(diagnostics.status, BitPerfectStatus::Unverified);
        assert_eq!(diagnostics.reason, "needs hardware proof");
        assert!(diagnostics.source_format.is_none());
    }
}
