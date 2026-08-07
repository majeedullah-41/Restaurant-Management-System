use rusqlite::Connection;
use std::env;
use std::fs;

// Regression test: databases created BEFORE the `must_change_password` column
// existed must still initialize. init_db() now runs migrations before seeding,
// so the column is added before any INSERT references it.
#[test]
fn legacy_database_without_must_change_password_migrates() {
    let db_path = "backend_test_legacy.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);
    let _ = fs::remove_file(format!("{}-wal", db_path));
    let _ = fs::remove_file(format!("{}-shm", db_path));

    {
        let conn = Connection::open(db_path).expect("open legacy db");
        conn.execute_batch(
            "CREATE TABLE roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
             CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role_id INTEGER NOT NULL, FOREIGN KEY(role_id) REFERENCES roles(id));
             INSERT INTO roles (id, name) VALUES (1, 'Admin');
             INSERT INTO users (username, password_hash, role_id) VALUES ('admin@restaurant.com', 'password', 1);",
        )
        .expect("create legacy schema");
    }

    rms_lib::db::init_shared_connection();
    rms_lib::db::init_db().expect("init_db must succeed on a legacy database");

    {
        let conn = rms_lib::db::get_conn().unwrap();
        let has_column: bool = conn
            .prepare("SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'must_change_password'")
            .unwrap()
            .query_row([], |row| row.get::<_, i64>(0))
            .unwrap()
            > 0;
        assert!(has_column, "must_change_password column should have been added by migrations");
    }

    let res = rms_lib::db::login("admin@restaurant.com".into(), "password".into());
    assert!(res.success, "legacy admin user should still be able to log in");
    assert!(
        res.session_token.is_some(),
        "login should issue a session token"
    );

    rms_lib::db::logout(res.session_token.unwrap()).unwrap();

    let _ = fs::remove_file(db_path);
    let _ = fs::remove_file(format!("{}-wal", db_path));
    let _ = fs::remove_file(format!("{}-shm", db_path));
}
