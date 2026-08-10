#![allow(dead_code, unused_variables, non_snake_case)]

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::NaiveDate;
use rsa::pkcs1v15::{Signature, VerifyingKey};
use rsa::pkcs8::DecodePublicKey;
use rsa::signature::Verifier;
use rsa::RsaPublicKey;
use serde::Serialize;
use sha2::Sha256;
use sysinfo::System;

use std::sync::Mutex;

static HWID_CACHE: Mutex<Option<String>> = Mutex::new(None);

/// Generates a hardware-bound identifier from strictly permanent machine
/// hardware: the CPU ProcessorId, motherboard serial, BIOS serial and the
/// SMBIOS system UUID. Unlike hostname / MAC / MachineGuid these values never
/// change when Windows is reinstalled, the machine is renamed, or network
/// adapters are swapped, so a license stays bound to the physical device.
///
/// The first value computed for a device is persisted in the license table
/// and reused on every subsequent launch. This makes the HWID stable even if
/// WMI intermittently returns a different set of identifiers, a BIOS/CMOS
/// update alters the reported serials, or the PowerShell query fails entirely
/// (the fallback would otherwise produce a different value than the primary
/// path). Once stored, the HWID only changes if the database is wiped.
pub fn get_hwid() -> String {
    {
        let cache = HWID_CACHE.lock().unwrap();
        if let Some(h) = cache.as_ref() {
            return h.clone();
        }
    }

    let value = if let Some(persisted) = load_persisted_hwid() {
        persisted
    } else {
        let computed = compute_hwid();
        persist_hwid(&computed);
        computed
    };

    let mut cache = HWID_CACHE.lock().unwrap();
    *cache = Some(value.clone());
    value
}

/// Clears the in-memory HWID cache so the next call re-reads the persisted
/// value. Required after a backup import swaps in a license from another
/// machine: the restored DB carries that machine's HWID, and the cache must not
/// keep serving the pre-import value.
pub fn invalidate_hwid_cache() {
    let mut cache = HWID_CACHE.lock().unwrap();
    *cache = None;
}

/// Computes a HWID from the current hardware, without consulting persistence.
fn compute_hwid() -> String {
    let mut components: Vec<String> = Vec::new();

    for id in get_permanent_hardware_ids() {
        if !id.is_empty() {
            components.push(id);
        }
    }

    // Last-resort fallback so the app still works on a machine where no
    // permanent hardware identifier is exposed (locked-down VM / sandbox).
    // It intentionally never runs on a normal physical PC.
    if components.is_empty() {
        let hostname = System::host_name()
            .or_else(|| std::env::var("COMPUTERNAME").ok())
            .unwrap_or_else(|| "UNKNOWN-HOST".to_string());
        let mac = get_primary_mac().unwrap_or_else(|| "00:00:00:00:00:00".to_string());
        let machine_guid = get_windows_machine_guid().unwrap_or_else(|| "UNKNOWN-GUID".to_string());
        components.push(format!("{}|{}|{}", hostname, mac, machine_guid));
    }

    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(components.join("|"));
    let result = hasher.finalize();

    let hex: String = result.iter().take(16).map(|b| format!("{:02X}", b)).collect();

    format!(
        "{}-{}-{}-{}",
        &hex[0..4],
        &hex[4..8],
        &hex[8..12],
        &hex[12..16]
    )
}

/// Returns the HWID previously persisted for this installation, if any.
fn load_persisted_hwid() -> Option<String> {
    let conn = crate::db::get_conn().ok()?;
    let hwid: Option<String> = conn
        .query_row("SELECT hwid FROM license WHERE id = 1", [], |row| row.get(0))
        .ok()?;
    hwid.filter(|h| !h.trim().is_empty())
}

/// Stores the HWID in the license table so it is reused on future launches.
/// Best-effort: if the database is unavailable we simply skip persistence and
/// keep the in-memory value for this process.
fn persist_hwid(hwid: &str) {
    if let Ok(conn) = crate::db::get_conn() {
        let _ = conn.execute(
            "INSERT INTO license (id, hwid) VALUES (1, ?1) \
             ON CONFLICT(id) DO UPDATE SET hwid = excluded.hwid",
            [hwid],
        );
    }
}

/// Reads the strictly permanent hardware identifiers from WMI in a single
/// PowerShell invocation (avoids spawning one process per identifier).
/// Returns them in a fixed, deterministic order:
///   [CPU ProcessorId, Motherboard Serial, BIOS Serial, System UUID]
fn get_permanent_hardware_ids() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$mb  = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
$sys = Get-CimInstance Win32_ComputerSystemProduct | Select-Object -First 1
Write-Output ("CPU=" + $cpu.ProcessorId)
Write-Output ("MB=" + $mb.SerialNumber)
Write-Output ("BIOS=" + $bios.SerialNumber)
Write-Output ("UUID=" + $sys.UUID)
"#;

        let mut cmd = std::process::Command::new("powershell.exe");
        cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
        cmd.creation_flags(CREATE_NO_WINDOW);

        if let Ok(output) = cmd.output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut ids: Vec<String> = Vec::new();
            for line in stdout.lines() {
                let line = line.trim();
                if let Some(value) = line.strip_prefix("CPU=") {
                    push_hardware_id(&mut ids, value);
                } else if let Some(value) = line.strip_prefix("MB=") {
                    push_hardware_id(&mut ids, value);
                } else if let Some(value) = line.strip_prefix("BIOS=") {
                    push_hardware_id(&mut ids, value);
                } else if let Some(value) = line.strip_prefix("UUID=") {
                    push_hardware_id(&mut ids, value);
                }
            }
            return ids;
        }
    }
    Vec::new()
}

/// Appends an identifier unless it is a WMI placeholder value that some OEM
/// boards/firmware report in place of a real serial number.
fn push_hardware_id(ids: &mut Vec<String>, value: &str) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return;
    }
    let lower = trimmed.to_lowercase();
    const PLACEHOLDERS: &[&str] = &[
        "default string",
        "to be filled by o.e.m.",
        "o.e.m.",
        "system serial number",
        "none",
        "not specified",
        "unknown",
        "n/a",
        "null",
        "0",
    ];
    if PLACEHOLDERS.iter().any(|p| lower == *p) {
        return;
    }
    ids.push(trimmed.to_string());
}

/// Retrieves the primary MAC address deterministically by sorting all interface MACs.
fn get_primary_mac() -> Option<String> {
    let networks = sysinfo::Networks::new_with_refreshed_list();
    let mut macs: Vec<String> = Vec::new();

    for (_name, network) in &networks {
        let mac_str = network.mac_address().to_string().to_uppercase();
        if !mac_str.is_empty() && mac_str != "00:00:00:00:00:00" && mac_str.contains(':') {
            macs.push(mac_str);
        }
    }

    if !macs.is_empty() {
        macs.sort(); // Sort deterministically so interface order is 100% stable
        return Some(macs[0].clone());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        let mut cmd = std::process::Command::new("getmac");
        cmd.args(["/FO", "CSV", "/NH"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        if let Ok(output) = cmd.output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split(',').collect();
                if let Some(mac_field) = parts.first() {
                    let mac = mac_field.trim().trim_matches('"');
                    if !mac.is_empty() && mac != "N/A" && mac.contains('-') {
                        macs.push(mac.replace('-', ":").to_uppercase());
                    }
                }
            }
        }
        if !macs.is_empty() {
            macs.sort();
            return Some(macs[0].clone());
        }
    }

    None
}

/// Retrieves the permanent Windows MachineGuid from the registry for stable hardware identification.
fn get_windows_machine_guid() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let mut cmd = std::process::Command::new("reg");
        cmd.args(["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"]);
        cmd.creation_flags(CREATE_NO_WINDOW);

        if let Ok(output) = cmd.output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("MachineGuid") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if let Some(guid) = parts.last() {
                        return Some(guid.to_string());
                    }
                }
            }
        }
    }
    None
}

// ─── Embedded Public Key ────────────────────────────────────────────────────
// This public key is used to verify license keys signed by the owner's private key.
// Replace this with your actual public key generated by the keygen script.

const PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnfpuwXZ872GX2c/qE4KT
8UnLHDR+BfJuW8aT/bNEU6Q9EEi9/qFAdV/jPtud/IJNSfBY/jUyFszSSDAiFuyI
sh8LWUm/673ooXSQSZeNBvDpKjdDsNrL3G0R1rf8bP+nEuYKuE+ih/riUeH+kYee
Sc5zYC93pnBv4pKZnGUL+N3LdqAW1H2yzpeLScv+OzaR8N/g4iSiKes9Gv1fHNRT
SIjY9XSJMo8SAY6x1b+qT9D1CpEdEP/4O1W61ha0wSadzPv1kPPmKVnfygUS7j9o
OLYwOj+eubKpZmpiMkbGD08NeettFijBwkZZ+SgvrzeqYXbOxC1kfLY7pi+Z3FRv
wwIDAQAB
-----END PUBLIC KEY-----";

// ─── License Key Format ─────────────────────────────────────────────────────
// A license key is a Base64 string that decodes to:
//   PAYLOAD\n
//   SIGNATURE
//
// Where PAYLOAD is: HWID|EXPIRY_DATE (e.g., "A1B2-C3D4-E5F6-G7H8|2025-12-31")
// And SIGNATURE is the RSA-SHA256 signature of PAYLOAD, also Base64 encoded.

#[derive(Serialize)]
pub struct LicenseStatus {
    pub valid: bool,
    pub hwid: String,
    pub message: String,
    pub expiry_date: Option<String>,
    pub days_remaining: Option<i64>,
}

/// Verifies a license key against the current machine's HWID and today's date.
pub fn verify_license_key(key_string: &str) -> LicenseStatus {
    verify_license_key_for_hwid(key_string, &get_hwid())
}

/// Verifies a license key against a *specific* HWID and today's date. This is
/// used to check a license stored inside a backup file: the backup belongs to
/// another machine, so it must be validated against the HWID embedded in the
/// backup (not the current machine's), using today's real date for expiry.
pub fn verify_license_key_for_hwid(key_string: &str, expected_hwid: &str) -> LicenseStatus {
    let hwid = expected_hwid.to_string();

    // Decode the key from Base64
    let decoded = match BASE64.decode(key_string.trim()) {
        Ok(d) => d,
        Err(_) => {
            return LicenseStatus {
                valid: false,
                hwid,
                message: "Invalid license key format.".to_string(),
                expiry_date: None,
                days_remaining: None,
            };
        }
    };

    let decoded_str = match String::from_utf8(decoded) {
        Ok(s) => s,
        Err(_) => {
            return LicenseStatus {
                valid: false,
                hwid,
                message: "Invalid license key encoding.".to_string(),
                expiry_date: None,
                days_remaining: None,
            };
        }
    };

    // Split into payload and signature
    let parts: Vec<&str> = decoded_str.splitn(2, '\n').collect();
    if parts.len() != 2 {
        return LicenseStatus {
            valid: false,
            hwid,
            message: "Malformed license key.".to_string(),
            expiry_date: None,
            days_remaining: None,
        };
    }

    let payload = parts[0];
    let signature_b64 = parts[1];

    // Verify RSA signature
    let pub_key = match RsaPublicKey::from_public_key_pem(PUBLIC_KEY_PEM) {
        Ok(k) => k,
        Err(_) => {
            return LicenseStatus {
                valid: false,
                hwid,
                message: "Internal error: invalid public key configuration.".to_string(),
                expiry_date: None,
                days_remaining: None,
            };
        }
    };

    let sig_bytes = match BASE64.decode(signature_b64.trim()) {
        Ok(s) => s,
        Err(_) => {
            return LicenseStatus {
                valid: false,
                hwid,
                message: "Invalid signature in license key.".to_string(),
                expiry_date: None,
                days_remaining: None,
            };
        }
    };

    let verifying_key = VerifyingKey::<Sha256>::new(pub_key);
    let signature = match Signature::try_from(sig_bytes.as_slice()) {
        Ok(s) => s,
        Err(_) => {
            return LicenseStatus {
                valid: false,
                hwid,
                message: "Corrupted signature in license key.".to_string(),
                expiry_date: None,
                days_remaining: None,
            };
        }
    };

    if verifying_key.verify(payload.as_bytes(), &signature).is_err() {
        return LicenseStatus {
            valid: false,
            hwid,
            message: "License key signature verification failed. This key is invalid or tampered with.".to_string(),
            expiry_date: None,
            days_remaining: None,
        };
    }

    // Signature is valid — now check payload contents
    let payload_parts: Vec<&str> = payload.splitn(2, '|').collect();
    if payload_parts.len() != 2 {
        return LicenseStatus {
            valid: false,
            hwid,
            message: "Malformed license payload.".to_string(),
            expiry_date: None,
            days_remaining: None,
        };
    }

    let key_hwid = payload_parts[0];
    let key_expiry = payload_parts[1];

    // Check HWID match
    if key_hwid != hwid {
        return LicenseStatus {
            valid: false,
            hwid,
            message: "This license key was issued for a different machine.".to_string(),
            expiry_date: Some(key_expiry.to_string()),
            days_remaining: None,
        };
    }

    // Check expiry
    let expiry = match NaiveDate::parse_from_str(key_expiry, "%Y-%m-%d") {
        Ok(d) => d,
        Err(_) => {
            return LicenseStatus {
                valid: false,
                hwid,
                message: "Invalid expiry date in license key.".to_string(),
                expiry_date: Some(key_expiry.to_string()),
                days_remaining: None,
            };
        }
    };

    let today = chrono::Local::now().date_naive();
    let days_remaining = (expiry - today).num_days();

    if days_remaining < 0 {
        return LicenseStatus {
            valid: false,
            hwid,
            message: format!(
                "License expired on {}. Please contact your vendor for renewal.",
                key_expiry
            ),
            expiry_date: Some(key_expiry.to_string()),
            days_remaining: Some(days_remaining),
        };
    }

    LicenseStatus {
        valid: true,
        hwid,
        message: format!("License is active. {} days remaining.", days_remaining),
        expiry_date: Some(key_expiry.to_string()),
        days_remaining: Some(days_remaining),
    }
}

// ─── Tauri Commands ─────────────────────────────────────────────────────────

use std::time::{Duration, Instant};

struct LicenseCache {
    checked_at: Instant,
    valid: bool,
}

static LICENSE_CACHE: Mutex<Option<LicenseCache>> = Mutex::new(None);

/// Fast boolean license check used by the central `authorize()` gate in lib.rs.
/// Every protected IPC command is blocked unless a valid, unexpired license for
/// this machine is present. The result is cached for a short window so we do
/// not re-read the key and re-verify the RSA signature on every single IPC call.
pub fn is_license_valid() -> bool {
    {
        if let Ok(cache) = LICENSE_CACHE.lock() {
            if let Some(c) = cache.as_ref() {
                if c.checked_at.elapsed() < Duration::from_secs(5) {
                    return c.valid;
                }
            }
        }
    }

    let valid = matches!(check_license_status(), Ok(s) if s.valid);

    if let Ok(mut cache) = LICENSE_CACHE.lock() {
        *cache = Some(LicenseCache {
            checked_at: Instant::now(),
            valid,
        });
    }
    valid
}

/// Invalidates the cached license verdict (called after a successful
/// activation or renewal so the new key takes effect immediately).
pub fn invalidate_license_cache() {
    if let Ok(mut cache) = LICENSE_CACHE.lock() {
        *cache = None;
    }
}

/// Returns the current machine's HWID for display on the License screen.
#[tauri::command]
pub fn get_machine_hwid() -> String {
    get_hwid()
}

/// Checks the license status by reading the stored key from the database.
#[tauri::command]
pub fn check_license_status() -> Result<LicenseStatus, String> {
    let conn = crate::db::get_conn()?;

    let hwid = get_hwid();

    // Try to read the current key from the license table
    let key: Option<String> = conn
        .query_row(
            "SELECT current_key FROM license WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .ok();

    match key {
        Some(k) if !k.is_empty() => {
            let status = verify_license_key(&k);
            if status.valid {
                // Detect clock rollback: the license can only be valid if the
                // current date is not earlier than the last date it validated.
                // Persist today on every successful check.
                let today = chrono::Local::now().format("%Y-%m-%d").to_string();
                let last_validated: Option<String> = conn
                    .query_row(
                        "SELECT last_validated_date FROM license WHERE id = 1",
                        [],
                        |row| row.get(0),
                    )
                    .ok();

                if let Some(prev) = last_validated {
                    if !prev.is_empty() {
                        if let (Ok(prev_date), Ok(today_date)) = (
                            NaiveDate::parse_from_str(&prev, "%Y-%m-%d"),
                            NaiveDate::parse_from_str(&today, "%Y-%m-%d"),
                        ) {
                            if today_date < prev_date {
                                let expiry_date = status.expiry_date.clone();
                                let days_remaining = expiry_date.as_deref().and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok()).map(|exp| (exp - today_date).num_days());
                                return Ok(LicenseStatus {
                                    valid: false,
                                    hwid,
                                    message: "System clock appears to have been rolled back. Please restore the correct date.".to_string(),
                                    expiry_date,
                                    days_remaining,
                                });
                            }
                        }
                    }
                }

                let _ = conn.execute(
                    "UPDATE license SET last_validated_date = ?1 WHERE id = 1",
                    rusqlite::params![today],
                );
            }
            Ok(status)
        }
        _ => Ok(LicenseStatus {
            valid: false,
            hwid,
            message: "No license key found. Please activate your license.".to_string(),
            expiry_date: None,
            days_remaining: None,
        }),
    }
}

/// Activates a license key by verifying it and storing it in the database.
#[tauri::command]
pub fn activate_license(key: String) -> Result<LicenseStatus, String> {
    let status = verify_license_key(&key);

    if !status.valid {
        return Ok(status);
    }

    // Key is valid — store it in the database
    let conn = crate::db::get_conn()?;

    let expiry = status.expiry_date.as_deref().unwrap_or("");
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO license (id, current_key, expiry_date, activated_at) VALUES (1, ?1, ?2, ?3) \
         ON CONFLICT(id) DO UPDATE SET current_key = ?1, expiry_date = ?2, activated_at = ?3",
        [&key, expiry, &now.as_str()],
    )
    .map_err(|e| e.to_string())?;

    invalidate_license_cache();

    Ok(status)
}

/// Extracts the HWID embedded in a license key's payload (`hwid|expiry`).
/// Used when a backup file predates the `hwid` column in the license table.
fn hwid_from_key_payload(key_string: &str) -> Option<String> {
    let decoded = BASE64.decode(key_string.trim()).ok()?;
    let s = String::from_utf8(decoded).ok()?;
    let payload = s.splitn(2, '\n').next()?;
    let hwid = payload.splitn(2, '|').next()?.trim();
    if hwid.is_empty() { None } else { Some(hwid.to_string()) }
}

/// Restores a license from a backup database file, for moving to a new device.
///
/// The backup is validated against its *own* embedded HWID and *today's* real
/// date BEFORE any data is imported:
/// - If the license has expired (or fails verification), nothing is imported
///   and the status is returned so the License screen can tell the user the
///   backup's license is no longer active.
/// - If the license is still valid, the backup data is imported and the
///   backup's license (key + HWID) is adopted so it keeps working on the new
///   machine. Restores are tracked (original HWID + restore count) so a vendor
///   can detect license sharing across machines.
#[tauri::command]
pub fn restore_license_from_backup(file_path: String) -> Result<LicenseStatus, String> {
    // Defense in depth: this command is reachable without a session (it is
    // PUBLIC so the pre-login License screen can use it), so it must not be able
    // to silently overwrite an installation that already has a valid license.
    // On such a device the Settings → Data Migration flow is the correct path.
    if is_license_valid() {
        return Err(
            "This installation already has an active license. Restoring from a backup would overwrite its data and license. Use Settings → Data Migration instead.".to_string(),
        );
    }

    let (key, _expiry, _activated, _validated, backup_hwid) =
        crate::db::read_backup_license(&file_path)?;

    let hwid = backup_hwid
        .or_else(|| hwid_from_key_payload(&key))
        .ok_or_else(|| "Backup license is missing a machine identifier.".to_string())?;

    let status = verify_license_key_for_hwid(&key, &hwid);

    if !status.valid {
        return Ok(status);
    }

    crate::db::import_backup_adopting_license(file_path)?;
    crate::db::mark_license_restored(&hwid)?;

    // The adopted HWID now lives in the imported database — drop the in-memory
    // caches so the next check reads it instead of the new machine's HWID.
    invalidate_hwid_cache();
    invalidate_license_cache();

    Ok(status)
}

/// Returns license info for the Settings page (license key, HWID, expiry,
/// activated_at, days remaining, restore tracking).
#[derive(Serialize)]
pub struct LicenseInfo {
    pub license_key: Option<String>,
    pub hwid: String,
    pub expiry_date: Option<String>,
    pub activated_at: Option<String>,
    pub days_remaining: Option<i64>,
    pub status: String,
    pub original_hwid: Option<String>,
    pub hwid_restored_at: Option<String>,
    pub restore_count: Option<i64>,
}

#[tauri::command]
pub fn get_license_info() -> Result<LicenseInfo, String> {
    let conn = crate::db::get_conn()?;
    let hwid = get_hwid();

    // Read license data from DB
    let result: Option<(Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<i64>)> = conn
        .query_row(
            "SELECT license_key, expiry_date, activated_at, original_hwid, hwid_restored_at, restore_count \
             FROM (SELECT current_key AS license_key, expiry_date, activated_at, original_hwid, hwid_restored_at, restore_count FROM license) WHERE 1 = 1",
            [],
            |row| Ok((
                row.get(0).ok().flatten(),
                row.get(1).ok().flatten(),
                row.get(2).ok().flatten(),
                row.get(3).ok().flatten(),
                row.get(4).ok().flatten(),
                row.get::<_, Option<i64>>(5).ok().flatten(),
            )),
        )
        .ok();

    match result {
        Some((license_key, expiry_date, activated_at, original_hwid, hwid_restored_at, restore_count)) => {
            let (days_remaining, status) = if let Some(ref exp) = expiry_date {
                if let Ok(expiry) = NaiveDate::parse_from_str(exp, "%Y-%m-%d") {
                    let today = chrono::Local::now().date_naive();
                    let days = (expiry - today).num_days();
                    if days < 0 {
                        (Some(days), "Expired".to_string())
                    } else {
                        (Some(days), "Active".to_string())
                    }
                } else {
                    (None, "Unknown".to_string())
                }
            } else {
                (None, "No License".to_string())
            };

            Ok(LicenseInfo {
                license_key,
                hwid,
                expiry_date,
                activated_at,
                days_remaining,
                status,
                original_hwid,
                hwid_restored_at,
                restore_count,
            })
        }
        None => Ok(LicenseInfo {
            license_key: None,
            hwid,
            expiry_date: None,
            activated_at: None,
            days_remaining: None,
            status: "No License".to_string(),
            original_hwid: None,
            hwid_restored_at: None,
            restore_count: None,
        }),
    }
}
