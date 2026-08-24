// ─── Server-side authentication & authorization ─────────────────────────────
//
// All IPC commands are validated centrally in `lib.rs` through a wrapper around
// the generated invoke handler. A valid session token must be present in the
// payload of every protected command (injected automatically by the frontend
// `invoke` wrapper). Role-based access control is enforced here so the backend
// never trusts client-supplied roles or localStorage values.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as BASE64, Engine};
use chrono::{DateTime, Duration, Local};
use rand::RngCore;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

const SESSION_TTL_HOURS: i64 = 12;
const MAX_SESSIONS_PER_USER: usize = 5;

const RESET_MAX_ATTEMPTS: usize = 5;
const RESET_WINDOW_SECS: u64 = 900; // 15 minutes

// ─── Login & reset throttling ───────────────────────────────────────────────

const LOGIN_MAX_ATTEMPTS: usize = 5;
const LOGIN_WINDOW_SECS: u64 = 300; // 5 minutes

/// Tracks failed login attempts per username to throttle brute force.
static LOGIN_ATTEMPTS: OnceLock<Mutex<HashMap<String, Vec<Instant>>>> = OnceLock::new();

fn login_attempts() -> &'static Mutex<HashMap<String, Vec<Instant>>> {
    LOGIN_ATTEMPTS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Returns true when the username has exceeded the allowed number of failed
/// login attempts within the window.
pub fn is_login_locked(username: &str) -> bool {
    let now = Instant::now();
    let cutoff = now - std::time::Duration::from_secs(LOGIN_WINDOW_SECS);
    let mut map = login_attempts().lock().unwrap();
    let attempts = map.entry(username.to_string()).or_insert_with(Vec::new);
    attempts.retain(|t| *t > cutoff);
    attempts.len() >= LOGIN_MAX_ATTEMPTS
}

/// Records a failed login attempt for the given username.
pub fn record_login_attempt(username: &str) {
    let now = Instant::now();
    let cutoff = now - std::time::Duration::from_secs(LOGIN_WINDOW_SECS);
    let mut map = login_attempts().lock().unwrap();
    let attempts = map.entry(username.to_string()).or_insert_with(Vec::new);
    attempts.retain(|t| *t > cutoff);
    attempts.push(now);
}

/// Clears recorded login attempts for the given username (successful login).
pub fn clear_login_attempts(username: &str) {
    if let Ok(mut map) = login_attempts().lock() {
        map.remove(username);
    }
}

// Password-verification throttling (verify_admin_password / verify_operator_password).
// Same window/threshold as login so these confirmation prompts cannot be used as
// an unthrottled oracle to brute-force an admin or cashier password.

const VERIFY_MAX_ATTEMPTS: usize = 5;
const VERIFY_WINDOW_SECS: u64 = 300; // 5 minutes

static VERIFY_ATTEMPTS: OnceLock<Mutex<HashMap<String, Vec<Instant>>>> = OnceLock::new();

fn verify_attempts() -> &'static Mutex<HashMap<String, Vec<Instant>>> {
    VERIFY_ATTEMPTS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Returns true when the session user has exceeded the allowed number of failed
/// password-verification attempts within the window.
pub fn is_verify_locked(username: &str) -> bool {
    let now = Instant::now();
    let cutoff = now - std::time::Duration::from_secs(VERIFY_WINDOW_SECS);
    let mut map = verify_attempts().lock().unwrap();
    let attempts = map.entry(username.to_string()).or_insert_with(Vec::new);
    attempts.retain(|t| *t > cutoff);
    attempts.len() >= VERIFY_MAX_ATTEMPTS
}

/// Records a failed password-verification attempt for the session user.
pub fn record_verify_attempt(username: &str) {
    let now = Instant::now();
    let cutoff = now - std::time::Duration::from_secs(VERIFY_WINDOW_SECS);
    let mut map = verify_attempts().lock().unwrap();
    let attempts = map.entry(username.to_string()).or_insert_with(Vec::new);
    attempts.retain(|t| *t > cutoff);
    attempts.push(now);
}

/// Clears recorded verification attempts for the session user (successful verification).
pub fn clear_verify_attempts(username: &str) {
    if let Ok(mut map) = verify_attempts().lock() {
        map.remove(username);
    }
}

// Password-reset throttling is stored in the `reset_attempts` table so the
// counter survives an app restart and a local attacker cannot trivially reset
// it by relaunching the process.

/// Returns true when the username has exceeded the allowed number of failed
/// reset attempts within the window.
pub fn is_reset_locked(conn: &rusqlite::Connection, username: &str) -> bool {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let row: Option<(i64, i64)> = conn.query_row(
        "SELECT count, window_start FROM reset_attempts WHERE username = ?1",
        [username], |row| Ok((row.get(0)?, row.get(1)?)),
    ).ok();
    match row {
        Some((count, window_start)) => {
            if now.saturating_sub(window_start as u64) >= RESET_WINDOW_SECS {
                let _ = conn.execute("DELETE FROM reset_attempts WHERE username = ?1", [username]);
                false
            } else {
                count as usize >= RESET_MAX_ATTEMPTS
            }
        }
        None => false,
    }
}

/// Records a failed reset attempt for the given username.
pub fn record_reset_attempt(conn: &rusqlite::Connection, username: &str) {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let _ = conn.execute(
        "INSERT INTO reset_attempts (username, count, window_start) VALUES (?1, 1, ?2)
         ON CONFLICT(username) DO UPDATE SET count = count + 1",
        rusqlite::params![username, now as i64],
    );
}

/// Clears recorded reset attempts for the given username (successful reset).
pub fn clear_reset_attempts(conn: &rusqlite::Connection, username: &str) {
    let _ = conn.execute("DELETE FROM reset_attempts WHERE username = ?1", [username]);
}

#[derive(Clone, Debug)]
pub struct Session {
    pub username: String,
    pub role: String,
    pub expires_at: DateTime<Local>,
}

static SESSIONS: OnceLock<Mutex<HashMap<String, Session>>> = OnceLock::new();

fn sessions() -> &'static Mutex<HashMap<String, Session>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn new_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    BASE64.encode(bytes)
}

/// Creates a new session for the given user and returns its token.
/// Expired sessions are purged and each user is limited to a bounded number of
/// concurrent sessions (oldest are evicted first).
pub fn create_session(username: String, role: String) -> String {
    let token = new_token();
    let now = Local::now();
    let session = Session {
        username,
        role,
        expires_at: now + Duration::hours(SESSION_TTL_HOURS),
    };

    let mut map = sessions().lock().unwrap();
    map.retain(|_, s| s.expires_at > now);

    let mut user_tokens: Vec<(String, DateTime<Local>)> = map
        .iter()
        .filter(|(_, s)| s.username == session.username)
        .map(|(t, s)| (t.clone(), s.expires_at))
        .collect();

    if user_tokens.len() >= MAX_SESSIONS_PER_USER {
        user_tokens.sort_by_key(|(_, e)| *e);
        let to_evict = user_tokens.len() + 1 - MAX_SESSIONS_PER_USER;
        for (old_token, _) in user_tokens.into_iter().take(to_evict) {
            map.remove(&old_token);
        }
    }

    map.insert(token.clone(), session);
    token
}

/// Validates a session token, returning the session if it is still valid.
pub fn validate(token: &str) -> Result<Session, String> {
    let mut map = sessions().lock().unwrap();
    let now = Local::now();
    match map.get(token) {
        Some(s) if s.expires_at > now => Ok(s.clone()),
        Some(_) => {
            map.remove(token);
            Err("Session expired. Please log in again.".to_string())
        }
        None => Err("Not authenticated. Please log in.".to_string()),
    }
}

/// Invalidates a session token (no-op if the token does not exist).
pub fn logout(token: &str) {
    if let Ok(mut map) = sessions().lock() {
        map.remove(token);
    }
}

/// Validates the token and requires the session role to be one of `roles`.
pub fn require_role(token: &str, roles: &[&str]) -> Result<Session, String> {
    let session = validate(token)?;
    if roles.contains(&session.role.as_str()) {
        Ok(session)
    } else {
        Err("You do not have permission to perform this action.".to_string())
    }
}

// ─── Command classification ─────────────────────────────────────────────────

/// Commands that do not require an authenticated session.
/// These are the entry points reachable before/without logging in:
/// login, license activation/status, forgot-password, and logo/settings used
/// to render the login screen.
pub const PUBLIC_COMMANDS: &[&str] = &[
    "login",
    "logout",
    "get_settings",
    "get_restaurant_name",
    "get_security_question",
    "reset_password_with_security_answer",
    "activate_license",
    "check_license_status",
    "get_machine_hwid",
    "restore_license_from_backup",
];

/// Commands that require the session role to be `Admin`.
pub const ADMIN_COMMANDS: &[&str] = &[
    // Menu
    "add_category",
    "update_category",
    "delete_category",
    "add_menu_item",
    "update_menu_item",
    "delete_menu_item",
    "toggle_menu_item_status",
    // Settings / config
    "update_settings",
    "update_delivery_settings",
    "update_print_settings",
    "update_backup_settings",
    "get_backup_settings",
    "perform_backup",
    "validate_backup_file",
    "import_backup_file",
    // Structural table changes
    "add_table",
    "add_tables",
    "delete_table",
    "get_table_categories",
    "add_table_category",
    "update_table_category",
    "delete_table_category",
    "admin_update_table_status",
    // Staff
    "get_staff",
    "add_staff",
    "update_staff",
    "delete_staff",
    "add_staff_category",
    "delete_staff_category",
    // Expenses
    "get_expenses",
    "add_expense",
    "delete_expense",
    // Dashboard / reports
    "get_dashboard_stats",
    "get_revenue_overview",
    "get_top_selling_items",
    "get_recent_expenses",
    "get_analytics_report",
    "get_detailed_report",
    "save_text_report",
    // Report PDF export / printing (report pages are admin-only)
    "print_html_to_pdf",
    "print_file_to_printer",
    // Backup (copies the entire live database to disk)
    "check_and_run_auto_backup",
    // Attendance exposes all staff HR data (names, clock in/out)
    "get_attendance",
    // Admin password confirmation (backup / restore gates)
    "verify_admin_password",
    // Deleting closed orders destroys the financial audit trail
    "delete_order_history",
    // License metadata (used on the admin Settings page)
    "get_license_info",
    // User management
    "get_users",
    "get_user_role_by_username",
    // Payroll
    "get_payroll_summary",
    "process_payout",
    "process_batch_payout",
    "pay_advance_salary",
    "update_advance",
    "delete_advance",
    "get_payout_history",
    "get_paid_staff_ids",
    "get_payroll_period",
    "update_payroll_record",
    "get_payroll_record",
    "process_payroll_batch",
    "reopen_payroll",
    "void_payroll",
    "delete_payroll_record",
    "delete_payroll_period",
    "get_advance_history",
    "get_staff_advance_balance",
    "get_payroll_history",
    // Customers (removing customers is an admin action)
    "delete_customer",
    // Inventory
    "get_inventory_items",
    "add_inventory_item",
    "update_inventory_item",
    "delete_inventory_item",
    "record_inventory_usage",
    "record_inventory_purchase",
    "get_inventory_transactions",
    "get_inventory_summary",
    "delete_inventory_transaction",
];

/// Payload keys under which the session token may arrive. Tauri command args
/// are serialized with the JS (camelCase) names, so the frontend wrapper sends
/// `sessionToken`.
const TOKEN_KEYS: &[&str] = &["sessionToken", "session_token"];

/// Extracts the session token from an IPC payload if present.
pub fn token_from_payload(payload: &tauri::ipc::InvokeBody) -> Option<String> {
    match payload {
        tauri::ipc::InvokeBody::Json(json) => {
            for key in TOKEN_KEYS {
                if let Some(v) = json.get(*key).and_then(|v| v.as_str()) {
                    if !v.is_empty() {
                        return Some(v.to_string());
                    }
                }
            }
            None
        }
        _ => None,
    }
}

/// Data returned to the frontend describing the currently authenticated user.
#[derive(Serialize)]
pub struct CurrentUser {
    pub username: String,
    pub role: String,
    pub display_name: Option<String>,
    pub must_change_password: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_and_validate_session() {
        let token = create_session("alice".to_string(), "Admin".to_string());
        let session = validate(&token).expect("token should be valid");
        assert_eq!(session.username, "alice");
        assert_eq!(session.role, "Admin");
    }

    #[test]
    fn validate_rejects_unknown_token() {
        let err = validate("bogus-token").unwrap_err();
        assert!(err.contains("Not authenticated"));
    }

    #[test]
    fn logout_invalidates_session() {
        let token = create_session("bob".to_string(), "Cashier".to_string());
        assert!(validate(&token).is_ok());
        logout(&token);
        assert!(validate(&token).is_err());
    }

    #[test]
    fn require_role_enforces_admin() {
        let admin_token = create_session("admin".to_string(), "Admin".to_string());
        let cashier_token = create_session("cashier".to_string(), "Cashier".to_string());

        assert!(require_role(&admin_token, &["Admin"]).is_ok());
        assert!(require_role(&cashier_token, &["Admin"]).is_err());
        assert!(require_role(&cashier_token, &["Admin", "Cashier"]).is_ok());
    }

    #[test]
    fn expires_sessions_are_invalid() {
        let token = create_session("carol".to_string(), "Admin".to_string());
        {
            let mut map = sessions().lock().unwrap();
            let session = map.get_mut(&token).unwrap();
            session.expires_at = Local::now() - Duration::hours(1);
        }
        assert!(validate(&token).is_err());
    }
}
