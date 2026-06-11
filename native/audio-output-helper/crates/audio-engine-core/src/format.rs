use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AudioOutputMode {
    Shared,
    Exclusive,
    Voicemeeter,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioFormatDiagnostics {
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_format: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bit_depth: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}
