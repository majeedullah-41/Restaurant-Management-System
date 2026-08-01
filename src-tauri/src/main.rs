// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![windows_subsystem = "windows"]

fn main() {
    rms_lib::db::init_shared_connection();
    rms_lib::db::init_db().expect("Failed to initialize database");
    rms_lib::run()
}
