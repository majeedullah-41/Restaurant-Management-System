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

const SESSION_TTL_HOURS: i64 = 12;
const MAX_SESSIONS_PER_USER: usize = 5;

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
    "update_backup_settings",
    "get_backup_settings",
    "perform_backup",
    "validate_backup_file",
    "import_backup_file",
    // Structural table changes
    "add_table",
    "delete_table",
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
    // Admin password confirmation (backup / restore gates)
    "verify_admin_password",
    // Payroll
    "get_payroll_summary",
    "process_payout",
    "process_batch_payout",
    "pay_advance_salary",
    "get_payout_history",
    "get_paid_staff_ids",
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
