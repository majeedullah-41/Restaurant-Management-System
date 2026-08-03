#![allow(dead_code, unused_variables, non_snake_case)]

use rusqlite::{Connection, Result};
use serde::Serialize;
use std::sync::{Mutex, OnceLock};

static DB_CONN: OnceLock<Mutex<Connection>> = OnceLock::new();

pub fn get_default_db_path() -> String {
    if let Ok(p) = std::env::var("DB_PATH") {
        if !p.trim().is_empty() {
            return p;
        }
    }

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let app_dir = std::path::Path::new(&local_app_data).join("RMS");
        if std::fs::create_dir_all(&app_dir).is_ok() {
            return app_dir.join("local.db").to_string_lossy().to_string();
        }
    }

    "local.db".to_string()
}

pub fn init_shared_connection() {
    let db_path = get_default_db_path();
    let conn = Connection::open(&db_path).expect("Failed to open global database connection");
    
    // Enable WAL mode & performance PRAGMAs to eliminate SQLite locks and lag
    let _ = conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;"
    );

    DB_CONN.set(Mutex::new(conn)).unwrap_or_else(|_| panic!("DB_CONN already initialized"));
}

pub fn get_conn() -> std::result::Result<std::sync::MutexGuard<'static, Connection>, String> {
    DB_CONN.get()
        .ok_or_else(|| "Database connection not initialized".to_string())
        .and_then(|mutex| mutex.lock().map_err(|e| format!("Failed to lock DB connection: {}", e)))
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub success: bool,
    pub role: Option<String>,
    pub username: Option<String>,
    pub display_name: Option<String>,
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
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role_id INTEGER NOT NULL, FOREIGN KEY(role_id) REFERENCES roles(id));
        CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS menu_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category_id INTEGER NOT NULL, price REAL NOT NULL, image_path TEXT, is_active INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(category_id) REFERENCES categories(id));
        CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, amount REAL NOT NULL, date TEXT NOT NULL, category TEXT NOT NULL, note TEXT);
        CREATE TABLE IF NOT EXISTS salary_payouts (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id INTEGER NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL);
        COMMIT;"
    )?;

    // Seed the default data
    conn.execute("INSERT OR IGNORE INTO roles (id, name) VALUES (1, 'Admin'), (2, 'Cashier')", [])?;
    conn.execute("INSERT OR IGNORE INTO restaurant_settings (id, restaurant_name, tax_rate, total_tables) VALUES (1, 'My Restaurant', 16.0, 10)", [])?;


    // NEW: Seed a default Admin user with hashed password
    let hash = bcrypt::hash("password", bcrypt::DEFAULT_COST).map_err(|e| rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e.to_string())))?;
    conn.execute("INSERT OR IGNORE INTO users (username, password_hash, role_id) VALUES ('admin@restaurant.com', ?1, 1)", [&hash])?;
    conn.execute("INSERT OR IGNORE INTO users (username, password_hash, role_id) VALUES ('cashier@restaurant.com', ?1, 2)", [&hash])?;

    println!("Database created and seeded successfully!");
    run_migrations(&conn).map_err(|e| rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(1), Some(e)))?;
    Ok(())
}

pub fn run_migrations(conn: &Connection) -> std::result::Result<(), String> {
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

    Ok(())
}

#[tauri::command]
pub fn update_user_profile(
    old_username: String,
    new_username: String,
    current_password: Option<String>,
    new_password: Option<String>,
    admin_override: Option<bool>,
    display_name: Option<String>,
    new_role: Option<String>,
) -> Result<(), String> {
    let conn = get_conn()?;

    // First check if user exists
    let mut stmt = conn.prepare("SELECT password_hash FROM users WHERE username = ?").map_err(|e| e.to_string())?;
    
    let db_password = stmt.query_row([&old_username], |row| row.get::<_, String>(0))
        .map_err(|_| "User not found".to_string())?;

    // If they want to change password, they must provide the correct current password
    if let Some(new_pw) = new_password {
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
            "UPDATE users SET username = ?, password_hash = ?, display_name = ? WHERE username = ?",
            [&new_username, &new_pw_hash, &display_name.unwrap_or_default(), &old_username],
        ).map_err(|e| e.to_string())?;
    } else {
        // Just update username and display_name
        conn.execute(
            "UPDATE users SET username = ?, display_name = ? WHERE username = ?",
            [&new_username, &display_name.unwrap_or_default(), &old_username],
        ).map_err(|e| e.to_string())?;
    }

    if let Some(role) = new_role {
        if let Ok(role_id) = conn.query_row("SELECT id FROM roles WHERE name = ?", [&role], |row| row.get::<_, i32>(0)) {
            conn.execute("UPDATE users SET role_id = ? WHERE username = ?", rusqlite::params![role_id, &new_username]).ok();
        }
    }

    Ok(())
}

#[tauri::command]
pub fn update_security_question(username: String, question: String, answer: String) -> Result<(), String> {
    let conn = get_conn()?;
    conn.execute(
        "UPDATE users SET security_question = ?, security_answer = ? WHERE username = ?",
        [&question, &answer, &username],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_security_question(username: String) -> Result<String, String> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT security_question FROM users WHERE username = ?").map_err(|e| e.to_string())?;
    let question: Option<String> = stmt.query_row([&username], |row| row.get(0)).map_err(|_| "User not found".to_string())?;
    match question {
        Some(q) => Ok(q),
        None => Err("No security question set for this user".to_string()),
    }
}

#[tauri::command]
pub fn reset_password_with_security_answer(username: String, answer: String, new_password: String) -> Result<(), String> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT security_answer FROM users WHERE username = ?").map_err(|e| e.to_string())?;
    let db_answer: Option<String> = stmt.query_row([&username], |row| row.get(0)).map_err(|_| "User not found".to_string())?;
    
    match db_answer {
        Some(a) => {
            if a.to_lowercase() == answer.to_lowercase() {
                let new_pw_hash = bcrypt::hash(&new_password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;
                conn.execute(
                    "UPDATE users SET password_hash = ? WHERE username = ?",
                    [&new_pw_hash, &username],
                ).map_err(|e| e.to_string())?;
                Ok(())
            } else {
                Err("Incorrect security answer".to_string())
            }
        },
        None => Err("No security question set for this user".to_string()),
    }
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

// NEW: The authentication command
#[tauri::command]
pub fn login(email: String, password: String) -> LoginResponse {
    let conn = match get_conn() {
        Ok(c) => c,
        Err(_) => return LoginResponse { success: false, role: None, username: None, display_name: None, message: "Database connection failed".into() },
    };

    let mut stmt = match conn.prepare(
        "SELECT r.name, u.display_name, u.password_hash FROM users u 
         JOIN roles r ON u.role_id = r.id 
         WHERE u.username = ?1"
    ) {
        Ok(s) => s,
        Err(_) => return LoginResponse { success: false, role: None, username: None, display_name: None, message: "Query preparation failed".into() },
    };

    let mut rows = match stmt.query([&email]) {
        Ok(r) => r,
        Err(_) => return LoginResponse { success: false, role: None, username: None, display_name: None, message: "Query execution failed".into() },
    };

    if let Ok(Some(row)) = rows.next() {
        let role: String = row.get(0).unwrap_or_default();
        let display_name: Option<String> = row.get(1).unwrap_or(None);
        let password_hash: String = row.get(2).unwrap_or_default();
        
        match bcrypt::verify(&password, &password_hash) {
            Ok(true) => {
                LoginResponse { success: true, role: Some(role), username: Some(email), display_name, message: "Login successful".into() }
            },
            _ => {
                LoginResponse { success: false, role: None, username: None, display_name: None, message: "Invalid email or password".into() }
            }
        }
    } else {
        LoginResponse { success: false, role: None, username: None, display_name: None, message: "Invalid email or password".into() }
    }
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
    // Note: In a real production app, you'd want to handle menu items linked to this category first!
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
}

#[tauri::command]
pub fn get_settings() -> Result<RestaurantSettings, String> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT restaurant_name, logo_path, tax_rate, total_tables, address, COALESCE(service_charge_rate, 0.0), COALESCE(service_charge_types, 'Dine-in'), contact_number FROM restaurant_settings WHERE id = 1").map_err(|e| e.to_string())?;
    
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
        })
    }).map_err(|e| e.to_string())?;

    Ok(settings)
}

#[tauri::command]
pub fn update_settings(name: String, address: Option<String>, logo_path: Option<String>, tax_rate: f64, total_tables: i32, service_charge_rate: f64, service_charge_types: String, contact_number: Option<String>) -> Result<String, String> {
    let conn = get_conn()?;
    
    // Check if we are reducing tables and if any of the tables to be removed are occupied
    let mut stmt = conn.prepare("SELECT COUNT(*) FROM table_status WHERE table_number > ?1 AND status != 'Available'").map_err(|e| e.to_string())?;
    let occupied_count: i32 = stmt.query_row([&total_tables], |row| row.get(0)).unwrap_or(0);
    if occupied_count > 0 {
        return Err("Cannot reduce total tables. Some tables to be removed are currently occupied or reserved.".to_string());
    }
    
    // Remove tables beyond the new total
    conn.execute("DELETE FROM table_status WHERE table_number > ?1", [&total_tables]).map_err(|e| e.to_string())?;

    // Ensure all tables from 1 to total_tables exist
    for i in 1..=total_tables {
        conn.execute("INSERT OR IGNORE INTO table_status (table_number, status) VALUES (?1, 'Available')", [&i]).ok();
    }

    conn.execute(
        "UPDATE restaurant_settings SET restaurant_name = ?1, address = ?2, logo_path = ?3, tax_rate = ?4, total_tables = ?5, service_charge_rate = ?6, service_charge_types = ?7, contact_number = ?8 WHERE id = 1",
        rusqlite::params![name, address, logo_path, tax_rate, total_tables, service_charge_rate, service_charge_types, contact_number],
    ).map_err(|e| e.to_string())?;
    
    Ok("Settings updated successfully".into())
}
#[derive(serde::Serialize)]
pub struct TableStatus {
    pub id: i32,
    pub table_number: i32,
    pub status: String,
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
    let mut stmt = conn.prepare("SELECT id, table_number, status FROM table_status ORDER BY table_number").map_err(|e| e.to_string())?;
    
    let tables = stmt.query_map([], |row| {
        Ok(TableStatus {
            id: row.get(0)?,
            table_number: row.get(1)?,
            status: row.get(2)?,
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
    pub table_number: i32,
    pub status: String,
    pub discount_amount: f64,
    pub order_type: Option<String>,
    pub customer_id: Option<i32>,
    pub customer_phone: Option<String>,
    pub delivery_address: Option<String>,
}


#[derive(serde::Serialize)]
pub struct OrderItem {
    pub id: i32,
    pub item_id: i32,
    pub name: String,
    pub price: f64,
    pub quantity: i32,
}

#[tauri::command]
pub fn get_order_items(order_id: i32) -> Result<Vec<OrderItem>, String> {
    let conn = get_conn()?;
    let mut stmt = conn.prepare("SELECT id, item_id, name, price, quantity FROM order_items WHERE order_id = ?1").map_err(|e| e.to_string())?;
    
    let items = stmt.query_map([&order_id], |row| {
        Ok(OrderItem {
            id: row.get(0)?,
            item_id: row.get(1)?,
            name: row.get(2)?,
            price: row.get(3)?,
            quantity: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    Ok(items)
}

#[tauri::command]
pub fn add_item_to_order(order_id: i32, item_id: i32, name: String, price: f64) -> Result<String, String> {
    let conn = get_conn()?;
    
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
    table_number: i32, 
    order_type: String, 
    customer_id: Option<i32>,
    subtotal: f64,
    tax_amount: f64,
    discount_amount: f64,
    amount_received: f64,
    change_due: f64,
    cashier_name: String,
    order_note: String,
    service_charge_amount: f64
) -> Result<String, String> {
    let conn = get_conn()?;
    
    // Ensure all new columns exist

    let new_status = if order_type == "Delivery" { "Delivery Pending" } else { "Closed" };

    // Close the order (or mark Delivery Pending)
    conn.execute(
        "UPDATE orders SET status = ?12, closed_at = datetime('now', 'localtime'), 
        order_type = ?2, subtotal = ?3, tax_amount = ?4, discount_amount = ?5, 
        amount_received = ?6, change_due = ?7, customer_id = ?8, cashier_name = ?9, order_note = ?10, service_charge_amount = ?11 
        WHERE id = ?1", 
        rusqlite::params![
            order_id, order_type, subtotal, tax_amount, discount_amount, 
            amount_received, change_due, customer_id, cashier_name, order_note, service_charge_amount,
            new_status
        ]
    ).map_err(|e| e.to_string())?;
    // Free up the physical table
    conn.execute("UPDATE table_status SET status = 'Available' WHERE table_number = ?1", [&table_number]).map_err(|e| e.to_string())?;

    
    if let Some(c_id) = customer_id {
        conn.execute("UPDATE customers SET visits = visits + 1 WHERE id = ?1", [&c_id]).map_err(|e| e.to_string())?;
    }

    Ok("Order closed and table cleared".into())
}

#[tauri::command]
pub fn update_order_discount(order_id: i32, discount_amount: f64) -> Result<String, String> {
    let conn = get_conn()?;
    
    // Ensure column exists
    
    conn.execute(
        "UPDATE orders SET discount_amount = ?1 WHERE id = ?2 AND status = 'Open'",
        rusqlite::params![discount_amount, order_id]
    ).map_err(|e| e.to_string())?;
    
    Ok("Discount updated".into())
}

#[tauri::command]
pub fn save_print_html(filename: String, html: String) -> Result<String, String> {
    let path = std::env::temp_dir().join(&filename);
    std::fs::write(&path, html).map_err(|e| e.to_string())?;
    opener::open(&path).map_err(|e| e.to_string())?;
    Ok("Success".to_string())
}

#[tauri::command]
pub async fn print_receipt_text(text: String) -> Result<String, String> {
    let path = std::env::temp_dir().join("temp_receipt.txt");
    std::fs::write(&path, &text).map_err(|e| e.to_string())?;
    
    // Use powershell to send the text directly to the default printer
    // We use spawn() instead of output() so it doesn't block if the printer
    // is a PDF printer waiting for a 'Save As' dialog.
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(&[
            "-WindowStyle", "Hidden",
            "-Command",
            &format!("Get-Content '{}' | Out-Printer", path.display())
        ]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn().map_err(|e| format!("Failed to spawn print command: {}", e))?;
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("powershell")
            .args(&[
                "-WindowStyle", "Hidden",
                "-Command",
                &format!("Get-Content '{}' | Out-Printer", path.display())
            ])
            .spawn()
            .map_err(|e| format!("Failed to spawn print command: {}", e))?;
    }

    Ok("Print job sent".to_string())
}

#[derive(serde::Serialize)]
pub struct OrderHistory {
    pub id: i32,
    pub table_number: i32,
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
}

#[tauri::command]
pub fn get_order_history() -> Result<Vec<OrderHistory>, String> {
    let conn = get_conn()?;
    
    // We join the orders and order_items tables, sum up the quantities and prices, 
    // and only fetch the orders that have been successfully checked out ('Closed').
    let mut stmt = conn.prepare(
        "SELECT o.id, o.table_number, o.status, 
                COALESCE(SUM(oi.quantity), 0) as total_items, 
                COALESCE(SUM(oi.price * oi.quantity), 0) + COALESCE(o.delivery_fee, 0.0) + COALESCE(o.service_charge_amount, 0.0) as total_price,
                o.subtotal, o.tax_amount, o.discount_amount, o.amount_received, o.change_due,
                c.name as customer_name, o.cashier_name, o.order_note, o.order_type, o.created_at, o.closed_at, o.delivery_fee,
                o.customer_phone, o.delivery_address, o.service_charge_amount
         FROM orders o 
         LEFT JOIN order_items oi ON o.id = oi.order_id 
         LEFT JOIN customers c ON o.customer_id = c.id
         WHERE o.status IN ('Closed', 'Open', 'Placed') 
         GROUP BY o.id ORDER BY o.id DESC"
    ).map_err(|e| e.to_string())?;

    let orders = stmt.query_map([], |row| {
        Ok(OrderHistory {
            id: row.get(0)?,
            table_number: row.get(1)?,
            status: row.get(2)?,
            total_items: row.get(3)?,
            total_price: row.get(4)?,
            subtotal: row.get(5).unwrap_or(0.0),
            tax_amount: row.get(6).unwrap_or(0.0),
            discount_amount: row.get(7).unwrap_or(0.0),
            amount_received: row.get(8).unwrap_or(0.0),
            change_due: row.get(9).unwrap_or(0.0),
            customer_name: row.get(10).unwrap_or(None),
            cashier_name: row.get(11).unwrap_or(None),
            order_note: row.get(12).unwrap_or(None),
            order_type: row.get(13).unwrap_or(None),
            created_at: row.get(14).unwrap_or(None),
            closed_at: row.get(15).unwrap_or(None),
            delivery_fee: row.get(16).unwrap_or(0.0),
            customer_phone: row.get(17).unwrap_or(None),
            delivery_address: row.get(18).unwrap_or(None),
            service_charge_amount: row.get(19).unwrap_or(0.0),
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    Ok(orders)
}
#[tauri::command]
pub fn admin_update_table_status(table_number: i32, status: String) -> Result<String, String> {
    let conn = get_conn()?;
    
    // 1. Check current status to prevent overriding an active checkout session
    let mut stmt = conn.prepare("SELECT status FROM table_status WHERE table_number = ?1").map_err(|e| e.to_string())?;
    let current_status: String = stmt.query_row([&table_number], |row| row.get(0)).unwrap_or_default();
    
    // If the cashier is currently serving this table, block the admin override
    if current_status == "Occupied" && status != "Occupied" {
        return Err("Cannot change status: Table currently has an active, unpaid order.".into());
    }

    // 2. Apply the new status (e.g., 'Available', 'Reserved', 'Maintenance')
    conn.execute(
        "UPDATE table_status SET status = ?1 WHERE table_number = ?2",
        rusqlite::params![status, table_number],
    ).map_err(|e| e.to_string())?;
    
    Ok(format!("Table {} updated to {}", table_number, status))
}
#[tauri::command]
pub fn cancel_active_order(order_id: i32, table_number: i32) -> Result<String, String> {
    let conn = get_conn()?;

    // 1. Delete associated items (just in case they added items and changed their mind)
    conn.execute("DELETE FROM order_items WHERE order_id = ?1", [&order_id]).map_err(|e| e.to_string())?;

    // 2. Delete the empty/cancelled order completely so it doesn't pollute Order History
    conn.execute("DELETE FROM orders WHERE id = ?1", [&order_id]).map_err(|e| e.to_string())?;

    // 3. Free up the table
    conn.execute("UPDATE table_status SET status = 'Available' WHERE table_number = ?1", [&table_number]).map_err(|e| e.to_string())?;

    Ok("Order cancelled and table freed".into())
}

#[tauri::command]
pub fn reassign_order_table(order_id: i32, old_table: i32, new_table: i32) -> Result<String, String> {
    let conn = get_conn()?;
    
    if new_table != 0 {
        let mut stmt = conn.prepare("SELECT status FROM table_status WHERE table_number = ?1").map_err(|e| e.to_string())?;
        let status: String = stmt.query_row([&new_table], |row| row.get(0)).unwrap_or_default();
        if status != "Available" {
            return Err("Target table is not available".into());
        }
    }
    
    conn.execute("UPDATE orders SET table_number = ?1 WHERE id = ?2", rusqlite::params![new_table, order_id]).map_err(|e| e.to_string())?;
    
    if old_table != 0 {
        conn.execute("UPDATE table_status SET status = 'Available' WHERE table_number = ?1", [&old_table]).ok();
    }
    if new_table != 0 {
        conn.execute("UPDATE table_status SET status = 'Occupied' WHERE table_number = ?1", [&new_table]).ok();
    }
    
    Ok("Table reassigned".into())
}

fn get_next_available_order_id(conn: &rusqlite::Connection) -> i32 {
    let min_id: Option<i32> = conn.query_row("SELECT MIN(id) FROM orders", [], |row| row.get(0)).unwrap_or(None);
    if min_id.is_none() || min_id != Some(1) {
        return 1;
    }
    
    conn.query_row(
        "SELECT id + 1 FROM orders mo WHERE NOT EXISTS (SELECT 1 FROM orders mi WHERE mi.id = mo.id + 1) ORDER BY id LIMIT 1", 
        [], 
        |row| row.get(0)
    ).unwrap_or(1)
}

#[tauri::command]
pub fn get_or_create_order(table_number: i32) -> Result<ActiveOrder, String> {
    let conn = get_conn()?;
    
    // 1. Ensure the order tables exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
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
    let mut stmt = conn.prepare("SELECT status FROM table_status WHERE table_number = ?1").map_err(|e| e.to_string())?;
    let current_status: String = stmt.query_row([&table_number], |row| row.get(0)).unwrap_or_default();
    
    if current_status == "Maintenance" || current_status == "Reserved" {
        return Err(format!("Cannot open order: Table is marked as {}.", current_status));
    }

    // 3. Check if this table already has an 'Open' order
    let mut stmt = conn.prepare("SELECT id, table_number, status, COALESCE(discount_amount, 0.0), order_type, customer_id, customer_phone, delivery_address FROM orders WHERE table_number = ?1 AND status = 'Open'").map_err(|e| e.to_string())?;
    let existing_order = stmt.query_row([&table_number], |row| {
        Ok(ActiveOrder {
            id: row.get(0)?,
            table_number: row.get(1)?,
            status: row.get(2)?,
            discount_amount: row.get(3)?,
            order_type: row.get(4).unwrap_or(None),
            customer_id: row.get(5).unwrap_or(None),
            customer_phone: row.get(6).unwrap_or(None),
            delivery_address: row.get(7).unwrap_or(None),
        })
    });

    if let Ok(order) = existing_order {
        return Ok(order); // Return the existing order
    }

    // 4. If no order exists, create a new one
    let new_id = get_next_available_order_id(&conn);
    let initial_type = if table_number == 0 { "Takeaway" } else { "Dine-in" };
    conn.execute(
        "INSERT INTO orders (id, table_number, status, created_at, order_type) VALUES (?1, ?2, 'Open', datetime('now', 'localtime'), ?3)", 
        rusqlite::params![&new_id, &table_number, &initial_type]
    ).map_err(|e| e.to_string())?;
    
    conn.execute("UPDATE table_status SET status = 'Occupied' WHERE table_number = ?1", [&table_number]).ok();

    Ok(ActiveOrder {
        id: new_id,
        table_number,
        status: "Open".to_string(),
        discount_amount: 0.0,
        order_type: Some(initial_type.to_string()),
        customer_id: None,
        customer_phone: None,
        delivery_address: None,
    })
}

#[tauri::command]
pub fn get_active_order(table_number: i32) -> Result<Option<ActiveOrder>, String> {
    let conn = get_conn()?;
    
    let mut stmt = conn.prepare("SELECT id, table_number, status, COALESCE(discount_amount, 0.0), order_type, customer_id, customer_phone, delivery_address FROM orders WHERE table_number = ?1 AND status = 'Open'").map_err(|e| e.to_string())?;
    let existing_order = stmt.query_row([&table_number], |row| {
        Ok(ActiveOrder {
            id: row.get(0)?,
            table_number: row.get(1)?,
            status: row.get(2)?,
            discount_amount: row.get(3)?,
            order_type: row.get(4).unwrap_or(None),
            customer_id: row.get(5).unwrap_or(None),
            customer_phone: row.get(6).unwrap_or(None),
            delivery_address: row.get(7).unwrap_or(None),
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
    
    let mut stmt = conn.prepare("SELECT id, table_number, status, COALESCE(discount_amount, 0.0), order_type, customer_id, customer_phone, delivery_address FROM orders WHERE id = ?1").map_err(|e| e.to_string())?;
    let order = stmt.query_row([&order_id], |row| {
        Ok(ActiveOrder {
            id: row.get(0)?,
            table_number: row.get(1)?,
            status: row.get(2)?,
            discount_amount: row.get(3)?,
            order_type: row.get(4).unwrap_or(None),
            customer_id: row.get(5).unwrap_or(None),
            customer_phone: row.get(6).unwrap_or(None),
            delivery_address: row.get(7).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?;
    
    Ok(order)
}

#[tauri::command]
pub fn create_walkin_order(
    order_type: String,
    customer_phone: Option<String>,
    delivery_address: Option<String>
) -> Result<ActiveOrder, String> {
    let conn = get_conn()?;
    
    let new_id = get_next_available_order_id(&conn);
    conn.execute(
        "INSERT INTO orders (id, table_number, status, created_at, order_type, customer_phone, delivery_address) VALUES (?1, 0, 'Open', datetime('now', 'localtime'), ?2, ?3, ?4)", 
        rusqlite::params![&new_id, &order_type, &customer_phone, &delivery_address]
    ).map_err(|e| e.to_string())?;
    
    Ok(ActiveOrder {
        id: new_id,
        table_number: 0,
        status: "Open".to_string(),
        discount_amount: 0.0,
        order_type: Some(order_type),
        customer_id: None,
        customer_phone: customer_phone.clone(),
        delivery_address: delivery_address.clone(),
    })
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
    let conn = get_conn()?;
    conn.execute("DELETE FROM staff WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
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
        // Clock in
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

    // 2. Try to find by name if phone was empty
    if p.is_empty() && !n.is_empty() {
        if let Ok(id) = conn.query_row("SELECT id FROM customers WHERE name = ?1", [&n], |row| row.get(0)) {
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

    let mut stmt = conn.prepare("SELECT id, amount, date, category, note FROM expenses ORDER BY date DESC, id DESC").map_err(|e| e.to_string())?;
    let expense_iter = stmt.query_map([], |row| {
        Ok(Expense {
            id: row.get(0)?,
            amount: row.get(1)?,
            date: row.get(2)?,
            category: row.get(3)?,
            note: row.get(4).unwrap_or(None),
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
    let conn = get_conn()?;
    
    // Fetch the expense details before deleting it
    let mut stmt = conn.prepare("SELECT amount, date, note FROM expenses WHERE id = ?1").map_err(|e| e.to_string())?;
    let expense_data = stmt.query_row([&id], |row| {
        Ok((row.get::<_, f64>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?))
    });

    conn.execute("DELETE FROM expenses WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
    
    // If it was a payroll expense, delete the corresponding salary payout
    if let Ok((_amount, date, Some(note))) = expense_data {
        if note.starts_with("Payroll: ") {
            let staff_name = note.trim_start_matches("Payroll: ");
            let mut stmt = conn.prepare("SELECT id FROM staff WHERE name = ?1").map_err(|e| e.to_string())?;
            if let Ok(staff_id) = stmt.query_row([&staff_name], |row| row.get::<_, i32>(0)) {
                conn.execute(
                    "DELETE FROM salary_payouts WHERE staff_id = ?1 AND date = ?2",
                    rusqlite::params![staff_id, date]
                ).ok();
            }
        }
    }
    
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
            table_number INTEGER, 
            status TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            closed_at TEXT
        )", []
    ).ok();


    // 1. Current Month Revenue
    let total_revenue_query = "
        SELECT COALESCE(SUM(COALESCE(subtotal, 0.0) + COALESCE(tax_amount, 0.0) + COALESCE(delivery_fee, 0.0) - COALESCE(discount_amount, 0.0)), 0)
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
        SELECT COALESCE(SUM(COALESCE(subtotal, 0.0) + COALESCE(tax_amount, 0.0) + COALESCE(delivery_fee, 0.0) - COALESCE(discount_amount, 0.0)), 0)
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

    // Last 7 days revenue
    let query = "
        SELECT 
            strftime('%w', closed_at) as day_of_week,
            COALESCE(SUM(oi.price * oi.quantity), 0) as revenue
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
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

    let mut stmt = conn.prepare("SELECT id, amount, date, category, note FROM expenses ORDER BY date DESC, id DESC LIMIT 5").map_err(|e| e.to_string())?;
    let expense_iter = stmt.query_map([], |row| {
        Ok(Expense {
            id: row.get(0)?,
            amount: row.get(1)?,
            date: row.get(2)?,
            category: row.get(3)?,
            note: row.get(4).unwrap_or(None),
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
            COALESCE(SUM(oi.price * oi.quantity), 0) as amount,
            time(o.closed_at) as closed_time
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.status IN ('Closed', 'Open')
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
    pub table_number: i32,
    pub status: String,
    pub active_order_id: Option<i32>,
    pub active_order_total: Option<f64>,
    pub elapsed_minutes: Option<i32>,
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
            (SELECT SUM(price * quantity) FROM order_items WHERE order_id = o.id) as active_order_total,
            CAST(round((julianday(datetime('now', 'localtime')) - julianday(o.created_at)) * 24 * 60) AS INTEGER) as elapsed_minutes
        FROM table_status t
        LEFT JOIN orders o ON o.table_number = t.table_number AND o.status = 'Active'
        ORDER BY t.table_number
    ";

    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    
    let tables = stmt.query_map([], |row| {
        let active_order_total: Option<f64> = row.get(4).unwrap_or(None);
        let elapsed_minutes: Option<i32> = row.get(5).unwrap_or(None);
        
        Ok(DetailedTableStatus {
            id: row.get(0)?,
            table_number: row.get(1)?,
            status: row.get(2)?,
            active_order_id: row.get(3).unwrap_or(None),
            active_order_total,
            elapsed_minutes,
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

    // 2. Sales for today (sum of item prices)
    let sales_query = "
        SELECT COALESCE(SUM(oi.price * oi.quantity), 0)
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
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
         COALESCE((SELECT SUM(amount) FROM advance_salaries WHERE staff_id = s.id AND is_deducted = 0), 0.0) as advance_balance,
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
}

#[tauri::command]
pub fn process_payout(staff_id: i32, amount: f64, bonus: f64, deduction: f64, date: String) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    
    let net_amount = amount + bonus - deduction;
    
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;
    
    tx.execute(
        "INSERT INTO salary_payouts (staff_id, amount, bonus, deduction, advance_deduction, date) VALUES (?1, ?2, ?3, ?4, 0.0, ?5)",
        rusqlite::params![staff_id, net_amount, bonus, deduction, date]
    ).map_err(|e| e.to_string())?;
    
    tx.execute(
        "INSERT INTO expenses (amount, date, category, note) VALUES (?1, ?2, 'Salaries', 'Payroll Processed')",
        rusqlite::params![net_amount, date]
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    
    Ok("Payout processed".into())
}

#[tauri::command]
pub fn get_payout_history(start_date: String, end_date: String) -> Result<Vec<SalaryPayout>, String> {
    let conn = get_conn()?;
    
    conn.execute("ALTER TABLE salary_payouts ADD COLUMN bonus REAL", []).ok();
    conn.execute("ALTER TABLE salary_payouts ADD COLUMN deduction REAL", []).ok();
    conn.execute("ALTER TABLE salary_payouts ADD COLUMN advance_deduction REAL", []).ok();

    let mut stmt = conn.prepare(
        "SELECT p.id, s.name, p.amount, p.bonus, p.deduction, p.advance_deduction, p.date
         FROM salary_payouts p
         JOIN staff s ON p.staff_id = s.id
         WHERE p.date >= ?1 AND p.date <= ?2
         ORDER BY p.date DESC"
    ).map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([&start_date, &end_date], |row| {
        Ok(SalaryPayout {
            id: row.get(0)?,
            staff_name: row.get(1)?,
            amount: row.get(2).unwrap_or(0.0),
            bonus: row.get(3).unwrap_or(0.0),
            deduction: row.get(4).unwrap_or(0.0),
            advance_deduction: row.get(5).unwrap_or(0.0),
            date: row.get(6)?,
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
        let total_deduction = entry.deduction + entry.advance_deduction;
        let net_amount = entry.base_salary + entry.bonus - total_deduction;
        
        tx.execute(
            "INSERT INTO salary_payouts (staff_id, amount, bonus, deduction, advance_deduction, date) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![entry.staff_id, net_amount, entry.bonus, entry.deduction, entry.advance_deduction, payout_date]
        ).map_err(|e| e.to_string())?;
        
        if entry.advance_deduction > 0.0 {
            tx.execute(
                "UPDATE advance_salaries SET is_deducted = 1 WHERE staff_id = ?1 AND is_deducted = 0",
                rusqlite::params![entry.staff_id]
            ).map_err(|e| e.to_string())?;
        }
        
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

#[tauri::command]
pub fn pay_advance_salary(staff_id: i32, amount: f64, date: String, note: String, staff_name: String) -> Result<String, String> {
    let mut conn_guard = get_conn()?;
    let tx = conn_guard.transaction().map_err(|e| e.to_string())?;
    
    tx.execute(
        "INSERT INTO advance_salaries (staff_id, amount, date, note) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![staff_id, amount, date, note]
    ).map_err(|e| e.to_string())?;
    
    tx.execute(
        "INSERT INTO expenses (amount, date, category, note) VALUES (?1, ?2, 'Salaries', ?3)",
        rusqlite::params![amount, date, format!("Advance Salary: {} - {}", staff_name, note)]
    ).map_err(|e| e.to_string())?;
    
    tx.commit().map_err(|e| e.to_string())?;
    
    Ok("Advance salary recorded successfully".to_string())
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

    let mut total_sales = 0.0;
    let mut total_orders = 0;
    conn.query_row(
        "SELECT COALESCE(SUM(oi.price * oi.quantity), 0), COUNT(DISTINCT o.id) 
         FROM orders o 
         JOIN order_items oi ON o.id = oi.order_id 
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
        "SELECT date(closed_at), COALESCE(SUM(COALESCE(subtotal, 0.0) + COALESCE(tax_amount, 0.0) + COALESCE(delivery_fee, 0.0) - COALESCE(discount_amount, 0.0)), 0) FROM orders WHERE status = 'Closed' AND date(closed_at) >= ?1 AND date(closed_at) <= ?2 GROUP BY date(closed_at)"
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
    
    let reports_dir = Path::new("../reports");
    if !reports_dir.exists() {
        fs::create_dir_all(reports_dir).map_err(|e| e.to_string())?;
    }
    
    let file_path = reports_dir.join(filename);
    fs::write(&file_path, content).map_err(|e| e.to_string())?;
    
    // Attempt to open the file so the user sees it immediately
    let _ = opener::open(&file_path);
    
    Ok(format!("Report saved and opened successfully."))
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

    let current_db_path = get_default_db_path();
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

    let conn = Connection::open(&file_path)
        .map_err(|_| "Failed to open file as a valid SQLite database.".to_string())?;

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

#[tauri::command]
pub fn import_backup_file(file_path: String) -> Result<String, String> {
    validate_backup_file(file_path.clone())?;

    let db_path_str = get_default_db_path();
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

    // Save existing license before overwriting
    let mut current_license: Option<(String, String)> = None;
    if db_path.exists() {
        std::fs::copy(db_path, &safety_file)
            .map_err(|e| format!("Failed to create safety backup of current database: {}", e))?;
            
        if let Ok(old_conn) = Connection::open(db_path) {
            if let Ok(mut stmt) = old_conn.prepare("SELECT current_key, expiry_date FROM license LIMIT 1") {
                if let Ok(mut rows) = stmt.query([]) {
                    if let Ok(Some(row)) = rows.next() {
                        if let (Ok(k), Ok(e)) = (row.get::<_, String>(0), row.get::<_, String>(1)) {
                            current_license = Some((k, e));
                        }
                    }
                }
            }
        }
    }

    std::fs::copy(&file_path, db_path)
        .map_err(|e| format!("Failed to import database file: {}", e))?;

    let conn = Connection::open(&db_path_str)
        .map_err(|e| format!("Database overwritten, but failed to reopen connection: {}", e))?;

    // Restore the license to the newly imported database
    if let Some((key, expiry)) = current_license {
        let _ = conn.execute("CREATE TABLE IF NOT EXISTS license (id INTEGER PRIMARY KEY, current_key TEXT, expiry_date TEXT)", []);
        let _ = conn.execute("DELETE FROM license", []);
        let _ = conn.execute("INSERT INTO license (current_key, expiry_date) VALUES (?1, ?2)", rusqlite::params![key, expiry]);
    }

    run_migrations(&conn)?;

    Ok(format!("Database imported. Safety copy created at: {}", safety_file.to_string_lossy()))
}

#[tauri::command]
pub fn verify_admin_password(password: String) -> Result<bool, String> {
    let conn = get_conn()?;
    
    let mut stmt = conn.prepare("SELECT password_hash FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'Admin'").map_err(|e| e.to_string())?;
    let admin_hashes = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;

    for hash_result in admin_hashes {
        if let Ok(hash) = hash_result {
            if let Ok(true) = bcrypt::verify(&password, &hash) {
                return Ok(true);
            }
        }
    }
    
    Ok(false)
}

#[derive(Serialize)]
pub struct DetailedOrder {
    pub id: i32,
    pub table_number: String,
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

    // Orders
    let mut orders = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT id, table_number, COALESCE(created_at, ''), 
         (COALESCE(subtotal, 0.0) + COALESCE(tax_amount, 0.0) + COALESCE(delivery_fee, 0.0) - COALESCE(discount_amount, 0.0)) as total, 
         COALESCE(status, ''), COALESCE(cashier_name, '') 
         FROM orders 
         WHERE date(created_at) >= ?1 AND date(created_at) <= ?2
         ORDER BY created_at DESC LIMIT 5"
    ).map_err(|e| e.to_string())?;
    
    let order_iter = stmt.query_map([&start_date, &end_date], |row| {
        let tbl: i32 = row.get(1).unwrap_or(0);
        let tbl_str = if tbl == 0 { "Walk-in".to_string() } else { tbl.to_string() };
        Ok(DetailedOrder {
            id: row.get(0)?,
            table_number: tbl_str,
            created_at: row.get(2)?,
            total: row.get(3)?,
            status: row.get(4)?,
            cashier: row.get(5)?,
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
         WHERE date >= ?1 AND date <= ?2
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

    // Payouts
    let mut payouts = Vec::new();
    let mut stmt3 = conn.prepare(
        "SELECT p.id, s.name, p.date, p.amount 
         FROM salary_payouts p
         JOIN staff s ON p.staff_id = s.id
         WHERE p.date >= ?1 AND p.date <= ?2
         ORDER BY p.date DESC LIMIT 5"
    ).map_err(|e| e.to_string())?;
    
    let pay_iter = stmt3.query_map([&start_date, &end_date], |row| {
        Ok(DetailedPayout {
            id: row.get(0)?,
            staff_name: row.get(1)?,
            date: row.get(2)?,
            amount: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    
    for p in pay_iter {
        if let Ok(pay) = p {
            payouts.push(pay);
        }
    }

    // Totals
    let total_revenue: f64 = conn.query_row(
        "SELECT COALESCE(SUM(COALESCE(subtotal, 0.0) + COALESCE(tax_amount, 0.0) + COALESCE(delivery_fee, 0.0) - COALESCE(discount_amount, 0.0)), 0) 
         FROM orders 
         WHERE status != 'Cancelled' AND date(created_at) >= ?1 AND date(created_at) <= ?2",
        [&start_date, &end_date], |row| row.get(0)
    ).unwrap_or(0.0);

    let total_orders: i32 = conn.query_row(
        "SELECT COUNT(id) FROM orders WHERE status != 'Cancelled' AND date(created_at) >= ?1 AND date(created_at) <= ?2",
        [&start_date, &end_date], |row| row.get(0)
    ).unwrap_or(0);

    let total_exp_only: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE date >= ?1 AND date <= ?2",
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

    // Daily Trend
    let mut sales_trend = Vec::new();
    let mut stmt4 = conn.prepare(
        "SELECT DISTINCT d FROM (
            SELECT date(created_at) as d FROM orders WHERE status = 'Closed' AND date(created_at) >= ?1 AND date(created_at) <= ?2
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
        "SELECT date(created_at), COALESCE(SUM(COALESCE(subtotal, 0.0) + COALESCE(tax_amount, 0.0) + COALESCE(delivery_fee, 0.0) - COALESCE(discount_amount, 0.0)), 0) FROM orders WHERE status = 'Closed' AND date(created_at) >= ?1 AND date(created_at) <= ?2 GROUP BY date(created_at)"
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
        "SELECT date, COALESCE(SUM(amount), 0) FROM expenses WHERE date >= ?1 AND date <= ?2 GROUP BY date"
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
        "SELECT category, SUM(amount) FROM expenses WHERE date >= ?1 AND date <= ?2 GROUP BY category ORDER BY SUM(amount) DESC"
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
         WHERE o.status = 'Closed' AND date(o.created_at) >= ?1 AND date(o.created_at) <= ?2
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
        "SELECT o.id, o.created_at, c.name, c.phone, o.delivery_address, o.status, o.delivery_status, 
                COALESCE(SUM(oi.price * oi.quantity), 0) + COALESCE(o.delivery_fee, 0) as total_price,
                o.delivery_fee, s.name as driver_name
         FROM orders o
         LEFT JOIN customers c ON o.customer_id = c.id
         LEFT JOIN staff s ON o.delivery_driver_id = s.id
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.order_type = 'Delivery' AND COALESCE(o.delivery_status, 'Pending') != 'Delivered'
         GROUP BY o.id ORDER BY o.id ASC"
    ).map_err(|e| e.to_string())?;
    
    let deliveries = stmt.query_map([], |row| {
        Ok(DeliveryOrder {
            id: row.get(0)?,
            created_at: row.get(1).unwrap_or(None),
            customer_name: row.get(2).unwrap_or(None),
            customer_phone: row.get(3).unwrap_or(None),
            delivery_address: row.get(4).unwrap_or(None),
            status: row.get(5)?,
            delivery_status: row.get(6).unwrap_or(Some("Pending".to_string())),
            total_price: row.get(7).unwrap_or(0.0),
            delivery_fee: row.get(8).unwrap_or(0.0),
            driver_name: row.get(9).unwrap_or(None),
        })
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();
    
    Ok(deliveries)
}

#[tauri::command]
pub fn update_delivery_status(order_id: i32, status: String) -> Result<String, String> {
    let conn = get_conn()?;
    
    conn.execute(
        "UPDATE orders SET delivery_status = ?1 WHERE id = ?2",
        rusqlite::params![status, order_id]
    ).map_err(|e| e.to_string())?;
    
    if status == "Delivered" {
        conn.execute(
            "UPDATE orders SET status = 'Closed', closed_at = datetime('now', 'localtime') WHERE id = ?1",
            rusqlite::params![order_id]
        ).map_err(|e| e.to_string())?;
    }
    
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
    let conn = get_conn()?;
    
    // Ensure all new columns exist

    let mut final_customer_id = customer_id;

    if let Some(c_id) = customer_id {
        // Update the customer's address and phone in case it changed
        let mut query = "UPDATE customers SET address = ?1".to_string();
        let mut params: Vec<rusqlite::types::Value> = vec![rusqlite::types::Value::Text(delivery_address.clone())];
        
        if let Some(phone) = &customer_phone {
            if !phone.trim().is_empty() {
                query.push_str(", phone = ?2");
                params.push(rusqlite::types::Value::Text(phone.clone()));
                query.push_str(" WHERE id = ?3");
                params.push(rusqlite::types::Value::Integer(c_id as i64));
            } else {
                query.push_str(" WHERE id = ?2");
                params.push(rusqlite::types::Value::Integer(c_id as i64));
            }
        } else {
            query.push_str(" WHERE id = ?2");
            params.push(rusqlite::types::Value::Integer(c_id as i64));
        }
        conn.execute(&query, rusqlite::params_from_iter(params.iter())).ok();
    } else if let Some(phone) = &customer_phone {
        if !phone.trim().is_empty() {
            // Check if a customer with this phone exists
            let mut stmt = conn.prepare("SELECT id FROM customers WHERE phone = ?1").map_err(|e| e.to_string())?;
            let existing_id: Result<i32, _> = stmt.query_row([phone], |row| row.get(0));
            
            if let Ok(id) = existing_id {
                final_customer_id = Some(id);
                conn.execute("UPDATE customers SET address = ?1 WHERE id = ?2", rusqlite::params![delivery_address, id]).ok();
            } else {
                // Insert new customer
                conn.execute(
                    "INSERT INTO customers (name, phone, address, visits) VALUES (?1, ?2, ?3, 1)",
                    rusqlite::params!["Guest", phone, delivery_address]
                ).ok();
                final_customer_id = Some(conn.last_insert_rowid() as i32);
            }
        }
    }

    // Place the order (status = 'Placed') so get_or_create_order doesn't overwrite it
    // and set delivery_status = 'Pending'
    conn.execute(
        "UPDATE orders SET status = 'Placed', delivery_status = 'Pending', 
        order_type = 'Delivery', subtotal = ?2, tax_amount = ?3, discount_amount = ?4, 
        customer_id = ?5, cashier_name = ?6, order_note = ?7, 
        delivery_address = ?8, delivery_fee = ?9, service_charge_amount = ?10
        WHERE id = ?1", 
        rusqlite::params![
            order_id, subtotal, tax_amount, discount_amount, 
            final_customer_id, cashier_name, order_note, delivery_address, delivery_fee, service_charge_amount
        ]
    ).map_err(|e| e.to_string())?;
    
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
    let conn = get_conn()?;
    conn.execute("DELETE FROM inventory_transactions WHERE item_id = ?1", [&id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM inventory_items WHERE id = ?1", [&id]).map_err(|e| e.to_string())?;
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

    // Auto-create expense entry
    let supplier_str = supplier.as_deref().map(|s| format!(" from {}", s)).unwrap_or_default();
    let expense_note = format!("Inventory: {} {} {}{}", quantity, item_unit, item_name, supplier_str);
    conn.execute(
        "INSERT INTO expenses (amount, date, category, note) VALUES (?1, ?2, 'Inventory', ?3)",
        rusqlite::params![total_cost, today, expense_note]
    ).map_err(|e| e.to_string())?;

    Ok("Purchase recorded and expense logged".into())
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
