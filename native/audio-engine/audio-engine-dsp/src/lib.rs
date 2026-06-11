pub fn dsp_capabilities() -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::dsp_capabilities;

    #[test]
    fn reports_no_dsp_capabilities_until_phase_one() {
        assert!(dsp_capabilities().is_empty());
    }
}
