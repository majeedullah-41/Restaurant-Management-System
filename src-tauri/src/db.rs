use rusqlite::{Connection, OpenFlags, Result};
use serde::Serialize;
use std::ops::{Deref, DerefMut};
use std::sync::{Mutex, MutexGuard};

static DB_CONN: Mutex<Option<Connection>> = Mutex::new(None);

/// Rounds a monetary value to two decimal places (round half away from zero,
/// matching how money is displayed). Applied to every financial component at
/// checkout so the stored subtotal/tax/service charge/discount always sum
/// exactly to the stored total.
fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Resolves the live database path. Order: explicit `DB_PATH` env override
/// (used by tests), then `%LOCALAPPDATA%\RMS\local.db`. There is deliberately
/// NO fallback to the current working directory — a CWD-relative path would
/// silently scatter data across directories depending on where the app is
/// launched from.
pub fn get_default_db_path() -> Result<String, String> {
    if let Ok(p) = std::env::var("DB_PATH") {
        if !p.trim().is_empty() {
            return Ok(p);
        }
    }

    let local_app_data = std::env::var("LOCALAPPDATA")
        .map_err(|_| "LOCALAPPDATA is not set; cannot resolve the application data directory.".to_string())?;
    let app_dir = std::path::Path::new(&local_app_data).join("RMS");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create application data directory '{}': {}", app_dir.display(), e))?;
    Ok(app_dir.join("local.db").to_string_lossy().to_string())
}

pub fn init_shared_connection() {
    let db_path = get_default_db_path().expect("Failed to resolve the database path");
    let conn = Connection::open(&db_path).expect("Failed to open global database connection");
    
    // Enable WAL mode & performance PRAGMAs to eliminate SQLite locks and lag
    let _ = conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;"
    );

    let mut slot = DB_CONN.lock().unwrap_or_else(|e| panic!("DB_CONN poisoned: {}", e));
    *slot = Some(conn);
}

/// A locked handle to the shared database connection.
///
/// Derefs to `rusqlite::Connection`, so call sites that used
/// `MutexGuard<'static, Connection>` keep working unchanged. The connection
/// itself lives inside `DB_CONN` and can be swapped out by
/// [`reopen_connection`], which a backup import relies on.
pub struct ConnGuard(MutexGuard<'static, Option<Connection>>);

impl ConnGuard {
    fn connection(&self) -> &Connection {
        self.0.as_ref().expect("Database connection not initialized")
    }

    fn connection_mut(&mut self) -> &mut Connection {
        self.0.as_mut().expect("Database connection not initialized")
    }
}

impl Deref for ConnGuard {
    type Target = Connection;

    fn deref(&self) -> &Connection {
        self.connection()
    }
}

impl DerefMut for ConnGuard {
    fn deref_mut(&mut self) -> &mut Connection {
        self.connection_mut()
    }
}

pub fn get_conn() -> std::result::Result<ConnGuard, String> {
    let guard = DB_CONN
        .lock()
        .map_err(|e| format!("Failed to lock DB connection: {}", e))?;
    if guard.is_none() {
        return Err("Database connection not initialized".to_string());
    }
    Ok(ConnGuard(guard))
}

/// Closes the current connection, removes any stale WAL/SHM sidecar files from
/// the previous database, and reopens the database at the default path.
///
/// This is required after a backup import swaps the underlying database file:
/// the old connection would keep serving the pre-import data, and an orphaned
/// `-wal`/`-shm` from the old database would otherwise be replayed on top of
/// the imported file, silently restoring the old data.
pub fn reopen_connection() -> std::result::Result<(), String> {
    let mut slot = DB_CONN
        .lock()
        .map_err(|e| format!("Failed to lock DB connection: {}", e))?;
    reopen_connection_locked(&mut slot, None)
}

/// The shared, lock-free core of [`reopen_connection`]. Callers must already
/// hold the `DB_CONN` mutex; `import_backup_file` uses this so the connection
/// stays locked across the whole file-swap window, preventing a concurrent
/// writer from being served by the pre-import connection.
///
/// If reopening fails, `rollback_path` (when given) is copied back over the
/// live database and the connection is reopened against it. This guarantees the
/// app never ends up with an uninitialized connection after a swap.
fn reopen_connection_locked(
    slot: &mut Option<Connection>,
    rollback_path: Option<&std::path::Path>,
) -> std::result::Result<(), String> {
    // Close the old connection and release its file handles before touching
    // the -wal/-shm sidecars (required on Windows to delete them).
    drop(slot.take());

    let db_path = get_default_db_path()?;
    let reopen = |path: &str| -> std::result::Result<Connection, String> {
        let conn = Connection::open(path)
            .map_err(|e| format!("Failed to reopen database connection: {}", e))?;
        let _ = conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;"
        );
        Ok(conn)
    };

    match reopen(&db_path) {
        Ok(conn) => {
            *slot = Some(conn);
            Ok(())
        }
        Err(e) => {
            // Attempt to roll back to the safety copy so the app stays usable.
            if let Some(rollback) = rollback_path {
                if rollback.exists() {
                    let _ = std::fs::remove_file(format!("{}-wal", db_path));
                    let _ = std::fs::remove_file(format!("{}-shm", db_path));
                    let _ = std::fs::copy(rollback, &db_path);
                    if let Ok(conn) = reopen(&db_path) {
                        *slot = Some(conn);
                        return Err(format!(
                            "Import failed ({}). The previous database was restored.",
                            e
                        ));
                    }
                }
            }
            Err(format!(
                "Failed to reopen database connection and no usable rollback was found: {}",
                e
            ))
        }
    }
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub success: bool,
    pub role: Option<String>,
    pub username: Option<String>,
    pub display_name: Option<String>,
    pub session_token: Option<String>,
    pub must_change_password: bool,
    pub message: String,
}

pub fn init_db() -> Result<()> {
    // This creates a file called "local.db" in your app's folder
    let conn = get_conn().map_err(|e| rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e)))?;
    
    // Create all the tables from the roadmap
    conn.execute_batch(
        "BEGIN;
        CREATE TABLE IF NOT EXISTS license (id INTEGER PRIMARY KEY, current_key TEXT, expiry_date TEXT);
        CREATE TABLE IF NOT EXISTS restaurant_settings (id INTEGER PRIMARY KEY, restaurant_name TEXT NOT NULL, logo_path TEXT, tax_rate REAL NOT NULL, total_tables INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role_id INTEGER NOT NULL, must_change_password INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(role_id) REFERENCES roles(id));
        CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS menu_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category_id INTEGER NOT NULL, price REAL NOT NULL, image_path TEXT, is_active INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(category_id) REFERENCES categories(id));
        CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, amount REAL NOT NULL, date TEXT NOT NULL, category TEXT NOT NULL, note TEXT);
        CREATE TABLE IF NOT EXISTS salary_payouts (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL);
        COMMIT;"
    )?;

    // Migrate pre-existing tables (e.g. add must_change_password) BEFORE seeding,
    // otherwise INSERTs referencing the new column fail on old databases.
    run_migrations(&conn).map_err(|e| rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e)))?;

    // Seed the default data
    conn.execute("INSERT OR IGNORE INTO roles (id, name) VALUES (1, 'Admin'), (2, 'Cashier')", [])?;
    conn.execute("INSERT OR IGNORE INTO restaurant_settings (id, restaurant_name, tax_rate, total_tables) VALUES (1, 'My Restaurant', 16.0, 10)", [])?;


    // NEW: Seed a default Admin user with hashed password
    let hash = bcrypt::hash("password", bcrypt::DEFAULT_COST).map_err(|e| rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e.to_string())))?;
    conn.execute("INSERT OR IGNORE INTO users (username, password_hash, role_id, must_change_password) VALUES ('admin@restaurant.com', ?1, 1, 1)", [&hash])?;
    conn.execute("INSERT OR IGNORE INTO users (username, password_hash, role_id, must_change_password) VALUES ('cashier@restaurant.com', ?1, 2, 1)", [&hash])?;

    println!("Database created and seeded successfully!");
    Ok(())
}

/// Bump this only when the migration suite below changes. The suite is a
/// monotonic, idempotent migration sequence: it runs exactly once per database
/// (`PRAGMA user_version`), so the expensive per-row backfills no longer re-run
/// on every app start or backup command.
const SCHEMA_VERSION: i32 = 3;

pub fn run_migrations(conn: &Connection) -> std::result::Result<(), String> {
    // Only run the migration suite once per database. `user_version` starts at
    // 0 for existing and freshly-created databases, so legacy schema always gets
    // migrated on first run after this guard is introduced. The version is only
    // persisted after the whole suite succeeds, so a partial failure retries.
    let current_version: i32 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap_or(0);
    if current_version >= SCHEMA_VERSION {
        return Ok(());
    }

    // 0. Ensure core tables exist before ALTER TABLE migrations run
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            table_id INTEGER,
            table_number INTEGER, 
            status TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            closed_at TEXT
        )",
        [],
    );
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            order_id INTEGER, 
            item_id INTEGER, 
            name TEXT, 
            price REAL, 
            quantity INTEGER
        )",
        [],
    );
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS staff_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )",
        [],
    );
    let _ = conn.execute("INSERT OR IGNORE INTO staff_categories (name) VALUES ('Order Taker')", []);
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS table_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )",
        [],
    );
    let _ = conn.execute("ALTER TABLE order_items ADD COLUMN kot_printed_qty INTEGER DEFAULT 0", []);
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS staff_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            clock_in TEXT,
            clock_out TEXT,
            status TEXT DEFAULT 'Present',
            note TEXT,
            FOREIGN KEY(staff_id) REFERENCES staff(id)
        )",
        [],
    );

    // 1. restaurant_settings table
    let _ = conn.execute("ALTER TABLE restaurant_settings ADD COLUMN last_backup_at TEXT", []);
    let _ = conn.execute("ALTER TABLE restaurant_settings ADD COLUMN backup_frequency TEXT DEFAULT 'Off'", []);
    let _ = conn.execute("ALTER TABLE restaurant_settings ADD COLUMN backup_path TEXT", []);
    let _ = conn.execute("ALTER TABLE restaurant_settings ADD COLUMN base_delivery_fee REAL DEFAULT 0.0", []);
    let _ = conn.execute("ALTER TABLE restaurant_settings ADD COLUMN free_delivery_threshold REAL DEFAULT 0.0", []);
    let _ = conn.execute("ALTER TABLE restaurant_settings ADD COLUMN address TEXT", []);
    let _ = conn.execute("ALTER TABLE restaurant_settings ADD COLUMN service_charge_rate REAL DEFAULT 0.0", []);
    let _ = conn.execute("ALTER TABLE restaurant_settings ADD COLUMN service_charge_types TEXT DEFAULT 'Dine-in'", []);
    let _ = conn.execute("ALTER TABLE restaurant_settings ADD COLUMN contact_number TEXT", []);

    // Add service_charge_amount to orders here as well to ensure it's globally migrated
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN service_charge_amount REAL DEFAULT 0.0", []);

    // 2. table_status & shifts tables
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS table_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            table_number INTEGER UNIQUE, 
            status TEXT NOT NULL DEFAULT 'Available'
        )",
        [],
    );
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_time TEXT DEFAULT (datetime('now', 'localtime')),
            end_time TEXT,
            opening_cash REAL NOT NULL,
            closing_cash REAL,
            status TEXT DEFAULT 'Open'
        )", []
    );

    // 3. orders table columns
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN created_at TEXT", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN closed_at TEXT", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'Dine-in'", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN subtotal REAL DEFAULT 0.0", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN tax_amount REAL DEFAULT 0.0", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0.0", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN amount_received REAL DEFAULT 0.0", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN change_due REAL DEFAULT 0.0", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN customer_id INTEGER", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN cashier_name TEXT", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN order_note TEXT", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN delivery_status TEXT", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN delivery_address TEXT", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN delivery_driver_id INTEGER", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN delivery_fee REAL DEFAULT 0.0", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN customer_phone TEXT", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN order_taker_id INTEGER", []);
    let _ = conn.execute("ALTER TABLE orders ADD COLUMN order_taker_name TEXT", []);
    
    // salary_payouts schema updates
    let _ = conn.execute("ALTER TABLE salary_payouts ADD COLUMN bonus REAL", []);
    let _ = conn.execute("ALTER TABLE salary_payouts ADD COLUMN deduction REAL", []);
    let _ = conn.execute("ALTER TABLE salary_payouts ADD COLUMN advance_deduction REAL", []);

    // 4. staff, customers, attendance, payouts columns/tables if any
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            phone TEXT,
            salary REAL NOT NULL DEFAULT 0.0,
            status TEXT DEFAULT 'Active'
        )", []
    );
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS advance_salaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            note TEXT,
            is_deducted BOOLEAN DEFAULT 0
        )", []
    );
    let _ = conn.execute("ALTER TABLE advance_salaries ADD COLUMN deducted_amount REAL DEFAULT 0.0", []);
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT UNIQUE NOT NULL,
            visits INTEGER DEFAULT 0,
            total_spent REAL DEFAULT 0.0
        )", []
    );
    let _ = conn.execute("ALTER TABLE customers ADD COLUMN address TEXT", []);

    // 5. License table: activated_at column
    let _ = conn.execute("ALTER TABLE license ADD COLUMN activated_at TEXT", []);
    let _ = conn.execute("ALTER TABLE license ADD COLUMN hwid TEXT", []);
    let _ = conn.execute("ALTER TABLE license ADD COLUMN original_hwid TEXT", []);
    let _ = conn.execute("ALTER TABLE license ADD COLUMN hwid_restored_at TEXT", []);
    let _ = conn.execute("ALTER TABLE license ADD COLUMN restore_count INTEGER DEFAULT 0", []);

    // 6. Inventory tables
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS inventory_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            unit TEXT NOT NULL DEFAULT 'pcs',
            low_stock_threshold REAL NOT NULL DEFAULT 5.0,
            default_supplier TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )", []
    );
    let _ = conn.execute("ALTER TABLE inventory_items ADD COLUMN default_supplier TEXT", []);
    let _ = conn.execute(
        "CREATE TABLE IF NOT EXISTS inventory_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit_price REAL,
            total_cost REAL,
            supplier TEXT,
            note TEXT,
            date TEXT NOT NULL DEFAULT (date('now', 'localtime')),
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY(item_id) REFERENCES inventory_items(id)
        )", []
    );

    // Migrations — safe to run multiple times (ADD COLUMN fails silently if already exists)
    conn.execute("ALTER TABLE users ADD COLUMN display_name TEXT", []).ok();
    conn.execute("ALTER TABLE users ADD COLUMN security_question TEXT", []).ok();
    conn.execute("ALTER TABLE users ADD COLUMN security_answer TEXT", []).ok();
    conn.execute("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0", []).ok();

    // Enforce case-insensitive unique usernames at the data layer. Without this,
    // two accounts can differ only in case (e.g. "Admin@x.com" and "admin@x.com")
    // and the case-insensitive login lookup becomes ambiguous. First rename any
    // legacy case-insensitive duplicates (preferring to keep an Admin account),
    // then build the unique index. The existing column-level UNIQUE constraint
    // only catches exact-case duplicates, so this closes the remaining gap.
    {
        let _ = conn.execute(
            "UPDATE users SET username = username || '-dup' WHERE id IN (
                SELECT u.id FROM users u
                WHERE LOWER(u.username) IN (
                    SELECT LOWER(username) FROM users GROUP BY LOWER(username) HAVING COUNT(*) > 1
                )
                AND u.id NOT IN (
                    SELECT COALESCE(MIN(CASE WHEN r.name = 'Admin' THEN u2.id END),
                                    MIN(u2.id))
                    FROM users u2 JOIN roles r ON u2.role_id = r.id
                    GROUP BY LOWER(u2.username)
                )
            )",
            [],
        );
        let _ = conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci ON users(LOWER(username))",
            [],
        );
    }

    // 6b. Security-answer hashing migration: legacy plaintext answers are
    // upgraded to bcrypt hashes (lowercased for case-insensitive matching) so
    // anyone with file access to the DB cannot read recovery answers.
    if let Ok(mut stmt) = conn.prepare("SELECT id, security_answer FROM users WHERE security_answer IS NOT NULL") {
        let rows_res: Result<Vec<(i32, String)>, _> = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?))
        }).and_then(|iter| iter.collect());
        if let Ok(rows) = rows_res {
            for (id, ans) in rows {
                if !ans.starts_with("$2") && !ans.is_empty() {
                    if let Ok(new_hash) = bcrypt::hash(ans.trim().to_lowercase(), bcrypt::DEFAULT_COST) {
                        conn.execute("UPDATE users SET security_answer = ?1 WHERE id = ?2", rusqlite::params![new_hash, id]).ok();
                    }
                }
            }
        }
    }
    // Track the latest date the license was validated so a rolled-back system
    // clock cannot resurrect an expired license.
    conn.execute("ALTER TABLE license ADD COLUMN last_validated_date TEXT", []).ok();
    // DB-backed brute-force throttle for the password-reset flow so a process
    // restart does not clear the counter.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reset_attempts (
            username TEXT PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0,
            window_start INTEGER NOT NULL
        )", []
    ).ok();

    // 7. Password hashing migration
    if let Ok(mut stmt) = conn.prepare("SELECT id, password_hash FROM users") {
        let users_res: Result<Vec<(i32, String)>, _> = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?))
        }).and_then(|iter| iter.collect());

        if let Ok(users) = users_res {
            let mut users_to_hash = Vec::new();
            for (id, hash_or_plain) in users {
                if !hash_or_plain.starts_with("$2") && !hash_or_plain.is_empty() {
                    if let Ok(new_hash) = bcrypt::hash(hash_or_plain, bcrypt::DEFAULT_COST) {
                        users_to_hash.push((id, new_hash));
                    }
                }
            }
            for (id, new_hash) in users_to_hash {
                conn.execute("UPDATE users SET password_hash = ?1 WHERE id = ?2", rusqlite::params![new_hash, id]).ok();
            }
        }
    }
    // 8. Remove global UNIQUE on table_number so same numbers work across categories.
    //    Only rebuild when the table still lacks category_id (i.e. once), so this
    //    destructive DROP+RENAME no longer runs on every app start / backup.
    {
        let has_category_id: bool = {
            let mut pragma_stmt = conn.prepare("PRAGMA table_info(table_status)").map_err(|e| e.to_string())?;
            let cols: Vec<String> = pragma_stmt.query_map([], |row| row.get(1)).map_err(|e| e.to_string())?
                .filter_map(Result::ok).collect();
            cols.iter().any(|c| c == "category_id")
        };

        if !has_category_id {
            // The source table was created without category_id (fresh installs
            // and pre-category DBs), so only copy the columns that exist.
            let copy_cols = "id, table_number, status";
            conn.execute_batch(&format!(
                "BEGIN;
                CREATE TABLE IF NOT EXISTS table_status_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, 
                    category_id INTEGER,
                    table_number INTEGER, 
                    status TEXT NOT NULL DEFAULT 'Available',
                    UNIQUE(category_id, table_number)
                );
                INSERT OR IGNORE INTO table_status_new (id, table_number, status) SELECT {copy_cols} FROM table_status;
                DROP TABLE IF EXISTS table_status;
                ALTER TABLE table_status_new RENAME TO table_status;
                COMMIT;"
            )).map_err(|e| e.to_string())?;
        }
    }
    
    // 9. Add table_id to orders
    conn.execute("ALTER TABLE orders ADD COLUMN table_id INTEGER DEFAULT 0", []).ok();
    conn.execute("UPDATE orders SET table_id = (SELECT id FROM table_status WHERE table_status.table_number = orders.table_number LIMIT 1) WHERE table_number > 0 AND table_id = 0", []).ok();

    // 10. Payroll overhaul: payroll_records becomes the source of truth for
    //     payroll, and expenses gain an explicit reference to what created them.
    //     These blocks are idempotent and safe to re-run on every startup.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS payroll_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            staff_id INTEGER NOT NULL,
            base_salary REAL NOT NULL DEFAULT 0,
            bonus REAL NOT NULL DEFAULT 0,
            deduction REAL NOT NULL DEFAULT 0,
            advance_deduction REAL NOT NULL DEFAULT 0,
            gross_pay REAL NOT NULL DEFAULT 0,
            net_pay REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'Pending',
            payroll_id TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime')),
            paid_at TEXT,
            FOREIGN KEY(staff_id) REFERENCES staff(id)
        )", []
    ).map_err(|e| e.to_string())?;
    // One payroll record per staff per period: structurally prevents double-pay.
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_record_unique ON payroll_records(start_date, end_date, staff_id)",
        [],
    ).ok();
    // Index used by the default "current month" lookup.
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_payroll_record_period ON payroll_records(start_date, end_date)",
        [],
    ).ok();

    // Expenses now link back to their originating payroll/advance by id.
    conn.execute("ALTER TABLE expenses ADD COLUMN reference_type TEXT", []).ok();
    conn.execute("ALTER TABLE expenses ADD COLUMN reference_id INTEGER", []).ok();

    // Backfill expense references for existing data. Salary expenses created by
    // the old batch payout carried a "Payroll: {name}" note but no record id, so
    // they are tagged salary_payout with a NULL reference (deleting them will no
    // longer cascade into payouts). Advance expenses are matched to their
    // advance_salaries row by note so they get a real reference_id.
    conn.execute(
        "UPDATE expenses SET reference_type = 'salary_payout' WHERE reference_type IS NULL AND COALESCE(note, '') LIKE 'Payroll%'",
        [],
    ).ok();
    conn.execute(
        "UPDATE expenses SET reference_type = 'salary_advance', reference_id = (
            SELECT a.id FROM advance_salaries a
            WHERE a.amount = expenses.amount
              AND a.date = expenses.date
              AND COALESCE(note, '') LIKE 'Advance Salary: %'
            LIMIT 1
        ) WHERE reference_type IS NULL AND COALESCE(note, '') LIKE 'Advance Salary: %'",
        [],
    ).ok();

    // Clean up orphaned inventory-purchase expenses whose linked inventory
    // transaction no longer exists (e.g. items deleted before cascading existed).
    conn.execute(
        "DELETE FROM expenses WHERE reference_type = 'inventory_purchase'
         AND reference_id NOT IN (SELECT id FROM inventory_transactions)",
        [],
    ).ok();

    // Backfill payroll_records from the legacy salary_payouts table so existing
    // paid history remains visible and reproducible under the new structure.
    // Group legacy payouts by (staff, month) — the old system recorded one
    // payout row per staff per payment, so the earliest payout in a month is the
    // period payout. base_salary is reconstructed from the stored split.
    conn.execute(
        "INSERT OR IGNORE INTO payroll_records
            (start_date, end_date, staff_id, base_salary, bonus, deduction, advance_deduction, gross_pay, net_pay, status, payroll_id, paid_at)
         SELECT
            date(min_p.date, 'start of month') AS start_date,
            date(min_p.date, 'start of month', '+1 month', '-1 day') AS end_date,
            min_p.staff_id,
            CASE WHEN COALESCE(min_p.bonus,0) + COALESCE(min_p.deduction,0) + COALESCE(min_p.advance_deduction,0) = 0
                 THEN min_p.amount ELSE min_p.amount + COALESCE(min_p.deduction,0) + COALESCE(min_p.advance_deduction,0) - COALESCE(min_p.bonus,0) END AS base_salary,
            COALESCE(min_p.bonus, 0),
            COALESCE(min_p.deduction, 0),
            COALESCE(min_p.advance_deduction, 0),
            COALESCE(min_p.amount,0) + COALESCE(min_p.deduction,0) + COALESCE(min_p.advance_deduction,0) AS gross_pay,
            min_p.amount AS net_pay,
            'Paid' AS status,
            substr(strftime('%Y', min_p.date), 3) || '-' || strftime('%m', min_p.date) || '-' || printf('%04d', min_p.id) AS payroll_id,
            min_p.date AS paid_at
         FROM (
             SELECT staff_id, MIN(date) AS date, MIN(id) AS id, MIN(amount) AS amount,
                    MIN(COALESCE(bonus,0)) AS bonus, MIN(COALESCE(deduction,0)) AS deduction,
                    MIN(COALESCE(advance_deduction,0)) AS advance_deduction
             FROM salary_payouts
             GROUP BY staff_id, substr(date, 1, 7)
         ) min_p
         WHERE EXISTS (SELECT 1 FROM staff s WHERE s.id = min_p.staff_id)",
        [],
    ).map_err(|e| e.to_string())?;

    // 11. An order must never be placed (or left open) with zero items. Clean
    //     up orphaned empty orders a prior bug may have left behind, and free
    //     any physical table they still mark as Occupied. Closed orders are
    //     untouched so revenue history is never altered. Idempotent and safe to
    //     re-run on every startup.
    conn.execute(
        "UPDATE table_status SET status = 'Available'
         WHERE id IN (
             SELECT o.table_id FROM orders o
             LEFT JOIN order_items oi ON oi.order_id = o.id
             WHERE o.status IN ('Open', 'Placed', 'Delivery Pending')
               AND o.table_id > 0
               AND oi.id IS NULL
         )",
        [],
    ).ok();
    conn.execute(
        "DELETE FROM orders
         WHERE status IN ('Open', 'Placed', 'Delivery Pending')
           AND id NOT IN (SELECT DISTINCT order_id FROM order_items)",
        [],
    ).ok();

    // 12. Per-period sequential order numbers. An order gets a stable
    //     order_number that resets each period (day/week/month/year) so a
    //     cancelled order's number is never reused mid-period. Idempotent.
    conn.execute("ALTER TABLE orders ADD COLUMN order_number INTEGER", []).ok();
    conn.execute("ALTER TABLE orders ADD COLUMN order_period_key TEXT", []).ok();
    conn.execute(
        "ALTER TABLE restaurant_settings ADD COLUMN order_reset_frequency TEXT NOT NULL DEFAULT 'Daily'",
        [],
    ).ok();
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_orders_period_key ON orders (order_period_key)",
        [],
    ).ok();
    let reset_frequency: String = conn
        .query_row(
            "SELECT COALESCE(order_reset_frequency, 'Daily') FROM restaurant_settings WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "Daily".to_string());
    {
        let mut stmt = conn
            .prepare("SELECT id, created_at FROM orders ORDER BY id")
            .map_err(|e| e.to_string())?;
        let rows: Vec<(i32, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        drop(stmt);
        for (id, created_at) in rows {
            let key = order_period_key(&created_at, &reset_frequency);
            conn.execute(
                "UPDATE orders SET order_period_key = ?2,
                    order_number = COALESCE(order_number, (SELECT COALESCE(MAX(o2.order_number), 0) + 1 FROM orders o2 WHERE o2.order_period_key = ?2 AND o2.id < ?1))
                 WHERE id = ?1",
                rusqlite::params![id, key],
            ).ok();
        }
    }

    // 13. Printing system configuration. Single-row table holding per-document
    //     printer selection, copies, and receipt/KOT/delivery/delivery-receipt
    //     layout JSON blobs (see print::PrintSettings). The legacy print_mode
    //     column is kept for old databases but is no longer used: printing
    //     always follows the selected printer directly.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS print_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            receipt_printer TEXT,
            kot_printer TEXT,
            delivery_printer TEXT,
            delivery_receipt_printer TEXT,
            receipt_copies INTEGER NOT NULL DEFAULT 1,
            kot_copies INTEGER NOT NULL DEFAULT 1,
            delivery_copies INTEGER NOT NULL DEFAULT 1,
            delivery_receipt_copies INTEGER NOT NULL DEFAULT 1,
            print_mode TEXT NOT NULL DEFAULT 'auto',
            receipt_layout TEXT,
            kot_layout TEXT,
            delivery_layout TEXT,
            delivery_receipt_layout TEXT
        )",
        [],
    ).ok();
    conn.execute("INSERT OR IGNORE INTO print_settings (id) VALUES (1)", []).ok();
    // Delivery receipt columns for databases created before SCHEMA_VERSION 3.
    conn.execute("ALTER TABLE print_settings ADD COLUMN delivery_receipt_printer TEXT", []).ok();
    conn.execute("ALTER TABLE print_settings ADD COLUMN delivery_receipt_copies INTEGER NOT NULL DEFAULT 1", []).ok();
    conn.execute("ALTER TABLE print_settings ADD COLUMN delivery_receipt_layout TEXT", []).ok();

    // Persist the completed migration state so the suite does not re-run.
    conn.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|e| format!("Failed to record schema version: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn update_user_profile(
    session_token: String,
    old_username: String,
    new_username: String,
    current_password: Option<String>,
    new_password: Option<String>,
    admin_override: Option<bool>,
    display_name: Option<String>,
    new_role: Option<String>,
) -> Result<(), String> {
    let new_username = new_username.trim().to_string();
    // Server-side authorization: never trust a client-supplied override flag.
    let caller = crate::auth::validate(&session_token)?;
    let is_admin = caller.role == "Admin";
    let is_self = caller.username == old_username;

    // A non-admin may only modify their own profile. Admin is required to touch
    // another user's record, regardless of how the request is framed.
    if !is_self && !is_admin {
        return Err("Only an Administrator can modify another user's profile.".to_string());
    }

    if admin_override.unwrap_or(false) && !is_admin {
        return Err("Only an Administrator can override another user's profile.".to_string());
    }
    if new_role.is_some() && !is_admin {
        return Err("Only an Administrator can change roles.".to_string());
    }
    if new_password.is_some() && !is_self && !is_admin {
        return Err("Only an Administrator can change another user's password.".to_string());
    }

    let conn = get_conn()?;

    // First check if user exists. Usernames are case-insensitive for login, so
    // match case-insensitively here too. The DB enforces a case-insensitive
    // unique index on username; if multiple rows still match (legacy data),
    // refuse to operate on an ambiguous record.
    let mut stmt = conn.prepare("SELECT id, password_hash, username FROM users WHERE LOWER(username) = LOWER(?)").map_err(|e| e.to_string())?;
    let mut matches: Vec<(i32, String, String)> = stmt.query_map([&old_username], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);

    if matches.is_empty() {
        return Err("User not found".to_string());
    }
    if matches.len() > 1 {
        return Err("Multiple accounts share this username. Please contact an administrator to resolve the duplicate.".to_string());
    }
    let (user_id, db_password, _db_username) = matches.remove(0);

    // Check if new_username is already taken by another user (case-insensitive).
    // Exclude by id rather than by raw username so a case-only rename of the
    // current user is not mistaken for a different account.
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(?) AND id != ?",
        rusqlite::params![&new_username, &user_id],
        |row| row.get(0)
    ).unwrap_or(0);

    if count > 0 {
        return Err("This username is already taken by another user.".to_string());
    }

    // If they want to change password, they must provide the correct current password
    if let Some(new_pw) = new_password {
        if new_pw.len() < 6 {
            return Err("New password must be at least 6 characters long.".to_string());
        }
        if !admin_override.unwrap_or(false) {
            let curr_pw = current_password.ok_or_else(|| "Current password is required to set a new password".to_string())?;
            if let Ok(is_valid) = bcrypt::verify(&curr_pw, &db_password) {
                if !is_valid {
                    return Err("Incorrect current password".to_string());
                }
            } else {
                return Err("Failed to verify current password".to_string());
            }
        }
        
        let new_pw_hash = bcrypt::hash(&new_pw, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;

        // Update username, password, and display_name
        conn.execute(
            "UPDATE users SET username = ?, password_hash = ?, display_name = ?, must_change_password = 0 WHERE id = ?",
            rusqlite::params![&new_username, &new_pw_hash, &display_name.unwrap_or_default(), user_id],
        ).map_err(|e| e.to_string())?;
    } else {
        // Just update username and display_name
        conn.execute(
            "UPDATE users SET username = ?, display_name = ? WHERE id = ?",
            rusqlite::params![&new_username, &display_name.unwrap_or_default(), user_id],
        ).map_err(|e| e.to_string())?;
    }

    if let Some(role) = new_role {
        if let Ok(role_id) = conn.query_row("SELECT id FROM roles WHERE name = ?", [&role], |row| row.get::<_, i32>(0)) {
            conn.execute("UPDATE users SET role_id = ? WHERE id = ?", rusqlite::params![role_id, user_id]).ok();
        }
    }

    Ok(())
}

#[tauri::command]
pub fn update_security_question(
    session_token: String,
    username: String,
    question: String,
    answer: String,
) -> Result<(), String> {
    // Only the account owner (or an Admin) may set the recovery question.
    // Otherwise a low-privilege user could plant a question/answer on an admin
    // account and then reset that account's password via the forgot flow.
    let caller = crate::auth::validate(&session_token)?;
    if caller.username != username && caller.role != "Admin" {
        return Err("Only the account owner or an Administrator can update the security question.".to_string());
    }
    if question.trim().is_empty() {
        return Err("Security question cannot be empty.".to_string());
    }
    // Require a reasonably long answer so a short guess cannot be brute-forced
    // through the public reset flow.
    if answer.trim().len() < 8 {
        return Err("Security answer must be at least 8 characters long.".to_string());
    }

    // Store a bcrypt hash of the answer so the local SQLite file cannot be read
    // to recover answers (passwords are hashed; the recovery answer now is too).
    // Answers are lowercased so verification is case-insensitive, matching how
    // legacy plaintext answers were compared.
    let normalized = answer.trim().to_lowercase();
    let answer_hash = bcrypt::hash(&normalized, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;

    let conn = get_conn()?;
    conn.execute(
        "UPDATE users SET security_question = ?, security_answer = ? WHERE username = ?",
        rusqlite::params![question.trim(), answer_hash, username],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_security_question(username: String) -> Result<String, String> {
    let conn = get_conn()?;
    // Return the same message whether the user doesn't exist or has no question,
    // so this endpoint cannot be used to enumerate registered usernames.
    let username_lower = username.to_lowercase();
    let mut stmt = conn.prepare("SELECT security_question FROM users WHERE LOWER(username) = ?").map_err(|e| e.to_string())?;
    let question: Option<Option<String>> = stmt.query_row([&username_lower], |row| row.get(0)).ok();
    match question {
        Some(Some(q)) => Ok(q),
        _ => Err("Invalid username or no security question set for this account".to_string()),
    }
}

#[tauri::command]
pub fn reset_password_with_security_answer(username: String, answer: String, new_password: String) -> Result<(), String> {
    if new_password.len() < 6 {
        return Err("New password must be at least 6 characters long.".to_string());
    }

    let conn = get_conn()?;
    let username_lower = username.to_lowercase();
    if crate::auth::is_reset_locked(&conn, &username_lower) {
        return Err("Too many reset attempts. Please try again later.".to_string());
    }

    let mut stmt = conn.prepare("SELECT security_answer, username FROM users WHERE LOWER(username) = ?").map_err(|e| e.to_string())?;
    let db_res: Option<(Option<String>, String)> = stmt.query_row([&username_lower], |row| Ok((row.get(0).ok(), row.get(1)?))).ok();

    // Generic failure so usernames cannot be enumerated through the reset flow.
    let generic_fail = || Err("Invalid username or security answer. Please try again.".to_string());

    let (stored, db_username) = match db_res {
        Some((Some(a), u)) => (a, u),
        _ => return generic_fail(),
    };

    // New answers are stored bcrypt-hashed (lowercased for case-insensitive
    // matching). Legacy answers stored in plaintext are verified
    // case-insensitively as a fallback and upgraded to a hash on a successful
    // reset. A plaintext answer still present is also hashed in place so any
    // copy of the DB no longer exposes it.
    let normalized_answer = answer.trim().to_lowercase();
    let valid = if stored.starts_with("$2") {
        bcrypt::verify(&normalized_answer, &stored).unwrap_or(false)
    } else {
        stored.to_lowercase() == normalized_answer
    };

    if !valid {
        crate::auth::record_reset_attempt(&conn, &username_lower);
        return generic_fail();
    }

    let new_pw_hash = bcrypt::hash(&new_password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = ?",
        rusqlite::params![&new_pw_hash, &db_username],
    ).map_err(|e| e.to_string())?;

    // Upgrade a legacy plaintext answer to a hash so it stays protected going forward.
    if !stored.starts_with("$2") {
        let answer_hash = bcrypt::hash(&normalized_answer, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE users SET security_answer = ?1 WHERE username = ?2",
            rusqlite::params![answer_hash, db_username],
        ).map_err(|e| e.to_string())?;
    }

    crate::auth::clear_reset_attempts(&conn, &username_lower);
    Ok(())
}

// This tells Tauri that React is allowed to call this function
#[tauri::command]
pub fn get_restaurant_name() -> Result<String, String> {
    // Open the database
    let conn = get_conn()?;
    
    // Ask the database for the name where id = 1
    let name: String = conn
        .query_row("SELECT restaurant_name FROM restaurant_settings WHERE id = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    
    // Send the name back to React
    Ok(name)
}

#[tauri::command]
pub fn get_user_role_by_username(username: String) -> Result<String, String> {
    let conn = get_conn()?;
    
    let mut stmt = conn.prepare("
        SELECT r.name FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.username = ?1
    ").map_err(|e| e.to_string())?;
    
    let role: String = stmt.query_row([&username], |row| row.get(0))
        .map_err(|_| "User not found".to_string())?;
        
    Ok(role)
}

#[derive(serde::Serialize)]
pub struct UserInfo {
    pub id: i32,
    pub username: String,
    pub role: String,
    pub display_name: Option<String>,
}

/// Admin-only: list all users for the "Manage User" dropdown.
#[tauri::command]
pub fn get_users() -> Result<Vec<UserInfo>, String> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT u.id, u.username, r.name, u.display_name FROM users u
         JOIN roles r ON u.role_id = r.id
         ORDER BY u.username COLLATE NOCASE"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(UserInfo {
            id: row.get(0)?,
            username: row.get(1)?,
            role: row.get(2)?,
            display_name: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// NEW: The authentication command
#[tauri::command]
pub fn login(email: String, password: String) -> LoginResponse {
    let fail = |message: &str| LoginResponse {
        success: false,
        role: None,
        username: None,
        display_name: None,
        session_token: None,
        must_change_password: false,
        message: message.into(),
    };

    let conn = match get_conn() {
        Ok(c) => c,
        Err(_) => return fail("Database connection failed"),
    };

    // Throttle brute-force attempts per username (locked after 5 failures / 5 min).
    // Normalize email (username) to lowercase for case-insensitive login
    let email_lower = email.trim().to_lowercase();
    let password = password.trim().to_string();

    if crate::auth::is_login_locked(&email_lower) {
        return fail("Too many failed login attempts. Please try again in a few minutes.");
    }

    let mut matches: Vec<(String, Option<String>, String, bool, String)> = Vec::new();

    {
        let mut stmt = match conn.prepare(
            "SELECT r.name, u.display_name, u.password_hash, COALESCE(u.must_change_password, 0), u.username FROM users u 
             JOIN roles r ON u.role_id = r.id 
             WHERE LOWER(u.username) = ?1"
        ) {
            Ok(s) => s,
            Err(_) => return fail("Query preparation failed"),
        };

        let mut rows = match stmt.query([&email_lower]) {
            Ok(r) => r,
            Err(_) => return fail("Query execution failed"),
        };

        while let Ok(Some(row)) = rows.next() {
            let role: String = row.get(0).unwrap_or_default();
            let display_name: Option<String> = row.get(1).unwrap_or(None);
            let password_hash: String = row.get(2).unwrap_or_default();
            let must_change_password: bool = row.get::<_, i32>(3).unwrap_or(0) == 1;
            let db_username: String = row.get(4).unwrap_or(email.clone());
            matches.push((role, display_name, password_hash, must_change_password, db_username));
        }
    }

    if matches.is_empty() {
        crate::auth::record_login_attempt(&email_lower);
        // Run a dummy bcrypt verification against a fixed cost-12 hash so the
        // response time matches that of an existing account's password check.
        // Otherwise the timing delta reveals whether a username exists.
        const DUMMY_BCRYPT: &str = "$2b$12$t4tRmi8mDwTY4Q.geBvBwuQAaxhRXkygoD2DFGF9NLJzVnHatetZ.";
        let _ = bcrypt::verify(&password, DUMMY_BCRYPT);
        return fail("Invalid email or password");
    }

    // If several accounts share the same username case-insensitively, refuse
    // to log in rather than silently authenticating to the first match.
    // The DB enforces a case-insensitive unique index, but this guards legacy
    // databases that may predate it.
    if matches.len() > 1 {
        return fail("Multiple accounts share this username. Please contact an administrator to resolve the duplicate.");
    }

    let (role, display_name, password_hash, must_change_password, db_username) = matches.remove(0);

    match bcrypt::verify(&password, &password_hash) {
        Ok(true) => {
            crate::auth::clear_login_attempts(&email_lower);
            let token = crate::auth::create_session(db_username.clone(), role.clone());
            return LoginResponse {
                success: true,
                role: Some(role),
                username: Some(db_username),
                display_name,
                session_token: Some(token),
                must_change_password,
                message: "Login successful".into(),
            };
        },
        _ => {}
    }

    crate::auth::record_login_attempt(&email_lower);
    fail("Invalid email or password")
}

/// Returns the currently authenticated user for the given session token,
/// or `None` if the token is missing/expired/invalid.
#[tauri::command]
pub fn get_current_session(session_token: String) -> Result<Option<crate::auth::CurrentUser>, String> {
    let session = match crate::auth::validate(&session_token) {
        Ok(s) => s,
        Err(_) => return Ok(None),
    };

    let conn = get_conn()?;
    let (display_name, must_change): (Option<String>, bool) = conn
        .query_row(
            "SELECT display_name, COALESCE(must_change_password, 0) FROM users WHERE username = ?1",
            [&session.username],
            |row| Ok((row.get(0).unwrap_or(None), row.get::<_, i32>(1).unwrap_or(0) == 1)),
        )
        .unwrap_or((None, false));

    Ok(Some(crate::auth::CurrentUser {
        username: session.username,
        role: session.role,
        display_name,
        must_change_password: must_change,
    }))
}

/// Returns true when the given username still has the `must_change_password`
/// flag set (used by the central authorize() gate to force a password change).
pub fn user_must_change_password(username: &str) -> bool {
    let Ok(conn) = get_conn() else {
        return false;
    };
    conn.query_row(
        "SELECT COALESCE(must_change_password, 0) FROM users WHERE username = ?1",
        [username],
        |row| row.get::<_, i32>(0),
    )
    .unwrap_or(0)
    == 1
}

/// Invalidates the given session token.
#[tauri::command]
pub fn logout(session_token: String) -> Result<(), String> {
    crate::auth::logout(&session_token);
    Ok(())
}

// Add this command to fetch categories
#[derive(serde::Serialize)]
pub struct Category {
    pub id: i32,
    pub name: String,
}

#[tauri::command]
pub fn get_categories() -> Result<Vec<Category>, String> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT id, name FROM categories").map_err(|e| e.to_string())?;
    
    let categories = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(Result::ok)
    .collect();

    Ok(categories)
}

// Add this command to fetch menu items
#[derive(serde::Serialize)]
pub struct MenuItem {
    pub id: i32,
    pub name: String,
    pub category_id: i32,
    pub price: f64,
    pub is_active: bool,
}

#[tauri::command]
pub fn get_menu_items() -> Result<Vec<MenuItem>, String> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT id, name, category_id, price, is_active FROM menu_items").map_err(|e| e.to_string())?;
    
    let items = stmt.query_map([], |row| {
        Ok(MenuItem {
            id: row.get(0)?,
            name: row.get(1)?,
            category_id: row.get(2)?,
            price: row.get(3)?,
            is_active: row.get::<_, i32>(4)? == 1,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(Result::ok)
    .collect();

    Ok(items)
}
#[tauri::command]
pub fn add_category(name: String) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute("INSERT INTO categories (name) VALUES (?1)", [&name]).map_err(|e| e.to_string())?;
    Ok("Category added".into())
}

#[tauri::command]
pub fn add_menu_item(name: String, category_id: i32, price: f64) -> Result<String, String> {
    if !price.is_finite() || price <= 0.0 {
        return Err("Price must be a positive number.".into());
    }
    let conn = get_conn()?;
    conn.execute(
        "INSERT INTO menu_items (name, category_id, price) VALUES (?1, ?2, ?3)",
        (&name, &category_id, &price),
    ).map_err(|e| e.to_string())?;
    Ok("Item added".into())
}
// --- CATEGORY CRUD ---

#[tauri::command]
pub fn delete_category(id: i32) -> Result<String, String> {
    let conn = get_conn()?;
    // Never leave orphaned menu items behind: a category that still has items
    // must be emptied first, otherwise those items disappear from every
    // category listing but remain purchasable in the POS (shown as "Unknown").
    let item_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM menu_items WHERE category_id = ?1",
        [&id], |row| row.get(0)
    ).map_err(|e| e.to_string())?;
    if item_count > 0 {
        return Err(format!(
            "Cannot delete this category: it still has {} menu item(s). Delete or move them to another category first.",
            item_count
        ));
    }
    conn.execute("DELETE FROM categories WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    Ok("Category deleted".into())
}

#[tauri::command]
pub fn update_category(id: i32, name: String) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute("UPDATE categories SET name = ?1 WHERE id = ?2", rusqlite::params![name, id]).map_err(|e| e.to_string())?;
    Ok("Category updated".into())
}

// --- MENU ITEM CRUD ---

#[tauri::command]
pub fn delete_menu_item(id: i32) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM menu_items WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    Ok("Menu item deleted".into())
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn update_menu_item(id: i32, name: String, categoryId: i32, price: f64) -> Result<String, String> {
    if !price.is_finite() || price <= 0.0 {
        return Err("Price must be a positive number.".into());
    }
    let conn = get_conn()?;
    conn.execute(
        "UPDATE menu_items SET name = ?1, category_id = ?2, price = ?3 WHERE id = ?4",
        rusqlite::params![name, categoryId, price, id],
    ).map_err(|e| e.to_string())?;
    Ok("Item updated successfully".to_string())
}

#[tauri::command]
pub fn toggle_menu_item_status(id: i32, is_active: bool) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute(
        "UPDATE menu_items SET is_active = ?1 WHERE id = ?2",
        rusqlite::params![if is_active { 1 } else { 0 }, id],
    ).map_err(|e| e.to_string())?;
    Ok("Item status updated successfully".to_string())
}

#[derive(serde::Serialize)]
pub struct RestaurantSettings {
    pub restaurant_name: String,
    pub address: Option<String>,
    pub logo_path: Option<String>,
    pub tax_rate: f64,
    pub total_tables: i32,
    pub service_charge_rate: f64,
    pub service_charge_types: String,
    pub contact_number: Option<String>,
    pub order_reset_frequency: String,
}

#[tauri::command]
pub fn get_settings() -> Result<RestaurantSettings, String> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT restaurant_name, logo_path, tax_rate, total_tables, address, COALESCE(service_charge_rate, 0.0), COALESCE(service_charge_types, 'Dine-in'), contact_number, COALESCE(order_reset_frequency, 'Daily') FROM restaurant_settings WHERE id = 1").map_err(|e| e.to_string())?;
    
    let settings = stmt.query_row([], |row| {
        Ok(RestaurantSettings {
            restaurant_name: row.get(0)?,
            logo_path: row.get(1)?,
            tax_rate: row.get(2)?,
            total_tables: row.get(3)?,
            address: row.get(4).unwrap_or(None),
            service_charge_rate: row.get(5).unwrap_or(0.0),
            service_charge_types: row.get(6).unwrap_or("Dine-in".to_string()),
            contact_number: row.get(7).unwrap_or(None),
            order_reset_frequency: row.get(8).unwrap_or("Daily".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    Ok(settings)
}

#[tauri::command]
pub fn update_settings(name: String, address: Option<String>, logo_path: Option<String>, tax_rate: f64, total_tables: Option<i32>, service_charge_rate: f64, service_charge_types: String, contact_number: Option<String>, order_reset_frequency: Option<String>) -> Result<String, String> {
    let conn = get_conn()?;

    // NOTE: Physical tables are managed exclusively through Table Management
    // (table_categories + add_tables/delete_table). We deliberately do NOT
    // mutate table_status here — the old behaviour deleted/re-inserted rows
    // whenever total_tables changed, which wiped category-assigned tables.
    // Keep the persisted total_tables value when the caller does not supply one.

    let frequency = order_reset_frequency.as_deref().unwrap_or("Daily").to_string();
    if !["Daily", "Weekly", "Monthly", "Yearly", "Never"].contains(&frequency.as_str()) {
        return Err("Invalid order reset frequency.".into());
    }

    if !tax_rate.is_finite() || tax_rate < 0.0 {
        return Err("Tax rate cannot be negative.".into());
    }
    if !service_charge_rate.is_finite() || service_charge_rate < 0.0 {
        return Err("Service charge rate cannot be negative.".into());
    }

    conn.execute(
        "UPDATE restaurant_settings SET restaurant_name = ?1, address = ?2, logo_path = ?3, tax_rate = ?4, total_tables = COALESCE(?5, total_tables), service_charge_rate = ?6, service_charge_types = ?7, contact_number = ?8, order_reset_frequency = COALESCE(?9, order_reset_frequency) WHERE id = 1",
        rusqlite::params![name, address, logo_path, tax_rate, total_tables, service_charge_rate, service_charge_types, contact_number, order_reset_frequency],
    ).map_err(|e| e.to_string())?;
    
    Ok("Settings updated successfully".into())
}
#[derive(serde::Serialize)]
pub struct TableStatus {
    pub id: i32,
    pub table_number: i32,
    pub status: String,
    pub category_id: Option<i32>,
    pub category_name: Option<String>,
}

#[tauri::command]
pub fn init_tables_if_needed() -> Result<String, String> {
    let conn = get_conn()?;
    
    // Create the table to track orders and availability
    conn.execute(
        "CREATE TABLE IF NOT EXISTS table_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            table_number INTEGER UNIQUE, 
            status TEXT NOT NULL DEFAULT 'Available'
        )",
        [],
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_time TEXT DEFAULT (datetime('now', 'localtime')),
            end_time TEXT,
            opening_cash REAL NOT NULL,
            closing_cash REAL,
            status TEXT DEFAULT 'Open'
        )", []
    ).ok();

    // Grab the global setting you just saved
    let total_tables: i32 = conn.query_row(
        "SELECT total_tables FROM restaurant_settings WHERE id = 1", 
        [], 
        |row| row.get(0)
    ).unwrap_or(10);

    // Seed the tables if the database is currently empty
    let count: i32 = conn.query_row("SELECT COUNT(*) FROM table_status", [], |row| row.get(0)).unwrap_or(0);
    if count == 0 {
        for i in 1..=total_tables {
            conn.execute("INSERT INTO table_status (table_number, status) VALUES (?1, 'Available')", [&i]).ok();
        }
    }
    
    Ok("Tables initialized".into())
}

#[tauri::command]
pub fn get_table_statuses() -> Result<Vec<TableStatus>, String> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare(
        "SELECT t.id, t.table_number, t.status, t.category_id, c.name
         FROM table_status t
         LEFT JOIN table_categories c ON t.category_id = c.id
         ORDER BY t.category_id, t.table_number"
    ).map_err(|e| e.to_string())?;
    
    let tables = stmt.query_map([], |row| {
        Ok(TableStatus {
            id: row.get(0)?,
            table_number: row.get(1)?,
            status: row.get(2)?,
            category_id: row.get(3).unwrap_or(None),
            category_name: row.get(4).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?
    .filter_map(Result::ok)
    .collect();

    Ok(tables)
}

#[tauri::command]
pub fn add_table(table_number: i32) -> Result<String, String> {
    let conn = get_conn()?;
    
    // Create the table if it doesn't exist yet
    conn.execute(
        "CREATE TABLE IF NOT EXISTS table_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            table_number INTEGER UNIQUE, 
            status TEXT NOT NULL DEFAULT 'Available'
        )",
        [],
    ).map_err(|e| e.to_string())?;

    let exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM table_status WHERE category_id IS NULL AND table_number = ?1",
        [&table_number],
        |row| row.get::<_, i64>(0)
    ).unwrap_or(0) > 0;
    if exists {
        return Err(format!("Table number {} already exists.", table_number));
    }

    conn.execute(
        "INSERT INTO table_status (table_number, status) VALUES (?1, 'Available')",
        [&table_number]
    ).map_err(|e| e.to_string())?;
    
    Ok("Table added successfully".into())
}

#[tauri::command]
pub fn delete_table(id: i32) -> Result<String, String> {
    let conn = get_conn()?;
    
    // Check if table is occupied
    let mut stmt = conn.prepare("SELECT status FROM table_status WHERE id = ?1").map_err(|e| e.to_string())?;
    let status: String = stmt.query_row([&id], |row| row.get(0)).unwrap_or_default();
    
    if status == "Occupied" {
        return Err("Cannot delete an occupied table.".into());
    }
    
    conn.execute("DELETE FROM table_status WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    
    Ok("Table deleted successfully".into())
}

#[derive(serde::Serialize)]
pub struct ActiveOrder {
    pub id: i32,
    pub order_number: i32,
    pub table_number: i32,
    pub table_category_name: Option<String>,
    pub status: String,
    pub discount_amount: f64,
    pub order_type: Option<String>,
    pub customer_id: Option<i32>,
    pub customer_phone: Option<String>,
    pub delivery_address: Option<String>,
    pub order_taker_id: Option<i32>,
    pub order_taker_name: Option<String>,
}


#[derive(serde::Serialize)]
pub struct OrderItem {
    pub id: i32,
    pub item_id: i32,
    pub name: String,
    pub price: f64,
    pub quantity: i32,
    pub kot_printed_qty: i32,
}

#[tauri::command]
pub fn get_order_items(order_id: i32) -> Result<Vec<OrderItem>, String> {
    let conn = get_conn()?;
    conn.execute("ALTER TABLE order_items ADD COLUMN kot_printed_qty INTEGER DEFAULT 0", []).ok();
    let mut stmt = conn.prepare("SELECT id, item_id, name, price, quantity, COALESCE(kot_printed_qty, 0) FROM order_items WHERE order_id = ?1").map_err(|e| e.to_string())?;
    
    let items = stmt.query_map([&order_id], |row| {
        Ok(OrderItem {
            id: row.get(0)?,
            item_id: row.get(1)?,
            name: row.get(2)?,
            price: row.get(3)?,
            quantity: row.get(4)?,
            kot_printed_qty: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    Ok(items)
}

#[tauri::command]
pub fn add_item_to_order(order_id: i32, item_id: i32, name: String, price: f64) -> Result<String, String> {
    let conn = get_conn()?;
    
    // Only Open orders may be edited; never mutate a Closed/Placed order.
    let status: String = conn.query_row("SELECT status FROM orders WHERE id = ?1", [&order_id], |row| row.get(0)).map_err(|_| "Order not found.".to_string())?;
    if status != "Open" {
        return Err("Order is no longer open and cannot be modified.".into());
    }

    // Check if item already exists in this specific order
    let mut stmt = conn.prepare("SELECT id, quantity FROM order_items WHERE order_id = ?1 AND item_id = ?2").map_err(|e| e.to_string())?;
    let existing = stmt.query_row([&order_id, &item_id], |row| Ok((row.get::<_, i32>(0)?, row.get::<_, i32>(1)?)));

    match existing {
        Ok((id, quantity)) => {
            // Stack it: Increase quantity by 1
            conn.execute("UPDATE order_items SET quantity = ?1 WHERE id = ?2", rusqlite::params![quantity + 1, id]).map_err(|e| e.to_string())?;
        },
        Err(_) => {
            // New item: Insert with quantity 1
            conn.execute(
                "INSERT INTO order_items (order_id, item_id, name, price, quantity) VALUES (?1, ?2, ?3, ?4, 1)",
                rusqlite::params![order_id, item_id, name, price],
            ).map_err(|e| e.to_string())?;
        }
    }
    Ok("Item added".into())
}

#[tauri::command]
pub fn remove_item_from_order(order_id: i32, item_id: i32) -> Result<String, String> {
    let conn = get_conn()?;
    
    let status: String = conn.query_row("SELECT status FROM orders WHERE id = ?1", [&order_id], |row| row.get(0)).map_err(|_| "Order not found.".to_string())?;
    if status != "Open" {
        return Err("Order is no longer open and cannot be modified.".into());
    }

    let mut stmt = conn.prepare("SELECT id, quantity FROM order_items WHERE order_id = ?1 AND item_id = ?2").map_err(|e| e.to_string())?;
    let existing = stmt.query_row([&order_id, &item_id], |row| Ok((row.get::<_, i32>(0)?, row.get::<_, i32>(1)?)));

    if let Ok((id, quantity)) = existing {
        if quantity > 1 {
            // Decrease quantity
            conn.execute("UPDATE order_items SET quantity = ?1 WHERE id = ?2", rusqlite::params![quantity - 1, id]).map_err(|e| e.to_string())?;
        } else {
            // Trash the item if quantity drops to 0
            conn.execute("DELETE FROM order_items WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
        }
    }
    Ok("Item removed".into())
}

#[tauri::command]
pub fn delete_item_from_order(order_id: i32, item_id: i32) -> Result<String, String> {
    let conn = get_conn()?;
    
    let status: String = conn.query_row("SELECT status FROM orders WHERE id = ?1", [&order_id], |row| row.get(0)).map_err(|_| "Order not found.".to_string())?;
    if status != "Open" {
        return Err("Order is no longer open and cannot be modified.".into());
    }

    conn.execute("DELETE FROM order_items WHERE order_id = ?1 AND item_id = ?2", rusqlite::params![order_id, item_id]).map_err(|e| e.to_string())?;
    Ok("Item completely removed".into())
}

#[tauri::command]
pub fn update_order_type(order_id: i32, order_type: String) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute(
        "UPDATE orders SET order_type = ?1 WHERE id = ?2",
        rusqlite::params![order_type, order_id]
    ).map_err(|e| e.to_string())?;
    Ok("Order type updated".into())
}

#[tauri::command]
pub fn update_order_delivery_draft(order_id: i32, delivery_address: Option<String>, customer_phone: Option<String>, customer_id: Option<i32>) -> Result<String, String> {
    let conn = get_conn()?;
    
    conn.execute(
        "UPDATE orders SET delivery_address = ?1, customer_phone = ?2, customer_id = ?3 WHERE id = ?4",
        rusqlite::params![delivery_address, customer_phone, customer_id, order_id]
    ).map_err(|e| e.to_string())?;
    Ok("Draft saved".into())
}

#[tauri::command]
pub fn checkout_order(
    order_id: i32, 
    table_id: i32, 
    order_type: String, 
    customer_id: Option<i32>,
    _subtotal: f64,
    _tax_amount: f64,
    discount_amount: f64,
    amount_received: f64,
    change_due: f64,
    cashier_name: String,
    order_note: String,
    _service_charge_amount: f64
) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let conn = &*conn_guard;

    // Recompute the financials server-side. Never trust client-supplied money
    // values: the stored subtotal/tax/service charge are derived from the
    // order_items and the configured settings, discount is clamped to the gross
    // payable (so the total can never go negative), and payment is validated
    // against the true total including any delivery fee already on the order.
    let server_subtotal: f64 = conn.query_row(
        "SELECT COALESCE(SUM(price * quantity), 0.0) FROM order_items WHERE order_id = ?1",
        [&order_id], |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    // Never finalize an order that has no items. An empty cart must not be
    // placed even if a delivery fee or discount would make its total positive.
    let item_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM order_items WHERE order_id = ?1",
        [&order_id], |row| row.get(0)
    ).map_err(|e| e.to_string())?;
    if item_count == 0 {
        return Err("Cannot checkout an empty order. Please add at least one item first.".into());
    }

    let (tax_rate, sc_rate, sc_types): (f64, f64, String) = conn.query_row(
        "SELECT COALESCE(tax_rate, 0.0), COALESCE(service_charge_rate, 0.0), COALESCE(service_charge_types, 'Dine-in') FROM restaurant_settings WHERE id = 1",
        [], |row| Ok((row.get(0).unwrap_or(0.0), row.get(1).unwrap_or(0.0), row.get(2).unwrap_or("Dine-in".to_string())))
    ).map_err(|e| e.to_string())?;

    let (delivery_fee, stored_discount): (f64, f64) = conn.query_row(
        "SELECT COALESCE(delivery_fee, 0.0), COALESCE(discount_amount, 0.0) FROM orders WHERE id = ?1",
        [&order_id], |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|e| e.to_string())?;

    let server_tax = round2(server_subtotal * tax_rate / 100.0);
    let sc_applies = sc_types.split(',').any(|t| t.trim() == order_type);
    let server_sc = if sc_applies { round2(server_subtotal * sc_rate / 100.0) } else { 0.0 };
    let gross = round2(server_subtotal) + server_tax + server_sc;
    // Prefer the client-supplied discount when present; otherwise fall back to
    // the discount already persisted on the open order (via update_order_discount)
    // so a checkout that omits it cannot silently drop the discount.
    let requested_discount = if discount_amount.is_finite() && discount_amount > 0.0 { discount_amount } else { stored_discount };
    let discount = round2(requested_discount.min(gross));
    let server_total = round2(gross + delivery_fee - discount);

    if server_total <= 0.0 {
        return Err("Order total cannot be zero or negative. Please check the discount.".to_string());
    }

    if !amount_received.is_finite() || amount_received < server_total - 0.009 {
        return Err(format!(
            "Amount received ({:.2}) is less than the payable total ({:.2}).",
            amount_received, server_total
        ));
    }
    if !change_due.is_finite() || change_due < -0.005 || amount_received < -0.005 || (amount_received - change_due - server_total).abs() > 0.01 {
        return Err("Change due does not match the amount received.".to_string());
    }

    let new_status = if order_type == "Delivery" { "Delivery Pending" } else { "Closed" };

    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;
    // Close the order (or mark Delivery Pending) — only if it is still open so
    // a repeated checkout call cannot mutate an already-closed order.
    let updated = tx.execute(
        "UPDATE orders SET status = ?12, closed_at = datetime('now', 'localtime'), 
        order_type = ?2, subtotal = ?3, tax_amount = ?4, discount_amount = ?5, 
        amount_received = ?6, change_due = ?7, customer_id = ?8, cashier_name = ?9, order_note = ?10, service_charge_amount = ?11 
        WHERE id = ?1 AND status = 'Open'", 
        rusqlite::params![
            order_id, order_type, round2(server_subtotal), server_tax, discount, 
            amount_received, change_due, customer_id, cashier_name, order_note, server_sc,
            new_status
        ]
    ).map_err(|e| e.to_string())?;

    if updated == 0 {
        return Err("Order is not open or does not exist.".into());
    }

    // Free up the physical table
    if table_id > 0 {
        tx.execute("UPDATE table_status SET status = 'Available' WHERE id = ?1", [&table_id]).map_err(|e| e.to_string())?;
    }

    if let Some(c_id) = customer_id {
        tx.execute("UPDATE customers SET visits = visits + 1 WHERE id = ?1", [&c_id]).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok("Order closed and table cleared".into())
}

#[tauri::command]
pub fn update_order_discount(order_id: i32, discount_amount: f64) -> Result<String, String> {
    let conn = get_conn()?;
    
    if !discount_amount.is_finite() || discount_amount < 0.0 {
        return Err("Discount must be a non-negative number.".into());
    }

    // Clamp the discount to the order's current item subtotal so it can never
    // exceed the gross payable and drive the total negative.
    let gross: f64 = conn.query_row(
        "SELECT COALESCE((SELECT SUM(price * quantity) FROM order_items WHERE order_id = ?1), 0.0) FROM orders WHERE id = ?1 AND status = 'Open'",
        [&order_id], |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    let discount = discount_amount.min(gross);

    // Ensure column exists
    
    let updated = conn.execute(
        "UPDATE orders SET discount_amount = ?1 WHERE id = ?2 AND status = 'Open'",
        rusqlite::params![discount, order_id]
    ).map_err(|e| e.to_string())?;
    
    if updated == 0 {
        return Err("Order not found or is no longer open.".into());
    }
    
    Ok("Discount updated".into())
}

#[tauri::command]
pub fn save_print_html(filename: String, html: String) -> Result<String, String> {
    let safe_name = sanitize_filename(&filename);
    if safe_name.is_empty() {
        return Err("Invalid filename.".into());
    }
    // Strip active content before the file is opened by the OS default handler,
    // which runs at file:// with no Tauri CSP. Receipt HTML embeds DB-supplied
    // strings, so <script>/<iframe>/event handlers must never execute.
    let sanitized = sanitize_html(&html);
    let path = std::env::temp_dir().join(safe_name);
    std::fs::write(&path, sanitized).map_err(|e| e.to_string())?;
    opener::open(&path).map_err(|e| e.to_string())?;
    Ok("Success".to_string())
}

/// Opens a self-generated designed-ticket HTML document with the OS default
/// handler. Unlike `save_print_html` this deliberately skips `sanitize_html`:
/// the markup comes from the app's own React templates and embeds the compiled
/// app stylesheet in `<style>` blocks, which the sanitizer would strip (same
/// trust rationale as `print_html_to_pdf`).
#[tauri::command]
pub fn open_ticket_html(filename: String, html: String) -> Result<String, String> {
    let safe_name = sanitize_filename(&filename);
    if safe_name.is_empty() {
        return Err("Invalid filename.".into());
    }
    let path = std::env::temp_dir().join(safe_name);
    std::fs::write(&path, html).map_err(|e| e.to_string())?;
    opener::open(&path).map_err(|e| e.to_string())?;
    Ok("Success".to_string())
}

/// Renders a standalone report HTML document to a PDF using headless Microsoft
/// Edge (same Chromium engine as the app, so Tailwind layouts stay intact) and
/// opens the resulting file. This bypasses the WebView2 print dialog entirely,
/// so report exports never change the printer remembered for receipt tickets.
///
/// The HTML is built by the app's own report components (React escapes all DB
/// values), so it is trusted and deliberately NOT run through `sanitize_html`:
/// that sanitizer strips `<style>` blocks (which would remove every report's
/// styling) and is O(n²) — it hangs for seconds/minutes on a large inlined-CSS
/// document. The HTML lives in a temp file read only by headless Edge and is
/// deleted immediately after rendering.
#[tauri::command]
pub async fn print_html_to_pdf(filename: String, html: String, output_path: String) -> Result<String, String> {
    // Run on a blocking thread so Edge rendering / opening the PDF never
    // freezes the app UI, even though Tauri async commands are off the main
    // thread already.
    tauri::async_runtime::spawn_blocking(move || {
        if output_path.trim().is_empty() {
            return Err("A PDF output path is required.".into());
        }
        let safe_name = sanitize_filename(&filename);
        if safe_name.is_empty() {
            return Err("Invalid filename.".into());
        }

        let tmp_dir = std::env::temp_dir();
        let html_path = tmp_dir.join(safe_name);
        std::fs::write(&html_path, &html).map_err(|e| format!("Failed to write temp HTML: {}", e))?;

        let result = crate::print::render_html_to_pdf(&html_path.display().to_string(), &output_path);
        let _ = std::fs::remove_file(&html_path);
        result?;

        opener::open(&output_path).map_err(|e| format!("PDF saved but could not be opened: {}", e))?;
        Ok(output_path)
    })
    .await
    .map_err(|e| format!("PDF export task failed: {}", e))?
}

/// Removes `<script>`/`<iframe>`/`<object>`/`<embed>`/`<style>` blocks and
/// `on*`/`javascript:` attributes from HTML so stored/receipt content cannot
/// execute scripts when opened via the OS default browser.
fn sanitize_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut rest = html;
    while !rest.is_empty() {
        let lower = rest.to_lowercase();

        // 1) Strip dangerous block elements: <script ...>...</script> etc.
        let mut removed_block = false;
        for tag in ["<script", "<iframe", "<object", "<embed", "<style"] {
            if lower.starts_with(tag) {
                // Find the start of the closing tag.
                if let Some(close_pos) = lower.find(&format!("</{}", &tag[1..])) {
                    out.push_str(&rest[..0]); // nothing before
                    rest = &rest[close_pos + tag.len() + 1..];
                    removed_block = true;
                    break;
                } else {
                    // No closing tag — drop from the block start onward.
                    rest = "";
                    removed_block = true;
                    break;
                }
            }
        }
        if removed_block { continue; }

        // 2) Strip `onXXX="..."` event-handler attributes.
        let mut removed_attr = false;
        for idx in 0..lower.len() {
            if lower[idx..].starts_with("on") {
                let after = &lower[idx + 2..];
                if !after.is_empty() {
                    let first = after.chars().next().unwrap();
                    let rest_after_first = &after[first.len_utf8()..];
                    if first.is_ascii_alphabetic() && rest_after_first.starts_with('=') {
                        let eq_pos = idx + 2 + first.len_utf8();
                        let after_eq = &rest[eq_pos + 1..];
                        let quote = after_eq.chars().next().unwrap_or(' ');
                        if quote == '"' || quote == '\'' {
                            if let Some(end) = after_eq[quote.len_utf8()..].find(quote) {
                                let end_pos = eq_pos + 1 + quote.len_utf8() + end + quote.len_utf8();
                                out.push_str(&rest[..idx]);
                                rest = &rest[end_pos..];
                                removed_attr = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
        if removed_attr { continue; }

        // 3) Strip `javascript:` scheme inside href/src values.
        if lower.starts_with("javascript:") {
            let after = &rest["javascript:".len()..];
            let end = after.find(|c: char| c == '"' || c == '\'' || c == '>').unwrap_or(after.len());
            rest = &after[end..];
            continue;
        }

        // Copy the first character and advance.
        let ch = rest.chars().next().unwrap();
        out.push(ch);
        rest = &rest[ch.len_utf8()..];
    }
    out
}

#[tauri::command]
pub async fn print_receipt_text(
    text: String,
    printer_name: Option<String>,
    copies: Option<i32>,
    width_mm: Option<f64>,
    font_scale: Option<f64>,
) -> Result<String, String> {
    let copies = copies.unwrap_or(1).max(1) as u32;
    crate::print::print_text(printer_name.as_deref(), &text, copies, width_mm, font_scale)?;
    Ok("Print job sent".to_string())
}

#[derive(serde::Serialize)]
pub struct OrderHistory {
    pub id: i32,
    pub order_number: i32,
    pub table_id: i32,
    pub table_number: i32,
    pub table_category_name: Option<String>,
    pub status: String,
    pub total_items: i32,
    pub total_price: f64,
    pub subtotal: f64,
    pub tax_amount: f64,
    pub discount_amount: f64,
    pub amount_received: f64,
    pub change_due: f64,
    pub customer_name: Option<String>,
    pub cashier_name: Option<String>,
    pub order_note: Option<String>,
    pub order_type: Option<String>,
    pub created_at: Option<String>,
    pub closed_at: Option<String>,
    pub delivery_fee: f64,
    pub customer_phone: Option<String>,
    pub delivery_address: Option<String>,
    pub service_charge_amount: f64,
    pub order_taker_id: Option<i32>,
    pub order_taker_name: Option<String>,
}

#[tauri::command]
pub fn get_order_history() -> Result<Vec<OrderHistory>, String> {
    let conn = get_conn()?;
    
    // We join the orders and order_items tables, sum up the quantities and prices, 
    // and only fetch the orders that have been successfully checked out ('Closed').
    // total_price = items + delivery_fee + service_charge + tax - discount, so it
    // matches what the customer actually paid at checkout.
    let mut stmt = conn.prepare(
        "SELECT o.id, o.table_id, o.table_number, o.status, 
                COALESCE(SUM(oi.quantity), 0) as total_items, 
                COALESCE(SUM(oi.price * oi.quantity), 0) + COALESCE(o.delivery_fee, 0.0) + COALESCE(o.service_charge_amount, 0.0) + COALESCE(o.tax_amount, 0.0) - COALESCE(o.discount_amount, 0.0) as total_price,
                o.subtotal, o.tax_amount, o.discount_amount, o.amount_received, o.change_due,
                c.name as customer_name, o.cashier_name, o.order_note, o.order_type, o.created_at, o.closed_at, o.delivery_fee,
                o.customer_phone, o.delivery_address, o.service_charge_amount, o.order_taker_id, o.order_taker_name, tc.name, COALESCE(o.order_number, 0)
         FROM orders o 
         LEFT JOIN order_items oi ON o.id = oi.order_id 
         LEFT JOIN customers c ON o.customer_id = c.id
         LEFT JOIN table_status ts ON o.table_id = ts.id
         LEFT JOIN table_categories tc ON ts.category_id = tc.id
         WHERE o.status IN ('Closed', 'Open', 'Placed', 'Delivery Pending') 
         GROUP BY o.id ORDER BY o.id DESC"
    ).map_err(|e| e.to_string())?;

    let orders = stmt.query_map([], |row| {
        Ok(OrderHistory {
            id: row.get(0)?,
            table_id: row.get(1).unwrap_or(0),
            table_number: row.get(2)?,
            status: row.get(3)?,
            total_items: row.get(4)?,
            total_price: row.get(5)?,
            subtotal: row.get(6).unwrap_or(0.0),
            tax_amount: row.get(7).unwrap_or(0.0),
            discount_amount: row.get(8).unwrap_or(0.0),
            amount_received: row.get(9).unwrap_or(0.0),
            change_due: row.get(10).unwrap_or(0.0),
            customer_name: row.get(11).unwrap_or(None),
            cashier_name: row.get(12).unwrap_or(None),
            order_note: row.get(13).unwrap_or(None),
            order_type: row.get(14).unwrap_or(None),
            created_at: row.get(15).unwrap_or(None),
            closed_at: row.get(16).unwrap_or(None),
            delivery_fee: row.get(17).unwrap_or(0.0),
            customer_phone: row.get(18).unwrap_or(None),
            delivery_address: row.get(19).unwrap_or(None),
            service_charge_amount: row.get(20).unwrap_or(0.0),
            order_taker_id: row.get(21).unwrap_or(None),
            order_taker_name: row.get(22).unwrap_or(None),
            table_category_name: row.get(23).unwrap_or(None),
            order_number: row.get(24).unwrap_or(0),
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    Ok(orders)
}
#[tauri::command]
pub fn admin_update_table_status(table_id: i32, status: String) -> Result<String, String> {
    let conn = get_conn()?;
    
    // 1. Check current status to prevent overriding an active checkout session
    let mut stmt = conn.prepare("SELECT status, table_number FROM table_status WHERE id = ?1").map_err(|e| e.to_string())?;
    let (current_status, table_number): (String, i32) = stmt.query_row([&table_id], |row| Ok((row.get(0)?, row.get(1).unwrap_or(0)))).unwrap_or(("".to_string(), 0));
    
    if current_status.is_empty() {
        return Err("Table not found.".into());
    }

    // If the cashier is currently serving this table, block the admin override
    if current_status == "Occupied" && status != "Occupied" {
        return Err("Cannot change status: Table currently has an active, unpaid order.".into());
    }

    // 2. Apply the new status (e.g., 'Available', 'Reserved', 'Maintenance')
    conn.execute(
        "UPDATE table_status SET status = ?1 WHERE id = ?2",
        rusqlite::params![status, table_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(format!("Table {} updated to {}", table_number, status))
}
#[tauri::command]
pub fn cancel_active_order(order_id: i32, table_id: i32) -> Result<String, String> {
    // Keep the table_id argument for backward compatibility with the frontend
    // contract; the order's actual table is read from the DB instead.
    let _ = table_id;
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    // Only allow cancelling an Open order; never delete a Closed/Placed one
    // that carries revenue. Derive the real table from the order row instead of
    // trusting the client-supplied table_id so we cannot free an unrelated table.
    let order_table: i32 = tx.query_row(
        "SELECT COALESCE(table_id, 0) FROM orders WHERE id = ?1 AND status = 'Open'",
        [&order_id], |row| row.get(0)
    ).map_err(|_| "Order not found or is no longer open.".to_string())?;

    // 1. Delete associated items (just in case they added items and changed their mind)
    tx.execute("DELETE FROM order_items WHERE order_id = ?1", [&order_id]).map_err(|e| e.to_string())?;

    // 2. Delete the empty/cancelled order completely so it doesn't pollute Order History
    let deleted = tx.execute("DELETE FROM orders WHERE id = ?1 AND status = 'Open'", [&order_id]).map_err(|e| e.to_string())?;
    if deleted == 0 {
        return Err("Order not found or is no longer open.".into());
    }

    // 3. Free up the table that this order actually occupied
    if order_table > 0 {
        tx.execute("UPDATE table_status SET status = 'Available' WHERE id = ?1", [&order_table]).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok("Order cancelled and table freed".into())
}

#[tauri::command]
pub fn delete_order_history(order_id: i32) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    // Only allow deleting fully completed orders from history. Open/Placed
    // orders carry active service and must never be removed this way.
    let status: String = tx.query_row(
        "SELECT status FROM orders WHERE id = ?1",
        [&order_id], |row| row.get(0)
    ).map_err(|_| "Order not found.".to_string())?;

    if status != "Closed" {
        return Err("Only completed (Closed) orders can be deleted from history.".into());
    }

    // 1. Delete associated items first (avoids orphaned rows)
    tx.execute("DELETE FROM order_items WHERE order_id = ?1", [&order_id]).map_err(|e| e.to_string())?;

    // 2. Delete the order itself
    let deleted = tx.execute("DELETE FROM orders WHERE id = ?1 AND status = 'Closed'", [&order_id]).map_err(|e| e.to_string())?;
    if deleted == 0 {
        return Err("Order not found or is no longer closed.".into());
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok("Order deleted from history".into())
}

#[tauri::command]
pub fn reassign_order_table(order_id: i32, old_table_id: i32, new_table_id: i32) -> Result<String, String> {
    // Keep old_table_id for frontend contract compatibility; the order's actual
    // table is derived from the DB so we never free an unrelated table.
    let _ = old_table_id;
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;
    
    if new_table_id != 0 {
        let mut stmt = tx.prepare("SELECT status FROM table_status WHERE id = ?1").map_err(|e| e.to_string())?;
        let status: String = stmt.query_row([&new_table_id], |row| row.get(0)).unwrap_or_default();
        if status != "Available" {
            return Err("Target table is not available".into());
        }
    }
    
    // Derive the order's real table from the order row, not the client-supplied
    // old_table_id, so an unrelated table can never be freed. A same-table
    // reassign is a no-op.
    let current_table: i32 = tx.query_row(
        "SELECT COALESCE(table_id, 0) FROM orders WHERE id = ?1",
        [&order_id], |row| row.get(0)
    ).map_err(|_| "Order not found.".to_string())?;

    if current_table == new_table_id {
        return Ok("Table reassigned".into());
    }

    let new_table_number: i32 = {
        let mut tn_stmt = tx.prepare("SELECT table_number FROM table_status WHERE id = ?1").map_err(|e| e.to_string())?;
        tn_stmt.query_row([&new_table_id], |row| row.get(0)).unwrap_or(0)
    };

    tx.execute("UPDATE orders SET table_id = ?1, table_number = ?2 WHERE id = ?3", rusqlite::params![new_table_id, new_table_number, order_id]).map_err(|e| e.to_string())?;
    
    if current_table != 0 {
        tx.execute("UPDATE table_status SET status = 'Available' WHERE id = ?1", [&current_table]).map_err(|e| e.to_string())?;
    }
    if new_table_id != 0 {
        tx.execute("UPDATE table_status SET status = 'Occupied' WHERE id = ?1", [&new_table_id]).map_err(|e| e.to_string())?;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok("Table reassigned".into())
}

// Per-period sequential order numbers. The reset frequency drives which
// calendar period the counter restarts in (Daily/Weekly/Monthly/Yearly/Never).
fn order_period_key(created_at: &str, frequency: &str) -> String {
    let date = created_at.split(' ').next().unwrap_or(created_at);
    match frequency {
        "Weekly" => {
            let mut parts = date.split('-');
            let y = parts.next().unwrap_or("0000").parse::<i32>().unwrap_or(0);
            let m = parts.next().unwrap_or("1").parse::<u32>().unwrap_or(1);
            let d = parts.next().unwrap_or("1").parse::<u32>().unwrap_or(1);
            if let Some(dt) = chrono::NaiveDate::from_ymd_opt(y, m, d) {
                let week = chrono::Datelike::iso_week(&dt);
                let oy = week.year();
                let ow = week.week();
                format!("{}-W{:02}", oy, ow)
            } else {
                date.to_string()
            }
        }
        "Monthly" => {
            if date.len() >= 7 { date[..7].to_string() } else { date.to_string() }
        }
        "Yearly" => date.split('-').next().unwrap_or("").to_string(),
        "Never" => "0".to_string(),
        _ => date.to_string(), // Daily
    }
}

// Allocate the next order_number for the current period. SQLite is single
// writer here, so a MAX-based pick is safe. A cancelled order's number is
// intentionally reused within the period (matches paper receipt style).
fn get_next_order_number(conn: &rusqlite::Connection, frequency: &str) -> Result<(i32, String), String> {
    let now: String = conn
        .query_row("SELECT datetime('now', 'localtime')", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let key = order_period_key(&now, frequency);
    let next: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_number), 0) + 1 FROM orders WHERE order_period_key = ?1",
            [&key],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok((next, key))
}

#[tauri::command]
pub fn get_or_create_order(table_id: i32) -> Result<ActiveOrder, String> {
    let conn = get_conn()?;

    // 1. Ensure the order tables exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            table_id INTEGER,
            table_number INTEGER, 
            status TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            closed_at TEXT
        )", []
    ).map_err(|e| e.to_string())?;

    // Attempt to migrate existing tables
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            order_id INTEGER, 
            item_id INTEGER, 
            name TEXT, 
            price REAL, 
            quantity INTEGER
        )", []
    ).map_err(|e| e.to_string())?;

    // 2. NEW SAFETY BLOCK: Check if the table is locked by the Admin
    let mut stmt = conn.prepare("SELECT status FROM table_status WHERE id = ?1").map_err(|e| e.to_string())?;
    let current_status: String = stmt.query_row([&table_id], |row| row.get(0)).unwrap_or_default();
    
    if current_status == "Maintenance" || current_status == "Reserved" {
        return Err(format!("Cannot open order: Table is marked as {}.", current_status));
    }

    // 3. Check if this table already has an 'Open' order
    let mut stmt = conn.prepare("SELECT o.id, COALESCE(o.order_number, 0), o.table_number, o.status, COALESCE(o.discount_amount, 0.0), o.order_type, o.customer_id, o.customer_phone, o.delivery_address, o.order_taker_id, o.order_taker_name, c.name FROM orders o LEFT JOIN table_status ts ON o.table_id = ts.id LEFT JOIN table_categories c ON ts.category_id = c.id WHERE o.table_id = ?1 AND o.status = 'Open' LIMIT 1").map_err(|e| e.to_string())?;
    let existing_order = stmt.query_row([&table_id], |row| {
        Ok(ActiveOrder {
            id: row.get(0)?,
            order_number: row.get(1)?,
            table_number: row.get(2)?,
            status: row.get(3)?,
            discount_amount: row.get(4)?,
            order_type: row.get(5).unwrap_or(None),
            customer_id: row.get(6).unwrap_or(None),
            customer_phone: row.get(7).unwrap_or(None),
            delivery_address: row.get(8).unwrap_or(None),
            order_taker_id: row.get(9).unwrap_or(None),
            order_taker_name: row.get(10).unwrap_or(None),
            table_category_name: row.get(11).unwrap_or(None),
        })
    });

    if let Ok(order) = existing_order {
        return Ok(order); // Return the existing order
    }

    // 4. If no order exists, create a new one. Insert without an explicit id so
    // AUTOINCREMENT assigns a fresh, never-reused number (prevents a new order
    // from inheriting a previously cancelled order's printed receipt/QR id).
    let initial_type = if table_id == 0 { "Takeaway" } else { "Dine-in" };
    
    // Get table_number from table_id
    let mut tn_stmt = conn.prepare("SELECT table_number FROM table_status WHERE id = ?1").unwrap();
    let table_number: i32 = tn_stmt.query_row([&table_id], |row| row.get(0)).unwrap_or(0);

    let frequency: String = conn
        .query_row(
            "SELECT COALESCE(order_reset_frequency, 'Daily') FROM restaurant_settings WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let (order_number, period_key) = get_next_order_number(&conn, &frequency)?;

    conn.execute(
        "INSERT INTO orders (table_id, table_number, status, created_at, order_type, order_number, order_period_key) VALUES (?1, ?2, 'Open', datetime('now', 'localtime'), ?3, ?4, ?5)", 
        rusqlite::params![&table_id, &table_number, &initial_type, order_number, period_key]
    ).map_err(|e| e.to_string())?;
    let new_id = conn.last_insert_rowid() as i32;
    
    conn.execute("UPDATE table_status SET status = 'Occupied' WHERE id = ?1", [&table_id]).ok();

    let mut cat_stmt = conn.prepare("SELECT c.name FROM table_status ts JOIN table_categories c ON ts.category_id = c.id WHERE ts.id = ?1").unwrap();
    let cat_name: Option<String> = cat_stmt.query_row([&table_id], |row| row.get(0)).unwrap_or(None);

    Ok(ActiveOrder {
        id: new_id,
        order_number,
        table_number,
        table_category_name: cat_name,
        status: "Open".to_string(),
        discount_amount: 0.0,
        order_type: Some(initial_type.to_string()),
        customer_id: None,
        customer_phone: None,
        delivery_address: None,
        order_taker_id: None,
        order_taker_name: None,
    })
}

#[tauri::command]
pub fn get_active_order(table_id: i32) -> Result<Option<ActiveOrder>, String> {
    let conn = get_conn()?;
    
    let mut stmt = conn.prepare("SELECT o.id, COALESCE(o.order_number, 0), o.table_number, o.status, COALESCE(o.discount_amount, 0.0), o.order_type, o.customer_id, o.customer_phone, o.delivery_address, o.order_taker_id, o.order_taker_name, c.name FROM orders o LEFT JOIN table_status ts ON o.table_id = ts.id LEFT JOIN table_categories c ON ts.category_id = c.id WHERE o.table_id = ?1 AND o.status = 'Open' LIMIT 1").map_err(|e| e.to_string())?;
    let existing_order = stmt.query_row([&table_id], |row| {
        Ok(ActiveOrder {
            id: row.get(0)?,
            order_number: row.get(1)?,
            table_number: row.get(2)?,
            status: row.get(3)?,
            discount_amount: row.get(4)?,
            order_type: row.get(5).unwrap_or(None),
            customer_id: row.get(6).unwrap_or(None),
            customer_phone: row.get(7).unwrap_or(None),
            delivery_address: row.get(8).unwrap_or(None),
            order_taker_id: row.get(9).unwrap_or(None),
            order_taker_name: row.get(10).unwrap_or(None),
            table_category_name: row.get(11).unwrap_or(None),
        })
    });

    match existing_order {
        Ok(order) => Ok(Some(order)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_order_by_id(order_id: i32) -> Result<ActiveOrder, String> {
    let conn = get_conn()?;
    
    let mut stmt = conn.prepare("SELECT o.id, COALESCE(o.order_number, 0), o.table_number, o.status, COALESCE(o.discount_amount, 0.0), o.order_type, o.customer_id, o.customer_phone, o.delivery_address, o.order_taker_id, o.order_taker_name, c.name FROM orders o LEFT JOIN table_status ts ON o.table_id = ts.id LEFT JOIN table_categories c ON ts.category_id = c.id WHERE o.id = ?1").map_err(|e| e.to_string())?;
    let order = stmt.query_row([&order_id], |row| {
        Ok(ActiveOrder {
            id: row.get(0)?,
            order_number: row.get(1)?,
            table_number: row.get(2)?,
            status: row.get(3)?,
            discount_amount: row.get(4)?,
            order_type: row.get(5).unwrap_or(None),
            customer_id: row.get(6).unwrap_or(None),
            customer_phone: row.get(7).unwrap_or(None),
            delivery_address: row.get(8).unwrap_or(None),
            order_taker_id: row.get(9).unwrap_or(None),
            order_taker_name: row.get(10).unwrap_or(None),
            table_category_name: row.get(11).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;
    
    Ok(order)
}

#[tauri::command]
pub fn create_walkin_order(
    order_type: String,
    customer_phone: Option<String>,
    delivery_address: Option<String>,
    order_taker_id: Option<i32>,
    order_taker_name: Option<String>
) -> Result<ActiveOrder, String> {
    let conn = get_conn()?;
    
    // Idempotency guard: if a walk-in (table_id = 0) order is already open,
    // return it instead of creating a duplicate. This prevents the frontend
    // lazy-creation race (two rapid clicks creating two orders) and stray
    // orphaned Open orders. Only an EMPTY order is reused: an open order that
    // already has items is a pending/held order the user is intentionally
    // leaving as-is, so starting a new order must create a fresh one.
    if let Ok(existing) = get_open_walkin_order(&conn) {
        let item_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM order_items WHERE order_id = ?1",
            [&existing.id], |row| row.get(0)
        ).unwrap_or(0);
        if item_count == 0 {
            conn.execute(
                "UPDATE orders SET order_type = ?1 WHERE id = ?2",
                rusqlite::params![order_type, existing.id],
            ).ok();
            return Ok(ActiveOrder {
                id: existing.id,
                order_number: existing.order_number,
                table_number: 0,
                table_category_name: None,
                status: "Open".to_string(),
                discount_amount: existing.discount_amount,
                order_type: Some(order_type),
                customer_id: existing.customer_id,
                customer_phone: existing.customer_phone,
                delivery_address: existing.delivery_address,
                order_taker_id: existing.order_taker_id,
                order_taker_name: existing.order_taker_name,
            });
        }
    }

    let frequency: String = conn
        .query_row(
            "SELECT COALESCE(order_reset_frequency, 'Daily') FROM restaurant_settings WHERE id = 1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let (order_number, period_key) = get_next_order_number(&conn, &frequency)?;

    conn.execute(
        "INSERT INTO orders (table_id, table_number, status, created_at, order_type, customer_phone, delivery_address, order_taker_id, order_taker_name, order_number, order_period_key) VALUES (0, 0, 'Open', datetime('now', 'localtime'), ?1, ?2, ?3, ?4, ?5, ?6, ?7)", 
        rusqlite::params![&order_type, &customer_phone, &delivery_address, &order_taker_id, &order_taker_name, order_number, period_key]
    ).map_err(|e| e.to_string())?;
    let new_id = conn.last_insert_rowid() as i32;
    
    Ok(ActiveOrder {
        id: new_id,
        order_number,
        table_number: 0,
        table_category_name: None,
        status: "Open".to_string(),
        discount_amount: 0.0,
        order_type: Some(order_type),
        customer_id: None,
        customer_phone: customer_phone.clone(),
        delivery_address: delivery_address.clone(),
        order_taker_id: order_taker_id.clone(),
        order_taker_name: order_taker_name.clone(),
    })
}

/// Returns the most recent open walk-in order (table_id = 0), if any. Preferring
/// the newest avoids silently reusing a stale open walk-in from a prior session.
fn get_open_walkin_order(conn: &rusqlite::Connection) -> Result<ActiveOrder, String> {
    let mut stmt = conn.prepare(
        "SELECT id, COALESCE(order_number, 0), table_number, status, COALESCE(discount_amount, 0.0), order_type, customer_id, customer_phone, delivery_address, order_taker_id, order_taker_name
         FROM orders WHERE table_id = 0 AND status = 'Open' ORDER BY id DESC LIMIT 1"
    ).map_err(|e| e.to_string())?;
    let order = stmt.query_row([], |row| {
        Ok(ActiveOrder {
            id: row.get(0)?,
            order_number: row.get(1)?,
            table_number: row.get(2)?,
            status: row.get(3)?,
            discount_amount: row.get(4)?,
            order_type: row.get(5).unwrap_or(None),
            customer_id: row.get(6).unwrap_or(None),
            customer_phone: row.get(7).unwrap_or(None),
            delivery_address: row.get(8).unwrap_or(None),
            order_taker_id: row.get(9).unwrap_or(None),
            order_taker_name: row.get(10).unwrap_or(None),
            table_category_name: None,
        })
    }).map_err(|e| e.to_string())?;
    Ok(order)
}

// --- STAFF CATEGORIES ---

#[derive(serde::Serialize)]
pub struct StaffCategory {
    pub id: i32,
    pub name: String,
}

#[tauri::command]
pub fn get_staff_categories() -> Result<Vec<StaffCategory>, String> {
    let conn = get_conn()?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS staff_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )", []
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, name FROM staff_categories").map_err(|e| e.to_string())?;
    let category_iter = stmt.query_map([], |row| {
        Ok(StaffCategory {
            id: row.get(0)?,
            name: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut categories = Vec::new();
    for c in category_iter {
        categories.push(c.map_err(|e| e.to_string())?);
    }
    Ok(categories)
}

#[tauri::command]
pub fn add_staff_category(name: String) -> Result<String, String> {
    let conn = get_conn()?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS staff_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )", []
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO staff_categories (name) VALUES (?1)",
        [&name]
    ).map_err(|e| e.to_string())?;
    Ok("Category added".into())
}

#[tauri::command]
pub fn delete_staff_category(id: i32) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM staff_categories WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    Ok("Category deleted".into())
}

// --- STAFF MANAGEMENT ---

#[derive(serde::Serialize)]
pub struct StaffMember {
    pub id: i32,
    pub name: String,
    pub role: Option<String>,
    pub category_id: Option<i32>,
    pub category_name: Option<String>,
    pub phone: String,
    pub salary: f64,
    pub pin_code: Option<String>,
}

#[tauri::command]
pub fn get_staff() -> Result<Vec<StaffMember>, String> {
    let conn = get_conn()?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT,
            phone TEXT
        )", []
    ).map_err(|e| e.to_string())?;

    // Attempt to add new columns if they don't exist
    conn.execute("ALTER TABLE staff ADD COLUMN category_id INTEGER", []).ok();
    conn.execute("ALTER TABLE staff ADD COLUMN salary REAL", []).ok();
    conn.execute("ALTER TABLE staff ADD COLUMN pin_code TEXT", []).ok();

    // Ensure staff_categories exists before we join on it
    conn.execute(
        "CREATE TABLE IF NOT EXISTS staff_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )", []
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.role, s.phone, s.category_id, s.salary, c.name as category_name, s.pin_code
         FROM staff s 
         LEFT JOIN staff_categories c ON s.category_id = c.id"
    ).map_err(|e| e.to_string())?;
    
    let staff_iter = stmt.query_map([], |row| {
        Ok(StaffMember {
            id: row.get(0)?,
            name: row.get(1)?,
            role: row.get(2).unwrap_or(None),
            phone: row.get(3).unwrap_or_default(),
            category_id: row.get(4).unwrap_or(None),
            salary: row.get(5).unwrap_or(0.0),
            category_name: row.get(6).unwrap_or(None),
            pin_code: row.get(7).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;

    let mut staff = Vec::new();
    for person in staff_iter {
        staff.push(person.map_err(|e| e.to_string())?);
    }
    Ok(staff)
}

/// Lean staff listing (id, name, role, category) for clock-in and delivery
/// assignment dropdowns. Omits salary and pin_code, which are admin-only data.
#[derive(serde::Serialize)]
pub struct StaffDropdown {
    pub id: i32,
    pub name: String,
    pub role: Option<String>,
    pub category_id: Option<i32>,
    pub category_name: Option<String>,
    pub salary: Option<f64>,
}

#[tauri::command]
pub fn get_staff_dropdown() -> Result<Vec<StaffDropdown>, String> {
    let conn = get_conn()?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT,
            phone TEXT
        )", []
    ).map_err(|e| e.to_string())?;

    conn.execute("ALTER TABLE staff ADD COLUMN category_id INTEGER", []).ok();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS staff_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )", []
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.role, s.category_id, c.name as category_name, s.salary
         FROM staff s
         LEFT JOIN staff_categories c ON s.category_id = c.id
         ORDER BY s.name"
    ).map_err(|e| e.to_string())?;

    let dropdown_iter = stmt.query_map([], |row| {
        Ok(StaffDropdown {
            id: row.get(0)?,
            name: row.get(1)?,
            role: row.get(2).unwrap_or(None),
            category_id: row.get(3).unwrap_or(None),
            category_name: row.get(4).unwrap_or(None),
            salary: row.get(5).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for item in dropdown_iter {
        result.push(item.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn get_order_takers() -> Result<Vec<StaffDropdown>, String> {
    let conn = get_conn()?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT,
            phone TEXT
        )", []
    ).map_err(|e| e.to_string())?;

    conn.execute("ALTER TABLE staff ADD COLUMN category_id INTEGER", []).ok();
    conn.execute("ALTER TABLE staff ADD COLUMN status TEXT DEFAULT 'Active'", []).ok();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS staff_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )", []
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, s.role, s.category_id, c.name as category_name, s.salary
         FROM staff s
         LEFT JOIN staff_categories c ON s.category_id = c.id
         WHERE COALESCE(s.status, 'Active') = 'Active' AND c.name LIKE 'Order Taker%'
         ORDER BY s.name"
    ).map_err(|e| e.to_string())?;

    let dropdown_iter = stmt.query_map([], |row| {
        Ok(StaffDropdown {
            id: row.get(0)?,
            name: row.get(1)?,
            role: row.get(2).unwrap_or(None),
            category_id: row.get(3).unwrap_or(None),
            category_name: row.get(4).unwrap_or(None),
            salary: row.get(5).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for item in dropdown_iter {
        result.push(item.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

#[tauri::command]
pub fn update_order_taker(order_id: i32, staff_id: Option<i32>, staff_name: Option<String>) -> Result<String, String> {
    let conn = get_conn()?;

    conn.execute(
        "UPDATE orders SET order_taker_id = ?1, order_taker_name = ?2 WHERE id = ?3",
        rusqlite::params![&staff_id, &staff_name, &order_id]
    ).map_err(|e| e.to_string())?;
    Ok("Order taker updated".into())
}

#[tauri::command]
pub fn add_staff(name: String, category_id: Option<i32>, phone: String, salary: f64, pin_code: String) -> Result<String, String> {
    let conn = get_conn()?;
    
    // Initialize if needed
    conn.execute("ALTER TABLE staff ADD COLUMN category_id INTEGER", []).ok();
    conn.execute("ALTER TABLE staff ADD COLUMN salary REAL", []).ok();
    conn.execute("ALTER TABLE staff ADD COLUMN pin_code TEXT", []).ok();
    
    conn.execute(
        "INSERT INTO staff (name, role, phone, category_id, salary, pin_code) VALUES (?1, 'Staff', ?2, ?3, ?4, ?5)",
        rusqlite::params![name, phone, category_id, salary, pin_code]
    ).map_err(|e| e.to_string())?;
    Ok("Staff added".into())
}

#[tauri::command]
pub fn delete_staff(id: i32) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    // Delete dependent rows first (attendance has an FK to staff; payouts,
    // advances and payroll records are orphan-prone) so the staff row can be
    // removed atomically. Linked expense entries for this staff's advances and
    // payouts are removed too, otherwise the expenses ledger would keep rows
    // pointing at financial records that no longer exist.
    tx.execute("DELETE FROM expenses WHERE reference_type = 'salary_advance' AND reference_id IN (SELECT id FROM advance_salaries WHERE staff_id = ?1)", [&id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM expenses WHERE reference_type = 'payroll' AND reference_id IN (SELECT id FROM payroll_records WHERE staff_id = ?1)", [&id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM staff_attendance WHERE staff_id = ?1", [&id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM salary_payouts WHERE staff_id = ?1", [&id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM advance_salaries WHERE staff_id = ?1", [&id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM payroll_records WHERE staff_id = ?1", [&id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM staff WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok("Staff deleted".into())
}

#[tauri::command]
pub fn update_staff(id: i32, name: String, category_id: Option<i32>, phone: String, salary: f64, pin_code: String) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute("ALTER TABLE staff ADD COLUMN pin_code TEXT", []).ok();
    conn.execute(
        "UPDATE staff SET name = ?1, phone = ?2, category_id = ?3, salary = ?4, pin_code = ?5 WHERE id = ?6",
        rusqlite::params![name, phone, category_id, salary, pin_code, id]
    ).map_err(|e| e.to_string())?;
    Ok("Staff updated".into())
}

#[derive(serde::Serialize)]
pub struct AttendanceRecord {
    pub id: i32,
    pub staff_id: i32,
    pub staff_name: String,
    pub date: String,
    pub clock_in: String,
    pub clock_out: Option<String>,
}

#[tauri::command]
pub fn clock_in_out(staff_id: i32) -> Result<String, String> {
    let conn = get_conn()?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS staff_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            clock_in TEXT NOT NULL,
            clock_out TEXT,
            FOREIGN KEY(staff_id) REFERENCES staff(id)
        )", []
    ).map_err(|e| e.to_string())?;

    // Find staff by id
    let mut stmt = conn.prepare("SELECT id, name FROM staff WHERE id = ?1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([&staff_id]).map_err(|e| e.to_string())?;
    
    let (_staff_id, name): (i32, String) = if let Some(row) = rows.next().unwrap_or(None) {
        (row.get(0).map_err(|e| e.to_string())?, row.get(1).map_err(|e| e.to_string())?)
    } else {
        return Err("Invalid Staff ID".into());
    };

    let today = date_now(&conn);
    
    // Check if clocked in today without clocking out
    let mut stmt = conn.prepare("SELECT id FROM staff_attendance WHERE staff_id = ?1 AND date = ?2 AND clock_out IS NULL").map_err(|e| e.to_string())?;
    let mut rows = stmt.query(rusqlite::params![staff_id, today]).map_err(|e| e.to_string())?;
    
    if let Some(row) = rows.next().unwrap_or(None) {
        let record_id: i32 = row.get(0).map_err(|e| e.to_string())?;
        // Clock out
        conn.execute(
            "UPDATE staff_attendance SET clock_out = datetime('now', 'localtime') WHERE id = ?1",
            rusqlite::params![record_id]
        ).map_err(|e| e.to_string())?;
        Ok(format!("{} clocked out successfully", name))
    } else {
        // Clock in. First close any dangling open record left over from a
        // previous day (e.g. a shift that never clocked out), so it cannot stay
        // "open" forever and skew the attendance history.
        conn.execute(
            "UPDATE staff_attendance SET clock_out = date || ' 23:59:59' WHERE staff_id = ?1 AND clock_out IS NULL AND date != ?2",
            rusqlite::params![staff_id, today]
        ).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO staff_attendance (staff_id, date, clock_in) VALUES (?1, ?2, datetime('now', 'localtime'))",
            rusqlite::params![staff_id, today]
        ).map_err(|e| e.to_string())?;
        Ok(format!("{} clocked in successfully", name))
    }
}

#[tauri::command]
pub fn get_attendance(date: String) -> Result<Vec<AttendanceRecord>, String> {
    let conn = get_conn()?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS staff_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            clock_in TEXT NOT NULL,
            clock_out TEXT,
            FOREIGN KEY(staff_id) REFERENCES staff(id)
        )", []
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT a.id, a.staff_id, s.name, a.date, a.clock_in, a.clock_out 
         FROM staff_attendance a 
         JOIN staff s ON a.staff_id = s.id 
         WHERE a.date = ?1 
         ORDER BY a.clock_in DESC"
    ).map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([&date], |row| {
        Ok(AttendanceRecord {
            id: row.get(0)?,
            staff_id: row.get(1)?,
            staff_name: row.get(2)?,
            date: row.get(3)?,
            clock_in: row.get(4)?,
            clock_out: row.get(5).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;
    
    let mut records = Vec::new();
    for rec in iter {
        records.push(rec.map_err(|e| e.to_string())?);
    }
    Ok(records)
}

#[derive(serde::Serialize)]
pub struct Customer {
    pub id: i32,
    pub name: String,
    pub phone: String,
    pub visits: i32,
}

#[tauri::command]
pub fn get_customers() -> Result<Vec<Customer>, String> {
    let conn = get_conn()?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT UNIQUE,
            visits INTEGER DEFAULT 0
        )", []
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, name, phone, visits FROM customers").map_err(|e| e.to_string())?;
    let customer_iter = stmt.query_map([], |row| {
        Ok(Customer {
            id: row.get(0)?,
            name: row.get(1)?,
            phone: row.get(2).unwrap_or_default(),
            visits: row.get(3).unwrap_or(0),
        })
    }).map_err(|e| e.to_string())?;

    let mut customers = Vec::new();
    for c in customer_iter {
        customers.push(c.map_err(|e| e.to_string())?);
    }
    Ok(customers)
}

#[tauri::command]
pub fn add_customer(name: String, phone: String) -> Result<String, String> {
    let conn = get_conn()?;
    // We start them at 0 visits. Later we will increment this on checkout!
    conn.execute(
        "INSERT INTO customers (name, phone, visits) VALUES (?1, ?2, 0)",
        [&name, &phone]
    ).map_err(|e| e.to_string())?;
    Ok("Customer added".into())
}

#[tauri::command]
pub fn resolve_customer(name: Option<String>, phone: Option<String>, address: Option<String>) -> Result<i32, String> {
    let conn = get_conn()?;
    
    let n = name.unwrap_or_default().trim().to_string();
    let p = phone.unwrap_or_default().trim().to_string();
    let a = address.unwrap_or_default().trim().to_string();

    if p.is_empty() && n.is_empty() {
        return Err("Name or Phone is required".into());
    }

    // 1. Try to find by phone if provided
    if !p.is_empty() {
        if let Ok(id) = conn.query_row("SELECT id FROM customers WHERE phone = ?1", [&p], |row| row.get(0)) {
            if !a.is_empty() {
                let _ = conn.execute("UPDATE customers SET address = ?1 WHERE id = ?2", rusqlite::params![&a, &id]);
            }
            return Ok(id);
        }
    }

    // 2. Try to find by name (even when a phone was supplied but not found, so
    // we don't fragment a customer's loyalty/visit history into duplicates).
    if !n.is_empty() {
        if let Ok(id) = conn.query_row("SELECT id FROM customers WHERE name = ?1", [&n], |row| row.get(0)) {
            if !p.is_empty() {
                let _ = conn.execute("UPDATE customers SET phone = ?1 WHERE id = ?2", rusqlite::params![&p, &id]);
            }
            if !a.is_empty() {
                let _ = conn.execute("UPDATE customers SET address = ?1 WHERE id = ?2", rusqlite::params![&a, &id]);
            }
            return Ok(id);
        }
    }

    // 3. Create new customer
    conn.execute(
        "INSERT INTO customers (name, phone, address, visits) VALUES (?1, ?2, ?3, 0)",
        rusqlite::params![&n, &p, &a]
    ).map_err(|e| e.to_string())?;
    
    let new_id = conn.last_insert_rowid() as i32;
    Ok(new_id)
}

#[tauri::command]
pub fn delete_customer(id: i32) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute("DELETE FROM customers WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    Ok("Customer deleted".into())
}

#[derive(serde::Serialize)]
pub struct Expense {
    pub id: i32,
    pub amount: f64,
    pub date: String,
    pub category: String,
    pub note: Option<String>,
    pub reference_type: Option<String>,
}

#[tauri::command]
pub fn get_expenses() -> Result<Vec<Expense>, String> {
    let conn = get_conn()?;
    
    // Ensure table exists just in case
    conn.execute(
        "CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            category TEXT NOT NULL,
            note TEXT
        )", []
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, amount, date, category, note, reference_type FROM expenses ORDER BY date DESC, id DESC").map_err(|e| e.to_string())?;
    let expense_iter = stmt.query_map([], |row| {
        Ok(Expense {
            id: row.get(0)?,
            amount: row.get(1)?,
            date: row.get(2)?,
            category: row.get(3)?,
            note: row.get(4).unwrap_or(None),
            reference_type: row.get(5).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;

    let mut expenses = Vec::new();
    for e in expense_iter {
        expenses.push(e.map_err(|e| e.to_string())?);
    }
    Ok(expenses)
}

#[tauri::command]
pub fn add_expense(amount: f64, date: String, category: String, note: Option<String>) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute(
        "INSERT INTO expenses (amount, date, category, note) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![amount, date, category, note]
    ).map_err(|e| e.to_string())?;
    Ok("Expense added".into())
}

#[tauri::command]
pub fn delete_expense(id: i32) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    
    // Fetch the expense details (including its reference) before deleting it.
    let mut stmt = conn_guard.prepare("SELECT amount, date, note, reference_type, reference_id FROM expenses WHERE id = ?1").map_err(|e| e.to_string())?;
    let expense_data = stmt.query_row([&id], |row| {
        Ok((
            row.get::<_, f64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<i64>>(4)?,
        ))
    });
    drop(stmt);

    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM expenses WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;

    if let Ok((amount, date, _note, reference_type, reference_id)) = expense_data {
        match (reference_type.as_deref(), reference_id) {
            // Inventory purchases are managed from the Inventory page. Deleting
            // them here would silently desync the stock ledger, so refuse and
            // ask the user to remove the entry from Inventory instead (which
            // deletes this expense automatically).
            (Some("inventory_purchase"), _) => {
                return Err("This expense is linked to an inventory purchase. Please delete the purchase from the Inventory page first — it will be removed from Expenses automatically.".into());
            }
            // Advance salary: delete the matching advance so it is no longer
            // shown as outstanding / deductible on the next payroll.
            (Some("salary_advance"), Some(advance_id)) => {
                tx.execute("DELETE FROM advance_salaries WHERE id = ?1", [&advance_id]).map_err(|e| e.to_string())?;
            }
            // New-style payroll expense: cascade the reversal so the payroll
            // record returns to Pending and its advance deductions are restored.
            (Some("payroll"), Some(record_id)) => {
                if let Ok((staff_id, advance_deduction)) = tx.query_row(
                    "SELECT staff_id, COALESCE(advance_deduction, 0.0) FROM payroll_records WHERE id = ?1",
                    [&record_id],
                    |row| Ok((row.get::<_, i32>(0)?, row.get::<_, f64>(1)?))
                ) {
                    if advance_deduction > 0.0 {
                        restore_advances(&tx, staff_id, advance_deduction)?;
                    }
                    tx.execute("DELETE FROM salary_payouts WHERE staff_id = ?1 AND date = ?2", rusqlite::params![staff_id, date]).map_err(|e| e.to_string())?;
                    tx.execute(
                        "UPDATE payroll_records SET status = 'Pending', payroll_id = NULL, paid_at = NULL, updated_at = datetime('now', 'localtime') WHERE id = ?1",
                        [&record_id]
                    ).map_err(|e| e.to_string())?;
                }
            }
            // Legacy rows: fall back to the old note-based matching so nothing
            // silently loses its payout/advance history.
            (None, _) => {
                let note = _note.unwrap_or_default();
                if note.starts_with("Payroll: ") {
                    // Batch payout: one expense per staff member, note carries the name.
                    let staff_name = note.trim_start_matches("Payroll: ");
                    let mut stmt = tx.prepare("SELECT id FROM staff WHERE name = ?1").map_err(|e| e.to_string())?;
                    if let Ok(staff_id) = stmt.query_row([&staff_name], |row| row.get::<_, i32>(0)) {
                        tx.execute(
                            "DELETE FROM salary_payouts WHERE staff_id = ?1 AND date = ?2",
                            rusqlite::params![staff_id, date]
                        ).map_err(|e| e.to_string())?;
                    }
                } else if note.starts_with("Payroll Processed") {
                    // Single payout: note has no staff name, so match the payout row by
                    // date and the net amount that was recorded as an expense.
                    tx.execute(
                        "DELETE FROM salary_payouts WHERE date = ?1 AND amount = ?2",
                        rusqlite::params![date, amount]
                    ).map_err(|e| e.to_string())?;
                } else if note.starts_with("Advance Salary: ") {
                    // Advance salary: delete the matching advance so it is no longer
                    // shown as outstanding / deductible on the next payroll.
                    let rest = note.trim_start_matches("Advance Salary: ");
                    let staff_name = rest.split(" - ").next().unwrap_or("");
                    let mut stmt = tx.prepare("SELECT id FROM staff WHERE name = ?1").map_err(|e| e.to_string())?;
                    if let Ok(staff_id) = stmt.query_row([&staff_name], |row| row.get::<_, i32>(0)) {
                        tx.execute(
                            "DELETE FROM advance_salaries WHERE staff_id = ?1 AND date = ?2 AND amount = ?3",
                            rusqlite::params![staff_id, date, amount]
                        ).map_err(|e| e.to_string())?;
                    }
                }
            }
            _ => {}
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok("Expense deleted".into())
}


// --- DASHBOARD ANALYTICS ---

#[derive(serde::Serialize)]
pub struct DashboardStats {
    pub total_revenue: f64,
    pub total_expenses: f64,
    pub net_profit: f64,
    pub total_orders: i32,
    pub today_revenue: f64,
    pub today_expenses: f64,
    pub today_profit: f64,
    pub today_orders: i32,
}

#[tauri::command]
pub fn get_dashboard_stats() -> Result<DashboardStats, String> {
    let conn = get_conn()?;

    // Apply migrations for orders timestamps
    conn.execute(
        "CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            table_id INTEGER,
            table_number INTEGER, 
            status TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            closed_at TEXT
        )", []
    ).ok();


    // 1. Current Month Revenue
    let total_revenue_query = "
        SELECT COALESCE(SUM(COALESCE(subtotal, 0.0) + COALESCE(tax_amount, 0.0) + COALESCE(service_charge_amount, 0.0) + COALESCE(delivery_fee, 0.0) - COALESCE(discount_amount, 0.0)), 0)
        FROM orders
        WHERE status = 'Closed' 
        AND strftime('%Y-%m', closed_at) = strftime('%Y-%m', 'now', 'localtime')
    ";
    let total_revenue: f64 = conn.query_row(total_revenue_query, [], |row| row.get(0)).unwrap_or(0.0);

    // 2. Current Month Expenses
    let total_expenses_query = "
        SELECT COALESCE(SUM(amount), 0)
        FROM expenses
        WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime') OR date LIKE strftime('%Y-%m', 'now', 'localtime') || '%'
    ";
    let total_expenses: f64 = conn.query_row(total_expenses_query, [], |row| row.get(0)).unwrap_or(0.0);

    // 3. Current Month Orders
    let total_orders_query = "
        SELECT COUNT(id)
        FROM orders
        WHERE status = 'Closed'
        AND strftime('%Y-%m', closed_at) = strftime('%Y-%m', 'now', 'localtime')
    ";
    let total_orders: i32 = conn.query_row(total_orders_query, [], |row| row.get(0)).unwrap_or(0);

    // 4. Today's Revenue
    let today_revenue_query = "
        SELECT COALESCE(SUM(COALESCE(subtotal, 0.0) + COALESCE(tax_amount, 0.0) + COALESCE(service_charge_amount, 0.0) + COALESCE(delivery_fee, 0.0) - COALESCE(discount_amount, 0.0)), 0)
        FROM orders
        WHERE status = 'Closed' 
        AND date(closed_at) = date('now', 'localtime')
    ";
    let today_revenue: f64 = conn.query_row(today_revenue_query, [], |row| row.get(0)).unwrap_or(0.0);

    // 5. Today's Expenses
    let today_expenses_query = "
        SELECT COALESCE(SUM(amount), 0)
        FROM expenses
        WHERE date(date) = date('now', 'localtime') OR date LIKE date('now', 'localtime') || '%'
    ";
    let today_expenses: f64 = conn.query_row(today_expenses_query, [], |row| row.get(0)).unwrap_or(0.0);

    // 6. Today's Orders
    let today_orders_query = "
        SELECT COUNT(id)
        FROM orders
        WHERE status = 'Closed'
        AND date(closed_at) = date('now', 'localtime')
    ";
    let today_orders: i32 = conn.query_row(today_orders_query, [], |row| row.get(0)).unwrap_or(0);

    Ok(DashboardStats {
        total_revenue,
        total_expenses,
        net_profit: total_revenue - total_expenses,
        total_orders,
        today_revenue,
        today_expenses,
        today_profit: today_revenue - today_expenses,
        today_orders,
    })
}

#[derive(serde::Serialize)]
pub struct RevenueOverview {
    pub name: String,
    pub revenue: f64,
}

#[tauri::command]
pub fn get_revenue_overview() -> Result<Vec<RevenueOverview>, String> {
    let conn = get_conn()?;

    // Last 7 days revenue. Use the stored totals (same formula as the
    // dashboard) so tax/service charge/delivery fee are included and discount
    // applied, matching every other revenue screen.
    let query = "
        SELECT 
            strftime('%w', closed_at) as day_of_week,
            COALESCE(SUM(COALESCE(o.subtotal,0) + COALESCE(o.tax_amount,0) + COALESCE(o.service_charge_amount,0) + COALESCE(o.delivery_fee,0) - COALESCE(o.discount_amount,0)), 0) as revenue
        FROM orders o
        WHERE o.status = 'Closed' 
        AND closed_at >= date('now', '-6 days', 'localtime')
        GROUP BY date(closed_at)
        ORDER BY date(closed_at) ASC
    ";

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    
    let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    
    let mut overview = Vec::new();
    let rows = stmt.query_map([], |row| {
        let dow_str: String = row.get(0)?;
        let dow_idx: usize = dow_str.parse().unwrap_or(0);
        let revenue: f64 = row.get(1)?;
        Ok(RevenueOverview {
            name: days[dow_idx].to_string(),
            revenue,
        })
    }).map_err(|e| e.to_string())?;

    for row in rows {
        if let Ok(r) = row {
            overview.push(r);
        }
    }

    Ok(overview)
}

#[derive(serde::Serialize)]
pub struct TopSellingItem {
    pub id: i32,
    pub item: String,
    pub sold: i32,
    pub revenue: f64,
    pub image: String,
}

#[tauri::command]
pub fn get_top_selling_items() -> Result<Vec<TopSellingItem>, String> {
    let conn = get_conn()?;
    let query = "
        SELECT 
            oi.item_id,
            oi.name,
            SUM(oi.quantity) as sold,
            SUM(oi.price * oi.quantity) as revenue
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status = 'Closed'
        GROUP BY oi.item_id, oi.name
        ORDER BY sold DESC
        LIMIT 5
    ";

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    
    let items = stmt.query_map([], |row| {
        Ok(TopSellingItem {
            id: row.get(0)?,
            item: row.get(1)?,
            sold: row.get(2)?,
            revenue: row.get(3)?,
            image: "🍔".to_string(), // Default emoji
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    Ok(items)
}

#[tauri::command]
pub fn get_recent_expenses() -> Result<Vec<Expense>, String> {
    let conn = get_conn()?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount REAL NOT NULL,
            date TEXT NOT NULL,
            category TEXT NOT NULL,
            note TEXT
        )", []
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, amount, date, category, note, reference_type FROM expenses ORDER BY date DESC, id DESC LIMIT 5").map_err(|e| e.to_string())?;
    let expense_iter = stmt.query_map([], |row| {
        Ok(Expense {
            id: row.get(0)?,
            amount: row.get(1)?,
            date: row.get(2)?,
            category: row.get(3)?,
            note: row.get(4).unwrap_or(None),
            reference_type: row.get(5).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;

    let mut expenses = Vec::new();
    for e in expense_iter {
        expenses.push(e.map_err(|e| e.to_string())?);
    }
    Ok(expenses)
}

#[derive(serde::Serialize)]
pub struct TodaySale {
    pub id: String,
    pub order_id: i32,
    pub table: String,
    pub customer: String,
    pub time: String,
    pub amount: f64,
    pub status: String,
}

#[tauri::command]
pub fn get_todays_sales(client_date: String) -> Result<Vec<TodaySale>, String> {
    let conn = get_conn()?;
    let query = "
        SELECT 
            o.id,
            o.table_number,
            o.status,
            COALESCE(COALESCE(SUM(oi.price * oi.quantity), 0.0) + COALESCE(o.tax_amount, 0.0) + COALESCE(o.service_charge_amount, 0.0) + COALESCE(o.delivery_fee, 0.0) - COALESCE(o.discount_amount, 0.0), 0) as amount,
            time(o.closed_at) as closed_time
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.status IN ('Closed', 'Open', 'Delivery Pending')
        AND date(COALESCE(o.closed_at, o.created_at, datetime('now', 'localtime'))) = ?1
        GROUP BY o.id
        ORDER BY CASE WHEN o.status = 'Open' THEN 1 ELSE 2 END, o.id DESC
        LIMIT 5
    ";

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    
    let sales = stmt.query_map([&client_date], |row| {
        let order_id: i32 = row.get(0)?;
        let table_num: i32 = row.get(1)?;
        let status: String = row.get(2)?;
        let amount: f64 = row.get(3)?;
        let time: Option<String> = row.get(4).unwrap_or(None);

        Ok(TodaySale {
            id: format!("#ORD-{:04}", order_id),
            order_id,
            table: if table_num == 0 { "Walk-in".to_string() } else { format!("Table {:02}", table_num) },
            customer: "Walk-in".to_string(), // Later we can join with customers table if order has customer_id
            time: time.unwrap_or_else(|| "N/A".into()),
            amount,
            status,
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    Ok(sales)
}

// --- CASHIER DASHBOARD & SHIFTS ---

#[derive(serde::Serialize)]
pub struct Shift {
    pub id: i32,
    pub start_time: String,
    pub end_time: Option<String>,
    pub opening_cash: f64,
    pub closing_cash: Option<f64>,
    pub status: String,
}

#[tauri::command]
pub fn get_current_shift() -> Result<Option<Shift>, String> {
    let conn = get_conn()?;
    
    let mut stmt = conn.prepare("SELECT id, start_time, end_time, opening_cash, closing_cash, status FROM shifts WHERE status = 'Open' ORDER BY id DESC LIMIT 1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query_map([], |row| {
        Ok(Shift {
            id: row.get(0)?,
            start_time: row.get(1)?,
            end_time: row.get(2).unwrap_or(None),
            opening_cash: row.get(3)?,
            closing_cash: row.get(4).unwrap_or(None),
            status: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    if let Some(row) = rows.next() {
        return Ok(Some(row.map_err(|e| e.to_string())?));
    }
    
    Ok(None)
}

#[tauri::command]
pub fn start_shift(opening_cash: f64) -> Result<String, String> {
    let conn = get_conn()?;
    
    // Check if one is already open
    let count: i32 = conn.query_row("SELECT COUNT(*) FROM shifts WHERE status = 'Open'", [], |row| row.get(0)).unwrap_or(0);
    if count > 0 {
        return Err("A shift is already open.".into());
    }

    conn.execute(
        "INSERT INTO shifts (opening_cash, status) VALUES (?1, 'Open')",
        [&opening_cash],
    ).map_err(|e| e.to_string())?;

    Ok("Shift started successfully".into())
}

#[tauri::command]
pub fn end_shift(shift_id: i32, closing_cash: f64) -> Result<String, String> {
    let conn = get_conn()?;
    
    conn.execute(
        "UPDATE shifts SET closing_cash = ?1, end_time = datetime('now', 'localtime'), status = 'Closed' WHERE id = ?2",
        rusqlite::params![closing_cash, shift_id],
    ).map_err(|e| e.to_string())?;

    Ok("Shift ended successfully".into())
}

#[derive(serde::Serialize)]
pub struct DetailedTableStatus {
    pub id: i32,
    pub table_id: i32,
    pub table_number: i32,
    pub status: String,
    pub active_order_id: Option<i32>,
    pub active_order_total: Option<f64>,
    pub elapsed_minutes: Option<i32>,
    pub category_name: Option<String>,
}

#[tauri::command]
pub fn get_detailed_table_statuses() -> Result<Vec<DetailedTableStatus>, String> {
    let conn = get_conn()?;
    
    let query = "
        SELECT 
            t.id, 
            t.table_number, 
            t.status,
            o.id as active_order_id,
            (COALESCE((SELECT SUM(price * quantity) FROM order_items WHERE order_id = o.id), 0.0) + COALESCE(o.tax_amount, 0.0) + COALESCE(o.service_charge_amount, 0.0) - COALESCE(o.discount_amount, 0.0)) as active_order_total,
            CAST(round((julianday(datetime('now', 'localtime')) - julianday(o.created_at)) * 24 * 60) AS INTEGER) as elapsed_minutes,
            c.name as category_name
        FROM table_status t
        LEFT JOIN table_categories c ON t.category_id = c.id
        LEFT JOIN (
            SELECT o1.* FROM orders o1
            JOIN (SELECT table_id, MIN(id) as id FROM orders WHERE status = 'Open' GROUP BY table_id) o2
            ON o1.id = o2.id
        ) o ON o.table_id = t.id AND o.status = 'Open'
        ORDER BY c.name, t.table_number
    ";

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    
    let tables = stmt.query_map([], |row| {
        let active_order_total: Option<f64> = row.get(4).unwrap_or(None);
        let elapsed_minutes: Option<i32> = row.get(5).unwrap_or(None);
        
        Ok(DetailedTableStatus {
            id: row.get(0)?,
            table_id: row.get(0)?, // Same as id
            table_number: row.get(1)?,
            status: row.get(2)?,
            active_order_id: row.get(3).unwrap_or(None),
            active_order_total,
            elapsed_minutes,
            category_name: row.get(6).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?
    .filter_map(Result::ok)
    .collect();

    Ok(tables)
}

#[derive(serde::Serialize)]
pub struct CashierStats {
    pub todays_sales: f64,
    pub total_orders: i32,
    pub completed_orders: i32,
    pub pending_orders: i32,
    pub avg_order_value: f64,
    pub total_tax: f64,
}

#[tauri::command]
pub fn get_cashier_dashboard_stats(client_date: String) -> Result<CashierStats, String> {
    let conn = get_conn()?;

    // 2. Sales for today (full paid total: items + tax + service charge + delivery - discount)
    let sales_query = "
        SELECT COALESCE(SUM(COALESCE(o.subtotal, 0.0) + COALESCE(o.tax_amount, 0.0) + COALESCE(o.service_charge_amount, 0.0) + COALESCE(o.delivery_fee, 0.0) - COALESCE(o.discount_amount, 0.0)), 0)
        FROM orders o
        WHERE o.status = 'Closed' 
        AND date(o.closed_at) = ?1
    ";
    let todays_sales: f64 = conn.query_row(sales_query, [&client_date], |row| row.get(0)).unwrap_or(0.0);

    // Get actual tax collected from closed orders (stored at checkout)
    let total_tax: f64 = conn.query_row(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM orders WHERE status = 'Closed' AND date(closed_at) = ?1",
        [&client_date], |row| row.get(0)
    ).unwrap_or(0.0);

    // 3. Orders for today
    let completed_orders: i32 = conn.query_row(
        "SELECT COUNT(id) FROM orders WHERE status = 'Closed' AND date(closed_at) = ?1", 
        [&client_date], |row| row.get(0)
    ).unwrap_or(0);

    let pending_orders: i32 = conn.query_row(
        "SELECT COUNT(id) FROM orders WHERE status = 'Open' AND date(created_at) = ?1", 
        [&client_date], |row| row.get(0)
    ).unwrap_or(0);

    let total_orders = completed_orders + pending_orders;

    let avg_order_value = if completed_orders > 0 {
        todays_sales / (completed_orders as f64)
    } else {
        0.0
    };

    Ok(CashierStats {
        todays_sales,
        total_orders,
        completed_orders,
        pending_orders,
        avg_order_value,
        total_tax,
    })
}

fn date_now(conn: &rusqlite::Connection) -> String {
    conn.query_row("SELECT date('now', 'localtime')", [], |row| row.get(0)).unwrap_or("".to_string())
}

#[derive(serde::Serialize)]
pub struct PayrollSummary {
    pub staff_id: i32,
    pub name: String,
    pub category_name: Option<String>,
    pub base_salary: f64,
    pub days_present: i32,
    pub advance_balance: f64,
    pub paid_amount: Option<f64>,
}

#[tauri::command]
pub fn get_payroll_summary(start_date: String, end_date: String) -> Result<Vec<PayrollSummary>, String> {
    let conn = get_conn()?;
    
    // We get distinct days a staff was present within the date range, plus their pending advance balance
    let mut stmt = conn.prepare(
        "SELECT s.id, s.name, c.name, s.salary, COUNT(DISTINCT a.date) as days_present,
         COALESCE((SELECT SUM(amount - COALESCE(deducted_amount, 0)) FROM advance_salaries WHERE staff_id = s.id AND is_deducted = 0), 0.0) as advance_balance,
         (SELECT amount FROM salary_payouts WHERE staff_id = s.id AND date >= ?1 AND date <= ?2 ORDER BY date DESC LIMIT 1) as paid_amount
         FROM staff s
         LEFT JOIN staff_categories c ON s.category_id = c.id
         LEFT JOIN staff_attendance a ON s.id = a.staff_id AND a.date >= ?1 AND a.date <= ?2
         GROUP BY s.id"
    ).map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([&start_date, &end_date], |row| {
        Ok(PayrollSummary {
            staff_id: row.get(0)?,
            name: row.get(1)?,
            category_name: row.get(2).unwrap_or(None),
            base_salary: row.get(3).unwrap_or(0.0),
            days_present: row.get(4).unwrap_or(0),
            advance_balance: row.get(5).unwrap_or(0.0),
            paid_amount: row.get(6).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;
    
    let mut summary = Vec::new();
    for rec in iter {
        match rec {
            Ok(s) => summary.push(s),
            Err(e) => return Err(format!("Error mapping row: {}", e)),
        }
    }
    Ok(summary)
}

#[derive(serde::Serialize, Debug)]
pub struct SalaryPayout {
    pub id: i32,
    pub staff_name: String,
    pub amount: f64,
    pub bonus: f64,
    pub deduction: f64,
    pub advance_deduction: f64,
    pub date: String,
    pub payout_type: String,
    pub note: Option<String>,
}

#[tauri::command]
pub fn process_payout(staff_id: i32, amount: f64, bonus: f64, deduction: f64, advance_deduction: f64, date: String) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    
    if !amount.is_finite() || !bonus.is_finite() || !deduction.is_finite() || !advance_deduction.is_finite() {
        return Err("Invalid payout amount.".into());
    }
    
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;
    
    // Mark only as much advance as was actually outstanding as deducted; use the
    // returned (capped) total so an over-large advance_deduction cannot over-charge.
    let actually_deducted = deduct_advances(&tx, staff_id, advance_deduction)?;
    let net_amount = amount + bonus - deduction - actually_deducted;
    if net_amount < 0.0 {
        return Err(format!(
            "Net payout would be negative ({:.2}). Deductions exceed the salary amount.",
            net_amount
        ));
    }

    tx.execute(
        "INSERT INTO salary_payouts (staff_id, amount, bonus, deduction, advance_deduction, date) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![staff_id, net_amount, bonus, deduction, actually_deducted, date]
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO expenses (amount, date, category, note) VALUES (?1, ?2, 'Salaries', 'Payroll Processed')",
        rusqlite::params![net_amount, date]
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    
    Ok("Payout processed".into())
}

/// Marks advances as deducted, oldest first, up to `amount`. Partial deduction
/// is tracked per-advance via `deducted_amount`; an advance is only flagged
/// fully deducted once its balance reaches zero.
fn deduct_advances(tx: &rusqlite::Transaction, staff_id: i32, mut amount: f64) -> std::result::Result<f64, String> {
    if amount <= 0.0 {
        return Ok(0.0);
    }
    let mut stmt = tx.prepare(
        "SELECT id, amount, COALESCE(deducted_amount, 0.0) FROM advance_salaries WHERE staff_id = ?1 AND is_deducted = 0 ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let rows: Vec<(i32, f64, f64)> = stmt.query_map([&staff_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    drop(stmt);

    let mut deducted_total = 0.0;
    for (id, advance_amount, already_deducted) in rows {
        if amount <= 0.001 { break; }
        let available = advance_amount - already_deducted;
        if available <= 0.001 { continue; }
        let to_deduct = if available > amount { amount } else { available };
        let new_deducted = already_deducted + to_deduct;
        let fully_deducted = if new_deducted >= advance_amount - 0.001 { 1 } else { 0 };
        tx.execute(
            "UPDATE advance_salaries SET deducted_amount = ?1, is_deducted = ?2 WHERE id = ?3",
            rusqlite::params![new_deducted, fully_deducted, id]
        ).map_err(|e| e.to_string())?;
        amount -= to_deduct;
        deducted_total += to_deduct;
    }
    Ok(deducted_total)
}

#[tauri::command]
pub fn get_payout_history(start_date: String, end_date: String) -> Result<Vec<SalaryPayout>, String> {
    let conn = get_conn()?;
    let end_date_full = format!("{}T23:59:59.999Z", end_date);
    
    conn.execute("ALTER TABLE salary_payouts ADD COLUMN bonus REAL", []).ok();
    conn.execute("ALTER TABLE salary_payouts ADD COLUMN deduction REAL", []).ok();
    conn.execute("ALTER TABLE salary_payouts ADD COLUMN advance_deduction REAL", []).ok();

    let mut stmt = conn.prepare(
        "SELECT p.id, s.name, p.amount, p.bonus, p.deduction, p.advance_deduction, p.date, 'Salary' as payout_type, NULL as note
         FROM salary_payouts p
         JOIN staff s ON p.staff_id = s.id
         WHERE p.date >= ?1 AND p.date <= ?2
         UNION ALL
         SELECT a.id + 1000000, s.name, a.amount, 0.0, 0.0, 0.0, a.date, 'Advance' as payout_type, a.note
         FROM advance_salaries a
         JOIN staff s ON a.staff_id = s.id
         WHERE a.date >= ?1 AND a.date <= ?2
         ORDER BY date DESC"
    ).map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([&start_date, &end_date_full], |row| {
        Ok(SalaryPayout {
            id: row.get(0)?,
            staff_name: row.get(1)?,
            amount: row.get(2).unwrap_or(0.0),
            bonus: row.get(3).unwrap_or(0.0),
            deduction: row.get(4).unwrap_or(0.0),
            advance_deduction: row.get(5).unwrap_or(0.0),
            date: row.get(6)?,
            payout_type: row.get(7)?,
            note: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut history = Vec::new();
    for rec in iter {
        match rec {
            Ok(h) => history.push(h),
            Err(e) => return Err(format!("Error mapping history row: {}", e)),
        }
    }
    Ok(history)
}

#[tauri::command]
pub fn get_paid_staff_ids(start_date: String, end_date: String) -> Result<Vec<i32>, String> {
    let conn = get_conn()?;
    
    
    let mut stmt = conn.prepare(
        "SELECT DISTINCT staff_id FROM salary_payouts WHERE date >= ?1 AND date <= ?2"
    ).map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([&start_date, &end_date], |row| {
        row.get::<_, i32>(0)
    }).map_err(|e| e.to_string())?;
    
    let mut ids = Vec::new();
    for id in iter {
        match id {
            Ok(i) => ids.push(i),
            Err(e) => return Err(format!("Error: {}", e)),
        }
    }
    Ok(ids)
}

#[derive(serde::Deserialize, Debug)]
pub struct BatchPayoutEntry {
    pub staff_id: i32,
    pub base_salary: f64,
    pub bonus: f64,
    pub deduction: f64,
    pub advance_deduction: f64,
    pub staff_name: String,
}

#[tauri::command]
pub fn process_batch_payout(payouts: Vec<BatchPayoutEntry>, payout_date: String) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;
    
    let mut total_paid = 0.0;
    let mut count = 0;
    
    for entry in &payouts {
        // Use the amount actually recovered from advances (capped by the
        // outstanding balance) rather than the raw requested deduction.
        let actually_deducted = if entry.advance_deduction > 0.0 {
            deduct_advances(&tx, entry.staff_id, entry.advance_deduction)?
        } else {
            0.0
        };
        let net_amount = entry.base_salary + entry.bonus - entry.deduction - actually_deducted;
        if net_amount < 0.0 {
            return Err(format!(
                "Net payout for {} would be negative ({:.2}). Deductions exceed the salary amount.",
                entry.staff_name, net_amount
            ));
        }
        
        tx.execute(
            "INSERT INTO salary_payouts (staff_id, amount, bonus, deduction, advance_deduction, date) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![entry.staff_id, net_amount, entry.bonus, entry.deduction, actually_deducted, payout_date]
        ).map_err(|e| e.to_string())?;
        
        tx.execute(
            "INSERT INTO expenses (amount, date, category, note) VALUES (?1, ?2, 'Salaries', ?3)",
            rusqlite::params![net_amount, payout_date, format!("Payroll: {}", entry.staff_name)]
        ).map_err(|e| e.to_string())?;
        
        total_paid += net_amount;
        count += 1;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    Ok(format!("Processed {} payouts totalling {:.2}", count, total_paid))
}

/// Recomputes `advance_deduction` and `net_pay` on a staff member's Pending
/// payroll records to match their current outstanding advance balance, capped
/// at what each period's salary can absorb.
fn resync_pending_advances(tx: &rusqlite::Transaction, staff_id: i32) -> std::result::Result<(), String> {
    tx.execute(
        "UPDATE payroll_records SET
            advance_deduction = MAX(0, MIN(base_salary + bonus - deduction, COALESCE((SELECT SUM(amount - COALESCE(deducted_amount, 0)) FROM advance_salaries WHERE staff_id = ?1), 0))),
            net_pay = MAX(0, base_salary + bonus - deduction - MAX(0, MIN(base_salary + bonus - deduction, COALESCE((SELECT SUM(amount - COALESCE(deducted_amount, 0)) FROM advance_salaries WHERE staff_id = ?1), 0)))),
            updated_at = datetime('now', 'localtime')
         WHERE staff_id = ?1 AND status = 'Pending'",
        [&staff_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pay_advance_salary(staff_id: i32, amount: f64, date: String, note: String, staff_name: String) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;
    
    if !amount.is_finite() || amount <= 0.0 {
        return Err("Advance amount must be a positive number.".into());
    }

    tx.execute(
        "INSERT INTO advance_salaries (staff_id, amount, date, note) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![staff_id, amount, date, note]
    ).map_err(|e| e.to_string())?;
    let advance_id = tx.last_insert_rowid();

    tx.execute(
        "INSERT INTO expenses (amount, date, category, note, reference_type, reference_id) VALUES (?1, ?2, 'Salaries', ?3, 'salary_advance', ?4)",
        rusqlite::params![amount, date, format!("Advance Salary: {} - {}", staff_name, note), advance_id]
    ).map_err(|e| e.to_string())?;

    // Resync from the actual outstanding balance so every Pending record of
    // this staff member reflects the new advance correctly (and never stores a
    // negative deduction).
    resync_pending_advances(&tx, staff_id)?;

    tx.commit().map_err(|e| e.to_string())?;
    
    Ok("Advance salary recorded successfully".to_string())
}

/// Corrects an advance's amount/note. Runs in a single transaction and keeps
/// the matching salary_advance expense in sync, so the two can never diverge.
/// The amount cannot drop below what payroll has already recovered.
#[tauri::command]
pub fn update_advance(advance_id: i32, amount: f64, note: Option<String>) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    if !amount.is_finite() || amount <= 0.0 {
        return Err("Advance amount must be a positive number.".into());
    }

    let (deducted, current_note, staff_id): (f64, Option<String>, i32) = tx.query_row(
        "SELECT COALESCE(deducted_amount, 0), note, staff_id FROM advance_salaries WHERE id = ?1",
        [&advance_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "Advance not found.".to_string())?;

    if amount < deducted - 0.001 {
        return Err(format!(
            "New amount ({:.2}) cannot be less than the amount already recovered from payroll ({:.2}).",
            amount, deducted
        ));
    }

    let new_note = note.unwrap_or(current_note.unwrap_or_default());
    let staff_name: String = tx.query_row(
        "SELECT name FROM staff WHERE id = ?1",
        [&staff_id],
        |row| row.get(0),
    ).map_err(|_| "Staff member not found.".to_string())?;

    tx.execute(
        "UPDATE advance_salaries SET amount = ?1, note = ?2 WHERE id = ?3",
        rusqlite::params![amount, new_note, advance_id],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE expenses SET amount = ?1, note = ?2 WHERE reference_type = 'salary_advance' AND reference_id = ?3",
        rusqlite::params![amount, format!("Advance Salary: {} - {}", staff_name, new_note), advance_id],
    ).map_err(|e| e.to_string())?;

    // Resync Pending payroll records so their advance deduction / net pay match
    // the corrected outstanding balance.
    resync_pending_advances(&tx, staff_id)?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok("Advance updated successfully".to_string())
}

/// Deletes an advance and its matching expense in a single transaction. Money
/// already recovered from past payrolls is kept; only the remaining outstanding
/// balance stops being deducted from future payrolls.
#[tauri::command]
pub fn delete_advance(advance_id: i32) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    let staff_id: i32 = tx.query_row(
        "SELECT staff_id FROM advance_salaries WHERE id = ?1",
        [&advance_id],
        |row| row.get(0),
    ).map_err(|_| "Advance not found.".to_string())?;

    tx.execute(
        "DELETE FROM advance_salaries WHERE id = ?1",
        [&advance_id],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM expenses WHERE reference_type = 'salary_advance' AND reference_id = ?1",
        [&advance_id],
    ).map_err(|e| e.to_string())?;

    // Remove the deleted advance from any Pending payroll records so future
    // payrolls stop deducting it.
    resync_pending_advances(&tx, staff_id)?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok("Advance deleted successfully".to_string())
}

// ─── Payroll periods & payroll records ───────────────────────────────────────

#[derive(serde::Serialize)]
pub struct PayrollPeriodSummary {
    pub total_staff: i32,
    pub total_gross: f64,
    pub advance_outstanding: f64,
    pub total_paid: f64,
    pub total_remaining: f64,
    pub paid_count: i32,
    pub pending_count: i32,
}

#[derive(serde::Serialize, Clone)]
pub struct PayrollRecordRow {
    pub id: i32,
    pub staff_id: i32,
    pub name: String,
    pub category_name: Option<String>,
    pub base_salary: f64,
    pub days_present: i32,
    pub advance_balance: f64,
    pub bonus: f64,
    pub deduction: f64,
    pub advance_deduction: f64,
    pub gross_pay: f64,
    pub net_pay: f64,
    pub status: String,
    pub payroll_id: Option<String>,
    pub paid_at: Option<String>,
}

#[derive(serde::Serialize)]
pub struct PayrollPeriod {
    pub start_date: String,
    pub end_date: String,
    pub summary: PayrollPeriodSummary,
    pub rows: Vec<PayrollRecordRow>,
}

/// Returns the outstanding (undeducted) advance balance for a staff member.
pub fn outstanding_advance(conn: &rusqlite::Connection, staff_id: i32) -> f64 {
    conn.query_row(
        "SELECT COALESCE(SUM(amount - COALESCE(deducted_amount, 0)), 0) FROM advance_salaries WHERE staff_id = ?1",
        [&staff_id], |row| row.get(0),
    ).unwrap_or(0.0)
}

fn map_payroll_row(row: &rusqlite::Row) -> rusqlite::Result<PayrollRecordRow> {
    Ok(PayrollRecordRow {
        id: row.get(0)?,
        staff_id: row.get(1)?,
        name: row.get(2)?,
        category_name: row.get(3).unwrap_or(None),
        base_salary: row.get(4).unwrap_or(0.0),
        days_present: row.get(5).unwrap_or(0),
        advance_balance: row.get(6).unwrap_or(0.0),
        bonus: row.get(7).unwrap_or(0.0),
        deduction: row.get(8).unwrap_or(0.0),
        advance_deduction: row.get(9).unwrap_or(0.0),
        gross_pay: row.get(10).unwrap_or(0.0),
        net_pay: row.get(11).unwrap_or(0.0),
        status: row.get(12).unwrap_or_else(|_| "Pending".to_string()),
        payroll_id: row.get(13).unwrap_or(None),
        paid_at: row.get(14).unwrap_or(None),
    })
}

const PAYROLL_RECORD_SELECT: &str =
    "SELECT pr.id, pr.staff_id, s.name, c.name, pr.base_salary,
            (SELECT COUNT(DISTINCT a.date) FROM staff_attendance a WHERE a.staff_id = s.id AND a.date >= ?1 AND a.date <= ?2) AS days_present,
            COALESCE((SELECT SUM(amount - COALESCE(deducted_amount, 0)) FROM advance_salaries WHERE staff_id = s.id), 0) AS advance_balance,
            pr.bonus, pr.deduction, pr.advance_deduction, pr.gross_pay, pr.net_pay, pr.status, pr.payroll_id, pr.paid_at
     FROM payroll_records pr
     JOIN staff s ON pr.staff_id = s.id
     LEFT JOIN staff_categories c ON s.category_id = c.id
     WHERE pr.start_date = ?1 AND pr.end_date = ?2";

/// Same as [`PAYROLL_RECORD_SELECT`] but scoped to a single record id (?3) so a
/// specific row is returned instead of an arbitrary row from the period.
const PAYROLL_RECORD_SELECT_BY_ID: &str =
    "SELECT pr.id, pr.staff_id, s.name, c.name, pr.base_salary,
            (SELECT COUNT(DISTINCT a.date) FROM staff_attendance a WHERE a.staff_id = s.id AND a.date >= ?1 AND a.date <= ?2) AS days_present,
            COALESCE((SELECT SUM(amount - COALESCE(deducted_amount, 0)) FROM advance_salaries WHERE staff_id = s.id), 0) AS advance_balance,
            pr.bonus, pr.deduction, pr.advance_deduction, pr.gross_pay, pr.net_pay, pr.status, pr.payroll_id, pr.paid_at
     FROM payroll_records pr
     JOIN staff s ON pr.staff_id = s.id
     LEFT JOIN staff_categories c ON s.category_id = c.id
     WHERE pr.start_date = ?1 AND pr.end_date = ?2 AND pr.id = ?3";

/// Loads (creating if needed) the payroll period and returns a summary plus
/// every staff member's payroll record for that period. Pending records are
/// automatically created from each staff member's current salary snapshot so
/// the admin only has to review, adjust and confirm.
#[tauri::command]
pub fn get_payroll_period(start_date: String, end_date: String) -> Result<PayrollPeriod, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    // Create a Pending payroll record for every active staff member in this
    // period if one does not already exist (INSERT OR IGNORE + unique index).
    tx.execute(
        "INSERT OR IGNORE INTO payroll_records (start_date, end_date, staff_id, base_salary, advance_deduction, gross_pay, net_pay, status)
         SELECT ?1, ?2, s.id, COALESCE(s.salary, 0), 
                MIN(COALESCE(s.salary, 0), COALESCE((SELECT SUM(amount - COALESCE(deducted_amount, 0)) FROM advance_salaries WHERE staff_id = s.id), 0)),
                COALESCE(s.salary, 0), 
                COALESCE(s.salary, 0) - MIN(COALESCE(s.salary, 0), COALESCE((SELECT SUM(amount - COALESCE(deducted_amount, 0)) FROM advance_salaries WHERE staff_id = s.id), 0)),
                'Pending'
         FROM staff s WHERE COALESCE(s.status, 'Active') = 'Active'",
        rusqlite::params![&start_date, &end_date],
    ).map_err(|e| e.to_string())?;

    // Recompute gross/net for pending records from their stored split, and
    // resync advance_deduction against the CURRENT outstanding advance balance
    // so records created before advances existed (or by an older build) still
    // recover the advance instead of paying it out in full. The deduction is
    // capped at what this period's salary can absorb; the rest carries over.
    tx.execute(
        "UPDATE payroll_records SET
            advance_deduction = MAX(0, MIN(base_salary + bonus - deduction,
                COALESCE((SELECT SUM(amount - COALESCE(deducted_amount, 0)) FROM advance_salaries WHERE staff_id = payroll_records.staff_id), 0))),
            gross_pay = base_salary + bonus,
            net_pay = MAX(0, base_salary + bonus - deduction - MAX(0, MIN(base_salary + bonus - deduction,
                COALESCE((SELECT SUM(amount - COALESCE(deducted_amount, 0)) FROM advance_salaries WHERE staff_id = payroll_records.staff_id), 0)))),
            updated_at = datetime('now', 'localtime')
         WHERE start_date = ?1 AND end_date = ?2 AND status = 'Pending'",
        rusqlite::params![&start_date, &end_date],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    let conn = &conn_guard;

    let mut stmt = conn.prepare(PAYROLL_RECORD_SELECT).map_err(|e| e.to_string())?;
    let mut rows = Vec::new();
    let iter = stmt.query_map([&start_date, &end_date], map_payroll_row).map_err(|e| e.to_string())?;
    for r in iter {
        rows.push(r.map_err(|e| e.to_string())?);
    }

    let total_staff = rows.len() as i32;
    let total_gross: f64 = rows.iter().map(|r| r.gross_pay).sum();
    let advance_outstanding: f64 = rows.iter().map(|r| r.advance_balance).sum();
    let total_paid: f64 = rows.iter().filter(|r| r.status == "Paid").map(|r| r.net_pay).sum();
    let total_remaining: f64 = rows.iter().filter(|r| r.status == "Pending").map(|r| r.net_pay).sum();
    let paid_count = rows.iter().filter(|r| r.status == "Paid").count() as i32;
    let pending_count = rows.iter().filter(|r| r.status == "Pending").count() as i32;

    Ok(PayrollPeriod {
        start_date,
        end_date,
        summary: PayrollPeriodSummary {
            total_staff,
            total_gross,
            advance_outstanding,
            total_paid,
            total_remaining,
            paid_count,
            pending_count,
        },
        rows,
    })
}

/// Saves adjustments to a Pending payroll record. Advance deduction may be any
/// value up to the outstanding balance; net pay can never go negative.
#[tauri::command]
pub fn update_payroll_record(record_id: i32, bonus: f64, deduction: f64, advance_deduction: f64) -> Result<PayrollRecordRow, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    let (staff_id, base_salary, status): (i32, f64, String) = tx.query_row(
        "SELECT staff_id, base_salary, status FROM payroll_records WHERE id = ?1",
        [&record_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|_| "Payroll record not found.".to_string())?;

    if status != "Pending" {
        return Err("This payroll has already been paid and is locked.".to_string());
    }

    if !bonus.is_finite() || !deduction.is_finite() || !advance_deduction.is_finite()
        || bonus < 0.0 || deduction < 0.0 || advance_deduction < 0.0 {
        return Err("Bonus and deductions must be non-negative numbers.".to_string());
    }

    let outstanding = outstanding_advance(&tx, staff_id);
    if advance_deduction > outstanding + 0.001 {
        return Err(format!(
            "Advance deduction of {:.2} exceeds the outstanding balance of {:.2}.",
            advance_deduction, outstanding
        ));
    }

    // Manual deductions must not exceed this period's gross pay.
    let before_advance = base_salary + bonus - deduction;
    if before_advance < -0.001 {
        return Err(format!(
            "Deductions of {:.2} exceed this period's gross pay of {:.2}.",
            deduction, base_salary + bonus
        ));
    }

    // Cap the advance recovery at what this period's salary can absorb; the
    // remaining balance carries over to future payrolls.
    let advance_deduction = advance_deduction.min(before_advance);
    let net_pay = (base_salary + bonus - deduction - advance_deduction).max(0.0);

    tx.execute(
        "UPDATE payroll_records SET bonus = ?1, deduction = ?2, advance_deduction = ?3,
                gross_pay = ?4, net_pay = ?5, updated_at = datetime('now', 'localtime')
         WHERE id = ?6",
        rusqlite::params![bonus, deduction, advance_deduction, base_salary + bonus, net_pay, record_id],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    let conn = &conn_guard;

    let (start_date, end_date): (String, String) = conn.query_row(
        "SELECT start_date, end_date FROM payroll_records WHERE id = ?1",
        [&record_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "Payroll record not found.".to_string())?;
    conn.query_row(
        PAYROLL_RECORD_SELECT_BY_ID,
        rusqlite::params![&start_date, &end_date, &record_id],
        map_payroll_row,
    )
    .map_err(|e| format!("Payroll record not found: {}", e))
}

/// Returns a single payroll record row by id (period bounds are looked up so
/// attendance days and advance balance can be computed consistently).
#[tauri::command]
pub fn get_payroll_record(record_id: i32) -> Result<PayrollRecordRow, String> {
    let conn = get_conn()?;
    let (start_date, end_date): (String, String) = conn.query_row(
        "SELECT start_date, end_date FROM payroll_records WHERE id = ?1",
        [&record_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| "Payroll record not found.".to_string())?;
    conn.query_row(
        PAYROLL_RECORD_SELECT_BY_ID,
        rusqlite::params![&start_date, &end_date, &record_id],
        map_payroll_row,
    )
    .map_err(|e| format!("Payroll record not found: {}", e))
}

/// Reverses a previous advance deduction, oldest advances first, up to `amount`.
/// Returns how much was actually restored.
fn restore_advances(tx: &rusqlite::Transaction, staff_id: i32, mut amount: f64) -> std::result::Result<f64, String> {
    if amount <= 0.0 {
        return Ok(0.0);
    }
    let mut stmt = tx.prepare(
        "SELECT id, amount, COALESCE(deducted_amount, 0.0) FROM advance_salaries
         WHERE staff_id = ?1 AND COALESCE(deducted_amount, 0.0) > 0.0 ORDER BY id DESC"
    ).map_err(|e| e.to_string())?;
    let rows: Vec<(i32, f64, f64)> = stmt.query_map([&staff_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    drop(stmt);

    let mut restored_total = 0.0;
    for (id, advance_amount, already_deducted) in rows {
        if amount <= 0.001 { break; }
        if already_deducted <= 0.001 { continue; }
        let to_restore = if already_deducted > amount { amount } else { already_deducted };
        let new_deducted = already_deducted - to_restore;
        // Only stay "fully recovered" if nothing was restored from this advance;
        // a partial restore leaves a live outstanding balance that future
        // payrolls (deduct_advances, which filters is_deducted = 0) must pick up.
        let is_deducted = if new_deducted >= advance_amount - 0.001 { 1 } else { 0 };
        tx.execute(
            "UPDATE advance_salaries SET deducted_amount = ?1, is_deducted = ?2 WHERE id = ?3",
            rusqlite::params![new_deducted, is_deducted, id]
        ).map_err(|e| e.to_string())?;
        amount -= to_restore;
        restored_total += to_restore;
    }
    Ok(restored_total)
}

/// Confirms the payroll for a period: marks the selected pending records as
/// Paid, deducts advances, records a salary payout and a matching expense for
/// each staff member. When `record_ids` is provided only those records in the
/// period are processed, otherwise every pending record is. Idempotent per
/// record (only Pending rows are processed).
#[tauri::command]
pub fn process_payroll_batch(start_date: String, end_date: String, record_ids: Option<Vec<i32>>) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    // Honor the UI selection: filter the pending records to the chosen ids.
    let filtered_ids: Vec<i32> = record_ids
        .as_ref()
        .map(|ids| ids.iter().copied().filter(|id| *id > 0).collect())
        .unwrap_or_default();

    if record_ids.is_some() && filtered_ids.is_empty() {
        return Err("No valid payroll records selected.".to_string());
    }

    let record_filter = if !filtered_ids.is_empty() {
        let placeholders = filtered_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        format!(" AND pr.id IN ({})", placeholders)
    } else {
        String::new()
    };
    let sql = format!(
        "SELECT pr.id, pr.staff_id, pr.base_salary, pr.bonus, pr.deduction, pr.advance_deduction, s.name
         FROM payroll_records pr JOIN staff s ON pr.staff_id = s.id
         WHERE pr.start_date = ?1 AND pr.end_date = ?2 AND pr.status = 'Pending'{} ORDER BY pr.id",
        record_filter
    );
    let mut params: Vec<rusqlite::types::Value> = vec![start_date.clone().into(), end_date.clone().into()];
    for id in &filtered_ids {
        params.push((*id).into());
    }
    let mut stmt = tx.prepare(&sql).map_err(|e| e.to_string())?;
    let rows: Vec<(i32, i32, f64, f64, f64, f64, String)> = stmt.query_map(
        rusqlite::params_from_iter(params),
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?))
    ).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);

    if rows.is_empty() {
        if record_ids.is_some() {
            return Err("No pending payroll records found for the selected staff in this period.".to_string());
        }
        return Err("No pending payroll records found for this period.".to_string());
    }

    let mut total_paid = 0.0;
    let mut count = 0;

    for (record_id, staff_id, base_salary, bonus, deduction, advance_deduction, name) in rows {
        // Recompute using the amount actually recovered from advances so a
        // stale balance can never over-charge a staff member.
        let actually_deducted = if advance_deduction > 0.0 {
            deduct_advances(&tx, staff_id, advance_deduction)?
        } else {
            0.0
        };
        let net_amount = (base_salary + bonus - deduction - actually_deducted).max(0.0);

        tx.execute(
            "INSERT INTO salary_payouts (staff_id, amount, bonus, deduction, advance_deduction, date) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![staff_id, net_amount, bonus, deduction, actually_deducted, &end_date]
        ).map_err(|e| e.to_string())?;

        tx.execute(
            "INSERT INTO expenses (amount, date, category, note, reference_type, reference_id) VALUES (?1, ?2, 'Salaries', ?3, 'payroll', ?4)",
            rusqlite::params![net_amount, &end_date, format!("Payroll: {}", name), record_id]
        ).map_err(|e| e.to_string())?;

        let payroll_id = format!("PR-{}-{:03}", end_date.replace('-', ""), record_id);
        tx.execute(
            "UPDATE payroll_records SET status = 'Paid', payroll_id = ?1, paid_at = datetime('now', 'localtime'),
                    advance_deduction = ?2, net_pay = ?3, updated_at = datetime('now', 'localtime')
             WHERE id = ?4",
            rusqlite::params![&payroll_id, actually_deducted, net_amount, record_id]
        ).map_err(|e| e.to_string())?;

        total_paid += net_amount;
        count += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(format!("Processed {} payouts totalling {:.2}", count, total_paid))
}

/// Reverts a paid period back to Pending. Deletes the payout and expense rows,
/// restores any advance deductions, and clears the payroll/paid metadata so the
/// period can be reviewed and re-processed.
#[tauri::command]
pub fn reopen_payroll(start_date: String, end_date: String) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    let mut stmt = tx.prepare(
        "SELECT id, staff_id, advance_deduction FROM payroll_records
         WHERE start_date = ?1 AND end_date = ?2 AND status = 'Paid'"
    ).map_err(|e| e.to_string())?;
    let rows: Vec<(i32, i32, f64)> = stmt.query_map(rusqlite::params![&start_date, &end_date], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2).unwrap_or(0.0)))
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);

    if rows.is_empty() {
        return Err("No paid payroll records found for this period.".to_string());
    }
    let reopened_count = rows.len();

    for (record_id, staff_id, advance_deduction) in rows {
        if advance_deduction > 0.0 {
            restore_advances(&tx, staff_id, advance_deduction)?;
        }
        tx.execute("DELETE FROM salary_payouts WHERE staff_id = ?1 AND date = ?2", rusqlite::params![staff_id, &end_date]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM expenses WHERE reference_type = 'payroll' AND reference_id = ?1", [&record_id]).map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE payroll_records SET status = 'Pending', payroll_id = NULL, paid_at = NULL, updated_at = datetime('now', 'localtime') WHERE id = ?1",
            [&record_id]
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(format!("Reopened payroll for {} staff members.", reopened_count))
}

/// Voids a paid period: reverses payouts, advances and expenses like reopening,
/// but marks the records as Void instead of Pending so it cannot be re-paid by
/// accident.
#[tauri::command]
pub fn void_payroll(start_date: String, end_date: String) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    let mut stmt = tx.prepare(
        "SELECT id, staff_id, advance_deduction FROM payroll_records
         WHERE start_date = ?1 AND end_date = ?2 AND status = 'Paid'"
    ).map_err(|e| e.to_string())?;
    let rows: Vec<(i32, i32, f64)> = stmt.query_map(rusqlite::params![&start_date, &end_date], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2).unwrap_or(0.0)))
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);

    if rows.is_empty() {
        return Err("No paid payroll records found for this period.".to_string());
    }
    let voided_count = rows.len();

    for (record_id, staff_id, advance_deduction) in rows {
        if advance_deduction > 0.0 {
            restore_advances(&tx, staff_id, advance_deduction)?;
        }
        tx.execute("DELETE FROM salary_payouts WHERE staff_id = ?1 AND date = ?2", rusqlite::params![staff_id, &end_date]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM expenses WHERE reference_type = 'payroll' AND reference_id = ?1", [&record_id]).map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE payroll_records SET status = 'Void', payroll_id = NULL, paid_at = NULL, updated_at = datetime('now', 'localtime') WHERE id = ?1",
            [&record_id]
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(format!("Voided payroll for {} staff members.", voided_count))
}

/// Deletes a single staff's payroll record. Paid records are fully reverted in
/// the same transaction: recovered advance amounts are restored, and the salary
/// payout + matching expense rows are removed so money stays consistent.
#[tauri::command]
pub fn delete_payroll_record(record_id: i32) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    let (staff_id, advance_deduction, status, net_pay, end_date): (i32, f64, String, f64, String) = tx.query_row(
        "SELECT staff_id, COALESCE(advance_deduction, 0), status, COALESCE(net_pay, 0), end_date
         FROM payroll_records WHERE id = ?1",
        [&record_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    ).map_err(|_| "Payroll record not found.".to_string())?;

    if status == "Paid" {
        if advance_deduction > 0.0 {
            restore_advances(&tx, staff_id, advance_deduction)?;
        }
        tx.execute(
            "DELETE FROM salary_payouts WHERE staff_id = ?1 AND date = ?2 AND ABS(amount - ?3) < 0.001",
            rusqlite::params![staff_id, &end_date, net_pay],
        ).map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM expenses WHERE reference_type = 'payroll' AND reference_id = ?1",
            [&record_id],
        ).map_err(|e| e.to_string())?;
    }

    tx.execute("DELETE FROM payroll_records WHERE id = ?1", [&record_id]).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok("Payroll record deleted successfully.".to_string())
}

/// Deletes an entire payroll period (every staff record). Each paid record is
/// first reverted like `delete_payroll_record`, then all records are removed —
/// all inside a single transaction.
#[tauri::command]
pub fn delete_payroll_period(start_date: String, end_date: String) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    let mut stmt = tx.prepare(
        "SELECT id, staff_id, COALESCE(advance_deduction, 0), status, COALESCE(net_pay, 0)
         FROM payroll_records WHERE start_date = ?1 AND end_date = ?2"
    ).map_err(|e| e.to_string())?;
    let rows: Vec<(i32, i32, f64, String, f64)> = stmt.query_map(rusqlite::params![&start_date, &end_date], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
    }).map_err(|e| e.to_string())?.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);

    if rows.is_empty() {
        return Err("No payroll records found for this period.".to_string());
    }
    let count = rows.len();

    for (record_id, staff_id, advance_deduction, status, net_pay) in rows {
        if status == "Paid" {
            if advance_deduction > 0.0 {
                restore_advances(&tx, staff_id, advance_deduction)?;
            }
            tx.execute(
                "DELETE FROM salary_payouts WHERE staff_id = ?1 AND date = ?2 AND ABS(amount - ?3) < 0.001",
                rusqlite::params![staff_id, &end_date, net_pay],
            ).map_err(|e| e.to_string())?;
            tx.execute(
                "DELETE FROM expenses WHERE reference_type = 'payroll' AND reference_id = ?1",
                [&record_id],
            ).map_err(|e| e.to_string())?;
        }
        tx.execute("DELETE FROM payroll_records WHERE id = ?1", [&record_id]).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(format!("Deleted payroll period with {} staff record(s).", count))
}

#[derive(serde::Serialize)]
pub struct AdvanceHistoryRow {
    pub id: i32,
    pub staff_id: i32,
    pub staff_name: String,
    pub amount: f64,
    pub date: String,
    pub note: Option<String>,
    pub deducted_amount: f64,
    pub outstanding: f64,
    pub is_deducted: bool,
}

#[tauri::command]
pub fn get_advance_history(staff_id: i32, start_date: String, end_date: String) -> Result<Vec<AdvanceHistoryRow>, String> {
    let conn = get_conn()?;
    let end_date_full = format!("{}T23:59:59.999Z", end_date);
    let mut stmt = conn.prepare(
        "SELECT a.id, a.staff_id, s.name, a.amount, a.date, a.note,
                COALESCE(a.deducted_amount, 0.0), (a.amount - COALESCE(a.deducted_amount, 0.0)), COALESCE(a.is_deducted, 0)
         FROM advance_salaries a JOIN staff s ON a.staff_id = s.id
         WHERE (a.staff_id = ?1 OR ?1 = 0) AND a.date >= ?2 AND a.date <= ?3
         ORDER BY a.date DESC, a.id DESC"
    ).map_err(|e| e.to_string())?;
    let iter = stmt.query_map(rusqlite::params![&staff_id, &start_date, &end_date_full], |row| {
        Ok(AdvanceHistoryRow {
            id: row.get(0)?,
            staff_id: row.get(1)?,
            staff_name: row.get(2)?,
            amount: row.get(3)?,
            date: row.get(4)?,
            note: row.get(5).unwrap_or(None),
            deducted_amount: row.get(6).unwrap_or(0.0),
            outstanding: row.get(7).unwrap_or(0.0),
            is_deducted: row.get::<_, i32>(8).unwrap_or(0) == 1,
        })
    }).map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for r in iter {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Returns the outstanding advance balance for a single staff member.
#[tauri::command]
pub fn get_staff_advance_balance(staff_id: i32) -> Result<f64, String> {
    let conn = get_conn()?;
    Ok(outstanding_advance(&conn, staff_id))
}

#[derive(serde::Serialize)]
pub struct PayrollHistoryPeriod {
    pub start_date: String,
    pub end_date: String,
    pub paid_at: Option<String>,
    pub total_count: i32,
    pub paid_count: i32,
    pub total_net: f64,
    pub rows: Vec<PayrollRecordRow>,
}

/// Returns all payroll periods that overlap the given range, newest first,
/// along with their records and a summary of paid vs pending.
#[tauri::command]
pub fn get_payroll_history(start_date: String, end_date: String) -> Result<Vec<PayrollHistoryPeriod>, String> {
    let conn = get_conn()?;

    let mut periods = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT start_date, end_date FROM payroll_records
             WHERE (start_date >= ?1 AND start_date <= ?2)
                OR (start_date <= ?2 AND end_date >= ?1)
             ORDER BY end_date DESC, start_date DESC"
        ).map_err(|e| e.to_string())?;
        let iter = stmt.query_map(rusqlite::params![&start_date, &end_date], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;
        for r in iter {
            periods.push(r.map_err(|e| e.to_string())?);
        }
    }

    let mut out = Vec::new();
    for (sd, ed) in periods {
        let mut stmt = conn.prepare(PAYROLL_RECORD_SELECT).map_err(|e| e.to_string())?;
        let mut rows = Vec::new();
        let iter = stmt.query_map(rusqlite::params![&sd, &ed], map_payroll_row).map_err(|e| e.to_string())?;
        for r in iter {
            rows.push(r.map_err(|e| e.to_string())?);
        }
        let total_count = rows.len() as i32;
        let paid_count = rows.iter().filter(|r| r.status == "Paid").count() as i32;
        let total_net: f64 = rows.iter().filter(|r| r.status == "Paid").map(|r| r.net_pay).sum();
        let paid_at = rows.iter().find(|r| r.paid_at.is_some()).and_then(|r| r.paid_at.clone());
        out.push(PayrollHistoryPeriod {
            start_date: sd,
            end_date: ed,
            paid_at,
            total_count,
            paid_count,
            total_net,
            rows,
        });
    }
    Ok(out)
}


#[derive(serde::Serialize, Debug)]
pub struct DailyTrend {
    pub date: String,
    pub sales: f64,
    pub expenses: f64,
}

#[derive(serde::Serialize, Debug)]
pub struct CategoryExpense {
    pub name: String,
    pub value: f64,
}

#[derive(serde::Serialize, Debug)]
pub struct TopItem {
    pub name: String,
    pub quantity: i32,
    pub revenue: f64,
}

#[derive(serde::Serialize, Debug)]
pub struct AnalyticsReport {
    pub total_sales: f64,
    pub total_expenses: f64,
    pub net_profit: f64,
    pub profit_margin: f64,
    pub total_orders: i32,
    pub avg_order_value: f64,
    pub sales_trend: Vec<DailyTrend>,
    pub expenses_by_category: Vec<CategoryExpense>,
    pub top_items: Vec<TopItem>,
}

#[tauri::command]
pub fn get_analytics_report(start_date: String, end_date: String) -> Result<AnalyticsReport, String> {
    let conn = get_conn()?;
    let end_date = format!("{}T23:59:59.999Z", end_date);

    let mut total_sales = 0.0;
    let mut total_orders = 0;
    conn.query_row(
        "SELECT COALESCE(SUM(COALESCE(o.subtotal, 0.0) + COALESCE(o.tax_amount, 0.0) + COALESCE(o.service_charge_amount, 0.0) + COALESCE(o.delivery_fee, 0.0) - COALESCE(o.discount_amount, 0.0)), 0), COUNT(DISTINCT o.id) 
         FROM orders o 
         WHERE o.status = 'Closed' AND date(o.closed_at) >= ?1 AND date(o.closed_at) <= ?2",
        [&start_date, &end_date],
        |row| {
            total_sales = row.get(0)?;
            total_orders = row.get(1)?;
            Ok(())
        }
    ).ok();

    let mut total_expenses = 0.0;
    conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE date >= ?1 AND date <= ?2",
        [&start_date, &end_date],
        |row| {
            total_expenses = row.get(0)?;
            Ok(())
        }
    ).ok();

    let net_profit = total_sales - total_expenses;
    let profit_margin = if total_sales > 0.0 { (net_profit / total_sales) * 100.0 } else { 0.0 };
    let avg_order_value = if total_orders > 0 { total_sales / total_orders as f64 } else { 0.0 };

    let mut sales_trend = Vec::new();
    
    let mut stmt = conn.prepare(
        "SELECT DISTINCT d FROM (
            SELECT date(closed_at) as d FROM orders WHERE status = 'Closed' AND date(closed_at) >= ?1 AND date(closed_at) <= ?2
            UNION
            SELECT date FROM expenses WHERE date >= ?1 AND date <= ?2
        ) ORDER BY d"
    ).map_err(|e| e.to_string())?;
    
    let dates: Vec<String> = stmt.query_map([&start_date, &end_date], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let mut sales_map = std::collections::HashMap::new();
    let mut sales_stmt = conn.prepare(
        "SELECT date(closed_at), COALESCE(SUM(COALESCE(subtotal, 0.0) + COALESCE(tax_amount, 0.0) + COALESCE(service_charge_amount, 0.0) + COALESCE(delivery_fee, 0.0) - COALESCE(discount_amount, 0.0)), 0) FROM orders WHERE status = 'Closed' AND date(closed_at) >= ?1 AND date(closed_at) <= ?2 GROUP BY date(closed_at)"
    ).map_err(|e| e.to_string())?;
    let _ = sales_stmt.query_map([&start_date, &end_date], |row| {
        let date: String = row.get(0).unwrap_or_default();
        let sum: f64 = row.get(1).unwrap_or(0.0);
        sales_map.insert(date, sum);
        Ok(())
    });

    let mut expenses_map = std::collections::HashMap::new();
    let mut exp_stmt = conn.prepare(
        "SELECT date, COALESCE(SUM(amount), 0) FROM expenses WHERE date >= ?1 AND date <= ?2 GROUP BY date"
    ).map_err(|e| e.to_string())?;
    let _ = exp_stmt.query_map([&start_date, &end_date], |row| {
        let date: String = row.get(0).unwrap_or_default();
        let sum: f64 = row.get(1).unwrap_or(0.0);
        expenses_map.insert(date, sum);
        Ok(())
    });

    for date in dates {
        let daily_sales = *sales_map.get(&date).unwrap_or(&0.0);
        let daily_expenses = *expenses_map.get(&date).unwrap_or(&0.0);

        sales_trend.push(DailyTrend {
            date,
            sales: daily_sales,
            expenses: daily_expenses,
        });
    }

    let mut stmt = conn.prepare(
        "SELECT category, SUM(amount) FROM expenses WHERE date >= ?1 AND date <= ?2 GROUP BY category ORDER BY SUM(amount) DESC"
    ).map_err(|e| e.to_string())?;
    
    let expenses_by_category: Vec<CategoryExpense> = stmt.query_map([&start_date, &end_date], |row| {
        Ok(CategoryExpense {
            name: row.get(0)?,
            value: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    let mut stmt = conn.prepare(
        "SELECT oi.name, SUM(oi.quantity) as q, SUM(oi.price * oi.quantity) as r
         FROM orders o JOIN order_items oi ON o.id = oi.order_id
         WHERE o.status = 'Closed' AND date(o.closed_at) >= ?1 AND date(o.closed_at) <= ?2
         GROUP BY oi.item_id, oi.name ORDER BY q DESC LIMIT 5"
    ).map_err(|e| e.to_string())?;
    
    let top_items: Vec<TopItem> = stmt.query_map([&start_date, &end_date], |row| {
        Ok(TopItem {
            name: row.get(0)?,
            quantity: row.get(1)?,
            revenue: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    Ok(AnalyticsReport {
        total_sales,
        total_expenses,
        net_profit,
        profit_margin,
        total_orders,
        avg_order_value,
        sales_trend,
        expenses_by_category,
        top_items,
    })
}

#[tauri::command]
pub fn save_text_report(filename: String, content: String) -> Result<String, String> {
    use std::fs;
    use std::path::Path;
    
    let safe_name = sanitize_filename(&filename);
    if safe_name.is_empty() {
        return Err("Invalid filename.".into());
    }

    let reports_dir = Path::new("../reports");
    if !reports_dir.exists() {
        fs::create_dir_all(reports_dir).map_err(|e| e.to_string())?;
    }
    
    let file_path = reports_dir.join(safe_name);
    fs::write(&file_path, content).map_err(|e| e.to_string())?;
    
    // Attempt to open the file so the user sees it immediately
    let _ = opener::open(&file_path);
    
    Ok(format!("Report saved and opened successfully."))
}

/// Reduces a client-supplied filename to a safe basename (letters, digits, and
/// `-` / `_` / `.` only) so reports and print files cannot escape their target
/// directory or overwrite arbitrary files on disk.
fn sanitize_filename(filename: &str) -> String {
    use std::path::Path;
    // Take only the last path component so `..\` / absolute paths are neutralized.
    let base = Path::new(filename).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    base.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
        .collect::<String>()
        .trim_matches('.')
        .to_string()
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct BackupSettings {
    pub last_backup_at: Option<String>,
    pub backup_frequency: String,
    pub backup_path: Option<String>,
}

#[tauri::command]
pub fn get_backup_settings() -> Result<BackupSettings, String> {
    let conn = get_conn()?;
    run_migrations(&conn)?;

    let mut stmt = conn.prepare(
        "SELECT last_backup_at, COALESCE(backup_frequency, 'Off'), backup_path FROM restaurant_settings WHERE id = 1"
    ).map_err(|e| e.to_string())?;

    let settings = stmt.query_row([], |row| {
        Ok(BackupSettings {
            last_backup_at: row.get(0)?,
            backup_frequency: row.get(1)?,
            backup_path: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(settings)
}

#[tauri::command]
pub fn update_backup_settings(frequency: String, path: Option<String>) -> Result<(), String> {
    let conn = get_conn()?;
    run_migrations(&conn)?;

    conn.execute(
        "UPDATE restaurant_settings SET backup_frequency = ?1, backup_path = ?2 WHERE id = 1",
        rusqlite::params![frequency, path],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn perform_backup(destination: Option<String>) -> Result<String, String> {
    let conn = get_conn()?;
    run_migrations(&conn)?;

    let target_path_str = match destination {
        Some(d) if !d.trim().is_empty() => d,
        _ => {
            let stored_path: Option<String> = conn
                .query_row("SELECT backup_path FROM restaurant_settings WHERE id = 1", [], |r| r.get(0))
                .unwrap_or(None);
            
            match stored_path {
                Some(p) if !p.trim().is_empty() => p,
                _ => return Err("No backup destination path selected.".into()),
            }
        }
    };

    let target_path = std::path::Path::new(&target_path_str);
    
    let final_dest = if target_path.is_dir() || target_path_str.ends_with('/') || target_path_str.ends_with('\\') {
        let now_str = conn.query_row("SELECT strftime('%Y-%m-%d_%H%M%S', 'now', 'localtime')", [], |r| r.get::<_, String>(0))
            .unwrap_or_else(|_| "backup".to_string());
        target_path.join(format!("rms_backup_{}.db", now_str))
    } else {
        target_path.to_path_buf()
    };

    if let Some(parent) = final_dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create folder: {}", e))?;
    }

    let current_db_path = get_default_db_path()?;
    // Flush pending WAL frames into the main file so the copied backup is a
    // complete snapshot (the app writes in WAL mode while running).
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    std::fs::copy(&current_db_path, &final_dest)
        .map_err(|e| format!("Failed to copy database file: {}", e))?;

    let dest_str = final_dest.to_string_lossy().to_string();

    conn.execute(
        "UPDATE restaurant_settings SET last_backup_at = datetime('now', 'localtime'), backup_path = ?1 WHERE id = 1",
        rusqlite::params![dest_str],
    ).map_err(|e| e.to_string())?;

    Ok(dest_str)
}

#[tauri::command]
pub fn check_and_run_auto_backup() -> Result<Option<String>, String> {
    // Determine if backup is needed, then DROP the lock before calling perform_backup
    let backup_path: Option<String> = {
        let conn = get_conn()?;
        run_migrations(&conn)?;

        let row: Result<(Option<String>, String, Option<String>), _> = conn.query_row(
            "SELECT last_backup_at, COALESCE(backup_frequency, 'Off'), backup_path FROM restaurant_settings WHERE id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        );

        let (last_backup_at, frequency, backup_path) = match row {
            Ok(vals) => vals,
            Err(_) => return Ok(None),
        };

        if frequency == "Off" {
            return Ok(None);
        }

        let path_str = match backup_path {
            Some(p) if !p.trim().is_empty() => p,
            _ => return Ok(None),
        };

        let should_backup = match last_backup_at {
            None => true,
            Some(last_str) => {
                let days_elapsed: Option<f64> = conn.query_row(
                    "SELECT julianday('now', 'localtime') - julianday(?1)",
                    [&last_str],
                    |r| r.get(0)
                ).unwrap_or(None);

                match days_elapsed {
                    Some(days) => {
                        if frequency == "Daily" && days >= 1.0 {
                            true
                        } else if frequency == "Weekly" && days >= 7.0 {
                            true
                        } else {
                            false
                        }
                    },
                    None => true,
                }
            }
        };

        if should_backup {
            Some(path_str)
        } else {
            None
        }
    }; // <-- MutexGuard dropped here

    // Now call perform_backup WITHOUT holding the lock
    match backup_path {
        Some(path) => {
            match perform_backup(Some(path)) {
                Ok(backed_path) => Ok(Some(backed_path)),
                Err(e) => Err(e),
            }
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn validate_backup_file(file_path: String) -> Result<String, String> {
    let p = std::path::Path::new(&file_path);
    if !p.exists() || !p.is_file() {
        return Err("Selected file does not exist or is invalid.".to_string());
    }

    // Open read-only so the backup is never modified and no -wal/-shm sidecars
    // are created next to the user's file (read-only media stays importable).
    let conn = Connection::open_with_flags(
        &file_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| "Failed to open file as a valid SQLite database.".to_string())?;

    // Refuse to import a corrupt database.
    let integrity: String = conn
        .query_row("PRAGMA quick_check", [], |r| r.get(0))
        .unwrap_or_else(|_| "error".to_string());
    if !integrity.eq_ignore_ascii_case("ok") {
        return Err("Backup file failed integrity checks and cannot be imported.".to_string());
    }

    let table_exists: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='restaurant_settings'",
        [],
        |r| r.get(0)
    ).unwrap_or(0);

    if table_exists == 0 {
        return Err("Invalid RMS database: Missing 'restaurant_settings' table.".to_string());
    }

    let restaurant_name: String = conn.query_row(
        "SELECT restaurant_name FROM restaurant_settings WHERE id = 1",
        [],
        |r| r.get(0)
    ).map_err(|_| "Database is missing restaurant settings configuration record.".to_string())?;

    Ok(restaurant_name)
}

/// Reads the license row embedded in a backup database file without touching
/// the live database. Returns `(current_key, expiry_date, activated_at,
/// last_validated_date, hwid)`. The HWID may be absent on backups created
/// before the HWID column existed.
pub fn read_backup_license(file_path: &str) -> Result<(String, Option<String>, Option<String>, Option<String>, Option<String>), String> {
    // Open read-only so the backup is never modified (no -wal/-shm sidecars are
    // created next to the user's file) and so files on read-only media (USB,
    // cloud-synced folders) can still be restored.
    let conn = Connection::open_with_flags(
        file_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| "Failed to open file as a valid SQLite database.".to_string())?;

    let table_exists: i32 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='license'",
        [],
        |r| r.get(0)
    ).unwrap_or(0);

    if table_exists == 0 {
        return Err("Backup file does not contain a license record.".to_string());
    }

    let row: Option<(String, Option<String>, Option<String>, Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT current_key, expiry_date, activated_at, last_validated_date, COALESCE(hwid, '') FROM license LIMIT 1",
            [],
            |row| Ok((
                row.get(0).unwrap_or_default(),
                row.get(1).unwrap_or(None),
                row.get(2).unwrap_or(None),
                row.get(3).unwrap_or(None),
                row.get::<_, String>(4).ok().filter(|h| !h.is_empty()),
            )),
        )
        .or_else(|_| {
            // Older backups may lack the hwid column entirely.
            conn.query_row(
                "SELECT current_key, expiry_date, activated_at, last_validated_date FROM license LIMIT 1",
                [],
                |row| Ok((
                    row.get(0).unwrap_or_default(),
                    row.get(1).unwrap_or(None),
                    row.get(2).unwrap_or(None),
                    row.get(3).unwrap_or(None),
                    None,
                )),
            )
        })
        .ok();

    match row {
        Some((key, expiry, act, val, hwid)) if !key.trim().is_empty() => Ok((key, expiry, act, val, hwid)),
        _ => Err("Backup file does not contain an activated license.".to_string()),
    }
}

/// Verifies a password against the admin user(s) stored inside a backup
/// database file, opened read-only. Prevents a local attacker from importing an
/// arbitrary database over a live install: the person restoring a backup must
/// prove they control that backup by knowing its admin password.
pub fn verify_backup_admin_password(file_path: &str, password: &str) -> Result<bool, String> {
    let conn = Connection::open_with_flags(
        file_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| "Failed to open file as a valid SQLite database.".to_string())?;

    let table_exists: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if table_exists == 0 {
        return Err("Backup file does not contain a users table.".to_string());
    }

    let mut stmt = conn
        .prepare(
            "SELECT u.password_hash FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'Admin'",
        )
        .map_err(|_| "Backup file is not a valid RMS database.".to_string())?;

    let hashes = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|_| "Backup file is not a valid RMS database.".to_string())?;

    for hash_result in hashes {
        if let Ok(hash) = hash_result {
            if let Ok(true) = bcrypt::verify(password, &hash) {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

/// Marks that the current license was adopted from a backup restore. Persists
/// the adopted HWID (so `get_hwid()` reports the machine the license was issued
/// for, keeping it valid), records the original (first) HWID so a vendor can
/// spot when the same license shows up on multiple machines, and increments the
/// restore count.
///
/// `last_validated_date` is cleared because it belonged to the previous machine
/// and may be in the future relative to the new device's clock — otherwise the
/// clock-rollback guard would falsely invalidate a perfectly valid license.
pub fn mark_license_restored(adopted_hwid: &str) -> Result<(), String> {
    let conn = get_conn()?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE license SET \
            hwid = ?1, \
            original_hwid = CASE WHEN original_hwid IS NULL OR original_hwid = '' THEN ?1 ELSE original_hwid END, \
            hwid_restored_at = ?2, \
            restore_count = COALESCE(restore_count, 0) + 1, \
            last_validated_date = NULL \
         WHERE id = 1",
        rusqlite::params![adopted_hwid, now],
    )
    .map_err(|e| format!("Failed to record license restore: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn import_backup_file(file_path: String) -> Result<String, String> {
    import_backup_file_inner(file_path, false)
}

/// Same as `import_backup_file`, but instead of preserving the current
/// machine's license it keeps the license embedded in the backup file. Used by
/// the "Restore from Backup" flow on the License Activation screen when moving
/// to a new device.
pub fn import_backup_adopting_license(file_path: String) -> Result<String, String> {
    import_backup_file_inner(file_path, true)
}

fn import_backup_file_inner(file_path: String, adopt_backup_license: bool) -> Result<String, String> {
    validate_backup_file(file_path.clone())?;

    // Hold the DB mutex for the entire swap so no other thread can be served by
    // the pre-import connection while the file is being replaced underneath it.
    let mut slot = DB_CONN
        .lock()
        .map_err(|e| format!("Failed to lock DB connection: {}", e))?;

    let db_path_str = get_default_db_path()?;
    let db_path = std::path::Path::new(&db_path_str);
    
    let backups_dir = db_path.parent().unwrap_or_else(|| std::path::Path::new(".")).join("backups");
    if let Err(e) = std::fs::create_dir_all(&backups_dir) {
        return Err(format!("Failed to create safety backups directory: {}", e));
    }

    let timestamp = match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(d) => d.as_secs().to_string(),
        Err(_) => "backup".to_string(),
    };
    let safety_file = backups_dir.join(format!("pre-import-{}.db", timestamp));

    // Always snapshot the current database before overwriting it, so a failed or
    // mistaken import can be rolled back. Only the license read is conditional:
    // the restore flow adopts the backup's license instead of the current one.
    let mut current_license: Option<(String, String, Option<String>, Option<String>, Option<String>)> = None;
    if db_path.exists() {
        // Flush any un-checkpointed WAL frames so the safety copy is complete
        // and matches what the running connection sees.
        if let Some(live) = slot.as_ref() {
            let _ = live.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }

        std::fs::copy(db_path, &safety_file)
            .map_err(|e| format!("Failed to create safety backup of current database: {}", e))?;

        if !adopt_backup_license {
            if let Ok(old_conn) = Connection::open(db_path) {
                // Include activated_at, last_validated_date and hwid so they are preserved
                if let Ok(mut stmt) = old_conn.prepare("SELECT current_key, expiry_date, activated_at, last_validated_date, hwid FROM license LIMIT 1") {
                    if let Ok(mut rows) = stmt.query([]) {
                        if let Ok(Some(row)) = rows.next() {
                            if let (Ok(k), Ok(e)) = (row.get::<_, String>(0), row.get::<_, String>(1)) {
                                let act: Option<String> = row.get(2).unwrap_or(None);
                                let val: Option<String> = row.get(3).unwrap_or(None);
                                let hwid: Option<String> = row.get(4).unwrap_or(None);
                                current_license = Some((k, e, act, val, hwid));
                            }
                        }
                    }
                }
            }
        }
    }

    std::fs::copy(&file_path, db_path)
        .map_err(|e| format!("Failed to import database file: {}", e))?;

    // Reopen the global connection against the imported file. This also drops
    // the stale -wal/-shm from the previous database; leaving them in place
    // would let the OLD data be replayed over the imported file, which is why
    // an import previously appeared to "succeed" without the data appearing.
    // If the imported file cannot be opened, the pre-import safety copy is
    // restored automatically so the connection is never left uninitialized.
    reopen_connection_locked(&mut slot, Some(&safety_file))?;

    let conn = slot
        .as_ref()
        .ok_or_else(|| "Database connection not initialized after import.".to_string())?;

    // Restore the license to the newly imported database
    if let Some((key, expiry, activated, validated, hwid)) = current_license {
        let _ = conn.execute("CREATE TABLE IF NOT EXISTS license (id INTEGER PRIMARY KEY, current_key TEXT, expiry_date TEXT, activated_at TEXT, last_validated_date TEXT, hwid TEXT)", []);
        let _ = conn.execute("DELETE FROM license", []);
        let _ = conn.execute("INSERT INTO license (current_key, expiry_date, activated_at, last_validated_date, hwid) VALUES (?1, ?2, ?3, ?4, ?5)", rusqlite::params![key, expiry, activated, validated, hwid]);
    }

    run_migrations(conn)?;

    Ok(format!("Database imported. Safety copy created at: {}", safety_file.to_string_lossy()))
}

#[tauri::command]
pub fn verify_admin_password(password: String, session_token: String) -> Result<bool, String> {
    let session = crate::auth::validate(&session_token).map_err(|e| e.to_string())?;
    if session.role != "Admin" {
        return Err("Admin access required for this action.".to_string());
    }
    if crate::auth::is_verify_locked(&session.username) {
        return Err("Too many failed attempts. Please try again in a few minutes.".to_string());
    }

    let conn = get_conn()?;
    
    let mut stmt = conn.prepare("SELECT password_hash FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'Admin'").map_err(|e| e.to_string())?;
    let admin_hashes = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;

    let mut verified = false;
    for hash_result in admin_hashes {
        if let Ok(hash) = hash_result {
            if let Ok(true) = bcrypt::verify(&password, &hash) {
                verified = true;
                break;
            }
        }
    }

    if verified {
        crate::auth::clear_verify_attempts(&session.username);
    } else {
        crate::auth::record_verify_attempt(&session.username);
    }
    Ok(verified)
}

#[tauri::command]
pub fn verify_operator_password(password: String, session_token: String) -> Result<bool, String> {
    let session = crate::auth::validate(&session_token).map_err(|e| e.to_string())?;
    if session.role != "Admin" && session.role != "Cashier" {
        return Err("Operator access required for this action.".to_string());
    }
    if crate::auth::is_verify_locked(&session.username) {
        return Err("Too many failed attempts. Please try again in a few minutes.".to_string());
    }

    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        "SELECT password_hash FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name IN ('Admin', 'Cashier')"
    ).map_err(|e| e.to_string())?;
    let hashes = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;

    let mut verified = false;
    for hash_result in hashes {
        if let Ok(hash) = hash_result {
            if let Ok(true) = bcrypt::verify(&password, &hash) {
                verified = true;
                break;
            }
        }
    }

    if verified {
        crate::auth::clear_verify_attempts(&session.username);
    } else {
        crate::auth::record_verify_attempt(&session.username);
    }
    Ok(verified)
}

#[derive(Serialize)]
pub struct DetailedOrder {
    pub id: i32,
    pub table_number: String,
    pub table_category_name: Option<String>,
    pub created_at: String,
    pub total: f64,
    pub status: String,
    pub cashier: String,
}

#[derive(Serialize)]
pub struct DetailedExpense {
    pub id: i32,
    pub date: String,
    pub category: String,
    pub amount: f64,
    pub note: String,
}

#[derive(Serialize)]
pub struct DetailedPayout {
    pub id: i32,
    pub staff_name: String,
    pub date: String,
    pub amount: f64,
    pub payout_type: String,
    pub note: Option<String>,
}



#[derive(Serialize)]
pub struct DetailedReport {
    pub orders: Vec<DetailedOrder>,
    pub expenses: Vec<DetailedExpense>,
    pub payouts: Vec<DetailedPayout>,
    pub total_revenue: f64,
    pub total_expenses: f64,
    pub net_profit: f64,
    pub profit_margin: f64,
    pub total_orders: i32,
    pub avg_order_value: f64,
    pub sales_trend: Vec<DailyTrend>,
    pub expenses_by_category: Vec<CategoryExpense>,
    pub top_items: Vec<TopItem>,
}

#[tauri::command]
pub fn get_detailed_report(start_date: String, end_date: String) -> Result<DetailedReport, String> {
    let conn = get_conn()?;
    let end_date = format!("{}T23:59:59.999Z", end_date);

    // Orders — only completed (Closed) orders, keyed on closed_at so revenue is
    // counted when actually paid, matching get_analytics_report.
    let mut orders = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT o.id, o.table_number, COALESCE(o.created_at, ''), 
         (COALESCE(o.subtotal, 0.0) + COALESCE(o.tax_amount, 0.0) + COALESCE(o.service_charge_amount, 0.0) + COALESCE(o.delivery_fee, 0.0) - COALESCE(o.discount_amount, 0.0)) as total, 
         COALESCE(o.status, ''), COALESCE(o.cashier_name, ''), c.name
         FROM orders o
         LEFT JOIN table_status ts ON o.table_id = ts.id
         LEFT JOIN table_categories c ON ts.category_id = c.id
         WHERE o.status = 'Closed' AND date(o.closed_at) >= ?1 AND date(o.closed_at) <= ?2
         ORDER BY o.closed_at DESC LIMIT 5"
    ).map_err(|e| e.to_string())?;
    
    let order_iter = stmt.query_map([&start_date, &end_date], |row| {
        let tbl: i32 = row.get(1).unwrap_or(0);
        let cat: Option<String> = row.get(6).unwrap_or(None);
        let tbl_str = if tbl == 0 { 
            "Walk-in".to_string() 
        } else { 
            if let Some(c) = cat.clone() {
                format!("{} - Table {}", c, format!("{:02}", tbl))
            } else {
                format!("Table {}", format!("{:02}", tbl))
            }
        };
        Ok(DetailedOrder {
            id: row.get(0)?,
            table_number: tbl_str,
            created_at: row.get(2)?,
            total: row.get(3)?,
            status: row.get(4)?,
            cashier: row.get(5)?,
            table_category_name: row.get(6).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;
    
    for o in order_iter {
        if let Ok(order) = o {
            orders.push(order);
        }
    }

    // Expenses
    let mut expenses = Vec::new();
    let mut stmt2 = conn.prepare(
        "SELECT id, date, category, amount, COALESCE(note, '') 
         FROM expenses 
         WHERE date >= ?1 AND date <= ?2 AND COALESCE(note, '') NOT LIKE 'Payroll%'
         ORDER BY date DESC LIMIT 5"
    ).map_err(|e| e.to_string())?;
    
    let exp_iter = stmt2.query_map([&start_date, &end_date], |row| {
        Ok(DetailedExpense {
            id: row.get(0)?,
            date: row.get(1)?,
            category: row.get(2)?,
            amount: row.get(3)?,
            note: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    
    for e in exp_iter {
        if let Ok(exp) = e {
            expenses.push(exp);
        }
    }

    // Payouts — salary payouts plus salary advances paid in the period, so the
    // report shows both regular pay and advanced salary money.
    let mut payouts = Vec::new();
    let mut stmt3 = conn.prepare(
        "SELECT p.id, s.name, p.date, p.amount, 'Salary' as payout_type, NULL as note
         FROM salary_payouts p
         JOIN staff s ON p.staff_id = s.id
         WHERE p.date >= ?1 AND p.date <= ?2
         UNION ALL
         SELECT a.id + 1000000, s.name, a.date, a.amount, 'Advance' as payout_type, a.note
         FROM advance_salaries a
         JOIN staff s ON a.staff_id = s.id
         WHERE a.date >= ?1 AND a.date <= ?2
         ORDER BY date DESC LIMIT 5"
    ).map_err(|e| e.to_string())?;
    
    let pay_iter = stmt3.query_map([&start_date, &end_date], |row| {
        Ok(DetailedPayout {
            id: row.get(0)?,
            staff_name: row.get(1)?,
            date: row.get(2)?,
            amount: row.get(3)?,
            payout_type: row.get(4)?,
            note: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    
    for p in pay_iter {
        if let Ok(pay) = p {
            payouts.push(pay);
        }
    }

    // Totals — Closed orders only, keyed on closed_at (matches order list above).
    let total_revenue: f64 = conn.query_row(
        "SELECT COALESCE(SUM(COALESCE(subtotal, 0.0) + COALESCE(tax_amount, 0.0) + COALESCE(service_charge_amount, 0.0) + COALESCE(delivery_fee, 0.0) - COALESCE(discount_amount, 0.0)), 0) 
         FROM orders 
         WHERE status = 'Closed' AND date(closed_at) >= ?1 AND date(closed_at) <= ?2",
        [&start_date, &end_date], |row| row.get(0)
    ).unwrap_or(0.0);

    let total_orders: i32 = conn.query_row(
        "SELECT COUNT(id) FROM orders WHERE status = 'Closed' AND date(closed_at) >= ?1 AND date(closed_at) <= ?2",
        [&start_date, &end_date], |row| row.get(0)
    ).unwrap_or(0);

    let total_exp_only: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE date >= ?1 AND date <= ?2 AND COALESCE(note, '') NOT LIKE 'Payroll%'",
        [&start_date, &end_date], |row| row.get(0)
    ).unwrap_or(0.0);

    let total_pay_only: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM salary_payouts WHERE date >= ?1 AND date <= ?2",
        [&start_date, &end_date], |row| row.get(0)
    ).unwrap_or(0.0);

    let total_expenses = total_exp_only + total_pay_only;
    let net_profit = total_revenue - total_expenses;
    let profit_margin = if total_revenue > 0.0 { (net_profit / total_revenue) * 100.0 } else { 0.0 };
    let avg_order_value = if total_orders > 0 { total_revenue / total_orders as f64 } else { 0.0 };

    // Daily Trend — keyed on closed_at to match the rest of the report.
    let mut sales_trend = Vec::new();
    let mut stmt4 = conn.prepare(
        "SELECT DISTINCT d FROM (
            SELECT date(closed_at) as d FROM orders WHERE status = 'Closed' AND date(closed_at) >= ?1 AND date(closed_at) <= ?2
            UNION
            SELECT date FROM expenses WHERE date >= ?1 AND date <= ?2
        ) ORDER BY d"
    ).map_err(|e| e.to_string())?;
    
    let dates: Vec<String> = stmt4.query_map([&start_date, &end_date], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let mut sales_map = std::collections::HashMap::new();
    let mut sales_stmt = conn.prepare(
        "SELECT date(closed_at), COALESCE(SUM(COALESCE(subtotal, 0.0) + COALESCE(tax_amount, 0.0) + COALESCE(service_charge_amount, 0.0) + COALESCE(delivery_fee, 0.0) - COALESCE(discount_amount, 0.0)), 0) FROM orders WHERE status = 'Closed' AND date(closed_at) >= ?1 AND date(closed_at) <= ?2 GROUP BY date(closed_at)"
    ).map_err(|e| e.to_string())?;
    
    let sales_iter = sales_stmt.query_map([&start_date, &end_date], |row| {
        let date: String = row.get(0).unwrap_or_default();
        let sum: f64 = row.get(1).unwrap_or(0.0);
        Ok((date, sum))
    }).map_err(|e| e.to_string())?;

    for res in sales_iter {
        if let Ok((date, sum)) = res {
            sales_map.insert(date, sum);
        }
    }

    let mut expenses_map = std::collections::HashMap::new();
    let mut exp_stmt = conn.prepare(
        "SELECT date, COALESCE(SUM(amount), 0) FROM expenses WHERE date >= ?1 AND date <= ?2 AND COALESCE(note, '') NOT LIKE 'Payroll%' GROUP BY date"
    ).map_err(|e| e.to_string())?;
    
    let exp_iter = exp_stmt.query_map([&start_date, &end_date], |row| {
        let date: String = row.get(0).unwrap_or_default();
        let sum: f64 = row.get(1).unwrap_or(0.0);
        Ok((date, sum))
    }).map_err(|e| e.to_string())?;

    for res in exp_iter {
        if let Ok((date, sum)) = res {
            expenses_map.insert(date, sum);
        }
    }

    for date in dates {
        let daily_sales = *sales_map.get(&date).unwrap_or(&0.0);
        let daily_expenses = *expenses_map.get(&date).unwrap_or(&0.0);

        sales_trend.push(DailyTrend {
            date,
            sales: daily_sales,
            expenses: daily_expenses,
        });
    }

    // Category Expenses
    let mut stmt5 = conn.prepare(
        "SELECT category, SUM(amount) FROM expenses WHERE date >= ?1 AND date <= ?2 AND COALESCE(note, '') NOT LIKE 'Payroll%' GROUP BY category ORDER BY SUM(amount) DESC"
    ).map_err(|e| e.to_string())?;
    
    let expenses_by_category: Vec<CategoryExpense> = stmt5.query_map([&start_date, &end_date], |row| {
        Ok(CategoryExpense {
            name: row.get(0)?,
            value: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    // Top Items
    let mut stmt6 = conn.prepare(
        "SELECT oi.name, SUM(oi.quantity) as q, SUM(oi.price * oi.quantity) as r
         FROM orders o JOIN order_items oi ON o.id = oi.order_id
         WHERE o.status = 'Closed' AND date(o.closed_at) >= ?1 AND date(o.closed_at) <= ?2
         GROUP BY oi.item_id, oi.name ORDER BY q DESC LIMIT 5"
    ).map_err(|e| e.to_string())?;
    
    let top_items: Vec<TopItem> = stmt6.query_map([&start_date, &end_date], |row| {
        Ok(TopItem {
            name: row.get(0)?,
            quantity: row.get(1)?,
            revenue: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    Ok(DetailedReport {
        orders,
        expenses,
        payouts,
        total_revenue,
        total_expenses,
        net_profit,
        profit_margin,
        total_orders,
        avg_order_value,
        sales_trend,
        expenses_by_category,
        top_items,
    })
}

#[derive(serde::Serialize)]
pub struct DeliveryOrder {
    pub id: i32,
    pub order_number: i32,
    pub created_at: Option<String>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub delivery_address: Option<String>,
    pub status: String,
    pub delivery_status: Option<String>,
    pub total_price: f64,
    pub delivery_fee: f64,
    pub driver_name: Option<String>,
}

#[derive(serde::Serialize)]
pub struct DeliverySettings {
    pub base_delivery_fee: f64,
    pub free_delivery_threshold: f64,
}

#[tauri::command]
pub fn get_delivery_settings() -> Result<DeliverySettings, String> {
    let conn = get_conn()?;
    
    let settings = conn.query_row(
        "SELECT base_delivery_fee, free_delivery_threshold FROM restaurant_settings WHERE id = 1",
        [],
        |row| Ok(DeliverySettings {
            base_delivery_fee: row.get(0).unwrap_or(0.0),
            free_delivery_threshold: row.get(1).unwrap_or(0.0),
        })
    ).map_err(|e| e.to_string())?;
    
    Ok(settings)
}

#[tauri::command]
pub fn update_delivery_settings(base_delivery_fee: f64, free_delivery_threshold: f64) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute(
        "UPDATE restaurant_settings SET base_delivery_fee = ?1, free_delivery_threshold = ?2 WHERE id = 1",
        rusqlite::params![base_delivery_fee, free_delivery_threshold]
    ).map_err(|e| e.to_string())?;
    
    Ok("Delivery settings updated".into())
}

#[tauri::command]
pub fn get_active_deliveries() -> Result<Vec<DeliveryOrder>, String> {
    let conn = get_conn()?;
    
    let mut stmt = conn.prepare(
        "SELECT o.id, COALESCE(o.order_number, 0), o.created_at, c.name, c.phone, o.delivery_address, o.status, o.delivery_status, 
                COALESCE(SUM(oi.price * oi.quantity), 0) + COALESCE(o.delivery_fee, 0) + COALESCE(o.tax_amount, 0.0) + COALESCE(o.service_charge_amount, 0.0) - COALESCE(o.discount_amount, 0.0) as total_price,
                o.delivery_fee, s.name as driver_name
         FROM orders o
         LEFT JOIN customers c ON o.customer_id = c.id
         LEFT JOIN staff s ON o.delivery_driver_id = s.id
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.order_type = 'Delivery' AND o.status IN ('Placed', 'Delivery Pending') AND COALESCE(o.delivery_status, 'Pending') != 'Delivered'
         GROUP BY o.id ORDER BY o.id ASC"
    ).map_err(|e| e.to_string())?;
    
    let deliveries = stmt.query_map([], |row| {
        Ok(DeliveryOrder {
            id: row.get(0)?,
            order_number: row.get(1)?,
            created_at: row.get(2).unwrap_or(None),
            customer_name: row.get(3).unwrap_or(None),
            customer_phone: row.get(4).unwrap_or(None),
            delivery_address: row.get(5).unwrap_or(None),
            status: row.get(6)?,
            delivery_status: row.get(7).unwrap_or(Some("Pending".to_string())),
            total_price: row.get(8).unwrap_or(0.0),
            delivery_fee: row.get(9).unwrap_or(0.0),
            driver_name: row.get(10).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    
    Ok(deliveries)
}

#[tauri::command]
pub fn update_delivery_status(order_id: i32, status: String) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;
    
    tx.execute(
        "UPDATE orders SET delivery_status = ?1 WHERE id = ?2",
        rusqlite::params![status, order_id]
    ).map_err(|e| e.to_string())?;
    
    if status == "Delivered" {
        // Defense in depth: never close an order that has no items.
        let item_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM order_items WHERE order_id = ?1",
            [&order_id], |row| row.get(0)
        ).map_err(|e| e.to_string())?;
        if item_count == 0 {
            return Err("Cannot mark an empty order as Delivered.".into());
        }

        tx.execute(
            "UPDATE orders SET status = 'Closed', closed_at = datetime('now', 'localtime') WHERE id = ?1",
            rusqlite::params![order_id]
        ).map_err(|e| e.to_string())?;

        // Free the physical table this delivery originated from (if any), so a
        // dine-in order converted to delivery is not left Occupied forever.
        let order_table: i32 = tx.query_row(
            "SELECT COALESCE(table_id, 0) FROM orders WHERE id = ?1",
            [&order_id], |row| row.get(0)
        ).unwrap_or(0);
        if order_table > 0 {
            tx.execute("UPDATE table_status SET status = 'Available' WHERE id = ?1", [&order_table]).map_err(|e| e.to_string())?;
        }
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok("Delivery status updated".into())
}

#[tauri::command]
pub fn assign_delivery_driver(order_id: i32, driver_id: i32) -> Result<String, String> {
    let conn = get_conn()?;
    
    conn.execute(
        "UPDATE orders SET delivery_driver_id = ?1, delivery_status = 'Dispatched' WHERE id = ?2",
        rusqlite::params![driver_id, order_id]
    ).map_err(|e| e.to_string())?;
    
    Ok("Driver assigned".into())
}

#[tauri::command]
pub fn place_delivery_order(
    order_id: i32, 
    customer_id: Option<i32>,
    delivery_address: String,
    customer_phone: Option<String>,
    delivery_fee: f64,
    subtotal: f64,
    tax_amount: f64,
    discount_amount: f64,
    cashier_name: String,
    order_note: String,
    service_charge_amount: f64
) -> Result<String, String> {
    let mut conn_guard = get_conn()?;

    if !delivery_fee.is_finite() || delivery_fee < 0.0 {
        return Err("Delivery fee cannot be negative.".into());
    }
    if !discount_amount.is_finite() || discount_amount < 0.0 {
        return Err("Discount must be a non-negative number.".into());
    }
    if !subtotal.is_finite() || subtotal < 0.0 {
        return Err("Invalid subtotal.".into());
    }
    if !tax_amount.is_finite() || tax_amount < 0.0 {
        return Err("Invalid tax amount.".into());
    }
    if !service_charge_amount.is_finite() || service_charge_amount < 0.0 {
        return Err("Invalid service charge amount.".into());
    }

    // Recompute the financials server-side, mirroring checkout_order. Never
    // trust client-supplied money values: subtotal is derived from order_items,
    // tax/service charge from the configured settings, and the discount is
    // clamped to the gross payable so the total can never go negative.
    let server_subtotal: f64 = conn_guard.query_row(
        "SELECT COALESCE(SUM(price * quantity), 0.0) FROM order_items WHERE order_id = ?1",
        [&order_id], |row| row.get(0)
    ).map_err(|e| e.to_string())?;

    // Never place a delivery order that has no items. An empty cart must not be
    // placed even if the delivery fee would make its total positive.
    let item_count: i64 = conn_guard.query_row(
        "SELECT COUNT(*) FROM order_items WHERE order_id = ?1",
        [&order_id], |row| row.get(0)
    ).map_err(|e| e.to_string())?;
    if item_count == 0 {
        return Err("Cannot place an empty order. Please add at least one item first.".into());
    }

    let (tax_rate, sc_rate, sc_types): (f64, f64, String) = conn_guard.query_row(
        "SELECT COALESCE(tax_rate, 0.0), COALESCE(service_charge_rate, 0.0), COALESCE(service_charge_types, 'Dine-in') FROM restaurant_settings WHERE id = 1",
        [], |row| Ok((row.get(0).unwrap_or(0.0), row.get(1).unwrap_or(0.0), row.get(2).unwrap_or("Dine-in".to_string())))
    ).map_err(|e| e.to_string())?;

    let server_tax = round2(server_subtotal * tax_rate / 100.0);
    let sc_applies = sc_types.split(',').any(|t| t.trim() == "Delivery");
    let server_sc = if sc_applies { round2(server_subtotal * sc_rate / 100.0) } else { 0.0 };
    let gross = round2(server_subtotal) + server_tax + server_sc;
    let discount = round2(discount_amount.min(gross));
    let server_total = round2(gross + delivery_fee - discount);

    if server_total <= 0.0 {
        return Err("Order total cannot be zero or negative. Please check the discount.".to_string());
    }

    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;
    let mut final_customer_id = customer_id;

    if let Some(c_id) = customer_id {
        // Update the customer's address and phone in case it changed
        if let Some(phone) = &customer_phone {
            if !phone.trim().is_empty() {
                tx.execute(
                    "UPDATE customers SET address = ?1, phone = ?2 WHERE id = ?3",
                    rusqlite::params![delivery_address, phone, c_id],
                ).map_err(|e| e.to_string())?;
            } else {
                tx.execute(
                    "UPDATE customers SET address = ?1 WHERE id = ?2",
                    rusqlite::params![delivery_address, c_id],
                ).map_err(|e| e.to_string())?;
            }
        } else {
            tx.execute(
                "UPDATE customers SET address = ?1 WHERE id = ?2",
                rusqlite::params![delivery_address, c_id],
            ).map_err(|e| e.to_string())?;
        }
        // Loyalty: an existing customer placing a delivery also gains a visit
        tx.execute("UPDATE customers SET visits = visits + 1 WHERE id = ?1", [&c_id]).map_err(|e| e.to_string())?;
    } else if let Some(phone) = &customer_phone {
        if !phone.trim().is_empty() {
            // Check if a customer with this phone exists
            let mut stmt = tx.prepare("SELECT id FROM customers WHERE phone = ?1").map_err(|e| e.to_string())?;
            let existing_id: Result<i32, _> = stmt.query_row([phone], |row| row.get(0));
            
            if let Ok(id) = existing_id {
                final_customer_id = Some(id);
                tx.execute("UPDATE customers SET address = ?1 WHERE id = ?2", rusqlite::params![delivery_address, id]).map_err(|e| e.to_string())?;
                // Loyalty: repeat delivery customer gains a visit
                tx.execute("UPDATE customers SET visits = visits + 1 WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
            } else {
                // Insert new customer
                tx.execute(
                    "INSERT INTO customers (name, phone, address, visits) VALUES (?1, ?2, ?3, 1)",
                    rusqlite::params!["Guest", phone, delivery_address]
                ).map_err(|e| e.to_string())?;
                final_customer_id = Some(tx.last_insert_rowid() as i32);
            }
        }
    }

    // Place the order (status = 'Placed') so get_or_create_order doesn't overwrite it
    // and set delivery_status = 'Pending'. Money values are the server-recomputed
    // ones; only the delivery fee comes from the client (validated non-negative).
    tx.execute(
        "UPDATE orders SET status = 'Placed', delivery_status = 'Pending', 
        order_type = 'Delivery', subtotal = ?2, tax_amount = ?3, discount_amount = ?4, 
        customer_id = ?5, cashier_name = ?6, order_note = ?7, 
        delivery_address = ?8, delivery_fee = ?9, service_charge_amount = ?10
        WHERE id = ?1", 
        rusqlite::params![
            order_id, round2(server_subtotal), server_tax, discount, 
            final_customer_id, cashier_name, order_note, delivery_address, delivery_fee, server_sc
        ]
    ).map_err(|e| e.to_string())?;
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok("Delivery order placed".into())
}

// --- INVENTORY MANAGEMENT ---

#[derive(serde::Serialize)]
pub struct InventoryItem {
    pub id: i32,
    pub name: String,
    pub unit: String,
    pub low_stock_threshold: f64,
    pub current_stock: f64,
    pub default_supplier: Option<String>,
}

#[derive(serde::Serialize)]
pub struct InventoryTransaction {
    pub id: i32,
    pub item_id: i32,
    pub item_name: String,
    pub item_unit: String,
    pub transaction_type: String,
    pub quantity: f64,
    pub unit_price: Option<f64>,
    pub total_cost: Option<f64>,
    pub supplier: Option<String>,
    pub note: Option<String>,
    pub date: String,
}

#[derive(serde::Serialize)]
pub struct InventorySummary {
    pub total_items: i32,
    pub low_stock_count: i32,
    pub out_of_stock_count: i32,
    pub period_purchase_total: f64,
}

#[tauri::command]
pub fn get_inventory_items() -> Result<Vec<InventoryItem>, String> {
    let conn = get_conn()?;

    let mut stmt = conn.prepare(
        "SELECT i.id, i.name, i.unit, i.low_stock_threshold,
            COALESCE(
                (SELECT SUM(CASE WHEN t.type = 'purchase' THEN t.quantity ELSE -t.quantity END)
                 FROM inventory_transactions t WHERE t.item_id = i.id), 0
            ) as current_stock,
            i.default_supplier
        FROM inventory_items i
        ORDER BY i.name ASC"
    ).map_err(|e| e.to_string())?;

    let iter = stmt.query_map([], |row| {
        Ok(InventoryItem {
            id: row.get(0)?,
            name: row.get(1)?,
            unit: row.get(2)?,
            low_stock_threshold: row.get(3)?,
            current_stock: row.get(4)?,
            default_supplier: row.get(5).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for item in iter {
        items.push(item.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

#[tauri::command]
pub fn add_inventory_item(name: String, unit: String, low_stock_threshold: f64, default_supplier: Option<String>) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute(
        "INSERT INTO inventory_items (name, unit, low_stock_threshold, default_supplier) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![name, unit, low_stock_threshold, default_supplier]
    ).map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            format!("An item named '{}' already exists", name)
        } else {
            e.to_string()
        }
    })?;
    Ok("Item added".into())
}

#[tauri::command]
pub fn update_inventory_item(id: i32, name: String, unit: String, low_stock_threshold: f64, default_supplier: Option<String>) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute(
        "UPDATE inventory_items SET name = ?1, unit = ?2, low_stock_threshold = ?3, default_supplier = ?4 WHERE id = ?5",
        rusqlite::params![name, unit, low_stock_threshold, default_supplier, id]
    ).map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            format!("An item named '{}' already exists", name)
        } else {
            e.to_string()
        }
    })?;
    Ok("Item updated".into())
}

#[tauri::command]
pub fn delete_inventory_item(id: i32) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    // Purchases for this item are auto-logged as expenses; removing the item
    // from Inventory must remove the linked expenses too so the ledger stays in sync.
    tx.execute(
        "DELETE FROM expenses WHERE reference_type = 'inventory_purchase' AND reference_id IN (
            SELECT id FROM inventory_transactions WHERE item_id = ?1 AND type = 'purchase'
        )",
        [&id]
    ).map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM inventory_transactions WHERE item_id = ?1", [&id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM inventory_items WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok("Item and all its transactions deleted".into())
}

#[tauri::command]
pub fn record_inventory_usage(item_id: i32, quantity: f64, note: Option<String>) -> Result<String, String> {
    if quantity <= 0.0 {
        return Err("Quantity must be greater than 0".into());
    }
    let conn = get_conn()?;

    // Verify item exists
    let _name: String = conn.query_row(
        "SELECT name FROM inventory_items WHERE id = ?1", [&item_id],
        |row| row.get(0)
    ).map_err(|_| "Item not found".to_string())?;

    let today = chrono_today();

    // Insert usage transaction (no blocking on insufficient stock)
    conn.execute(
        "INSERT INTO inventory_transactions (item_id, type, quantity, date, note) VALUES (?1, 'usage', ?2, ?3, ?4)",
        rusqlite::params![item_id, quantity, today, note]
    ).map_err(|e| e.to_string())?;

    Ok("Usage recorded".into())
}

#[tauri::command]
pub fn record_inventory_purchase(
    item_id: i32,
    quantity: f64,
    total_cost: f64,
    supplier: Option<String>,
    note: Option<String>,
) -> Result<String, String> {
    if quantity <= 0.0 {
        return Err("Quantity must be greater than 0".into());
    }
    if total_cost < 0.0 {
        return Err("Total cost cannot be negative".into());
    }
    let conn = get_conn()?;

    // Fetch item details
    let (item_name, item_unit): (String, String) = conn.query_row(
        "SELECT name, unit FROM inventory_items WHERE id = ?1", [&item_id],
        |row| Ok((row.get(0)?, row.get(1)?))
    ).map_err(|_| "Item not found".to_string())?;

    let unit_price = if quantity > 0.0 { total_cost / quantity } else { 0.0 };
    let today = chrono_today();

    // Insert purchase transaction
    conn.execute(
        "INSERT INTO inventory_transactions (item_id, type, quantity, unit_price, total_cost, supplier, note, date) VALUES (?1, 'purchase', ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![item_id, quantity, unit_price, total_cost, supplier, note, today]
    ).map_err(|e| e.to_string())?;
    let transaction_id = conn.last_insert_rowid() as i32;

    // Auto-create expense entry, linked back to the inventory transaction so
    // deleting the purchase from Inventory removes the expense automatically,
    // and deleting it from Expenses is rejected (see delete_expense).
    let supplier_str = supplier.as_deref().map(|s| format!(" from {}", s)).unwrap_or_default();
    let expense_note = format!("Inventory: {} {} {}{}", quantity, item_unit, item_name, supplier_str);
    conn.execute(
        "INSERT INTO expenses (amount, date, category, note, reference_type, reference_id) VALUES (?1, ?2, 'Inventory', ?3, 'inventory_purchase', ?4)",
        rusqlite::params![total_cost, today, expense_note, transaction_id]
    ).map_err(|e| e.to_string())?;

    Ok("Purchase recorded and expense logged".into())
}

#[tauri::command]
pub fn delete_inventory_transaction(id: i32) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;

    let txn_type: String = tx.query_row(
        "SELECT type FROM inventory_transactions WHERE id = ?1",
        [&id], |row| row.get(0)
    ).map_err(|_| "Inventory transaction not found.".to_string())?;

    tx.execute("DELETE FROM inventory_transactions WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;

    // Purchases are auto-logged as expenses; removing the purchase from
    // Inventory must remove the linked expense too so the ledger stays in sync.
    if txn_type == "purchase" {
        tx.execute(
            "DELETE FROM expenses WHERE reference_type = 'inventory_purchase' AND reference_id = ?1",
            [&id]
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok("Inventory transaction deleted".into())
}

fn chrono_today() -> String {
    chrono::Local::now().date_naive().format("%Y-%m-%d").to_string()
}

#[tauri::command]
pub fn get_inventory_transactions(
    start_date: Option<String>,
    end_date: Option<String>,
    item_id: Option<i32>,
    transaction_type: Option<String>,
) -> Result<Vec<InventoryTransaction>, String> {
    let conn = get_conn()?;

    let mut sql = String::from(
        "SELECT t.id, t.item_id, i.name, i.unit, t.type, t.quantity, t.unit_price, t.total_cost, t.supplier, t.note, t.date
         FROM inventory_transactions t
         JOIN inventory_items i ON t.item_id = i.id
         WHERE 1=1"
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref sd) = start_date {
        sql.push_str(" AND t.date >= ?");
        params.push(Box::new(sd.clone()));
    }
    if let Some(ref ed) = end_date {
        sql.push_str(" AND t.date <= ?");
        params.push(Box::new(ed.clone()));
    }
    if let Some(iid) = item_id {
        sql.push_str(" AND t.item_id = ?");
        params.push(Box::new(iid));
    }
    if let Some(ref tt) = transaction_type {
        if tt != "all" {
            sql.push_str(" AND t.type = ?");
            params.push(Box::new(tt.clone()));
        }
    }
    sql.push_str(" ORDER BY t.date DESC, t.id DESC");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let iter = stmt.query_map(param_refs.as_slice(), |row| {
        Ok(InventoryTransaction {
            id: row.get(0)?,
            item_id: row.get(1)?,
            item_name: row.get(2)?,
            item_unit: row.get(3)?,
            transaction_type: row.get(4)?,
            quantity: row.get(5)?,
            unit_price: row.get(6).unwrap_or(None),
            total_cost: row.get(7).unwrap_or(None),
            supplier: row.get(8).unwrap_or(None),
            note: row.get(9).unwrap_or(None),
            date: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut transactions = Vec::new();
    for t in iter {
        transactions.push(t.map_err(|e| e.to_string())?);
    }
    Ok(transactions)
}

#[tauri::command]
pub fn get_inventory_summary(start_date: Option<String>, end_date: Option<String>) -> Result<InventorySummary, String> {
    let conn = get_conn()?;

    let total_items: i32 = conn.query_row(
        "SELECT COUNT(*) FROM inventory_items", [],
        |row| row.get(0)
    ).unwrap_or(0);

    let mut stmt = conn.prepare(
        "SELECT i.low_stock_threshold,
            COALESCE(
                (SELECT SUM(CASE WHEN t.type = 'purchase' THEN t.quantity ELSE -t.quantity END)
                 FROM inventory_transactions t WHERE t.item_id = i.id), 0
            ) as current_stock
        FROM inventory_items i"
    ).map_err(|e| e.to_string())?;

    let mut low_stock_count = 0i32;
    let mut out_of_stock_count = 0i32;
    let stock_iter = stmt.query_map([], |row| {
        Ok((row.get::<_, f64>(0)?, row.get::<_, f64>(1)?))
    }).map_err(|e| e.to_string())?;
    for entry in stock_iter {
        if let Ok((threshold, stock)) = entry {
            if stock <= 0.0 {
                out_of_stock_count += 1;
            } else if stock <= threshold {
                low_stock_count += 1;
            }
        }
    }

    let mut sql = String::from("SELECT COALESCE(SUM(total_cost), 0) FROM inventory_transactions WHERE type = 'purchase'");
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    
    if let Some(ref sd) = start_date {
        sql.push_str(" AND date >= ?");
        params.push(Box::new(sd.clone()));
    }
    if let Some(ref ed) = end_date {
        sql.push_str(" AND date <= ?");
        params.push(Box::new(ed.clone()));
    }
    if start_date.is_none() && end_date.is_none() {
        let today = chrono_today();
        sql.push_str(" AND date = ?");
        params.push(Box::new(today));
    }
    
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let period_purchase_total: f64 = conn.query_row(
        &sql, param_refs.as_slice(),
        |row| row.get(0)
    ).unwrap_or(0.0);

    Ok(InventorySummary {
        total_items,
        low_stock_count,
        out_of_stock_count,
        period_purchase_total,
    })
}

#[derive(serde::Serialize)]
pub struct TableCategory {
    pub id: i32,
    pub name: String,
}

#[tauri::command]
pub fn get_table_categories() -> Result<Vec<TableCategory>, String> {
    let conn = get_conn()?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS table_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )", []
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, name FROM table_categories ORDER BY id").map_err(|e| e.to_string())?;
    let cats = stmt.query_map([], |row| {
        Ok(TableCategory {
            id: row.get(0)?,
            name: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    Ok(cats)
}

#[tauri::command]
pub fn add_table_category(name: String) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute("INSERT INTO table_categories (name) VALUES (?1)", [&name]).map_err(|e| e.to_string())?;
    Ok("Category added".into())
}

#[tauri::command]
pub fn update_table_category(id: i32, name: String) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute("UPDATE table_categories SET name = ?1 WHERE id = ?2", rusqlite::params![name, id]).map_err(|e| e.to_string())?;
    Ok("Category updated".into())
}

#[tauri::command]
pub fn delete_table_category(id: i32) -> Result<String, String> {
    let conn = get_conn()?;
    let count: i32 = conn.query_row("SELECT COUNT(*) FROM table_status WHERE category_id = ?1", [&id], |row| row.get(0)).unwrap_or(0);
    if count > 0 {
        return Err("Cannot delete category because it still contains tables. Please move or delete the tables first.".into());
    }
    conn.execute("DELETE FROM table_categories WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    Ok("Category deleted".into())
}

#[tauri::command]
pub fn add_tables(category_id: i32, numbers: String) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let mut to_add = Vec::new();
    for part in numbers.split(',') {
        let part = part.trim();
        if part.contains('-') {
            let bounds: Vec<&str> = part.split('-').collect();
            if bounds.len() == 2 {
                if let (Ok(start), Ok(end)) = (bounds[0].trim().parse::<i32>(), bounds[1].trim().parse::<i32>()) {
                    // Reject unbounded/inverted ranges that could hang the main
                    // thread with billions of inserts.
                    if end < start || end - start > 499 {
                        return Err("Table range is too large. Add at most 500 tables at a time.".into());
                    }
                    for i in start..=end {
                        to_add.push(i);
                    }
                }
            }
        } else if let Ok(num) = part.parse::<i32>() {
            to_add.push(num);
        }
    }
    if to_add.is_empty() {
        return Err("No valid table numbers provided.".into());
    }
    if to_add.len() > 500 {
        return Err("Too many tables in a single request. Add at most 500 tables at a time.".into());
    }

    // All-or-nothing so a partial failure cannot leave the batch half-added.
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;
    let mut added = 0;
    for table_number in to_add {
        let exists: bool = tx.query_row(
            "SELECT COUNT(*) FROM table_status WHERE category_id = ?1 AND table_number = ?2",
            rusqlite::params![category_id, table_number],
            |row| row.get::<_, i64>(0)
        ).unwrap_or(0) > 0;
        if exists {
            return Err(format!("Table number {} already exists in this category.", table_number));
        }
        tx.execute("INSERT INTO table_status (category_id, table_number, status) VALUES (?1, ?2, 'Available')", rusqlite::params![category_id, table_number]).map_err(|e| e.to_string())?;
        added += 1;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(format!("{} tables added", added))
}

#[tauri::command]
pub fn mark_kot_printed(order_id: i32) -> Result<String, String> {
    let conn = get_conn()?;
    conn.execute("ALTER TABLE order_items ADD COLUMN kot_printed_qty INTEGER DEFAULT 0", []).ok();
    // Track per-item quantity already sent to the kitchen so a later KOT only
    // reprints the additional items. Quantities printed are recorded once here.
    conn.execute("UPDATE order_items SET kot_printed_qty = quantity WHERE order_id = ?1", [&order_id]).map_err(|e| e.to_string())?;
    Ok("KOT marked as printed".into())
}
