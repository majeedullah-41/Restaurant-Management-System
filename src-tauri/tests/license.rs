use rms_lib::license;

// Regression test: the machine identifier must be a deterministic 16-hex-digit
// string and must be stable across repeated reads (it is derived from permanent
// hardware such as CPU ProcessorId / motherboard serial, not from OS-install
// state like MachineGuid or hostname).
#[test]
fn hwid_is_deterministic_and_well_formed() {
    let a = license::get_hwid();
    let b = license::get_hwid();
    assert_eq!(a, b, "HWID must be stable across calls");

    let groups: Vec<&str> = a.split('-').collect();
    assert_eq!(groups.len(), 4, "HWID must be 4 dash-separated groups");
    for g in groups {
        assert_eq!(g.len(), 4, "each HWID group must be 4 chars");
        assert!(
            g.chars().all(|c| c.is_ascii_hexdigit()),
            "HWID group must be hex, got: {}",
            g
        );
    }
}
