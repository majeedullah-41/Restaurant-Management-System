use rms_lib::db;
use std::env;
use std::fs;
use std::sync::{Mutex, MutexGuard};

static TEST_LOCK: Mutex<()> = Mutex::new(());

fn lock_db_tests() -> MutexGuard<'static, ()> {
    TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

#[test]
fn test_delivery_flow_status_transitions_and_driver_assignment() {
    let _guard = lock_db_tests();
    let db_path = "backend_delivery_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();

    // Customer resolution creates/reuses a customer record
    let customer_id = db::resolve_customer(
        Some("Ali".into()),
        Some("0300-1234567".into()),
        Some("Street 1".into()),
    ).unwrap();
    assert!(customer_id > 0);

    // Create a delivery order and add items
    let order = db::create_walkin_order("Delivery".into(), None, None, None, None).unwrap();
    let order_id = order.id;
    db::add_item_to_order(order_id, 1, "Burger".into(), 250.0).unwrap();
    db::add_item_to_order(order_id, 2, "Fries".into(), 100.0).unwrap();

    // Place the delivery
    db::place_delivery_order(
        order_id,
        Some(customer_id),
        "Street 1".into(),
        Some("0300-1234567".into()),
        50.0,
        350.0,
        10.0,
        0.0,
        "Admin".into(),
        "Handle with care".into(),
        0.0,
    ).unwrap();

    // Appears in active deliveries with customer details
    let deliveries = db::get_active_deliveries().unwrap();
    let d = deliveries.iter().find(|d| d.id == order_id).expect("delivery should be active");
    assert_eq!(d.delivery_status.as_deref(), Some("Pending"));
    assert_eq!(d.customer_name.as_deref(), Some("Ali"));

    // Validation: negative delivery fee rejected
    assert!(db::place_delivery_order(
        order_id,
        Some(customer_id),
        "Street 1".into(),
        None,
        -5.0,
        350.0,
        0.0,
        0.0,
        "Admin".into(),
        String::new(),
        0.0,
    ).is_err());

    // Add a driver (staff) and assign
    db::add_staff("Driver Babar".into(), None, "0311-0000000".into(), 20000.0, "1234".into()).unwrap();
    let staff = db::get_staff_dropdown().unwrap();
    let driver = staff.iter().find(|s| s.name == "Driver Babar").expect("driver added");
    db::assign_delivery_driver(order_id, driver.id).unwrap();

    let deliveries = db::get_active_deliveries().unwrap();
    let d = deliveries.iter().find(|d| d.id == order_id).unwrap();
    assert_eq!(d.delivery_status.as_deref(), Some("Dispatched"));
    assert_eq!(d.driver_name.as_deref(), Some("Driver Babar"));

    // Delivering closes the order and removes it from active deliveries
    db::update_delivery_status(order_id, "Delivered".into()).unwrap();
    let deliveries = db::get_active_deliveries().unwrap();
    assert!(deliveries.iter().all(|d| d.id != order_id), "delivered order must leave active deliveries");

    let closed = db::get_order_by_id(order_id).unwrap();
    assert_eq!(closed.status, "Closed");
}