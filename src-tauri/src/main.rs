// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
fn main() {
    db::init_db().expect("Failed to initialize database");
    rms_lib::run()
}
