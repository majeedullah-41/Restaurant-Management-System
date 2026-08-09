use rusqlite::Connection;
use std::env;
use std::fs;

fn clean(db_path: &str) {
    let _ = fs::remove_file(db_path);
    let _ = fs::remove_file(format!("{}-wal", db_path));
    let _ = fs::remove_file(format!("{}-shm", db_path));
}

// Regression test: usernames are matched case-insensitively at login, so two
// accounts differing only in case would make the lookup ambiguous and let one
// account silently shadow the other. init_db() migrations must rename legacy
// duplicates and install a case-insensitive unique index so this can never
// recur. The unique index must also reject any future case-only duplicate.
#[test]
fn case_insensitive_duplicate_usernames_are_handled() {
    let db_path = "backend_test_username_ci.db";
    env::set_var("DB_PATH", db_path);
    clean(db_path);

    // Legacy DB with two accounts that differ only in case.
    {
        let conn = Connection::open(db_path).expect("open db");
        conn.execute_batch(
            "CREATE TABLE roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
             CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role_id INTEGER NOT NULL, FOREIGN KEY(role_id) REFERENCES roles(id));
             INSERT INTO roles (id, name) VALUES (1, 'Admin'), (2, 'Cashier');
             INSERT INTO users (username, password_hash, role_id) VALUES ('admin@restaurant.com', 'x', 1), ('ADMIN@restaurant.com', 'x', 2);",
        )
        .expect("create legacy schema with case-insensitive duplicate usernames");
    }

    rms_lib::db::init_shared_connection();
    rms_lib::db::init_db().expect("init_db must succeed on a database with duplicate usernames");

    {
        let conn = rms_lib::db::get_conn().unwrap();
        let count: i64 = conn
            .prepare("SELECT COUNT(*) FROM users WHERE LOWER(username) = 'admin@restaurant.com'")
            .unwrap()
            .query_row([], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1, "only one account may keep the original username");

        let renamed: i64 = conn
            .prepare("SELECT COUNT(*) FROM users WHERE LOWER(username) LIKE 'admin@restaurant.com%-dup%'")
            .unwrap()
            .query_row([], |row| row.get(0))
            .unwrap();
        assert_eq!(renamed, 1, "the duplicate should have been renamed with a -dup suffix");

        let has_index: bool = conn
            .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_users_username_ci'")
            .unwrap()
            .query_row([], |row| row.get::<_, i64>(0))
            .unwrap()
            > 0;
        assert!(has_index, "case-insensitive unique index should exist after migration");

        // With the index in place, a future case-only duplicate must be rejected
        // at the data layer, so the UI/update_user_profile guards can never be
        // bypassed by a case-only difference.
        let insert_res = conn.execute(
            "INSERT INTO users (username, password_hash, role_id, must_change_password) VALUES ('ADMIN@RESTAURANT.COM', 'x', 2, 1)",
            [],
        );
        assert!(
            insert_res.is_err(),
            "inserting a username that differs only in case from an existing one must be rejected"
        );
    }

    // The surviving account is unambiguous after migration: logging in with a
    // wrong password must produce the ordinary "invalid" error, never the
    // "multiple accounts" ambiguity error. Drop the connection guard first so
    // login (which also locks the shared connection) does not deadlock.
    let res = rms_lib::db::login("admin@restaurant.com".into(), "password".into());
    assert!(
        !res.success && res.message.contains("Invalid email or password"),
        "login should fail normally (bogus hash in legacy seed), not with an ambiguity error: {:?}",
        res.message
    );

    clean(db_path);
}
