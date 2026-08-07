use rms_lib::db;
use std::env;
use std::fs;

#[test]
fn test_order_taker_round_trip() {
    let db_path = "backend_order_taker_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();
    db::init_tables_if_needed().unwrap();

    // The "Order Taker" category is seeded by migrations; fetch its id.
    let conn = db::get_conn().unwrap();
    conn.execute("ALTER TABLE staff ADD COLUMN category_id INTEGER", []).ok();
    conn.execute("ALTER TABLE staff ADD COLUMN salary REAL", []).ok();
    conn.execute("ALTER TABLE staff ADD COLUMN pin_code TEXT", []).ok();
    let category_id: i32 = conn
        .query_row("SELECT id FROM staff_categories WHERE name = 'Order Taker'", [], |row| row.get(0))
        .unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO staff (name, role, phone, category_id, salary, pin_code, status) VALUES (?1, 'Staff', ?2, ?3, ?4, ?5, 'Active')",
        rusqlite::params!["Ali Waiter", "0300", category_id, 50000.0, "1234"],
    ).unwrap();
    // A staff assigned to a "Order Takers" (plural) category should also be listed
    conn.execute("INSERT OR IGNORE INTO staff_categories (name) VALUES ('Order Takers')", []).unwrap();
    let plural_id: i32 = conn
        .query_row("SELECT id FROM staff_categories WHERE name = 'Order Takers'", [], |row| row.get(0))
        .unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO staff (name, role, phone, category_id, salary, pin_code, status) VALUES (?1, 'Staff', ?2, ?3, ?4, ?5, 'Active')",
        rusqlite::params!["Sara Taker", "0311", plural_id, 45000.0, "5678"],
    ).unwrap();
    drop(conn);

    // Only Order Taker category staff should be listed
    let takers = db::get_order_takers().expect("Failed to get order takers");
    assert_eq!(takers.len(), 2, "Expected 2 order takers (singular + plural category)");
    assert_eq!(takers[0].name, "Ali Waiter");

    // Create order with a taker up front
    let order = db::create_walkin_order(
        "Takeaway".to_string(),
        None,
        None,
        Some(takers[0].id),
        Some(takers[0].name.clone()),
    ).expect("Failed to create walkin order");
    let order_id = order.id;
    assert_eq!(order.order_taker_name.as_deref(), Some("Ali Waiter"));

    // Clear the taker on an existing order
    db::update_order_taker(order_id, None, None).expect("Failed to clear taker");
    let order = db::get_order_by_id(order_id).expect("Failed to fetch order");
    assert_eq!(order.order_taker_id, None);
    assert_eq!(order.order_taker_name, None);

    // Set the taker back
    db::update_order_taker(order_id, Some(takers[0].id), Some(takers[0].name.clone())).expect("Failed to set taker");
    let order = db::get_order_by_id(order_id).expect("Failed to fetch order");
    assert_eq!(order.order_taker_id, Some(takers[0].id));
    assert_eq!(order.order_taker_name.as_deref(), Some("Ali Waiter"));

    // Order history should surface the taker
    let history = db::get_order_history().expect("Failed to get order history");
    assert!(history.iter().any(|o| o.id == order_id && o.order_taker_name.as_deref() == Some("Ali Waiter")));

    let _ = fs::remove_file(db_path);
}
