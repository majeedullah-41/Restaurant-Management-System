//! Hard-timeout wrappers around external process spawns.
//!
//! Right after Windows boots the WMI service and PowerShell can stay cold for
//! minutes; any blocking `Command::output()` call made during that window
//! freezes the caller indefinitely (observed as the app hanging or being
//! killed at startup). Every external helper process the app spawns therefore
//! goes through [`output_with_timeout`], which kills the child and returns
//! `None` when the deadline expires so callers fall back gracefully instead
//! of hanging forever.

use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};

/// Poll interval while waiting for the child to exit.
const POLL_INTERVAL: Duration = Duration::from_millis(25);

/// Runs `cmd`, capturing its output. Returns `None` when the child cannot be
/// spawned or does not exit within `timeout` (in which case it is killed).
/// Only suitable for commands with small outputs (< ~32 KB), which covers all
/// current uses (WMI queries, getmac, reg query); larger outputs would fill
/// the OS pipe buffer and deadlock until the timeout fires.
pub fn output_with_timeout(mut cmd: Command, timeout: Duration) -> Option<Output> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => return None,
    };

    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {
                if start.elapsed() >= timeout {
                    break None;
                }
                std::thread::sleep(POLL_INTERVAL);
            }
            Err(_) => break None,
        }
    };

    let status = match status {
        Some(s) => s,
        None => {
            // Deadline exceeded or wait failed: kill so nothing is left behind.
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
    };

    // Child already exited, so these reads complete immediately.
    let stdout = child.stdout.take().map(|mut p| {
        use std::io::Read;
        let mut buf = Vec::new();
        let _ = p.read_to_end(&mut buf);
        buf
    });
    let stderr = child.stderr.take().map(|mut p| {
        use std::io::Read;
        let mut buf = Vec::new();
        let _ = p.read_to_end(&mut buf);
        buf
    });

    Some(Output {
        status,
        stdout: stdout.unwrap_or_default(),
        stderr: stderr.unwrap_or_default(),
    })
}
