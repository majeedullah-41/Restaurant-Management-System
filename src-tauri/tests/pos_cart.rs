use rms_lib::db;
use std::env;
use std::fs;

#[test]
fn test_add_item_to_order_and_get_order_items() {
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
