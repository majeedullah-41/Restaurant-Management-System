const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs'); // Need bcrypt to hash the admin password

/**
 * Seeds a fresh test.db for the WebDriver E2E suite.
 *
 * Schema is aligned with what the app expects AFTER its startup migrations so
 * the app boots straight into a usable state:
 *  - users carries must_change_password / display_name / security fields
 *  - table_status uses the category_id + UNIQUE(category_id, table_number) shape
 *  - staff + staff_categories drive the POS order-taker dropdown/auto-fill
 *  - a valid license is seeded so the app skips the LicenseScreen gate
 *
 * License: the app adopts whatever HWID is persisted in the license table, so
 * we seed a deterministic test HWID plus a license key for it signed with the
 * vendor's private key (scripts/.keys/private_key.pem, git-ignored). If the
 * private key is not present (e.g. a non-vendor machine), a warning is printed
 * and the suite cannot pass until a vendor-issued key is seeded.
 */

function hashToHwid(input) {
    const hex = crypto.createHash('sha256').update(input).digest('hex').toUpperCase();
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

function buildTestLicense() {
    const privateKeyPath = path.resolve(__dirname, '../../scripts/.keys/private_key.pem');
    if (!fs.existsSync(privateKeyPath)) {
        console.warn('WARN: scripts/.keys/private_key.pem not found — cannot issue a test license. The E2E suite will be blocked at the LicenseScreen.');
        return { hwid: null, key: null, expiry: null };
    }

    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const hwid = hashToHwid('RMS-E2E-TEST-MACHINE');
    const expiry = new Date(Date.now() + 5 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const payload = `${hwid}|${expiry}`;

    const sign = crypto.createSign('SHA256');
    sign.update(payload);
    sign.end();
    const signatureB64 = sign.sign(privateKey).toString('base64');
    const key = Buffer.from(`${payload}\n${signatureB64}`).toString('base64');

    return { hwid, key, expiry };
}

function setupTestDB() {
    const dbPath = path.resolve(__dirname, '../../test.db');

    // Delete existing test.db if it exists
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }

    const db = new Database(dbPath);

    // Schema (matches the current app; startup migrations will reconcile the rest)
    db.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role_id INTEGER NOT NULL,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            display_name TEXT,
            security_question TEXT,
            security_answer TEXT
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
            contact_number TEXT,
            order_reset_frequency TEXT DEFAULT 'Daily',
            base_delivery_fee REAL NOT NULL DEFAULT 0.0,
            free_delivery_threshold REAL NOT NULL DEFAULT 0.0
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
        CREATE TABLE table_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE table_status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category_id INTEGER,
            table_number INTEGER,
            status TEXT NOT NULL DEFAULT 'Available',
            UNIQUE(category_id, table_number)
        );
        CREATE TABLE staff_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT,
            phone TEXT,
            category_id INTEGER,
            status TEXT DEFAULT 'Active',
            salary REAL DEFAULT 0
        );
        CREATE TABLE order_number_counter (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            last_number INTEGER NOT NULL
        );
        CREATE TABLE license (
            id INTEGER PRIMARY KEY,
            current_key TEXT,
            expiry_date TEXT,
            activated_at TEXT,
            last_validated_date TEXT,
            hwid TEXT,
            original_hwid TEXT,
            hwid_restored_at TEXT,
            restore_count INTEGER DEFAULT 0
        );
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id INTEGER,
            table_number INTEGER,
            status TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            closed_at TEXT
        );
        CREATE TABLE order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            item_id INTEGER,
            name TEXT,
            price REAL,
            quantity INTEGER
        );
        CREATE TABLE customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            phone TEXT,
            email TEXT,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            total_spent REAL NOT NULL DEFAULT 0.0,
            visits INTEGER NOT NULL DEFAULT 0,
            last_visit TEXT,
            points REAL NOT NULL DEFAULT 0.0,
            address TEXT
        );
    `);

    // Order takers: the POS auto-fills the taker when the logged-in user's
    // display_name matches a staff member in the "Order Taker" category.
    db.prepare("INSERT INTO staff_categories (id, name) VALUES (1, 'Order Taker')").run();
    db.prepare("INSERT INTO staff (id, name, role, category_id, status) VALUES (1, 'admin', 'Admin', 1, 'Active')").run();
    db.prepare("INSERT INTO staff (id, name, role, category_id, status) VALUES (2, 'cashier', 'Cashier', 1, 'Active')").run();

    // Users (must_change_password = 0 so the test goes straight to the dashboard).
    // Usernames are email-format to match the real store DB (admin@restaurant.com,
    // cashier@restaurant.com) and pass the login form's type="email" validation.
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password_hash, role_id, must_change_password, display_name) VALUES (?, ?, ?, 0, ?)').run('admin@restaurant.com', adminHash, 1, 'admin');
    const cashierHash = bcrypt.hashSync('cashier123', 10);
    db.prepare('INSERT INTO users (username, password_hash, role_id, must_change_password, display_name) VALUES (?, ?, ?, 0, ?)').run('cashier@restaurant.com', cashierHash, 2, 'cashier');

    db.prepare('INSERT INTO roles (id, name) VALUES (1, ?)').run('Admin');
    db.prepare('INSERT INTO roles (id, name) VALUES (2, ?)').run('Cashier');

    // License: self-issued test license bound to a seeded HWID
    const { hwid, key, expiry } = buildTestLicense();
    db.prepare('INSERT INTO license (id, current_key, expiry_date, activated_at, hwid) VALUES (1, ?, ?, datetime(\'now\'), ?)').run(key, expiry, hwid);

    db.prepare('INSERT INTO restaurant_settings (id, restaurant_name, tax_rate, service_charge_rate, service_charge_types, total_tables, contact_number) VALUES (1, ?, ?, ?, ?, ?, ?)').run('Test Restaurant', 0.12, 0.05, 'Dine-in,Dinein', 10, '1234567890');

    db.prepare('INSERT INTO categories (id, name) VALUES (1, ?)').run('Main');
    db.prepare('INSERT INTO categories (id, name) VALUES (2, ?)').run('Drinks');

    db.prepare('INSERT INTO menu_items (id, category_id, name, price, is_active) VALUES (1, 1, ?, ?, 1)').run('Burger', 150.0);
    db.prepare('INSERT INTO menu_items (id, category_id, name, price, is_active) VALUES (2, 1, ?, ?, 1)').run('Coke', 50.0);

    db.prepare('INSERT INTO table_categories (id, name) VALUES (1, ?)').run('Main');
    db.prepare('INSERT INTO table_status (id, category_id, table_number, status) VALUES (1, 1, 1, ?)').run('Available');

    db.prepare('INSERT INTO order_number_counter (id, last_number) VALUES (1, 0)').run();

    db.close();
    console.log("test.db seeded successfully!");
}

setupTestDB();
