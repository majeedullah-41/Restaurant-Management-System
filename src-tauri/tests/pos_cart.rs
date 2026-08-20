use rms_lib::db;
use std::env;
use std::fs;
use std::sync::{Mutex, MutexGuard};

/// Both tests in this binary operate on the process-global database connection,
/// so they must never run concurrently (cargo runs tests in threads by default).
static TEST_LOCK: Mutex<()> = Mutex::new(());

fn lock_db_tests() -> MutexGuard<'static, ()> {
    TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

#[test]
fn test_add_item_to_order_and_get_order_items() {
    let _guard = lock_db_tests();
    let db_path = "backend_pos_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();

    let conn = db::get_conn().unwrap();
    conn.execute(
        "CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_number INTEGER,
            status TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            closed_at TEXT,
            order_type TEXT DEFAULT 'Dine-in',
            subtotal REAL DEFAULT 0.0,
            tax_amount REAL DEFAULT 0.0,
            discount_amount REAL DEFAULT 0.0,
            amount_received REAL DEFAULT 0.0,
            change_due REAL DEFAULT 0.0,
            customer_id INTEGER,
            cashier_name TEXT,
            order_note TEXT,
            delivery_status TEXT,
            delivery_address TEXT,
            delivery_driver_id INTEGER,
            delivery_fee REAL DEFAULT 0.0,
            customer_phone TEXT,
            service_charge_amount REAL DEFAULT 0.0,
            order_taker_id INTEGER,
            order_taker_name TEXT
        )", []
    ).unwrap();
    drop(conn);

    db::init_tables_if_needed().unwrap();

    // Simulate the POS walk-in order flow
    let order = db::create_walkin_order(
        "Takeaway".to_string(),
        None,
        None,
        None,
        None,
    ).expect("Failed to create walkin order");
    let order_id = order.id;

    db::add_item_to_order(order_id, 1, "Burger".to_string(), 250.0).expect("Failed to add item");
    db::add_item_to_order(order_id, 2, "Fries".to_string(), 100.0).expect("Failed to add item");
    db::add_item_to_order(order_id, 1, "Burger".to_string(), 250.0).expect("Failed to stack item");

    let items = db::get_order_items(order_id).expect("Failed to get order items");
    assert_eq!(items.len(), 2, "Expected 2 distinct items in cart");
    let burger = items.iter().find(|i| i.item_id == 1).unwrap();
    assert_eq!(burger.quantity, 2, "Burger should stack to quantity 2");
    let fries = items.iter().find(|i| i.item_id == 2).unwrap();
    assert_eq!(fries.quantity, 1);

    let _ = fs::remove_file(db_path);
}

#[test]
fn test_mark_kot_printed_tracks_incremental_items() {
    let _guard = lock_db_tests();
    let db_path = "backend_pos_kot_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();

    let conn = db::get_conn().unwrap();
    conn.execute(
        "CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_number INTEGER,
            status TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            closed_at TEXT,
            order_type TEXT DEFAULT 'Dine-in',
            subtotal REAL DEFAULT 0.0,
            tax_amount REAL DEFAULT 0.0,
            discount_amount REAL DEFAULT 0.0,
            amount_received REAL DEFAULT 0.0,
            change_due REAL DEFAULT 0.0,
            customer_id INTEGER,
            cashier_name TEXT,
            order_note TEXT,
            delivery_status TEXT,
            delivery_address TEXT,
            delivery_driver_id INTEGER,
            delivery_fee REAL DEFAULT 0.0,
            customer_phone TEXT,
            service_charge_amount REAL DEFAULT 0.0,
            order_taker_id INTEGER,
            order_taker_name TEXT
        )", []
    ).unwrap();
    drop(conn);

    db::init_tables_if_needed().unwrap();

    let order = db::create_walkin_order(
        "Takeaway".to_string(),
        None,
        None,
        None,
        None,
    ).expect("Failed to create walkin order");
    let order_id = order.id;

    db::add_item_to_order(order_id, 1, "Burger".to_string(), 250.0).expect("Failed to add item");
    db::add_item_to_order(order_id, 2, "Fries".to_string(), 100.0).expect("Failed to add item");

    // First KOT prints everything
    db::mark_kot_printed(order_id).expect("Failed to mark KOT printed");

    // Order taker brings additional items
    db::add_item_to_order(order_id, 3, "Coke".to_string(), 80.0).expect("Failed to add item");
    db::add_item_to_order(order_id, 1, "Burger".to_string(), 250.0).expect("Failed to stack item");

    let items = db::get_order_items(order_id).expect("Failed to get order items");

    let burger = items.iter().find(|i| i.item_id == 1).unwrap();
    assert_eq!(burger.quantity, 2, "Burger total quantity should be 2");
    assert_eq!(burger.kot_printed_qty, 1, "Only 1 Burger was previously printed");
    assert_eq!(burger.quantity - burger.kot_printed_qty, 1, "Second KOT should print 1 additional Burger");

    let fries = items.iter().find(|i| i.item_id == 2).unwrap();
    assert_eq!(fries.quantity, 1);
    assert_eq!(fries.quantity - fries.kot_printed_qty, 0, "Fries already printed, must not reprint");

    let coke = items.iter().find(|i| i.item_id == 3).unwrap();
    assert_eq!(coke.quantity, 1);
    assert_eq!(coke.kot_printed_qty, 0, "Coke is brand new, not yet printed");
    assert_eq!(coke.quantity - coke.kot_printed_qty, 1, "Second KOT should print the new Coke");

    let _ = fs::remove_file(db_path);
}

#[test]
fn test_new_walkin_order_does_not_reuse_pending_order_with_items() {
    let _guard = lock_db_tests();
    let db_path = "backend_pos_new_order_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();

    let conn = db::get_conn().unwrap();
    conn.execute(
        "CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_number INTEGER,
            status TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            closed_at TEXT,
            order_type TEXT DEFAULT 'Dine-in',
            subtotal REAL DEFAULT 0.0,
            tax_amount REAL DEFAULT 0.0,
            discount_amount REAL DEFAULT 0.0,
            amount_received REAL DEFAULT 0.0,
            change_due REAL DEFAULT 0.0,
            customer_id INTEGER,
            cashier_name TEXT,
            order_note TEXT,
            delivery_status TEXT,
            delivery_address TEXT,
            delivery_driver_id INTEGER,
            delivery_fee REAL DEFAULT 0.0,
            customer_phone TEXT,
            service_charge_amount REAL DEFAULT 0.0,
            order_taker_id INTEGER,
            order_taker_name TEXT
        )", []
    ).unwrap();
    drop(conn);

    db::init_tables_if_needed().unwrap();

    // Simulate a pending (held) order that already has items.
    let pending = db::create_walkin_order(
        "Delivery".to_string(),
        None,
        None,
        None,
        None,
    ).expect("Failed to create pending walkin order");
    db::add_item_to_order(pending.id, 1, "Burger".to_string(), 250.0).expect("Failed to add item");

    // Starting a new order must create a fresh order, NOT reuse the pending one.
    let fresh = db::create_walkin_order(
        "Takeaway".to_string(),
        None,
        None,
        None,
        None,
    ).expect("Failed to create new walkin order");

    assert_ne!(fresh.id, pending.id, "New order must not reuse a pending order that has items");
    let fresh_items = db::get_order_items(fresh.id).expect("Failed to get fresh order items");
    assert!(fresh_items.is_empty(), "Fresh order cart must start empty");

    // Pending order still holds its own items untouched.
    let pending_items = db::get_order_items(pending.id).expect("Failed to get pending order items");
    assert_eq!(pending_items.len(), 1, "Pending order items must not be affected");

    let _ = fs::remove_file(db_path);
}
