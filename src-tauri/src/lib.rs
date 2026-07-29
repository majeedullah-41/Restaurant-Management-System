#![allow(dead_code, unused_variables, non_snake_case)]

pub mod db;
pub mod license;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
    db::get_user_role_by_username,
    db::get_restaurant_name,
    db::login,
    db::update_user_profile,
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
    db::delete_table,
    db::get_or_create_order,
    db::create_walkin_order,
    db::get_order_by_id,
    db::get_order_items,
    db::add_item_to_order,
    db::remove_item_from_order,
    db::checkout_order,
    db::get_order_history,
    db::update_order_discount,
    db::admin_update_table_status,
    db::cancel_active_order,
    db::reassign_order_table,
    db::update_order_type,
    db::update_order_delivery_draft,
    db::get_staff,
    db::add_staff,
    db::delete_staff,
    db::update_staff,
    db::get_staff_categories,
    db::add_staff_category,
    db::delete_staff_category,
    db::get_customers,
    db::add_customer,
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
    db::clock_in_out,
    db::get_attendance,
    db::get_payroll_summary,
    db::process_payout,
    db::get_payout_history,
    db::get_paid_staff_ids,
    db::process_batch_payout,
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

    license::get_machine_hwid,
    license::check_license_status,
    license::activate_license,
    license::get_license_info
])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
