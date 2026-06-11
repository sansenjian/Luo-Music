pub const PROTOCOL_VERSION: u32 = 2;

const CORE_CAPABILITIES: &[&str] = &[
    "streaming-pcm-buffer",
    "raw-pcm-passthrough",
    "bit-perfect-diagnostics",
];

pub fn core_capabilities() -> Vec<String> {
    CORE_CAPABILITIES
        .iter()
        .map(|capability| (*capability).to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{core_capabilities, PROTOCOL_VERSION};

    #[test]
    fn reports_core_capabilities_for_ready_payload() {
        let capabilities = core_capabilities();

        assert_eq!(PROTOCOL_VERSION, 2);
        assert!(capabilities.contains(&"streaming-pcm-buffer".to_string()));
        assert!(capabilities.contains(&"raw-pcm-passthrough".to_string()));
        assert!(capabilities.contains(&"bit-perfect-diagnostics".to_string()));
    }
}
