import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "./api";
import { loadPrintSettings } from "./printing";

// The app's compiled Tailwind CSS, inlined at build time so a standalone HTML
// document rendered by headless Edge keeps every utility class intact.
import compiledCss from "../App.css?inline";

const PHYSICAL_PRINTER_BLOCKLIST = ["microsoft print to pdf", "fax", "xps", "onenote"];

function isPhysicalPrinter(name: string): boolean {
  const lower = name.toLowerCase();
  return !PHYSICAL_PRINTER_BLOCKLIST.some((b) => lower.includes(b));
}

/** Ticket printers are 80mm thermal devices — an A4 report must never go there. */
async function isTicketPrinter(name: string): Promise<boolean> {
  try {
    const s = await loadPrintSettings();
    const ticketPrinters = [
      s.receiptPrinter,
      s.kotPrinter,
      s.deliveryReceiptPrinter,
      ]
      .map((p) => p?.trim().toLowerCase())
      .filter(Boolean);
    return ticketPrinters.includes(name.trim().toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Builds a self-contained HTML document from a rendered report node so it can be
 * converted to PDF with headless Edge. Inlines the app stylesheet and rewrites
 * local <img src="C:\..."> paths to file:// URIs so logos load from disk.
 */
export function buildReportHtml(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;

  clone.querySelectorAll("img[src]").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (/^[a-zA-Z]:[\\/]/.test(src)) {
      img.setAttribute("src", "file:///" + src.replace(/\\/g, "/"));
    }
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Report</title>
<style>${compiledCss}</style>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .hidden { display: block !important; }
</style>
</head>
<body>${clone.outerHTML}</body>
</html>`;
}

/**
 * Exports a rendered report to a PDF. Shows a Save As dialog, renders the PDF
 * with headless Microsoft Edge (correct A4 layout, no printer involvement) and
 * opens it. If a physical printer is connected it also prints the PDF to it.
 */
export async function exportReportAsPdf(title: string, node: HTMLElement | null): Promise<void> {
  if (!node) return;

  const target = await save({
    defaultPath: `${title.replace(/[\\/:*?"<>|]/g, "_")}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!target) return;

  const html = buildReportHtml(node);
  try {
    await invoke<string>("print_html_to_pdf", {
      filename: `${title.replace(/[\\/:*?"<>|]/g, "_")}.html`,
      html,
      outputPath: target,
    });
  } catch (err) {
    console.error("PDF export failed:", err);
    window.alert("PDF export failed. Please try again.\n\n" + (typeof err === "string" ? err : err instanceof Error ? err.message : ""));
    return;
  }

  // Print the saved PDF to the default printer only when it is a physical
  // printer that is not a ticket printer (80mm receipt/KOT/delivery). Otherwise
  // the file is simply saved and opened.
  try {
    const defaultPrinter: string = await invoke("get_default_printer");
    if (defaultPrinter && isPhysicalPrinter(defaultPrinter) && !(await isTicketPrinter(defaultPrinter))) {
      await invoke("print_file_to_printer", {
        filePath: target,
        printerName: defaultPrinter,
      });
    }
  } catch (err) {
    // Printing is best-effort — never fail the export because of it.
    console.warn("Could not print PDF to printer:", err);
  }
}