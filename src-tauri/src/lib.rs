#![allow(dead_code, unused_variables, non_snake_case)]

pub mod auth;
pub mod db;
pub mod license;

/// Authorizes an IPC invoke before it is dispatched to the registered command.
///
/// Public commands pass through untouched. Every other command requires a valid
/// server-side session token (injected automatically by the frontend invoke
/// wrapper). Admin-only commands additionally require the session role to be
/// `Admin`. This centralizes authentication so individual commands never trust
/// client-supplied roles or localStorage values.
fn authorize(command: &str, payload: &tauri::ipc::InvokeBody) -> Result<(), String> {
    if auth::PUBLIC_COMMANDS.contains(&command) {
        return Ok(());
    }

    let token = auth::token_from_payload(payload)
        .ok_or_else(|| "Not authenticated. Please log in.".to_string())?;

    let session = auth::validate(&token)?;

    // License enforcement (defense in depth — the UI also gates on this).
    // Only license-management and pre-auth commands remain usable without a
    // valid, unexpired license.
    const LICENSE_EXEMPT: &[&str] = &[
        "login",
        "logout",
        "get_settings",
        "get_restaurant_name",
        "get_security_question",
        "reset_password_with_security_answer",
        "activate_license",
        "check_license_status",
        "get_machine_hwid",
        "get_license_info",
    ];
    if !LICENSE_EXEMPT.contains(&command) && !license::is_license_valid() {
        return Err("License is invalid or expired. Please activate your license.".to_string());
    }

    // Force a password change before any other protected command can run.
    const PASSWORD_CHANGE_OK: &[&str] = &[
        "logout",
        "get_current_session",
        "update_user_profile",
        "get_settings",
        "get_restaurant_name",
        "activate_license",
        "check_license_status",
        "get_machine_hwid",
        "get_license_info",
    ];
    if db::user_must_change_password(&session.username) && !PASSWORD_CHANGE_OK.contains(&command) {
        return Err("You must change your password before continuing.".to_string());
    }

    if auth::ADMIN_COMMANDS.contains(&command) && session.role != "Admin" {
        return Err("Admin access required for this action.".to_string());
    }

    Ok(())
}

/// Wraps the generated invoke handler with a central authentication gate.
fn wrap_handler<R: tauri::Runtime, H>(inner: H) -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static
where
    H: Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static,
{
    move |invoke| {
        let command = invoke.message.command().to_string();
        let payload = invoke.message.payload().clone();

        match authorize(&command, &payload) {
            Ok(()) => inner(invoke),
            Err(message) => {
                invoke.resolver.reject(message);
                true
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(wrap_handler(tauri::generate_handler![
    db::pay_advance_salary,
    db::get_user_role_by_username,
    db::get_users,
    db::get_restaurant_name,
    db::login,
    db::update_user_profile,
    db::update_security_question,
    db::get_security_question,
    db::reset_password_with_security_answer,
    db::get_categories,
    db::get_menu_items,
    db::add_category,
    db::add_menu_item,
    db::delete_category,
    db::update_category,
    db::delete_menu_item,
    db::update_menu_item,
    db::toggle_menu_item_status,
    db::get_settings,
    db::update_settings,
    db::init_tables_if_needed,
    db::get_table_statuses,
    db::add_table,
    db::add_tables,
    db::delete_table,
    db::get_table_categories,
    db::add_table_category,
    db::update_table_category,
    db::delete_table_category,
    db::get_or_create_order,
    db::get_active_order,
    db::create_walkin_order,
    db::get_order_by_id,
    db::get_order_items,
    db::mark_kot_printed,
    db::add_item_to_order,
    db::remove_item_from_order,
    db::delete_item_from_order,
    db::checkout_order,
    db::get_order_history,
    db::update_order_discount,
    db::admin_update_table_status,
    db::cancel_active_order,
    db::reassign_order_table,
    db::update_order_type,
    db::update_order_delivery_draft,
    db::get_order_takers,
    db::update_order_taker,
    db::get_staff,
    db::get_staff_dropdown,
    db::add_staff,
    db::delete_staff,
    db::update_staff,
    db::get_staff_categories,
    db::add_staff_category,
    db::delete_staff_category,
    db::get_customers,
    db::add_customer,
    db::resolve_customer,
    db::delete_customer,
    db::get_expenses,
    db::add_expense,
    db::delete_expense,

    db::get_dashboard_stats,
    db::get_revenue_overview,
    db::get_top_selling_items,
    db::get_recent_expenses,
    db::get_todays_sales,
    db::get_current_shift,
    db::start_shift,
    db::end_shift,
    db::get_detailed_table_statuses,
    db::get_cashier_dashboard_stats,
    db::save_print_html,
    db::print_receipt_text,
    db::clock_in_out,
    db::get_attendance,
    db::get_payroll_summary,
    db::process_payout,
    db::get_payout_history,
    db::get_paid_staff_ids,
    db::process_batch_payout,
    db::get_payroll_period,
    db::update_payroll_record,
    db::get_payroll_record,
    db::process_payroll_batch,
    db::reopen_payroll,
    db::void_payroll,
    db::get_advance_history,
    db::get_staff_advance_balance,
    db::get_payroll_history,
    db::get_analytics_report,
    db::get_detailed_report,
    db::save_text_report,

    db::get_backup_settings,
    db::update_backup_settings,
    db::perform_backup,
    db::check_and_run_auto_backup,
    db::validate_backup_file,
    db::import_backup_file,
    db::verify_admin_password,

    db::get_delivery_settings,
    db::update_delivery_settings,
    db::get_active_deliveries,
    db::update_delivery_status,
    db::assign_delivery_driver,
    db::place_delivery_order,

    db::get_inventory_items,
    db::add_inventory_item,
    db::update_inventory_item,
    db::delete_inventory_item,
    db::record_inventory_usage,
    db::record_inventory_purchase,
    db::get_inventory_transactions,
    db::get_inventory_summary,

    license::get_machine_hwid,
    license::check_license_status,
    license::activate_license,
    license::get_license_info,

    db::get_current_session,
    db::logout
]))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
