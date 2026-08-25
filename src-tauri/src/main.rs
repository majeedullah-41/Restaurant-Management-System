// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![windows_subsystem = "windows"]

fn main() {
    for arg in std::env::args() {
        if arg.starts_with("--remote-debugging-port") {
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", &arg);
        }
    }

    rms_lib::db::init_shared_connection();
    rms_lib::db::init_db().expect("Failed to initialize database");

    // Warm up the hardware ID off-thread while the window loads. The first
    // run after install (and any launch where the persisted HWID is missing)
    // shells out to PowerShell/WMI, which is very slow right after boot; doing
    // it here keeps it off the UI's first IPC call. Later launches just read
    // the persisted value from the DB and return instantly.
    std::thread::spawn(|| {
        let _ = rms_lib::license::get_hwid();
    });

    rms_lib::run()
}
