use serde::Serialize;

/// A single printer discovered on the machine via `Get-Printer`.
#[derive(Serialize, Debug)]
pub struct PrinterInfo {
    pub name: String,
    pub driver_name: String,
    pub port_name: String,
    pub status: i32,
}

#[derive(Serialize)]
pub struct PrintSettings {
    pub receipt_printer: Option<String>,
    pub kot_printer: Option<String>,
    pub delivery_printer: Option<String>,
    pub delivery_receipt_printer: Option<String>,
    pub receipt_copies: i32,
    pub kot_copies: i32,
    pub delivery_copies: i32,
    pub delivery_receipt_copies: i32,
    pub print_mode: String,
    pub receipt_layout: Option<String>,
    pub kot_layout: Option<String>,
    pub delivery_layout: Option<String>,
    pub delivery_receipt_layout: Option<String>,
}

fn sanitize_layout_json(input: &str) -> String {
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(input);
    match parsed {
        Ok(value) if value.is_object() => serde_json::to_string(&value).unwrap_or_else(|_| "{}".into()),
        _ => "{}".to_string(),
    }
}

#[tauri::command]
pub fn get_print_settings() -> Result<PrintSettings, String> {
    let conn = crate::db::get_conn()?;
    crate::db::run_migrations(&conn)?;
    let mut stmt = conn
        .prepare(
            "SELECT receipt_printer, kot_printer, delivery_printer, delivery_receipt_printer,
                    COALESCE(receipt_copies, 1), COALESCE(kot_copies, 1), COALESCE(delivery_copies, 1), COALESCE(delivery_receipt_copies, 1),
                    COALESCE(print_mode, 'auto'),
                    COALESCE(receipt_layout, '{}'), COALESCE(kot_layout, '{}'), COALESCE(delivery_layout, '{}'), COALESCE(delivery_receipt_layout, '{}')
             FROM print_settings WHERE id = 1",
        )
        .map_err(|e| e.to_string())?;

    let settings = stmt
        .query_row([], |row| {
            Ok(PrintSettings {
                receipt_printer: row.get(0)?,
                kot_printer: row.get(1)?,
                delivery_printer: row.get(2)?,
                delivery_receipt_printer: row.get(3)?,
                receipt_copies: row.get(4)?,
                kot_copies: row.get(5)?,
                delivery_copies: row.get(6)?,
                delivery_receipt_copies: row.get(7)?,
                print_mode: row.get(8)?,
                receipt_layout: row.get(9)?,
                kot_layout: row.get(10)?,
                delivery_layout: row.get(11)?,
                delivery_receipt_layout: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(settings)
}

#[tauri::command]
pub fn update_print_settings(
    receipt_printer: Option<String>,
    kot_printer: Option<String>,
    delivery_printer: Option<String>,
    delivery_receipt_printer: Option<String>,
    receipt_copies: i32,
    kot_copies: i32,
    delivery_copies: i32,
    delivery_receipt_copies: i32,
    print_mode: String,
    receipt_layout: Option<String>,
    kot_layout: Option<String>,
    delivery_layout: Option<String>,
    delivery_receipt_layout: Option<String>,
) -> Result<String, String> {
    if !["auto", "preview"].contains(&print_mode.as_str()) {
        return Err("Invalid print mode.".into());
    }
    let copies = [receipt_copies, kot_copies, delivery_copies, delivery_receipt_copies];
    if copies.iter().any(|&c| c < 1 || c > 99) {
        return Err("Copies must be between 1 and 99.".into());
    }

    let trim_opt = |s: Option<String>| -> Option<String> {
        s.map(|v| {
            let t = v.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        })
        .flatten()
    };

    let receipt_layout = receipt_layout.map(|s| sanitize_layout_json(&s)).unwrap_or_else(|| "{}".to_string());
    let kot_layout = kot_layout.map(|s| sanitize_layout_json(&s)).unwrap_or_else(|| "{}".to_string());
    let delivery_layout = delivery_layout.map(|s| sanitize_layout_json(&s)).unwrap_or_else(|| "{}".to_string());
    let delivery_receipt_layout = delivery_receipt_layout.map(|s| sanitize_layout_json(&s)).unwrap_or_else(|| "{}".to_string());

    let conn = crate::db::get_conn()?;
    crate::db::run_migrations(&conn)?;
    conn.execute(
        "UPDATE print_settings SET
            receipt_printer = ?1,
            kot_printer = ?2,
            delivery_printer = ?3,
            delivery_receipt_printer = ?4,
            receipt_copies = ?5,
            kot_copies = ?6,
            delivery_copies = ?7,
            delivery_receipt_copies = ?8,
            print_mode = ?9,
            receipt_layout = ?10,
            kot_layout = ?11,
            delivery_layout = ?12,
            delivery_receipt_layout = ?13
         WHERE id = 1",
        rusqlite::params![
            trim_opt(receipt_printer),
            trim_opt(kot_printer),
            trim_opt(delivery_printer),
            trim_opt(delivery_receipt_printer),
            receipt_copies,
            kot_copies,
            delivery_copies,
            delivery_receipt_copies,
            print_mode,
            receipt_layout,
            kot_layout,
            delivery_layout,
            delivery_receipt_layout,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok("Print settings saved successfully".into())
}

/// Caches the printer listing briefly so navigating settings tabs does not
/// spawn a fresh PowerShell process (and flash a console / block a worker)
/// on every mount.
static PRINTER_CACHE: std::sync::Mutex<Option<(std::time::Instant, String)>> = std::sync::Mutex::new(None);

#[tauri::command]
pub async fn list_printers(force: Option<bool>) -> Result<Vec<PrinterInfo>, String> {
    let script =
        "Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus | ConvertTo-Json -Compress";
    let force = force.unwrap_or(false);
    let cached = if force {
        None
    } else {
        let guard = PRINTER_CACHE.lock().unwrap();
        match &*guard {
            Some((at, raw)) if at.elapsed() < std::time::Duration::from_secs(10) => Some(raw.clone()),
            _ => None,
        }
    };
    let output = match cached {
        Some(raw) => raw,
        None => {
            let raw = run_powershell(script)?;
            let mut guard = PRINTER_CACHE.lock().unwrap();
            *guard = Some((std::time::Instant::now(), raw.clone()));
            raw
        }
    };
    let trimmed = output.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    #[derive(serde::Deserialize)]
    struct RawPrinter {
        #[serde(rename = "Name")]
        name: String,
        #[serde(rename = "DriverName", default)]
        driver_name: String,
        #[serde(rename = "PortName", default)]
        port_name: String,
        #[serde(rename = "PrinterStatus", default)]
        status: i32,
    }

    let parsed: Result<Vec<RawPrinter>, _> = serde_json::from_str(trimmed);
    match parsed {
        Ok(list) => Ok(list
            .into_iter()
            .map(|p| PrinterInfo {
                name: p.name,
                driver_name: p.driver_name,
                port_name: p.port_name,
                status: p.status,
            })
            .collect()),
        Err(_) => {
            // Single printer (Get-Printer may return a non-array).
            let single: Result<RawPrinter, _> = serde_json::from_str(trimmed);
            Ok(single
                .map(|p| {
                    vec![PrinterInfo {
                        name: p.name,
                        driver_name: p.driver_name,
                        port_name: p.port_name,
                        status: p.status,
                    }]
                })
                .unwrap_or_default())
        }
    }
}

/// Runs a PowerShell command and captures its standard output (used for queries
/// like `Get-Printer`). On Windows the child is started with CREATE_NO_WINDOW so
/// no console flashes up; PowerShell's own `-WindowStyle Hidden` is not
/// sufficient when spawned from a GUI process.
fn run_powershell(script: &str) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let mut cmd = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut c = std::process::Command::new("powershell");
        c.args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script]);
        c.creation_flags(CREATE_NO_WINDOW);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = std::process::Command::new("powershell");
        c.args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script]);
        c
    };

    let output = cmd.output().map_err(|e| format!("Failed to run PowerShell: {}", e))?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Spawns (non-blocking) a PowerShell job that sends `text` to the named
/// printer (or the default printer when `printer_name` is None), `copies` times.
pub fn print_text(printer_name: Option<&str>, text: &str, copies: u32) -> Result<(), String> {
    let copies = copies.max(1);
    let path = std::env::temp_dir().join(format!("rms_print_{}.txt", std::process::id()));
    std::fs::write(&path, text).map_err(|e| format!("Failed to write print file: {}", e))?;

    let escaped_path = path.display().to_string().replace('\'', "''");
    let p_name = printer_name.unwrap_or("").replace('\'', "''");

    let script = format!(
        r#"
$typeDef = @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {{
    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public class DOCINFOA {{
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }}

    public static bool SendBytesToPrinter(string szPrinterName, byte[] data) {{
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        bool bSuccess = false;
        di.pDocName = "RAW Document";
        di.pDataType = "RAW";

        if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {{
            if (StartDocPrinter(hPrinter, 1, di)) {{
                if (StartPagePrinter(hPrinter)) {{
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(data.Length);
                    Marshal.Copy(data, 0, pUnmanagedBytes, data.Length);
                    int dwWritten = 0;
                    bSuccess = WritePrinter(hPrinter, pUnmanagedBytes, data.Length, out dwWritten);
                    EndPagePrinter(hPrinter);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                }}
                EndDocPrinter(hPrinter);
            }}
            ClosePrinter(hPrinter);
        }}
        return bSuccess;
    }}
}}
"@
try {{
    Add-Type -TypeDefinition $typeDef -ErrorAction SilentlyContinue
}} catch {{}}

$printerName = '{1}'
if ([string]::IsNullOrWhiteSpace($printerName)) {{
    $printerName = (Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default=`$true").Name
}}

$bytes = [System.IO.File]::ReadAllBytes('{0}')
1..{2} | ForEach-Object {{
    [RawPrint]::SendBytesToPrinter($printerName, $bytes)
}}
"#,
        escaped_path,
        p_name,
        copies
    );

    spawn_powershell(&script)
}

#[cfg(target_os = "windows")]
fn spawn_powershell(script: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script]);
    cmd.creation_flags(CREATE_NO_WINDOW);
    // spawn() instead of output() so it doesn't block if the printer is a PDF
    // printer waiting for a 'Save As' dialog.
    cmd.spawn().map_err(|e| format!("Failed to spawn print command: {}", e))?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn spawn_powershell(script: &str) -> Result<(), String> {
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script])
        .spawn()
        .map_err(|e| format!("Failed to spawn print command: {}", e))?;
    Ok(())
}
