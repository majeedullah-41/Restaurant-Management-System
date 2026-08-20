use rms_lib::db;
use std::env;
use std::fs;
use std::sync::{Mutex, MutexGuard};

static TEST_LOCK: Mutex<()> = Mutex::new(());

fn lock_db_tests() -> MutexGuard<'static, ()> {
    TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

#[test]
fn test_backup_creation_validate_and_restore() {
    let _guard = lock_db_tests();
    let db_path = "backend_backup_restore_test.db";
    let backup_file = "backend_backup_restore_out.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);
    let _ = fs::remove_file(backup_file);

    db::init_shared_connection();
    db::init_db().unwrap();

    db::add_category("Bakery".into()).unwrap();
    db::add_category("Drinks".into()).unwrap();

    // Snapshot the current database to a backup file
    let backup_path = db::perform_backup(Some(backup_file.into())).unwrap();
    assert!(std::path::Path::new(&backup_path).exists());

    // Backup validates and reports the restaurant name
    let name = db::validate_backup_file(backup_file.into()).unwrap();
    assert_eq!(name, "My Restaurant");

    // Mutate the live DB after the backup
    db::add_category("After Backup".into()).unwrap();

    // Restore from the backup
    db::import_backup_file(backup_file.into()).unwrap();

    let cats = db::get_categories().unwrap();
    let names: Vec<String> = cats.iter().map(|c| c.name.clone()).collect();
    assert!(names.contains(&"Bakery".into()), "restored categories should include Bakery: {:?}", names);
    assert!(names.contains(&"Drinks".into()), "restored categories should include Drinks: {:?}", names);
    assert!(!names.contains(&"After Backup".into()), "post-backup mutation must be rolled back: {:?}", names);

    // Invalid file rejected
    assert!(db::validate_backup_file("does-not-exist.db".into()).is_err());

    let _ = fs::remove_file(db_path);
    let _ = fs::remove_file(backup_file);
}

#[test]
fn test_auto_backup_scheduling() {
    let _guard = lock_db_tests();
    let db_path = "backend_auto_backup_test.db";
    let backup_file = "backend_auto_backup_out.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);
    let _ = fs::remove_file(backup_file);

    db::init_shared_connection();
    db::init_db().unwrap();

    // Frequency Off -> never backs up
    db::update_backup_settings("Off".into(), Some(backup_file.into())).unwrap();
    assert_eq!(db::check_and_run_auto_backup().unwrap(), None);

    // Frequency Daily with no prior backup -> backs up immediately
    db::update_backup_settings("Daily".into(), Some(backup_file.into())).unwrap();
    let ran = db::check_and_run_auto_backup().unwrap();
    assert!(ran.is_some(), "first daily backup should run");
    assert!(std::path::Path::new(ran.as_deref().unwrap()).exists());

    // Just backed up -> no second backup on the same day
    assert_eq!(db::check_and_run_auto_backup().unwrap(), None);

    let _ = fs::remove_file(db_path);
    let _ = fs::remove_file(backup_file);
}