use rms_lib::db;
use std::env;
use std::fs;

// Regression test: importing a backup must make the running app serve the
// imported data. Previously the global connection was never reopened and stale
// -wal/-shm files survived the file swap, so the import reported success while
// the old data kept being read (and could be replayed over the new file).
#[test]
fn import_backup_reopens_connection_and_serves_new_data() {
    let db_path = "backend_test_import.db";
    let backup_path = "backend_test_import_backup.db";
    env::set_var("DB_PATH", db_path);
    for p in [
        db_path,
        backup_path,
        "backend_test_import.db-wal",
        "backend_test_import.db-shm",
    ] {
        let _ = fs::remove_file(p);
    }

    db::init_shared_connection();
    db::init_db().unwrap();

    // Build a "backup" file representing someone else's database.
    db::get_conn()
        .unwrap()
        .execute("UPDATE restaurant_settings SET restaurant_name = 'Imported Restaurant' WHERE id = 1", [])
        .unwrap();
    // Flush the WAL so the copied backup file is a complete snapshot.
    db::get_conn()
        .unwrap()
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .unwrap();
    fs::copy(db_path, backup_path).unwrap();

    // Point the live database away from the backup contents.
    db::get_conn()
        .unwrap()
        .execute("UPDATE restaurant_settings SET restaurant_name = 'Current Restaurant' WHERE id = 1", [])
        .unwrap();

    let current_name: String = db::get_conn()
        .unwrap()
        .query_row("SELECT restaurant_name FROM restaurant_settings WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(current_name, "Current Restaurant");

    // Import the backup.
    let res = db::import_backup_file(backup_path.to_string()).unwrap();
    assert!(res.contains("Database imported"));

    // The global connection must now serve the imported data without a restart.
    let imported_name: String = db::get_conn()
        .unwrap()
        .query_row("SELECT restaurant_name FROM restaurant_settings WHERE id = 1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        imported_name,
        "Imported Restaurant",
        "global connection should serve the imported data after import"
    );

    // "Current Restaurant" was written to the live db (into its WAL) BEFORE the
    // import. If the stale sidecars had been replayed over the imported file,
    // the name would still read "Current Restaurant" — so this assertion is the
    // regression check that the old data is not leaking through.

    for p in [
        db_path,
        backup_path,
        "backend_test_import.db-wal",
        "backend_test_import.db-shm",
    ] {
        let _ = fs::remove_file(p);
    }
}
