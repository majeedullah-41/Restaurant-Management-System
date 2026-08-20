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

#[test]
fn test_inventory_item_crud_and_stock_calculations() {
    let _guard = lock_db_tests();
    let db_path = "backend_inventory_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();

    // Add items
    db::add_inventory_item("Tomato".into(), "kg".into(), 5.0, Some("Farmer A".into())).unwrap();
    db::add_inventory_item("Flour".into(), "kg".into(), 3.0, None).unwrap();

    // Duplicate names are rejected
    assert!(db::add_inventory_item("Tomato".into(), "kg".into(), 1.0, None).is_err());

    // New items have zero stock
    let items = db::get_inventory_items().unwrap();
    let tomato = items.iter().find(|i| i.name == "Tomato").unwrap();
    assert_eq!(tomato.current_stock, 0.0);
    let tomato_id = tomato.id;

    // Update item metadata
    db::update_inventory_item(tomato_id, "Tomato Fresh".into(), "kg".into(), 4.0, Some("Farmer A".into())).unwrap();
    let items = db::get_inventory_items().unwrap();
    let tomato = items.iter().find(|i| i.id == tomato_id).unwrap();
    assert_eq!(tomato.name, "Tomato Fresh");
    assert_eq!(tomato.low_stock_threshold, 4.0);

    // Purchase 10 units @ 100 total, then use 3
    db::record_inventory_purchase(tomato_id, 10.0, 100.0, Some("Farmer A".into()), None).unwrap();
    db::record_inventory_usage(tomato_id, 3.0, Some("Kitchen".into())).unwrap();

    // Validation: negative/zero quantities rejected
    assert!(db::record_inventory_usage(tomato_id, -1.0, None).is_err());
    assert!(db::record_inventory_purchase(tomato_id, 0.0, 0.0, None, None).is_err());
    assert!(db::record_inventory_purchase(tomato_id, 1.0, -5.0, None, None).is_err());

    // Stock is purchase - usage = 10 - 3 = 7
    let items = db::get_inventory_items().unwrap();
    let tomato = items.iter().find(|i| i.id == tomato_id).unwrap();
    assert!((tomato.current_stock - 7.0).abs() < 0.001, "stock should be 7, got {}", tomato.current_stock);

    // Transactions recorded (purchase + usage)
    let txns = db::get_inventory_transactions(None, None, Some(tomato_id), None).unwrap();
    assert_eq!(txns.len(), 2);
    let usage = txns.iter().find(|t| t.transaction_type == "usage").unwrap();
    assert_eq!(usage.quantity, 3.0);

    // Filter by type
    let purchases = db::get_inventory_transactions(None, None, Some(tomato_id), Some("purchase".into())).unwrap();
    assert_eq!(purchases.len(), 1);

    // Summary: 2 items, Flour is out of stock (0 <= 0), Tomato is not low (7 > 4)
    let summary = db::get_inventory_summary(None, None).unwrap();
    assert_eq!(summary.total_items, 2);
    assert_eq!(summary.out_of_stock_count, 1);
    assert_eq!(summary.low_stock_count, 0);
    assert!((summary.period_purchase_total - 100.0).abs() < 0.001);

    // Purchases also auto-log an Inventory expense
    let expenses = db::get_expenses().unwrap();
    assert!(expenses.iter().any(|e| e.category == "Inventory" && (e.amount - 100.0).abs() < 0.001));

    // Delete removes the item and its transactions
    db::delete_inventory_item(tomato_id).unwrap();
    let items = db::get_inventory_items().unwrap();
    assert_eq!(items.len(), 1);
    let txns = db::get_inventory_transactions(None, None, Some(tomato_id), None).unwrap();
    assert_eq!(txns.len(), 0);

    let _ = fs::remove_file(db_path);
}

#[test]
fn test_purchase_deletion_cascades_to_expenses_and_blocks_direct_expense_delete() {
    let _guard = lock_db_tests();
    let db_path = "backend_inventory_link_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();

    db::add_inventory_item("Rice".into(), "kg".into(), 5.0, Some("Metro".into())).unwrap();
    let items = db::get_inventory_items().unwrap();
    let rice = items.iter().find(|i| i.name == "Rice").unwrap();
    let rice_id = rice.id;

    // Purchase auto-logs a linked Inventory expense
    db::record_inventory_purchase(rice_id, 20.0, 500.0, Some("Metro".into()), Some("Weekly".into())).unwrap();
    let expenses = db::get_expenses().unwrap();
    let inv_expense = expenses.iter().find(|e| e.category == "Inventory" && (e.amount - 500.0).abs() < 0.001)
        .expect("purchase should auto-log an Inventory expense");
    let expense_id = inv_expense.id;

    // Deleting the expense directly is rejected to avoid desyncing inventory
    assert!(db::delete_expense(expense_id).is_err(), "inventory-linked expense must not be deletable directly");
    let expenses = db::get_expenses().unwrap();
    assert!(expenses.iter().any(|e| e.id == expense_id), "expense must still exist after blocked delete");

    // Find the purchase transaction and delete it from Inventory
    let txns = db::get_inventory_transactions(None, None, Some(rice_id), Some("purchase".into())).unwrap();
    assert_eq!(txns.len(), 1);
    let txn_id = txns[0].id;

    db::delete_inventory_transaction(txn_id).unwrap();

    // Linked expense removed automatically
    let expenses = db::get_expenses().unwrap();
    assert!(!expenses.iter().any(|e| e.id == expense_id), "linked expense must be deleted with the purchase");
    let txns = db::get_inventory_transactions(None, None, Some(rice_id), None).unwrap();
    assert_eq!(txns.len(), 0, "purchase transaction gone");

    // Usage deletion works too (no expense involved)
    db::record_inventory_usage(rice_id, 2.0, Some("Kitchen".into())).unwrap();
    let usages = db::get_inventory_transactions(None, None, Some(rice_id), Some("usage".into())).unwrap();
    assert_eq!(usages.len(), 1);
    db::delete_inventory_transaction(usages[0].id).unwrap();
    let txns = db::get_inventory_transactions(None, None, Some(rice_id), None).unwrap();
    assert_eq!(txns.len(), 0, "usage transaction gone");

    // Deleting a missing transaction errors cleanly
    assert!(db::delete_inventory_transaction(999999).is_err());

    let _ = fs::remove_file(db_path);
}