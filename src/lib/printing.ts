import { invoke } from "./api";
import { formatCurrency } from "./utils";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { join, tempDir } from "@tauri-apps/api/path";
// The app's compiled Tailwind CSS, inlined at build time so standalone ticket
// HTML (browser / PDF / print window) keeps every utility class intact.
import compiledCss from "../App.css?inline";

export interface PrinterInfo {
  name: string;
  driver_name: string;
  port_name: string;
  status: number;
}

export interface BaseLayoutConfig {
  widthMm: number;
  fontScale: number;
  showLogo: boolean;
  showDate: boolean;
  showTime: boolean;
  showTable: boolean;
  showCashier: boolean;
  footerMessage: string;
  showEndMarker: boolean;
}

export interface ReceiptLayoutConfig extends BaseLayoutConfig {
  headerText: string;
  showOrderNo: boolean;
  showOrderType: boolean;
  showTax: boolean;
  showDiscount: boolean;
  showCashReceived: boolean;
  showChange: boolean;
  itemNameWidthPct: number;
  showOrderTaker: boolean;
  charsPerLine: number;
}

export interface KotLayoutConfig extends BaseLayoutConfig {
  showOrderTaker: boolean;
  charsPerLine: number;
}

export interface DeliveryReceiptLayoutConfig extends BaseLayoutConfig {
  headerText: string;
  showOrderNo: boolean;
  showOrderType: boolean;
  showTax: boolean;
  showDiscount: boolean;
  showCashReceived: boolean;
  showChange: boolean;
  itemNameWidthPct: number;
  showCustomerDetails: boolean;
  showDeliveryAddress: boolean;
  charsPerLine: number;
}

export interface PrintSettings {
  receiptPrinter: string;
  kotPrinter: string;
  deliveryReceiptPrinter: string;
  receiptCopies: number;
  kotCopies: number;
  deliveryReceiptCopies: number;
  receiptLayout: ReceiptLayoutConfig;
  kotLayout: KotLayoutConfig;
  deliveryReceiptLayout: DeliveryReceiptLayoutConfig;
}

export type TicketKind = "receipt" | "kot" | "delivery_receipt";

// ─── Logical receipt document (shared source of truth) ──────────────────────
// Serialized straight into the Rust `ReceiptDocument` model (snake_case keys
// match serde). Both the thermal ESC/POS renderer and the HTML renderer
// consume the same logical data.

export interface ReceiptDocumentItem {
  name: string;
  price: number;
  quantity: number;
}

export interface ReceiptDocument {
  kind: TicketKind;
  restaurant: {
    name: string;
    address?: string | null;
    contact?: string | null;
  };
  meta: {
    order_id: string;
    date_time: string;
    order_type: string;
    table_label: string;
    cashier_name: string;
    order_taker_name?: string | null;
  };
  customer?: {
    name?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null;
  items: ReceiptDocumentItem[];
  totals: {
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    discount: number;
    delivery_fee?: number | null;
    total_amount: number;
  };
  payment: {
    amount_received: number;
    change_amount: number;
  };
}

export const DEFAULT_RECEIPT_LAYOUT: ReceiptLayoutConfig = {
  widthMm: 80,
  fontScale: 100,
  showLogo: true,
  showDate: true,
  showTime: true,
  showTable: true,
  showCashier: true,
  footerMessage: "Thank you for your visit!",
  showEndMarker: true,
  headerText: "PAYMENT RECEIPT",
  showOrderNo: true,
  showOrderType: true,
  showTax: true,
  showDiscount: true,
  showCashReceived: true,
  showChange: true,
  itemNameWidthPct: 40,
  showOrderTaker: true,
  charsPerLine: 0,
};

export const DEFAULT_KOT_LAYOUT: KotLayoutConfig = {
  widthMm: 80,
  fontScale: 100,
  showLogo: false,
  showDate: true,
  showTime: true,
  showTable: true,
  showCashier: true,
  footerMessage: "",
  showEndMarker: true,
  showOrderTaker: true,
  charsPerLine: 0,
};

export const DEFAULT_DR_LAYOUT: DeliveryReceiptLayoutConfig = {
  widthMm: 80,
  fontScale: 100,
  showLogo: true,
  showDate: true,
  showTime: true,
  showTable: false,
  showCashier: true,
  footerMessage: "Thank you for your order!",
  showEndMarker: true,
  headerText: "DELIVERY RECEIPT",
  showOrderNo: true,
  showOrderType: true,
  showTax: true,
  showDiscount: true,
  showCashReceived: true,
  showChange: true,
  itemNameWidthPct: 40,
  showCustomerDetails: true,
  showDeliveryAddress: true,
  charsPerLine: 0,
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  receiptPrinter: "",
  kotPrinter: "",
  deliveryReceiptPrinter: "",
  receiptCopies: 1,
  kotCopies: 1,
  deliveryReceiptCopies: 1,
  receiptLayout: DEFAULT_RECEIPT_LAYOUT,
  kotLayout: DEFAULT_KOT_LAYOUT,
  deliveryReceiptLayout: DEFAULT_DR_LAYOUT,
};

function parseLayout<T>(json: string | null | undefined, defaults: T): T {
  if (!json) return defaults;
  try {
    const parsed = JSON.parse(json);
    return { ...defaults, ...parsed } as T;
  } catch {
    return defaults;
  }
}

export async function fetchPrinters(force = false): Promise<PrinterInfo[]> {
  try {
    return await invoke<PrinterInfo[]>("list_printers", { force });
  } catch {
    return [];
  }
}

export async function loadPrintSettings(): Promise<PrintSettings> {
  try {
    const data: any = await invoke("get_print_settings");
    return {
      receiptPrinter: data.receipt_printer || "",
      kotPrinter: data.kot_printer || "",
      deliveryReceiptPrinter: data.delivery_receipt_printer || "",
      receiptCopies: data.receipt_copies ?? 1,
      kotCopies: data.kot_copies ?? 1,
      deliveryReceiptCopies: data.delivery_receipt_copies ?? 1,
      receiptLayout: parseLayout<ReceiptLayoutConfig>(data.receipt_layout, DEFAULT_RECEIPT_LAYOUT),
      kotLayout: parseLayout<KotLayoutConfig>(data.kot_layout, DEFAULT_KOT_LAYOUT),
      deliveryReceiptLayout: parseLayout<DeliveryReceiptLayoutConfig>(data.delivery_receipt_layout, DEFAULT_DR_LAYOUT),
    };
  } catch {
    return DEFAULT_PRINT_SETTINGS;
  }
}

export async function savePrintSettings(settings: PrintSettings): Promise<void> {
  await invoke("update_print_settings", {
    receiptPrinter: settings.receiptPrinter || null,
    kotPrinter: settings.kotPrinter || null,
    deliveryReceiptPrinter: settings.deliveryReceiptPrinter || null,
    receiptCopies: settings.receiptCopies,
    kotCopies: settings.kotCopies,
    deliveryReceiptCopies: settings.deliveryReceiptCopies,
    receiptLayout: JSON.stringify(settings.receiptLayout),
    kotLayout: JSON.stringify(settings.kotLayout),
    deliveryReceiptLayout: JSON.stringify(settings.deliveryReceiptLayout),
  });
}

export function kindConfig(settings: PrintSettings, kind: TicketKind): {
  printer: string;
  copies: number;
} {
  if (kind === "receipt") return { printer: settings.receiptPrinter, copies: settings.receiptCopies };
  if (kind === "kot") return { printer: settings.kotPrinter, copies: settings.kotCopies };
  return { printer: settings.deliveryReceiptPrinter, copies: settings.deliveryReceiptCopies };
}

/**
 * Prints a plain-text ticket. The selected printer drives the behaviour:
 * a real printer (or blank = OS default) receives the ticket directly with
 * no dialog; "browser" opens an HTML preview in the system browser instead.
 * Uses spawn() so PDF printers waiting on a 'Save As' dialog never block the UI.
 */
export function layoutForKind(settings: PrintSettings, kind: TicketKind): BaseLayoutConfig {
  if (kind === "receipt") return settings.receiptLayout;
  if (kind === "kot") return settings.kotLayout;
  return settings.deliveryReceiptLayout;
}

/** Converts a local absolute path (e.g. a logo file) to a file:// URI so it loads in standalone HTML. */
export function assetFileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^(data:|https?:|blob:|file:)/i.test(path)) return path;
  if (!/^[a-zA-Z]:[\\/]/.test(path)) return path;
  return "file:///" + path.replace(/\\/g, "/");
}

/**
 * Renders the designed ticket template into a self-contained HTML document:
 * inlines the compiled app stylesheet and un-hides the template wrapper, so
 * the output looks exactly like the live preview in Settings.
 */
function buildTicketHtml(element: ReactElement): string {
  const body = renderToStaticMarkup(element);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Ticket</title>
<style>${compiledCss}</style>
<style>
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    min-height: 0 !important;
    height: auto !important;
    overflow: visible !important;
  }
  .hidden { display: block !important; }
</style>
</head>
<body>${body}</body>
</html>`;
}

/**
 * Opens the OS print window for `html` via a hidden iframe, letting the user
 * pick any installed printer (WebView2 shows the native print dialog).
 */
function printViaDialog(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.srcdoc = html;
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) {
      frame.remove();
      return;
    }
    win.addEventListener("afterprint", () => frame.remove());
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.error("Failed to open the print window:", err);
        frame.remove();
      }
    }, 100);
  };
  document.body.appendChild(frame);
  // Safety cleanup in case the print is cancelled without afterprint firing.
  setTimeout(() => {
    if (frame.isConnected) frame.remove();
  }, 120000);
}

/**
 * Prints a ticket following the selected printer option:
 *  - "browser"  → opens the designed ticket in the system browser
 *  - "dialog"   → opens the OS print window with the designed ticket
 *  - PDF printer → renders the designed ticket to a PDF and opens it
 *  - a real printer (or blank = OS default) → deterministic ESC/POS thermal
 *    output first (`print_thermal_ticket`); if that pipeline fails, falls
 *    back to the designed HTML→PDF route, then to plain-text ESC/POS.
 * `element` is the designed template exactly as previewed in Settings;
 * `document` is the logical receipt shared by both renderers; `text` is its
 * plain-text last-resort form. Every fallback fires at most once — never
 * recursively (master spec Fallback Rule).
 */
export async function printTicketDocument(
  kind: TicketKind,
  element: ReactElement,
  document: ReceiptDocument,
  text: string,
  settings: PrintSettings
): Promise<void> {
  const { printer, copies } = kindConfig(settings, kind);

  if (printer === "browser") {
    await invoke("open_ticket_html", { filename: `ticket-${Date.now()}.html`, html: buildTicketHtml(element) });
    return;
  }

  if (printer === "dialog") {
    printViaDialog(buildTicketHtml(element));
    return;
  }

  // Resolve a blank selection to the OS default so a PDF default printer is detected.
  let target = printer;
  if (!target) {
    try {
      target = (await invoke<string>("get_default_printer")) || "";
    } catch {
      target = "";
    }
  }

  if (/pdf/i.test(target.toLowerCase())) {
    const outputPath = await join(await tempDir(), `ticket-${Date.now()}.pdf`);
    await invoke("print_html_to_pdf", {
      filename: `ticket-${Date.now()}.html`,
      html: buildTicketHtml(element),
      outputPath,
    });
    return;
  }

  // Physical receipt printer: deterministic thermal output first.
  const layout = layoutForKind(settings, kind);
  try {
    await invoke("print_thermal_ticket", {
      document,
      layoutJson: JSON.stringify(layout),
      printerName: printer || null,
      copies: Math.max(1, copies),
    });
    return;
  } catch (thermalErr) {
    console.error("Thermal print failed; falling back to the designed HTML→PDF route:", thermalErr);
  }

  try {
    await invoke("print_designed_ticket", {
      html: buildTicketHtml(element),
      printerName: printer || null,
      copies: Math.max(1, copies),
    });
  } catch (designedErr) {
    console.error("Designed print failed; falling back to plain-text ticket:", designedErr);
    await invoke("print_receipt_text", {
      text,
      printerName: printer || null,
      copies: Math.max(1, copies),
      widthMm: layout.widthMm || 80,
      fontScale: layout.fontScale || 100,
    });
  }
}

// ─── Text layout helpers ─────────────────────────────────────────────────────

/** Characters available on a line for a given paper width (mm). */
export function widthForPaper(mm: number): number {
  // 58mm paper fits 32 characters and 80mm paper fits 42 at the default font.
  const chars = Math.round((mm - 58) * ((42 - 32) / (80 - 58)) + 32);
  return Math.max(20, Math.min(48, chars));
}

/** Characters per line honouring the configured font scale (bigger font => fewer chars). */
function charsForLine(mm: number, fontScale: number): number {
  const scaled = Math.round((widthForPaper(mm) * 100) / Math.max(40, Math.min(200, fontScale || 100)));
  return Math.max(20, Math.min(48, scaled));
}

export function centerText(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width);
  const left = Math.floor((width - text.length) / 2);
  return " ".repeat(left) + text;
}

export function padBoth(left: string, right: string, width: number): string {
  const cleanRight = right;
  const spaces = width - left.length - cleanRight.length;
  return left + " ".repeat(Math.max(1, spaces)) + cleanRight;
}

export function ruleLine(char = "-", width: number): string {
  return char.repeat(width);
}

function money(amount: number): string {
  return formatCurrency(amount);
}

// ─── Receipt text builder ────────────────────────────────────────────────────

export interface ReceiptTextData {
  restaurantName: string;
  restaurantAddress?: string;
  restaurantContact?: string;
  orderId: string;
  orderType: string;
  tableLabel: string;
  date: string;
  items: { name: string; price: number; quantity: number }[];
  cashierName: string;
  orderTakerName?: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  totalAmount: number;
  amountReceived: number;
  changeAmount: number;
}

export function buildReceiptText(data: ReceiptTextData, layout: ReceiptLayoutConfig): string {
  const width = charsForLine(layout.widthMm, layout.fontScale);
  const [datePart, ...timeParts] = data.date.split(" ");
  const timePart = timeParts.join(" ") || "";
  const lines: string[] = [];

  if (layout.showLogo) {
    lines.push(centerText(data.restaurantName.toUpperCase(), width));
    if (data.restaurantAddress) lines.push(centerText(data.restaurantAddress.toUpperCase(), width));
    if (data.restaurantContact) lines.push(centerText(data.restaurantContact, width));
  }
  lines.push(centerText(`*** ${layout.headerText.toUpperCase()} ***`, width));
  lines.push(ruleLine("-", width));

  if (layout.showOrderNo) lines.push(padBoth("ORDER NO.", data.orderId, width));
  if (layout.showDate || layout.showTime) {
    const dLabel = [layout.showDate ? "DATE" : "", layout.showTime ? "TIME" : ""].filter(Boolean).join("/");
    const dVal = [layout.showDate ? datePart : "", layout.showTime ? timePart : ""].filter(Boolean).join(" ");
    lines.push(padBoth(dLabel, dVal, width));
  }
  if (layout.showOrderType) lines.push(padBoth("TYPE", data.orderType, width));
  if (layout.showTable) lines.push(padBoth("TABLE", data.tableLabel, width));
  if (layout.showCashier) lines.push(padBoth("CASHIER", data.cashierName, width));
  if (layout.showOrderTaker && data.orderTakerName) lines.push(padBoth("ORDER TAKER", data.orderTakerName, width));

  lines.push(ruleLine("-", width));

  const qtyW = 3;
  const totalW = 11;
  const prefixW = 3;
  const nameW = Math.max(6, width - prefixW - 1 - qtyW - 2 - totalW);
  lines.push(padBoth("# " + "ITEM", "QTY".padStart(qtyW) + "  " + "TOTAL".padStart(totalW), width));
  lines.push(ruleLine("-", width));
  data.items.forEach((item, i) => {
    const name = item.name.length > nameW ? item.name.substring(0, nameW - 1) + "~" : item.name.padEnd(nameW);
    const qty = item.quantity.toString().padStart(qtyW);
    const total = money(item.price * item.quantity).padStart(totalW);
    lines.push(`${(i + 1).toString()}. `.padEnd(prefixW) + name + " " + qty + "  " + total);
  });

  lines.push(ruleLine("-", width));
  lines.push(padBoth("SUBTOTAL", money(data.subtotal), width));
  if (layout.showTax) lines.push(padBoth(`TAX (${data.taxRate}%)`, money(data.taxAmount), width));
  if (layout.showDiscount && data.discount > 0) lines.push(padBoth("DISCOUNT", "-" + money(data.discount), width));
  lines.push(ruleLine("-", width));
  lines.push(padBoth("GRAND TOTAL", money(data.totalAmount), width));
  lines.push(ruleLine("-", width));
  if (layout.showCashReceived) lines.push(padBoth("CASH RECEIVED", money(data.amountReceived), width));
  if (layout.showChange) lines.push(padBoth("CHANGE DUE", money(data.changeAmount), width));

  lines.push(ruleLine("-", width));
  if (layout.footerMessage.trim()) lines.push(centerText(layout.footerMessage.trim().toUpperCase(), width));
  lines.push(centerText("Software Provided by", width));
  lines.push(centerText("Eaglenest Creations (0346-4451505)", width));
  if (layout.showEndMarker) {
    lines.push(centerText("*** END OF RECEIPT ***", width));
    lines.push(ruleLine("-", width));
  }

  return lines.join("\n") + "\n";
}

// ─── KOT text builder ────────────────────────────────────────────────────────

export interface KotTextData {
  restaurantName: string;
  restaurantContact?: string;
  orderId: string;
  orderType: string;
  tableLabel: string;
  date: string;
  items: { name: string; printQty: number }[];
  cashierName: string;
  orderTakerName?: string;
}

export function buildKotText(data: KotTextData, layout: KotLayoutConfig): string {
  const width = charsForLine(layout.widthMm, layout.fontScale);
  const [datePart, ...timeParts] = data.date.split(" ");
  const timePart = timeParts.join(" ") || "";
  const lines: string[] = [];

  if (layout.showLogo) lines.push(centerText(data.restaurantName.toUpperCase(), width));
  lines.push(centerText("KOT", width));
  lines.push(centerText("*** KITCHEN COPY ***", width));
  lines.push(ruleLine("-", width));

  lines.push(padBoth("ORDER NO.", data.orderId, width));
  if (layout.showDate || layout.showTime) {
    const dLabel = [layout.showDate ? "DATE" : "", layout.showTime ? "TIME" : ""].filter(Boolean).join("/");
    const dVal = [layout.showDate ? datePart : "", layout.showTime ? timePart : ""].filter(Boolean).join(" ");
    lines.push(padBoth(dLabel, dVal, width));
  }
  lines.push(padBoth("TYPE", data.orderType, width));
  if (layout.showTable && data.orderType === "Dine-in") lines.push(padBoth("TABLE", data.tableLabel, width));
  if (layout.showCashier) lines.push(padBoth("CASHIER", data.cashierName, width));
  if (layout.showOrderTaker && data.orderTakerName) lines.push(padBoth("ORDER TAKER", data.orderTakerName, width));

  lines.push(ruleLine("-", width));

  const qtyW = 4;
  const prefixW = 3;
  const nameW = Math.max(6, width - prefixW - 1 - qtyW);
  lines.push(padBoth("# " + "ITEM", "QTY".padStart(qtyW), width));
  lines.push(ruleLine("-", width));
  data.items.forEach((item, i) => {
    const name = item.name.length > nameW ? item.name.substring(0, nameW - 1) + "~" : item.name.padEnd(nameW);
    const qty = item.printQty.toString().padStart(qtyW);
    lines.push(`${(i + 1).toString()}. `.padEnd(prefixW) + name + " " + qty);
  });

  lines.push(ruleLine("-", width));
  if (layout.footerMessage.trim()) lines.push(centerText(layout.footerMessage.trim().toUpperCase(), width));
  if (layout.showEndMarker) {
    lines.push(centerText("*** END OF KOT ***", width));
    lines.push(ruleLine("-", width));
  }

  return lines.join("\n") + "\n";
}

// ─── Delivery Receipt text builder ───────────────────────────────────────────

export interface DeliveryReceiptTextData {
  restaurantName: string;
  restaurantAddress?: string;
  restaurantContact?: string;
  orderId: string;
  orderType: string;
  date: string;
  items: { name: string; price: number; quantity: number }[];
  cashierName: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  totalAmount: number;
  amountReceived: number;
  changeAmount: number;
  deliveryFee: number;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
}

export function buildDeliveryReceiptText(data: DeliveryReceiptTextData, layout: DeliveryReceiptLayoutConfig): string {
  const width = charsForLine(layout.widthMm, layout.fontScale);
  const [datePart, ...timeParts] = data.date.split(" ");
  const timePart = timeParts.join(" ") || "";
  const lines: string[] = [];

  if (layout.showLogo) {
    lines.push(centerText(data.restaurantName.toUpperCase(), width));
    if (data.restaurantAddress) lines.push(centerText(data.restaurantAddress.toUpperCase(), width));
    if (data.restaurantContact) lines.push(centerText(data.restaurantContact, width));
  }
  lines.push(centerText(`*** ${layout.headerText.toUpperCase()} ***`, width));
  lines.push(ruleLine("-", width));

  if (layout.showOrderNo) lines.push(padBoth("ORDER NO.", data.orderId, width));
  if (layout.showDate || layout.showTime) {
    const dLabel = [layout.showDate ? "DATE" : "", layout.showTime ? "TIME" : ""].filter(Boolean).join("/");
    const dVal = [layout.showDate ? datePart : "", layout.showTime ? timePart : ""].filter(Boolean).join(" ");
    lines.push(padBoth(dLabel, dVal, width));
  }
  if (layout.showOrderType) lines.push(padBoth("TYPE", data.orderType, width));
  if (layout.showCashier) lines.push(padBoth("CASHIER", data.cashierName, width));

  lines.push(ruleLine("-", width));

  const qtyW = 3;
  const totalW = 11;
  const prefixW = 3;
  const nameW = Math.max(6, width - prefixW - 1 - qtyW - 2 - totalW);
  lines.push(padBoth("# " + "ITEM", "QTY".padStart(qtyW) + "  " + "TOTAL".padStart(totalW), width));
  lines.push(ruleLine("-", width));
  data.items.forEach((item, i) => {
    const name = item.name.length > nameW ? item.name.substring(0, nameW - 1) + "~" : item.name.padEnd(nameW);
    const qty = item.quantity.toString().padStart(qtyW);
    const total = money(item.price * item.quantity).padStart(totalW);
    lines.push(`${(i + 1).toString()}. `.padEnd(prefixW) + name + " " + qty + "  " + total);
  });

  lines.push(ruleLine("-", width));
  lines.push(padBoth("SUBTOTAL", money(data.subtotal), width));
  if (layout.showTax) lines.push(padBoth(`TAX (${data.taxRate}%)`, money(data.taxAmount), width));
  if (layout.showDiscount && data.discount > 0) lines.push(padBoth("DISCOUNT", "-" + money(data.discount), width));
  if (data.deliveryFee > 0) lines.push(padBoth("DELIVERY FEE", money(data.deliveryFee), width));
  lines.push(ruleLine("-", width));
  lines.push(padBoth("GRAND TOTAL", money(data.totalAmount), width));
  lines.push(ruleLine("-", width));
  if (layout.showCashReceived) lines.push(padBoth("CASH RECEIVED", money(data.amountReceived), width));
  if (layout.showChange) lines.push(padBoth("CHANGE DUE", money(data.changeAmount), width));

  if (layout.showCustomerDetails) {
    lines.push(ruleLine("-", width));
    lines.push("CUSTOMER DETAILS:");
    lines.push(`NAME: ${data.customerName || "WALK-IN"}`);
    lines.push(`PHONE: ${data.customerPhone || "N/A"}`);
    if (layout.showDeliveryAddress) {
      lines.push("ADDRESS:");
      lines.push(data.deliveryAddress || "NO ADDRESS PROVIDED");
    }
  }

  lines.push(ruleLine("-", width));
  if (layout.footerMessage.trim()) lines.push(centerText(layout.footerMessage.trim().toUpperCase(), width));
  lines.push(centerText("Software Provided by", width));
  lines.push(centerText("Eaglenest Creations (0346-4451505)", width));
  if (layout.showEndMarker) {
    lines.push(centerText("*** END OF DELIVERY RECEIPT ***", width));
    lines.push(ruleLine("-", width));
  }

  return lines.join("\n") + "\n";
}
