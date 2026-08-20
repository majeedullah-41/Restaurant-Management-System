use rms_lib::db;
use std::env;
use std::fs;
use std::sync::{Mutex, MutexGuard};

/// Tests in this binary operate on the process-global database connection, so
/// they must never run concurrently (cargo runs tests in threads by default).
static TEST_LOCK: Mutex<()> = Mutex::new(());

fn lock_db_tests() -> MutexGuard<'static, ()> {
    TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

const PERIOD_START: &str = "2026-08-01";
const PERIOD_END: &str = "2026-08-31";

fn q_i64(db_path: &str, sql: &str) -> i64 {
    let conn = rusqlite::Connection::open(db_path).unwrap();
    conn.query_row(sql, [], |row| row.get::<_, i64>(0)).unwrap_or(0)
}

fn staff_id_by_name(db_path: &str, name: &str) -> i32 {
    let conn = rusqlite::Connection::open(db_path).unwrap();
    conn.query_row(
        "SELECT id FROM staff WHERE name = ?1",
        [name],
        |row| row.get::<_, i32>(0),
    )
    .unwrap()
}

fn setup(db_path: &str) -> i32 {
    env::set_var("DB_PATH", db_path);
    for suffix in ["", "-wal", "-shm"] {
        let _ = fs::remove_file(format!("{db_path}{suffix}"));
    }
    db::init_shared_connection();
    db::init_db().unwrap();
    db::init_tables_if_needed().unwrap();

    db::add_staff("Alice".into(), None, "111".into(), 30000.0, "1111".into()).unwrap();
    staff_id_by_name(db_path, "Alice")
}

#[test]
fn test_delete_category_blocks_when_items_exist() {
    let _guard = lock_db_tests();
    let db_path = "cascade_delete_category.db";
    setup(db_path);

    let cat_id = q_i64(db_path, "SELECT id FROM categories WHERE name = 'Drinks'") as i32;
    if cat_id == 0 {
        db::add_category("Drinks".into()).unwrap();
    }
    let cat_id = q_i64(db_path, "SELECT id FROM categories WHERE name = 'Drinks'") as i32;
    db::add_menu_item("Cola".into(), cat_id, 2.0).unwrap();

    // Deleting a category that still has items must fail, not orphan them.
    let err = db::delete_category(cat_id).unwrap_err();
    assert!(err.to_lowercase().contains("menu item"), "unexpected error: {err}");

    // The item (and its category) survive the rejected delete.
    let items = db::get_menu_items().unwrap();
    assert!(items.iter().any(|i| i.name == "Cola"));
    let cats = db::get_categories().unwrap();
    assert!(cats.iter().any(|c| c.id == cat_id));

    // After removing the item, the category can be deleted cleanly.
    let item_id = items.iter().find(|i| i.name == "Cola").unwrap().id;
    db::delete_menu_item(item_id).unwrap();
    db::delete_category(cat_id).unwrap();
    let cats = db::get_categories().unwrap();
    assert!(!cats.iter().any(|c| c.id == cat_id));
}

#[test]
fn test_delete_staff_cleans_payroll_records_and_expenses() {
    let _guard = lock_db_tests();
    let db_path = "cascade_delete_staff.db";
    let staff_id = setup(db_path);

    // Record a salary advance: creates both an advance_salaries row and a
    // linked expense row (reference_type = 'salary_advance').
    db::pay_advance_salary(staff_id, 5000.0, "2026-08-05".into(), "".into(), "Alice".into()).unwrap();

    // Create a payroll period and process it: creates salary_payouts,
    // payroll_records and a linked expense row (reference_type = 'payroll').
    db::get_payroll_period(PERIOD_START.into(), PERIOD_END.into()).unwrap();
    db::process_payroll_batch(PERIOD_START.into(), PERIOD_END.into(), None).unwrap();

    // Sanity: the financial rows exist before the staff is deleted.
    assert!(q_i64(db_path, "SELECT COUNT(*) FROM expenses WHERE reference_type = 'salary_advance'") > 0);
    assert!(q_i64(db_path, "SELECT COUNT(*) FROM expenses WHERE reference_type = 'payroll'") > 0);
    assert!(q_i64(db_path, &format!("SELECT COUNT(*) FROM payroll_records WHERE staff_id = {staff_id}")) > 0);

    // Deleting the staff member must not leave orphaned financial rows behind.
    db::delete_staff(staff_id).unwrap();

    let adv_left = q_i64(db_path, "SELECT COUNT(*) FROM expenses WHERE reference_type = 'salary_advance'");
    let pay_left = q_i64(db_path, "SELECT COUNT(*) FROM expenses WHERE reference_type = 'payroll'");
    let rec_left = q_i64(db_path, &format!("SELECT COUNT(*) FROM payroll_records WHERE staff_id = {staff_id}"));
    let payouts_left = q_i64(db_path, &format!("SELECT COUNT(*) FROM salary_payouts WHERE staff_id = {staff_id}"));
    let advances_left = q_i64(db_path, &format!("SELECT COUNT(*) FROM advance_salaries WHERE staff_id = {staff_id}"));

    assert_eq!(adv_left, 0, "orphaned salary_advance expense left behind");
    assert_eq!(pay_left, 0, "orphaned payroll expense left behind");
    assert_eq!(rec_left, 0, "orphaned payroll_record left behind");
    assert_eq!(payouts_left, 0, "orphaned salary_payout left behind");
    assert_eq!(advances_left, 0, "orphaned advance left behind");

    let staff = db::get_staff().unwrap();
    assert!(!staff.iter().any(|s| s.id == staff_id));
}

#[test]
fn test_menu_price_and_settings_validation() {
    let _guard = lock_db_tests();
    let db_path = "cascade_validation.db";
    setup(db_path);

    db::add_category("Food".into()).unwrap();
    let cat_id = q_i64(db_path, "SELECT id FROM categories WHERE name = 'Food'") as i32;

    // Negative / zero / NaN prices are rejected for new and existing items.
    assert!(db::add_menu_item("Bad".into(), cat_id, -5.0).is_err());
    assert!(db::add_menu_item("Bad".into(), cat_id, 0.0).is_err());
    assert!(db::add_menu_item("Good".into(), cat_id, 10.0).is_ok());
    let items = db::get_menu_items().unwrap();
    let good = items.iter().find(|i| i.name == "Good").unwrap();
    assert!(db::update_menu_item(good.id, "Good".into(), cat_id, -1.0).is_err());
    assert!(db::update_menu_item(good.id, "Good".into(), cat_id, 12.0).is_ok());

    // Negative tax / service-charge rates are rejected.
    assert!(
        db::update_settings("R".into(), None, None, -1.0, None, 0.0, "Dine-in".into(), None, None).is_err()
    );
    assert!(
        db::update_settings("R".into(), None, None, 10.0, None, -2.0, "Dine-in".into(), None, None).is_err()
    );
    assert!(
        db::update_settings("R".into(), None, None, 10.0, None, 5.0, "Dine-in".into(), None, None).is_ok()
    );
}