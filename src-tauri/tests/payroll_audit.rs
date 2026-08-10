// Payroll end-to-end audit.
//
// Exercises the real payroll flow the same way the UI does:
//   advances -> get_payroll_period -> update_payroll_record ->
//   process_payroll_batch (selected + all) -> reopen -> reprocess -> void
// and cross-checks every invariant against the raw SQLite tables to catch
// inconsistent data, miscalculations, or lost money.

use rms_lib::db;
use std::env;
use std::fs;

const DB_PATH: &str = "payroll_audit_test.db";
const PERIOD_START: &str = "2026-08-01";
const PERIOD_END: &str = "2026-08-31";

fn assert_close(actual: f64, expected: f64, label: &str) {
    assert!(
        (actual - expected).abs() < 0.01,
        "{}: expected {:.2}, got {:.2}",
        label,
        expected,
        actual
    );
}

fn q_rows(db_path: &str, sql: &str) -> Vec<Vec<Option<f64>>> {
    let conn = rusqlite::Connection::open(db_path).unwrap();
    let mut stmt = conn.prepare(sql).unwrap();
    let rows: Vec<Vec<Option<f64>>> = stmt
        .query_map([], |row| {
            let ncols = row.as_ref().column_count();
            let mut vals = Vec::with_capacity(ncols);
            for i in 0..ncols {
                vals.push(row.get::<_, Option<f64>>(i).unwrap_or(None));
            }
            Ok(vals)
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    rows
}

fn q_f64(db_path: &str, sql: &str) -> f64 {
    q_rows(db_path, sql)[0][0].unwrap_or(0.0)
}

fn q_i64(db_path: &str, sql: &str) -> i64 {
    let conn = rusqlite::Connection::open(db_path).unwrap();
    conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap()
}

fn q_str(db_path: &str, sql: &str) -> String {
    let conn = rusqlite::Connection::open(db_path).unwrap();
    conn.query_row(sql, [], |r| r.get::<_, Option<String>>(0))
        .unwrap()
        .unwrap_or_default()
}

fn staff_id_by_name(db_path: &str, name: &str) -> i32 {
    let conn = rusqlite::Connection::open(db_path).unwrap();
    conn.query_row(
        "SELECT id FROM staff WHERE name = ?1",
        [name],
        |r| r.get::<_, i32>(0),
    )
    .unwrap()
}

fn outstanding(db_path: &str, staff_id: i32) -> f64 {
    let conn = rusqlite::Connection::open(db_path).unwrap();
    conn.query_row(
        "SELECT COALESCE(SUM(amount - COALESCE(deducted_amount, 0)), 0) FROM advance_salaries WHERE staff_id = ?1",
        [staff_id],
        |r| r.get::<_, f64>(0),
    )
    .unwrap()
}

fn record_id_for(db_path: &str, staff_id: i32) -> i32 {
    let conn = rusqlite::Connection::open(db_path).unwrap();
    conn.query_row(
        "SELECT id FROM payroll_records WHERE start_date = ?1 AND end_date = ?2 AND staff_id = ?3",
        rusqlite::params![PERIOD_START, PERIOD_END, staff_id],
        |r| r.get::<_, i32>(0),
    )
    .unwrap()
}

fn setup() -> (i32, i32, i32, i32) {
    env::set_var("DB_PATH", DB_PATH);
    for suffix in ["", "-wal", "-shm"] {
        let _ = fs::remove_file(format!("{}{}", DB_PATH, suffix));
    }
    db::init_shared_connection();
    db::init_db().unwrap();
    db::init_tables_if_needed().unwrap();

    // 3 staff + 1 extra staff member added mid-month later
    db::add_staff("Alice".into(), None, "111".into(), 30000.0, "1111".into()).unwrap();
    db::add_staff("Bob".into(), None, "222".into(), 25000.0, "2222".into()).unwrap();
    db::add_staff("Carol".into(), None, "333".into(), 40000.0, "3333".into()).unwrap();
    db::add_staff("Dave".into(), None, "444".into(), 20000.0, "4444".into()).unwrap();

    let a = staff_id_by_name(DB_PATH, "Alice");
    let b = staff_id_by_name(DB_PATH, "Bob");
    let c = staff_id_by_name(DB_PATH, "Carol");
    let d = staff_id_by_name(DB_PATH, "Dave");

    // Advances: Bob 5000, Carol two advances 3000+2000, Dave 10000
    db::pay_advance_salary(b, 5000.0, "2026-08-05".into(), "".into(), "Bob".into()).unwrap();
    db::pay_advance_salary(c, 3000.0, "2026-08-03".into(), "".into(), "Carol".into()).unwrap();
    db::pay_advance_salary(c, 2000.0, "2026-08-10".into(), "".into(), "Carol".into()).unwrap();
    db::pay_advance_salary(d, 10000.0, "2026-08-01".into(), "".into(), "Dave".into()).unwrap();

    (a, b, c, d)
}

#[test]
fn payroll_full_lifecycle_consistency() {
    let (a, b, c, d) = setup();
    println!("staff ids: Alice={} Bob={} Carol={} Dave={}", a, b, c, d);

    // ── 1. Period creation ────────────────────────────────────────────────
    let p1 = db::get_payroll_period(PERIOD_START.into(), PERIOD_END.into()).unwrap();
    assert_eq!(p1.rows.len(), 4, "4 staff should each have a record");
    assert_eq!(p1.summary.total_staff, 4);
    assert_eq!(p1.summary.total_gross as i64, 30000 + 25000 + 40000 + 20000);
    assert_eq!(p1.summary.advance_outstanding as i64, 20000);
    assert_eq!(p1.summary.pending_count, 4);
    assert_eq!(p1.summary.paid_count, 0);
    // total_remaining is sum of net (after auto advance deduction): 30000+20000+35000+10000
    assert_close(p1.summary.total_remaining, 95000.0, "remaining == sum of net after auto deduction");
    for r in &p1.rows {
        println!(
            "  [{}] base={} bonus={} deduction={} adv_ded={} gross={} net={} status={}",
            r.name, r.base_salary, r.bonus, r.deduction, r.advance_deduction, r.gross_pay, r.net_pay, r.status
        );
        assert_eq!(r.status, "Pending");
        // Auto-deduct: on creation the record pre-fills advance_deduction with
        // min(salary, outstanding advance) so net = base - auto deduction.
        let auto = r.base_salary.min(r.advance_balance);
        assert_close(r.advance_deduction, auto, "auto advance deduction = min(base, outstanding)");
        assert_close(r.gross_pay, r.base_salary, "initial gross == base");
        assert_close(r.net_pay, r.base_salary - auto, "initial net == base - auto deduction");
        assert_close(r.bonus, 0.0, "initial bonus 0");
    }
    let bal: Vec<(i32, f64)> = p1.rows.iter().map(|r| (r.staff_id, r.advance_balance)).collect();
    let bal_for = |sid: i32| bal.iter().find(|(s, _)| *s == sid).unwrap().1;
    assert_close(bal_for(a), 0.0, "Alice balance");
    assert_close(bal_for(b), 5000.0, "Bob balance");
    assert_close(bal_for(c), 5000.0, "Carol balance");
    assert_close(bal_for(d), 10000.0, "Dave balance");
    // Exact auto-filled values for the four staff
    let row_for = |sid: i32| p1.rows.iter().find(|r| r.staff_id == sid).unwrap();
    assert_close(row_for(b).advance_deduction, 5000.0, "Bob auto adv_ded");
    assert_close(row_for(b).net_pay, 20000.0, "Bob auto net");
    assert_close(row_for(c).advance_deduction, 5000.0, "Carol auto adv_ded");
    assert_close(row_for(c).net_pay, 35000.0, "Carol auto net");
    assert_close(row_for(d).advance_deduction, 10000.0, "Dave auto adv_ded");
    assert_close(row_for(d).net_pay, 10000.0, "Dave auto net");
    assert_close(row_for(a).net_pay, 30000.0, "Alice auto net");

    // Idempotent: calling again must not create duplicates (unique index)
    let p1b = db::get_payroll_period(PERIOD_START.into(), PERIOD_END.into()).unwrap();
    assert_eq!(p1b.rows.len(), 4, "no duplicate records on re-fetch");

    // Staff added after the period was first created must appear on next fetch
    db::add_staff("Eve".into(), None, "555".into(), 15000.0, "5555".into()).unwrap();
    let e = staff_id_by_name(DB_PATH, "Eve");
    let p1c = db::get_payroll_period(PERIOD_START.into(), PERIOD_END.into()).unwrap();
    assert_eq!(p1c.rows.len(), 5, "new staff appears on next fetch");
    let eve_rec = p1c.rows.iter().find(|r| r.staff_id == e).unwrap();
    assert_close(eve_rec.base_salary, 15000.0, "Eve base salary");
    assert_eq!(eve_rec.status, "Pending");

    // ── 2. Adjustments ────────────────────────────────────────────────────
    let ra = db::update_payroll_record(record_id_for(DB_PATH, a), 2000.0, 1000.0, 0.0).unwrap();
    assert_close(ra.gross_pay, 32000.0, "Alice gross");
    assert_close(ra.net_pay, 31000.0, "Alice net");
    assert_close(ra.net_pay, ra.base_salary + ra.bonus - ra.deduction, "net == base+bonus-deduction");

    let rb = db::update_payroll_record(record_id_for(DB_PATH, b), 0.0, 0.0, 3000.0).unwrap();
    assert_close(rb.net_pay, 22000.0, "Bob net");

    let rc = db::update_payroll_record(record_id_for(DB_PATH, c), 4000.0, 500.0, 4000.0).unwrap();
    assert_close(rc.gross_pay, 44000.0, "Carol gross");
    assert_close(rc.net_pay, 39500.0, "Carol net");

    let rd = db::update_payroll_record(record_id_for(DB_PATH, d), 0.0, 2000.0, 10000.0).unwrap();
    assert_close(rd.net_pay, 8000.0, "Dave net");

    // Invalid adjustments must be rejected
    assert!(
        db::update_payroll_record(record_id_for(DB_PATH, b), 0.0, 0.0, 6000.0).is_err(),
        "advance deduction over outstanding must be rejected"
    );
    assert!(
        db::update_payroll_record(record_id_for(DB_PATH, b), 0.0, 30000.0, 0.0).is_err(),
        "negative net pay must be rejected"
    );
    assert!(
        db::update_payroll_record(record_id_for(DB_PATH, b), -1.0, 0.0, 0.0).is_err(),
        "negative bonus must be rejected"
    );

    // ── 3. Process only the selected staff ────────────────────────────────
    let rec_a = record_id_for(DB_PATH, a);
    let rec_b = record_id_for(DB_PATH, b);
    let msg = db::process_payroll_batch(
        PERIOD_START.into(),
        PERIOD_END.into(),
        Some(vec![rec_a, rec_b]),
    )
    .unwrap();
    println!("selective process: {}", msg);

    // Only Alice & Bob paid; Carol & Dave untouched
    assert_eq!(q_str(DB_PATH, &format!("SELECT status FROM payroll_records WHERE id = {}", rec_a)), "Paid");
    assert_eq!(q_str(DB_PATH, &format!("SELECT status FROM payroll_records WHERE id = {}", rec_b)), "Paid");
    assert_eq!(q_str(DB_PATH, &format!("SELECT status FROM payroll_records WHERE id = {}", record_id_for(DB_PATH, c))), "Pending");
    assert_eq!(q_str(DB_PATH, &format!("SELECT status FROM payroll_records WHERE id = {}", record_id_for(DB_PATH, d))), "Pending");

    // Exactly 2 payouts and 2 payroll expenses
    assert_eq!(q_i64(DB_PATH, "SELECT COUNT(*) FROM salary_payouts"), 2);
    assert_eq!(q_i64(DB_PATH, "SELECT COUNT(*) FROM expenses WHERE reference_type = 'payroll'"), 2);

    // payout amount == recorded net, expense amount == payout amount
    for sid in [a, b] {
        let net: f64 = q_f64(DB_PATH, &format!("SELECT net_pay FROM payroll_records WHERE staff_id = {}", sid));
        let payout: f64 = q_f64(DB_PATH, &format!("SELECT amount FROM salary_payouts WHERE staff_id = {}", sid));
        let exp: f64 = q_f64(DB_PATH, &format!("SELECT amount FROM expenses WHERE reference_type = 'payroll' AND reference_id = {}", record_id_for(DB_PATH, sid)));
        let payroll_id: String = q_str(DB_PATH, &format!("SELECT payroll_id FROM payroll_records WHERE staff_id = {}", sid));
        assert!(!payroll_id.is_empty(), "payroll_id assigned");
        let paid_at: String = q_str(DB_PATH, &format!("SELECT paid_at FROM payroll_records WHERE staff_id = {}", sid));
        assert!(!paid_at.is_empty(), "paid_at set");
        assert_ne!(paid_at, PERIOD_END, "paid_at is real timestamp, not period end");
        assert_close(payout, net, "payout == net_pay");
        assert_close(exp, net, "expense == net_pay");
    }

    // Bob's advance now 3000 deducted, still 2000 outstanding (partial, is_deducted stays 0)
    assert_close(outstanding(DB_PATH, b), 2000.0, "Bob outstanding after partial");
    assert_eq!(q_i64(DB_PATH, &format!("SELECT is_deducted FROM advance_salaries WHERE staff_id = {}", b)), 0);
    // Alice has no advances
    assert_eq!(q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM advance_salaries WHERE staff_id = {}", a)), 0);

    // ── 4. Process the rest (no selection = all remaining pending) ────────
    // Remaining pending at this point: Carol, Dave, Eve (Alice+Bob already paid).
    let msg2 = db::process_payroll_batch(PERIOD_START.into(), PERIOD_END.into(), None).unwrap();
    println!("full process: {}", msg2);
    assert_eq!(q_i64(DB_PATH, "SELECT COUNT(*) FROM salary_payouts"), 5);
    assert_eq!(q_i64(DB_PATH, "SELECT COUNT(*) FROM expenses WHERE reference_type = 'payroll'"), 5);

    // Carol: oldest advance (3000) fully deducted, second (2000) partially 1000
    assert_close(outstanding(DB_PATH, c), 1000.0, "Carol outstanding after process");
    assert_eq!(q_i64(DB_PATH, &format!("SELECT is_deducted FROM advance_salaries WHERE staff_id = {} AND amount = 3000", c)), 1);
    assert_eq!(q_i64(DB_PATH, &format!("SELECT is_deducted FROM advance_salaries WHERE staff_id = {} AND amount = 2000", c)), 0);
    // Dave: fully deducted
    assert_close(outstanding(DB_PATH, d), 0.0, "Dave outstanding after process");
    assert_eq!(q_i64(DB_PATH, &format!("SELECT is_deducted FROM advance_salaries WHERE staff_id = {}", d)), 1);

    // Total ledger check: SUM(payouts) == SUM(payroll expenses)
    let total_payout: f64 = q_f64(DB_PATH, "SELECT COALESCE(SUM(amount),0) FROM salary_payouts");
    let total_exp: f64 = q_f64(DB_PATH, "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE reference_type = 'payroll'");
    assert_close(total_payout, total_exp, "payout total == expense total");
    assert_close(total_payout, 115500.0, "expected total payroll = Alice 31000 + Bob 22000 + Carol 39500 + Dave 8000 + Eve 15000");

    // Per-record: payout == net_pay for every staff
    for sid in [a, b, c, d, e] {
        let net: f64 = q_f64(DB_PATH, &format!("SELECT net_pay FROM payroll_records WHERE staff_id = {}", sid));
        let payout: f64 = q_f64(DB_PATH, &format!("SELECT amount FROM salary_payouts WHERE staff_id = {}", sid));
        assert_close(payout, net, "payout == net for all staff");
    }

    // Period summary after full process
    let p2 = db::get_payroll_period(PERIOD_START.into(), PERIOD_END.into()).unwrap();
    assert_eq!(p2.summary.paid_count, 5);
    assert_eq!(p2.summary.pending_count, 0, "everyone paid");
    assert_close(p2.summary.total_paid, 115500.0, "total paid");
    assert_close(p2.summary.total_remaining, 0.0, "nothing remaining");
    assert_close(p2.summary.advance_outstanding, 3000.0, "Bob 2000 + Carol 1000 still outstanding");

    // ── 5. Idempotency: processing again must not double-pay ──────────────
    assert!(
        db::process_payroll_batch(PERIOD_START.into(), PERIOD_END.into(), None).is_err(),
        "second full process must error (no pending records)"
    );
    assert_eq!(q_i64(DB_PATH, "SELECT COUNT(*) FROM salary_payouts"), 5, "no duplicate payouts");

    // ── 6. Advance history consistency ────────────────────────────────────
    let bh = db::get_advance_history(b, PERIOD_START.into(), PERIOD_END.into()).unwrap();
    assert_eq!(bh.len(), 1);
    assert_close(bh[0].outstanding, 2000.0, "Bob advance history outstanding");
    assert_eq!(bh[0].is_deducted, false, "partially deducted advance is Active");

    let ch = db::get_advance_history(c, PERIOD_START.into(), PERIOD_END.into()).unwrap();
    assert_eq!(ch.len(), 2);
    let c3000 = ch.iter().find(|r| (r.amount - 3000.0).abs() < 0.01).unwrap();
    let c2000 = ch.iter().find(|r| (r.amount - 2000.0).abs() < 0.01).unwrap();
    assert_eq!(c3000.is_deducted, true, "fully deducted advance is Recovered");
    assert_close(c3000.outstanding, 0.0, "c3000 fully recovered");
    assert_eq!(c2000.is_deducted, false, "partially deducted advance is Active");
    assert_close(c2000.outstanding, 1000.0, "c2000 partial outstanding");

    // ── 7. Payroll history ────────────────────────────────────────────────
    let hist = db::get_payroll_history(PERIOD_START.into(), PERIOD_END.into()).unwrap();
    assert_eq!(hist.len(), 1);
    assert_eq!(hist[0].paid_count, 5);
    assert_eq!(hist[0].total_count, 5);
    assert_close(hist[0].total_net, 115500.0, "history total_net");
    assert!(hist[0].paid_at.is_some(), "history paid_at present");

    // ── 8. Reopen fully restores everything ───────────────────────────────
    let msg3 = db::reopen_payroll(PERIOD_START.into(), PERIOD_END.into()).unwrap();
    println!("reopen: {}", msg3);
    assert_eq!(q_i64(DB_PATH, "SELECT COUNT(*) FROM salary_payouts"), 0, "payouts deleted on reopen");
    assert_eq!(q_i64(DB_PATH, "SELECT COUNT(*) FROM expenses WHERE reference_type = 'payroll'"), 0, "payroll expenses deleted");
    for sid in [a, b, c, d, e] {
        let status: String = q_str(DB_PATH, &format!("SELECT status FROM payroll_records WHERE staff_id = {}", sid));
        assert_eq!(status, "Pending", "record reopened");
    }
    assert_close(outstanding(DB_PATH, b), 5000.0, "Bob advance fully restored");
    assert_close(outstanding(DB_PATH, c), 5000.0, "Carol advances fully restored");
    assert_close(outstanding(DB_PATH, d), 10000.0, "Dave advance fully restored");
    // Fully-deducted advances must be Active again after restore (is_deducted = 0)
    assert_eq!(q_i64(DB_PATH, "SELECT is_deducted FROM advance_salaries WHERE staff_id = 3 AND amount = 3000"), 0);
    assert_eq!(q_i64(DB_PATH, "SELECT is_deducted FROM advance_salaries WHERE staff_id = 4"), 0);

    // ── 9. Reprocess with a different deduction after reopen ──────────────
    let rb2 = db::update_payroll_record(record_id_for(DB_PATH, b), 0.0, 0.0, 2000.0).unwrap();
    assert_close(rb2.net_pay, 23000.0, "Bob net after re-adjust");
    db::process_payroll_batch(PERIOD_START.into(), PERIOD_END.into(), Some(vec![record_id_for(DB_PATH, b)]))
        .unwrap();
    assert_close(outstanding(DB_PATH, b), 3000.0, "Bob now only 2000 deducted");
    let bob_payout: f64 = q_f64(DB_PATH, "SELECT amount FROM salary_payouts WHERE staff_id = 2");
    assert_close(bob_payout, 23000.0, "Bob payout reflects re-adjustment");

    // ── 10. Void marks Void and cannot be reprocessed as pending ──────────
    db::process_payroll_batch(PERIOD_START.into(), PERIOD_END.into(), Some(vec![record_id_for(DB_PATH, d)]))
        .unwrap();
    let msg4 = db::void_payroll(PERIOD_START.into(), PERIOD_END.into()).unwrap();
    println!("void: {}", msg4);
    let d_status: String = q_str(DB_PATH, &format!("SELECT status FROM payroll_records WHERE staff_id = {}", d));
    assert_eq!(d_status, "Void", "Dave voided");
    assert_close(outstanding(DB_PATH, d), 10000.0, "Dave advance restored by void");
    assert_eq!(q_i64(DB_PATH, "SELECT COUNT(*) FROM salary_payouts WHERE staff_id = 4"), 0, "voided payout removed");
    assert!(
        db::process_payroll_batch(PERIOD_START.into(), PERIOD_END.into(), Some(vec![record_id_for(DB_PATH, d)])).is_err(),
        "voided record cannot be processed"
    );

    // ── 11. Deleting a salary-advance expense removes the advance ─────────
    let exp_id: i64 = q_i64(
        DB_PATH,
        "SELECT id FROM expenses WHERE reference_type = 'salary_advance' AND reference_id IN (SELECT id FROM advance_salaries WHERE staff_id = 4) LIMIT 1",
    );
    let before: f64 = outstanding(DB_PATH, d);
    db::delete_expense(exp_id as i32).unwrap();
    assert_close(outstanding(DB_PATH, d), before - 10000.0, "deleting advance expense zeroes outstanding");

    // ── 12. get_payroll_record returns the CORRECT record by id ──────────
    // (regression: it used to return an arbitrary row from the same period)
    let rec_a = record_id_for(DB_PATH, a);
    let got_a = db::get_payroll_record(rec_a).unwrap();
    assert_eq!(got_a.id, rec_a, "get_payroll_record returns the requested id");
    assert_eq!(got_a.name, "Alice", "get_payroll_record returns the right staff");
    let rec_b = record_id_for(DB_PATH, b);
    let got_b = db::get_payroll_record(rec_b).unwrap();
    assert_eq!(got_b.id, rec_b);
    assert_eq!(got_b.name, "Bob");
    assert_eq!(got_b.status, "Void");

    // ── 13. Deleting a new-style payroll expense reverts that record only ─
    // Current state: Alice/Carol/Eve Pending, Bob/Dave Void. Process just Alice.
    db::process_payroll_batch(PERIOD_START.into(), PERIOD_END.into(), Some(vec![rec_a])).unwrap();
    assert_eq!(q_str(DB_PATH, &format!("SELECT status FROM payroll_records WHERE id = {}", rec_a)), "Paid");
    assert_eq!(q_i64(DB_PATH, "SELECT COUNT(*) FROM salary_payouts WHERE staff_id = 1"), 1);
    let alice_expense: i64 = q_i64(DB_PATH, &format!("SELECT id FROM expenses WHERE reference_type = 'payroll' AND reference_id = {}", rec_a));
    db::delete_expense(alice_expense as i32).unwrap();
    assert_eq!(q_str(DB_PATH, &format!("SELECT status FROM payroll_records WHERE id = {}", rec_a)), "Pending", "expense delete reverts Alice to Pending");
    assert_eq!(q_i64(DB_PATH, "SELECT COUNT(*) FROM salary_payouts WHERE staff_id = 1"), 0, "Alice payout removed");
    assert_eq!(q_str(DB_PATH, &format!("SELECT payroll_id FROM payroll_records WHERE id = {}", rec_a)), "", "payroll_id cleared");
    assert_eq!(q_i64(DB_PATH, "SELECT COUNT(*) FROM expenses WHERE reference_type = 'payroll' AND reference_id = 1"), 0, "Alice expense gone");
    // Carol's record must be untouched
    assert_eq!(q_str(DB_PATH, &format!("SELECT status FROM payroll_records WHERE id = {}", record_id_for(DB_PATH, c))), "Pending");

    // ── 14. Cross-period / bogus selection is rejected safely ─────────────
    assert!(
        db::process_payroll_batch(PERIOD_START.into(), PERIOD_END.into(), Some(vec![999999])).is_err(),
        "bogus record id must error, not silently pay everyone"
    );

    // ── 15. Advance CRUD: update & delete via dedicated commands ──────────
    // Bob has one advance: amount 5000, deducted 0 (restored by the void).
    let bob_adv_id: i64 = q_i64(DB_PATH, &format!("SELECT id FROM advance_salaries WHERE staff_id = {}", b));
    assert_close(outstanding(DB_PATH, b), 5000.0, "Bob outstanding before edit");
    assert_eq!(
        q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM expenses WHERE reference_type = 'salary_advance' AND reference_id = {}", bob_adv_id)),
        1, "each advance has exactly one matching expense"
    );

    // Invalid amounts are rejected before any write (amount <= 0)
    assert!(db::update_advance(bob_adv_id as i32, -5.0, None).is_err());
    assert!(db::update_advance(bob_adv_id as i32, 0.0, None).is_err());

    // Simulate a partial recovery so the "cannot go below recovered" guard is hit
    {
        let conn = rusqlite::Connection::open(DB_PATH).unwrap();
        conn.execute("UPDATE advance_salaries SET deducted_amount = 2000.0, is_deducted = 0 WHERE id = ?1", [bob_adv_id]).unwrap();
    }
    assert!(
        db::update_advance(bob_adv_id as i32, 1500.0, Some("too low".into())).is_err(),
        "amount below already-recovered must be rejected"
    );
    assert_close(outstanding(DB_PATH, b), 3000.0, "rejected edit changes nothing (ACID)");

    // Correct the amount upward: advance + matching expense must both move, atomically
    db::update_advance(bob_adv_id as i32, 2500.0, Some("corrected amount".into())).unwrap();
    assert_close(outstanding(DB_PATH, b), 500.0, "outstanding = 2500 - 2000 after edit");
    assert_close(
        q_f64(DB_PATH, &format!("SELECT amount FROM expenses WHERE reference_type = 'salary_advance' AND reference_id = {}", bob_adv_id)),
        2500.0,
        "expense amount synced with the edited advance"
    );
    assert_eq!(
        q_str(DB_PATH, &format!("SELECT note FROM advance_salaries WHERE id = {}", bob_adv_id)),
        "corrected amount",
        "advance note updated"
    );

    // Delete removes the advance AND its expense together
    db::delete_advance(bob_adv_id as i32).unwrap();
    assert_eq!(q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM advance_salaries WHERE id = {}", bob_adv_id)), 0, "advance row gone");
    assert_eq!(q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM expenses WHERE reference_type = 'salary_advance' AND reference_id = {}", bob_adv_id)), 0, "matching expense gone");
    assert_close(outstanding(DB_PATH, b), 0.0, "Bob has no outstanding after delete");
    assert!(db::delete_advance(bob_adv_id as i32).is_err(), "deleting a non-existent advance errors");

    // ── 16. Payroll CRUD: delete record & delete period ──────────────────
    // Delete a Pending record (Alice): no side effects, row removed.
    let rec_alice = record_id_for(DB_PATH, a);
    db::delete_payroll_record(rec_alice).unwrap();
    assert_eq!(q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM payroll_records WHERE id = {}", rec_alice)), 0, "Alice pending record deleted");

    // Delete a Paid record (Carol): payout + expense removed, advances restored.
    let carol_out_before = outstanding(DB_PATH, c);
    let rec_carol = record_id_for(DB_PATH, c);
    db::process_payroll_batch(PERIOD_START.into(), PERIOD_END.into(), Some(vec![rec_carol])).unwrap();
    let carol_adv_ded: f64 = q_f64(DB_PATH, &format!("SELECT COALESCE(advance_deduction,0) FROM payroll_records WHERE id = {}", rec_carol));
    assert_close(outstanding(DB_PATH, c), carol_out_before - carol_adv_ded, "Carol advance deducted after processing");
    assert_eq!(q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM salary_payouts WHERE staff_id = {}", c)), 1, "Carol payout created");
    assert_eq!(q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM expenses WHERE reference_type = 'payroll' AND reference_id = {}", rec_carol)), 1, "Carol payroll expense created");
    db::delete_payroll_record(rec_carol).unwrap();
    assert_close(outstanding(DB_PATH, c), carol_out_before, "Carol advance restored after delete");
    assert_eq!(q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM salary_payouts WHERE staff_id = {}", c)), 0, "Carol payout removed");
    assert_eq!(q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM expenses WHERE reference_type = 'payroll' AND reference_id = {}", rec_carol)), 0, "Carol payroll expense removed");
    assert_eq!(q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM payroll_records WHERE id = {}", rec_carol)), 0, "Carol record deleted");

    // Bogus / empty deletes error safely (ACID: nothing changes)
    assert!(db::delete_payroll_record(999999).is_err(), "deleting non-existent record errors");
    assert!(db::delete_payroll_period("2020-01-01".into(), "2020-01-31".into()).is_err(), "deleting empty period errors");

    // Delete the whole remaining period (Bob/Dave Void + Eve Pending records)
    let remaining_before = q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM payroll_records WHERE start_date = '{}' AND end_date = '{}'", PERIOD_START, PERIOD_END));
    assert!(remaining_before >= 1, "records remain before period delete");
    db::delete_payroll_period(PERIOD_START.into(), PERIOD_END.into()).unwrap();
    assert_eq!(q_i64(DB_PATH, &format!("SELECT COUNT(*) FROM payroll_records WHERE start_date = '{}' AND end_date = '{}'", PERIOD_START, PERIOD_END)), 0, "period fully deleted");

    println!("ALL PAYROLL CONSISTENCY CHECKS PASSED");
}
