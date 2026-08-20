// Reproduces the exact scenario observed in the live database:
// 1. A payroll period is created BEFORE any advances exist (records get advance_deduction = 0).
// 2. Advances are given AFTER the records exist (resync_pending_advances should update them).
// 3. The payroll page is opened again (get_payroll_period).
// Verifies the pending records' advance_deduction / net_pay match the outstanding balance.

use rms_lib::db;
use std::env;
use std::fs;

const DB_PATH: &str = "payroll_live_repro_test.db";

fn setup_staff_and_period() -> i32 {
    for suffix in ["", "-wal", "-shm"] {
        let _ = fs::remove_file(format!("{}{}", DB_PATH, suffix));
    }
    db::init_shared_connection();
    db::init_db().unwrap();
    db::init_tables_if_needed().unwrap();

    // Staff 5 equivalent: salary 26000
    db::add_staff("Abubakkar".into(), None, "111".into(), 26000.0, "1111".into()).unwrap();
    let staff_id: i32 = {
        let conn = rusqlite::Connection::open(DB_PATH).unwrap();
        conn.query_row(
            "SELECT id FROM staff WHERE name = 'Abubakkar'",
            [],
            |r| r.get::<_, i32>(0),
        )
        .unwrap()
    };

    // 1. Open the payroll period BEFORE any advances exist (as happened on 2026-08-10)
    let p1 = db::get_payroll_period("2026-08-01".into(), "2026-08-31".into()).unwrap();
    assert_eq!(p1.rows.len(), 1);
    assert_close(p1.rows[0].advance_deduction, 0.0, "no advances yet -> 0 deduction");
    assert_close(p1.rows[0].net_pay, 26000.0, "full salary when no advances");

    staff_id
}

fn assert_close(actual: f64, expected: f64, label: &str) {
    assert!(
        (actual - expected).abs() < 0.01,
        "{}: expected {:.2}, got {:.2}",
        label,
        expected,
        actual
    );
}

#[test]
fn advance_given_after_record_creation_is_deducted() {
    env::set_var("DB_PATH", DB_PATH);
    let staff_id = setup_staff_and_period();

    // 2. Simulate the deployed-app scenario exactly as observed in the live DB:
    //    the advances were recorded by an older build that did NOT resync pending
    //    records (they were inserted with advance_deduction still 0). So insert the
    //    advance rows directly, bypassing pay_advance_salary's resync.
    {
        let conn = rusqlite::Connection::open(DB_PATH).unwrap();
        conn.execute(
            "INSERT INTO advance_salaries (staff_id, amount, date, note) VALUES (?1, 5000, '2026-08-17T12:50:56.540Z', 'kor ta laro')",
            [staff_id],
        ).unwrap();
        conn.execute(
            "INSERT INTO advance_salaries (staff_id, amount, date, note) VALUES (?1, 2000, '2026-08-17T12:51:39.371Z', 'pata na')",
            [staff_id],
        ).unwrap();
        conn.execute(
            "INSERT INTO expenses (amount, date, category, note, reference_type, reference_id) VALUES (5000, '2026-08-17', 'Salaries', 'Advance Salary: x', 'salary_advance', 1)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO expenses (amount, date, category, note, reference_type, reference_id) VALUES (2000, '2026-08-17', 'Salaries', 'Advance Salary: x', 'salary_advance', 2)",
            [],
        ).unwrap();
    }

    // Outstanding should now be 7000 but the record is still stale (0 deduction)
    let conn = rusqlite::Connection::open(DB_PATH).unwrap();
    let outstanding: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount - COALESCE(deducted_amount,0)),0) FROM advance_salaries WHERE staff_id = ?1",
            [staff_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_close(outstanding, 7000.0, "7000 outstanding after advances");
    let stale_deduction: f64 = conn
        .query_row(
            "SELECT advance_deduction FROM payroll_records WHERE staff_id = ?1 AND status = 'Pending'",
            [staff_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_close(stale_deduction, 0.0, "record still stale (0 deduction)");

    // 3. Open the payroll page again. get_payroll_period must resync stale
    //    pending records so the outstanding advance is actually recovered.
    let p2 = db::get_payroll_period("2026-08-01".into(), "2026-08-31".into()).unwrap();
    let row = &p2.rows[0];
    println!(
        "after advances: advance_deduction={:.2} net_pay={:.2} advance_balance={:.2}",
        row.advance_deduction, row.net_pay, row.advance_balance
    );
    // Expected: the pending record auto-deducts the outstanding 7000
    assert_close(row.advance_deduction, 7000.0, "record auto-deducts outstanding advance");
    assert_close(row.net_pay, 19000.0, "net = 26000 - 7000");
}