use rms_lib::{db, print};
use std::env;
use std::fs;

#[test]
fn test_print_settings_round_trip_and_validation() {
    let db_path = "backend_print_settings_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();

    // Defaults: no printers configured, single copies, auto mode.
    let settings = print::get_print_settings().expect("Failed to get print settings");
    assert_eq!(settings.receipt_printer, None);
    assert_eq!(settings.kot_printer, None);
    assert_eq!(settings.delivery_printer, None);
    assert_eq!(settings.delivery_receipt_printer, None);
    assert_eq!(settings.receipt_copies, 1);
    assert_eq!(settings.kot_copies, 1);
    assert_eq!(settings.delivery_copies, 1);
    assert_eq!(settings.delivery_receipt_copies, 1);
    assert_eq!(settings.print_mode, "auto");
    assert!(settings.receipt_layout.is_some());
    assert!(settings.kot_layout.is_some());
    assert!(settings.delivery_layout.is_some());
    assert!(settings.delivery_receipt_layout.is_some());

    // Round trip: persist printers, copies, mode and layout JSON.
    print::update_print_settings(
        Some("Black Copper 80".into()),
        Some("EPSON TM-T20".into()),
        Some("Black Copper 80".into()),
        Some("Black Copper 80".into()),
        2,
        3,
        1,
        4,
        "preview".into(),
        Some("{\"showTax\":false}".into()),
        Some("{\"showOrderTaker\":true}".into()),
        Some("{}".into()),
        Some("{\"showDeliveryAddress\":true}".into()),
    )
    .expect("Failed to update print settings");

    let settings = print::get_print_settings().expect("Failed to get print settings");
    assert_eq!(settings.receipt_printer.as_deref(), Some("Black Copper 80"));
    assert_eq!(settings.kot_printer.as_deref(), Some("EPSON TM-T20"));
    assert_eq!(settings.delivery_receipt_printer.as_deref(), Some("Black Copper 80"));
    assert_eq!(settings.receipt_copies, 2);
    assert_eq!(settings.kot_copies, 3);
    assert_eq!(settings.delivery_copies, 1);
    assert_eq!(settings.delivery_receipt_copies, 4);
    assert_eq!(settings.print_mode, "preview");
    let layout: serde_json::Value =
        serde_json::from_str(settings.receipt_layout.as_deref().unwrap()).unwrap();
    assert_eq!(layout["showTax"], serde_json::Value::Bool(false));
    let dr_layout: serde_json::Value =
        serde_json::from_str(settings.delivery_receipt_layout.as_deref().unwrap()).unwrap();
    assert_eq!(dr_layout["showDeliveryAddress"], serde_json::Value::Bool(true));

    // Validation: bad mode and out-of-range copies rejected.
    assert!(print::update_print_settings(None, None, None, None, 1, 1, 1, 1, "bogus".into(), None, None, None, None).is_err());
    assert!(print::update_print_settings(None, None, None, None, 0, 1, 1, 1, "auto".into(), None, None, None, None).is_err());
    assert!(print::update_print_settings(None, None, None, None, 1, 100, 1, 1, "auto".into(), None, None, None, None).is_err());

    // Blank printer names normalize to None.
    print::update_print_settings(Some("   ".into()), None, None, None, 1, 1, 1, 1, "auto".into(), None, None, None, None).expect("ok");
    let settings = print::get_print_settings().expect("ok");
    assert_eq!(settings.receipt_printer, None);

    let _ = fs::remove_file(db_path);
}

#[test]
fn test_list_printers_real_powershell() {
    // Runs the real PowerShell pipeline (Get-Printer | ConvertTo-Json) that the
    // Settings UI depends on. This is the actual E2E link: it must not flash a
    // console (CREATE_NO_WINDOW) and must parse the JSON into structs.
    let printers = tauri::async_runtime::block_on(print::list_printers(None))
        .expect("list_printers should succeed against a real PowerShell");
    for p in &printers {
        assert!(!p.name.is_empty(), "printer with empty name in {:?}", printers);
    }
    // The dev machine is expected to have the thermal printer installed.
    assert!(
        printers.iter().any(|p| p.name.to_lowercase().contains("black")),
        "Expected the Black Copper thermal printer to be discovered, got: {:?}",
        printers.iter().map(|p| p.name.as_str()).collect::<Vec<_>>()
    );
}
