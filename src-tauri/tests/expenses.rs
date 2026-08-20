use rms_lib::db;
use std::env;
use std::fs;
use std::sync::{Mutex, MutexGuard};

static TEST_LOCK: Mutex<()> = Mutex::new(());

fn lock_db_tests() -> MutexGuard<'static, ()> {
    TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

#[test]
fn test_expense_add_delete_and_report_aggregation() {
    let _guard = lock_db_tests();
    let db_path = "backend_expenses_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();

    let today = chrono::Local::now().date_naive().format("%Y-%m-%d").to_string();

    db::add_expense(100.0, today.clone(), "Rent".into(), Some("Office".into())).unwrap();
    db::add_expense(50.5, today.clone(), "Utilities".into(), None).unwrap();

    let expenses = db::get_expenses().unwrap();
    assert_eq!(expenses.len(), 2);
    let rent = expenses.iter().find(|e| e.category == "Rent").unwrap();
    assert_eq!(rent.amount, 100.0);
    assert_eq!(rent.note.as_deref(), Some("Office"));
    let utilities = expenses.iter().find(|e| e.category == "Utilities").unwrap();
    assert!((utilities.amount - 50.5).abs() < 0.001);

    // Delete one expense
    db::delete_expense(rent.id).unwrap();
    let expenses = db::get_expenses().unwrap();
    assert_eq!(expenses.len(), 1);
    assert!(expenses.iter().all(|e| e.category != "Rent"));

    // Report aggregation: total expenses and per-category breakdown
    let report = db::get_analytics_report(today.clone(), today.clone()).unwrap();
    assert!((report.total_expenses - 50.5).abs() < 0.001, "expected 50.5, got {}", report.total_expenses);
    let utilities_cat = report.expenses_by_category.iter().find(|c| c.name == "Utilities").expect("utilities category in breakdown");
    assert!((utilities_cat.value - 50.5).abs() < 0.001);

    let _ = fs::remove_file(db_path);
}