use rms_lib::db;
use std::env;
use std::fs;
use std::sync::{Mutex, MutexGuard};

static TEST_LOCK: Mutex<()> = Mutex::new(());

fn lock_db_tests() -> MutexGuard<'static, ()> {
    TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

#[test]
fn test_settings_save_load_round_trip() {
    let _guard = lock_db_tests();
    let db_path = "backend_settings_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();

    db::update_settings(
        "Tasty Bites".into(),
        Some("Main Road".into()),
        Some("logo.png".into()),
        8.5,
        Some(12),
        2.5,
        "Dine-in,Takeaway".into(),
        Some("0345-0000000".into()),
        Some("Weekly".into()),
    ).unwrap();

    let s = db::get_settings().unwrap();
    assert_eq!(s.restaurant_name, "Tasty Bites");
    assert_eq!(s.address.as_deref(), Some("Main Road"));
    assert_eq!(s.logo_path.as_deref(), Some("logo.png"));
    assert!((s.tax_rate - 8.5).abs() < 0.001);
    assert_eq!(s.total_tables, 12);
    assert!((s.service_charge_rate - 2.5).abs() < 0.001);
    assert_eq!(s.service_charge_types, "Dine-in,Takeaway");
    assert_eq!(s.contact_number.as_deref(), Some("0345-0000000"));
    assert_eq!(s.order_reset_frequency, "Weekly");

    // Invalid order reset frequency rejected
    assert!(db::update_settings(
        "X".into(), None, None, 0.0, None, 0.0, "Dine-in".into(), None, Some("Hourly".into())
    ).is_err());

    // total_tables not supplied preserves the existing value
    db::update_settings(
        "Tasty Bites".into(), None, None, 8.5, None, 2.5, "Dine-in,Takeaway".into(), None, Some("Weekly".into())
    ).unwrap();
    let s = db::get_settings().unwrap();
    assert_eq!(s.total_tables, 12);

    let _ = fs::remove_file(db_path);
}

#[test]
fn test_service_charge_type_round_trip() {
    let _guard = lock_db_tests();
    let db_path = "backend_settings_sc_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();

    // Default is Dine-in only
    let s = db::get_settings().unwrap();
    assert_eq!(s.service_charge_types, "Dine-in");

    // Persist a multi-type list exactly as the Settings UI stores it
    db::update_settings("Tasty Bites".into(), None, None, 8.5, None, 2.5, "Dine-in,Takeaway,Delivery".into(), None, None).unwrap();
    let s = db::get_settings().unwrap();
    assert_eq!(s.service_charge_types, "Dine-in,Takeaway,Delivery");
    assert!((s.service_charge_rate - 2.5).abs() < 0.001);

    // Clearing to an empty list is preserved verbatim
    db::update_settings("Tasty Bites".into(), None, None, 8.5, None, 2.5, String::new(), None, None).unwrap();
    let s = db::get_settings().unwrap();
    assert_eq!(s.service_charge_types, "");

    let _ = fs::remove_file(db_path);
}