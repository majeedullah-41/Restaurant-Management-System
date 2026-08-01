const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs'); // Need bcrypt to hash the admin password

function setupTestDB() {
    const dbPath = path.resolve(__dirname, '../../test.db');
    
    // Delete existing test.db if it exists
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
    
    const db = new Database(dbPath);
    
    // Create necessary tables
    db.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role_id INTEGER NOT NULL
        );
        CREATE TABLE roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE restaurant_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_name TEXT NOT NULL,
            address TEXT,
            logo_path TEXT,
            tax_rate REAL NOT NULL DEFAULT 0.0,
            service_charge_rate REAL NOT NULL DEFAULT 0.0,
            service_charge_types TEXT DEFAULT '',
            total_tables INTEGER NOT NULL DEFAULT 10,
            contact_number TEXT
        );
        CREATE TABLE categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            sort_order INTEGER DEFAULT 0
        );
        CREATE TABLE menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        );
        CREATE TABLE table_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            table_number INTEGER UNIQUE, 
            status TEXT NOT NULL DEFAULT 'Available'
        );
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_number INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'Open',
            total_amount REAL DEFAULT 0.0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            closed_at TEXT,
            order_type TEXT DEFAULT 'Dine-In',
            subtotal REAL DEFAULT 0.0,
            tax_amount REAL DEFAULT 0.0,
            service_charge_amount REAL DEFAULT 0.0,
            discount_amount REAL DEFAULT 0.0,
            amount_received REAL DEFAULT 0.0,
            change_due REAL DEFAULT 0.0,
            customer_id INTEGER,
            cashier_name TEXT,
            order_note TEXT,
            delivery_address TEXT,
            delivery_driver_id INTEGER,
            delivery_status TEXT
        );
        CREATE TABLE order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (item_id) REFERENCES menu_items(id)
        );
        CREATE TABLE shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            start_time TEXT DEFAULT (datetime('now', 'localtime')),
            end_time TEXT,
            opening_cash REAL NOT NULL,
            closing_cash REAL,
            status TEXT DEFAULT 'Open'
        );
    `);
    
    // Insert seed data
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin123', salt);
    
    db.exec(`
        INSERT INTO roles (id, name) VALUES (1, 'Admin');
        INSERT INTO users (username, password_hash, role_id) VALUES ('admin', '${hash}', 1);
        INSERT INTO restaurant_settings (restaurant_name, total_tables) VALUES ('Test Restaurant', 10);
        INSERT INTO categories (id, name) VALUES (1, 'Fast Food');
        INSERT INTO menu_items (id, category_id, name, price) VALUES (1, 1, 'Burger', 150.0);
        INSERT INTO menu_items (id, category_id, name, price) VALUES (2, 1, 'Coke', 50.0);
        INSERT INTO table_status (table_number, status) VALUES (1, 'Available');
    `);
    
    db.close();
    console.log("test.db seeded successfully!");
}

setupTestDB();
