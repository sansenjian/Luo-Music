pub fn resample_capabilities() -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::resample_capabilities;

    #[test]
    fn reports_no_resample_capabilities_until_phase_one() {
        assert!(resample_capabilities().is_empty());
    }
}
