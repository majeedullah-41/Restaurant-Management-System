// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![windows_subsystem = "windows"]

/// Installs a global panic hook that appends to a small log file next to the
/// database. Without it, an unexpected Rust panic silently kills the process —
/// the user sees the app "just close" with no trace of why. The log keeps the
/// last few crashes (rotated) so recurring issues can be diagnosed.
fn install_panic_logger() {
    std::panic::set_hook(Box::new(|info| {
        use std::io::Write;

        // Resolve the data dir independently of db.rs to keep this hook
        // dependency-free and safe even if panicking code holds DB locks.
        let dir = std::env::var("LOCALAPPDATA")
            .map(|d| std::path::Path::new(&d).join("RMS"))
            .unwrap_or_else(|_| std::path::PathBuf::from("."));
        let _ = std::fs::create_dir_all(&dir);
        let log_path = dir.join("crash.log");

        // Rotate: keep crash.log + one previous generation.
        let prev = dir.join("crash.log.1");
        if prev.exists() {
            let _ = std::fs::remove_file(&prev);
        }
        let _ = std::fs::rename(&log_path, &prev);

        let thread = std::thread::current();
        let thread_name = thread.name().unwrap_or("<unnamed>");
        // After rotation, this append creates a fresh log holding just this
        // panic; the previous session's log lives on as crash.log.1.
        let mut file = match std::fs::OpenOptions::new().create(true).append(true).open(&log_path)
        {
            Ok(f) => f,
            Err(_) => return, // Never panic inside a panic hook.
        };
        let _ = writeln!(file, "===== {} =====", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"));
        let _ = writeln!(file, "thread: {}", thread_name);
        let _ = writeln!(file, "{}", info);
        let _ = file.flush();
    }));
}

fn main() {
    install_panic_logger();

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
