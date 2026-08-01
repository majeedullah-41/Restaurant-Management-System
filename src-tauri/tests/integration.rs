use rms_lib::db;
use std::env;
use std::fs;

#[test]
fn test_delivery_checkout_status() {
    let db_path = "backend_test.db";
    // 1. Setup a test database
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    // 2. Initialize DB connection and tables
    db::init_shared_connection();
    db::init_db().unwrap();
    
    // Ensure `orders` table exists before `init_tables_if_needed` alters it
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
            service_charge_amount REAL DEFAULT 0.0
        )", []
    ).unwrap();
    drop(conn);

    db::init_tables_if_needed().unwrap();
    
    // Ensure table 99 exists for our order
    let _ = db::add_table(99); 

    // 3. Create an order on table 99
    let order = db::get_or_create_order(99).expect("Failed to create order");
    let order_id = order.id;

    // 4. Checkout the order as "Delivery"
    db::checkout_order(
        order_id,
        99,
        "Delivery".to_string(),
        None, // customer_id
        100.0,
        0.0,
        0.0,
        100.0,
        0.0,
        "Test Cashier".to_string(),
        "".to_string(), // order_note is String, not Option<String>
        0.0
    ).expect("Failed to checkout order");

    // 5. Verify the order status in the database directly
    let conn = rusqlite::Connection::open(db_path).unwrap();
    let status: String = conn.query_row(
        "SELECT status FROM orders WHERE id = ?1",
        [order_id],
        |row| row.get(0)
    ).unwrap();

    assert_eq!(status, "Delivery Pending", "Delivery order should be marked as Delivery Pending");

    // Cleanup
    let _ = fs::remove_file(db_path);
}
