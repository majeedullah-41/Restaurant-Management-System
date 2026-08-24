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
    pub delivery_receipt_printer: Option<String>,
    pub receipt_copies: i32,
    pub kot_copies: i32,
    pub delivery_receipt_copies: i32,
    pub receipt_layout: Option<String>,
    pub kot_layout: Option<String>,
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
            "SELECT receipt_printer, kot_printer, delivery_receipt_printer,
                    COALESCE(receipt_copies, 1), COALESCE(kot_copies, 1), COALESCE(delivery_receipt_copies, 1),
                    COALESCE(receipt_layout, '{}'), COALESCE(kot_layout, '{}'), COALESCE(delivery_receipt_layout, '{}')
             FROM print_settings WHERE id = 1",
        )
        .map_err(|e| e.to_string())?;

    let settings = stmt
        .query_row([], |row| {
            Ok(PrintSettings {
                receipt_printer: row.get(0)?,
                kot_printer: row.get(1)?,
                delivery_receipt_printer: row.get(2)?,
                receipt_copies: row.get(3)?,
                kot_copies: row.get(4)?,
                delivery_receipt_copies: row.get(5)?,
                receipt_layout: row.get(6)?,
                kot_layout: row.get(7)?,
                delivery_receipt_layout: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    Ok(settings)
}

#[tauri::command]
pub fn update_print_settings(
    receipt_printer: Option<String>,
    kot_printer: Option<String>,
    delivery_receipt_printer: Option<String>,
    receipt_copies: i32,
    kot_copies: i32,
    delivery_receipt_copies: i32,
    receipt_layout: Option<String>,
    kot_layout: Option<String>,
    delivery_receipt_layout: Option<String>,
) -> Result<String, String> {
    let copies = [receipt_copies, kot_copies, delivery_receipt_copies];
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
    let delivery_receipt_layout = delivery_receipt_layout.map(|s| sanitize_layout_json(&s)).unwrap_or_else(|| "{}".to_string());

    let conn = crate::db::get_conn()?;
    crate::db::run_migrations(&conn)?;
    conn.execute(
        "UPDATE print_settings SET
            receipt_printer = ?1,
            kot_printer = ?2,
            delivery_receipt_printer = ?3,
            receipt_copies = ?4,
            kot_copies = ?5,
            delivery_receipt_copies = ?6,
            receipt_layout = ?7,
            kot_layout = ?8,
            delivery_receipt_layout = ?9
         WHERE id = 1",
        rusqlite::params![
            trim_opt(receipt_printer),
            trim_opt(kot_printer),
            trim_opt(delivery_receipt_printer),
            receipt_copies,
            kot_copies,
            delivery_receipt_copies,
            receipt_layout,
            kot_layout,
            delivery_receipt_layout,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok("Print settings saved successfully".into())
}

/// Deterministic thermal (ESC/POS) ticket printing — the physical-printer
/// route. Pipeline: validate → layout → render bytes → spool, with every
/// failure tagged by its stage (spec Error Handling Rule). Logs contain only
/// kind/printer/profile/stage — never customer-sensitive data.
#[tauri::command]
pub async fn print_thermal_ticket(
    document: serde_json::Value,
    layout_json: Option<String>,
    printer_name: Option<String>,
    copies: Option<i32>,
) -> Result<String, String> {
    let copies = copies.unwrap_or(1).max(1);
    tauri::async_runtime::spawn_blocking(move || {
        use crate::thermal::{model::ThermalLayout, model::profile_for_paper,
                             printer::{PrintJob, RealThermalPrinter, ThermalPrinter},
                             renderer::render_ticket};

        let doc: crate::thermal::model::ReceiptDocument = serde_json::from_value(document)
            .map_err(|e| format!("validation: invalid receipt document: {}", e))?;
        let kind = format!("{:?}", doc.kind);

        let layout_raw = layout_json.unwrap_or_default();
        let layout = ThermalLayout::from_json(doc.kind, &layout_raw);
        let profile = profile_for_paper(layout.width_mm);
        let log_ctx =
            |stage: &str, msg: &str| format!("[thermal-print] kind={} stage={} profile={}mm/{}col msg={}", kind, stage, profile.paper_width_mm, profile.characters_per_line, msg);

        let ticket = render_ticket(&doc, &profile, &layout)
            .map_err(|e| { eprintln!("{}", log_ctx("layout", &e)); e })?;

        RealThermalPrinter { printer_name: printer_name.clone() }
            .send(&PrintJob {
                document_name: format!("RMS {} Ticket", kind),
                bytes: ticket.bytes,
                copies: copies as u32,
            })
            .map(|_| {
                println!("{}", log_ctx("spooling", "job accepted"));
                "Thermal ticket sent to the printer".into()
            })
            .map_err(|e| {
                let msg = log_ctx(e.stage.to_string().as_str(), &e.message);
                eprintln!("{}", msg);
                msg
            })
    })
    .await
    .map_err(|e| format!("Thermal print task failed: {}", e))?
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

/// Returns the name of the Windows default printer (empty string when none).
#[tauri::command]
pub async fn get_default_printer() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let script = "(Get-WmiObject -Query \"SELECT * FROM Win32_Printer WHERE Default=$true\").Name";
        let output = run_powershell(script)?;
        Ok(output.trim().to_string())
    })
    .await
    .map_err(|e| format!("Failed to query default printer: {}", e))?
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

/// True for virtual PDF destinations such as "Microsoft Print to PDF". These
/// printers cannot consume RAW text: the spooler wraps the bytes into a
/// corrupt "RAW Document.pdf" that no viewer can open.
fn is_pdf_printer(printer_name: &str) -> bool {
    printer_name.to_lowercase().contains("pdf")
}

fn escape_html_text(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// Renders the ticket to a proper PDF with headless Edge and opens it in the
/// system PDF viewer. The page mirrors the design from Settings: the content
/// column is `width_mm` wide and the monospace font scales with `font_scale`.
/// Runs on a background thread (Edge can take a few seconds) so the caller
/// returns immediately, like the raw print path.
fn print_text_as_pdf(text: &str, width_mm: Option<f64>, font_scale: Option<f64>) -> Result<(), String> {
    let width = width_mm.unwrap_or(80.0).clamp(40.0, 120.0);
    let font_px = 12.0 * font_scale.unwrap_or(100.0).clamp(40.0, 200.0) / 100.0;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let html_path = std::env::temp_dir().join(format!("rms_ticket_{}.html", stamp));
    let pdf_path = std::env::temp_dir().join(format!("rms_ticket_{}.pdf", stamp));

    let html = format!(
        r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Ticket</title>
<style>
  @page {{ margin: 6mm; }}
  body {{ margin: 0; display: flex; justify-content: center; background: #ffffff; }}
  .ticket {{ width: {w}mm; padding: 2mm; font-family: 'Courier New', Courier, monospace; font-size: {f}px; font-weight: bold; color: #000; white-space: pre-wrap; word-wrap: break-word; }}
</style>
</head>
<body><div class="ticket">{}</div></body>
</html>"#,
        escape_html_text(text),
        w = width,
        f = font_px
    );
    std::fs::write(&html_path, html).map_err(|e| format!("Failed to write ticket HTML: {}", e))?;

    let html_str = html_path.display().to_string();
    let pdf_str = pdf_path.display().to_string();
    std::thread::spawn(move || {
        let result = render_html_to_pdf(&html_str, &pdf_str);
        let _ = std::fs::remove_file(&html_str);
        match result {
            Ok(()) => {
                let script = format!("Invoke-Item '{}'", pdf_str.replace('\'', "''"));
                if let Err(e) = spawn_powershell(&script) {
                    eprintln!("Failed to open the generated ticket PDF: {}", e);
                }
            }
            Err(e) => eprintln!("Failed to render the ticket PDF: {}", e),
        }
    });
    Ok(())
}

/// Sends `text` to the named printer (or the default printer when
/// `printer_name` is None), `copies` times. Raw/thermal printers receive the
/// bytes directly; PDF destinations get a rendered PDF document instead,
/// laid out with the paper width and font scale designed in Settings.
pub fn print_text(
    printer_name: Option<&str>,
    text: &str,
    copies: u32,
    width_mm: Option<f64>,
    font_scale: Option<f64>,
) -> Result<(), String> {
    let copies = copies.max(1);

    // Virtual PDF printers cannot consume RAW text — render a real PDF.
    if printer_name.map(is_pdf_printer).unwrap_or(false) {
        return print_text_as_pdf(text, width_mm, font_scale);
    }

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

/// Sends pre-rendered thermal (ESC/POS) bytes straight to the named printer
/// via the winspool RAW pipeline. Unlike [`print_text`] there is no
/// PDF-printer detour: the thermal router guarantees a physical destination.
pub fn print_raw_bytes(printer_name: Option<&str>, bytes: &[u8], copies: u32) -> Result<(), String> {
    let copies = copies.max(1);

    let path = std::env::temp_dir().join(format!("rms_thermal_{}.bin", std::process::id()));
    std::fs::write(&path, bytes).map_err(|e| format!("Failed to write thermal print file: {}", e))?;

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
        di.pDocName = "RMS Thermal Ticket";
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

/// Locates the Microsoft Edge executable used for headless HTML->PDF rendering.
/// Probes the standard install locations and falls back to `where.exe msedge`.
pub fn find_edge() -> Result<String, String> {
    let candidates = [
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    for path in candidates {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }
    // Fall back to PATH resolution.
    let output = std::process::Command::new("where.exe")
        .arg("msedge")
        .output()
        .map_err(|e| format!("Failed to search for Edge: {}", e))?;
    let found = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    found.ok_or_else(|| "Microsoft Edge could not be found. Please install Microsoft Edge to export PDFs.".into())
}

/// Renders a standalone HTML file to a PDF using headless Microsoft Edge.
/// Runs synchronously (headless Edge exits after printing and never shows a
/// dialog), waiting up to 40 seconds for the render to complete.
pub fn render_html_to_pdf(html_path: &str, output_path: &str) -> Result<(), String> {
    let edge = find_edge()?;

    // A temp user-data-dir avoids clashing with a running Edge instance/profile.
    let profile_dir = std::env::temp_dir().join(format!("rms_edge_profile_{}", std::process::id()));
    let _ = std::fs::create_dir_all(&profile_dir);

    let url = format!("file:///{}", html_path.replace('\\', "/"));

    #[cfg(target_os = "windows")]
    let mut cmd = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut c = std::process::Command::new(&edge);
        c.args([
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            "--disable-extensions",
            &format!("--user-data-dir={}", profile_dir.display()),
            &format!("--print-to-pdf={}", output_path),
            &url,
        ]);
        c.creation_flags(CREATE_NO_WINDOW);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = std::process::Command::new(&edge);
        c.args([
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            "--disable-extensions",
            &format!("--user-data-dir={}", profile_dir.display()),
            &format!("--print-to-pdf={}", output_path),
            &url,
        ]);
        c
    };

    // Headless Edge normally exits within a couple of seconds. Wait up to 40s
    // defensively so a stuck first-run never blocks the app indefinitely.
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run Edge for PDF export: {}", e))?;

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(40);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if std::time::Instant::now() > deadline => {
                let _ = child.kill();
                let _ = std::fs::remove_dir_all(&profile_dir);
                return Err("Timed out rendering the PDF with Edge.".into());
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(200)),
            Err(e) => {
                let _ = std::fs::remove_dir_all(&profile_dir);
                return Err(format!("Failed to run Edge for PDF export: {}", e));
            }
        }
    };

    let _ = std::fs::remove_dir_all(&profile_dir);
    if !status.success() {
        return Err("Edge failed to render the PDF. Check the output location is writable.".into());
    }
    Ok(())
}

/// Sends an existing document (e.g. a generated PDF) to a printer using the
/// Windows shell `printto` verb so the file's registered handler prints it
/// without opening a save dialog. Non-blocking (spawn) like the raw printer.
#[tauri::command]
pub fn print_file_to_printer(file_path: String, printer_name: Option<String>) -> Result<String, String> {
    crate::print::print_file_to_printer_cmd(&file_path, printer_name.as_deref())?;
    Ok("Print job sent".into())
}

fn print_file_to_printer_cmd(file_path: &str, printer_name: Option<&str>) -> Result<(), String> {
    let file = file_path.replace('\'', "''");
    let printer = printer_name.unwrap_or("").replace('\'', "''");

    let script = format!(
        r#"
$file = '{0}'
$printer = '{1}'
if ([string]::IsNullOrWhiteSpace($printer)) {{
    $printer = (Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default=`$true").Name
}}
try {{
    $sh = New-Object -ComObject Shell.Application
    $folder = $sh.Namespace((Split-Path $file))
    $item = $folder.ParseName((Split-Path $file -Leaf))
    if ($null -eq $item) {{ throw "File not found: $file" }}
    $item.InvokeVerbEx('printto', $printer)
}} catch {{
    throw
}}
"#,
        file,
        printer
    );

    spawn_powershell(&script)
}

/// Renders a designed-ticket HTML document to a PDF with headless Edge and
/// sends it to the named printer via the shell `printto` verb, once per copy.
/// This is how receipt/KOT/delivery printers receive the exact layout designed
/// in Settings instead of plain ESC/POS text. The temp PDF intentionally
/// outlives this call: the shell's print handler may still be reading it.
#[tauri::command]
pub async fn print_designed_ticket(
    html: String,
    printer_name: Option<String>,
    copies: Option<i32>,
) -> Result<String, String> {
    let copies = copies.unwrap_or(1).max(1) as u32;
    tauri::async_runtime::spawn_blocking(move || {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir();
        let html_path = dir.join(format!("rms_ticket_{}.html", stamp));
        let pdf_path = dir.join(format!("rms_ticket_{}.pdf", stamp));

        std::fs::write(&html_path, &html)
            .map_err(|e| format!("Failed to write ticket HTML: {}", e))?;
        let rendered =
            render_html_to_pdf(&html_path.display().to_string(), &pdf_path.display().to_string());
        let _ = std::fs::remove_file(&html_path);
        rendered?;

        let pdf = pdf_path.display().to_string();
        for _ in 0..copies {
            print_file_to_printer_cmd(&pdf, printer_name.as_deref())?;
        }
        Ok("Designed ticket sent to the printer".into())
    })
    .await
    .map_err(|e| format!("Designed print task failed: {}", e))?
}
