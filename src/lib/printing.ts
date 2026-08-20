import { invoke } from "./api";
import { formatCurrency } from "./utils";

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
}

export interface KotLayoutConfig extends BaseLayoutConfig {
  showOrderTaker: boolean;
}

export interface DeliveryLayoutConfig extends BaseLayoutConfig {
  showCustomerDetails: boolean;
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
}

export interface PrintSettings {
  receiptPrinter: string;
  kotPrinter: string;
  deliveryPrinter: string;
  deliveryReceiptPrinter: string;
  receiptCopies: number;
  kotCopies: number;
  deliveryCopies: number;
  deliveryReceiptCopies: number;
  printMode: "auto" | "preview";
  receiptLayout: ReceiptLayoutConfig;
  kotLayout: KotLayoutConfig;
  deliveryLayout: DeliveryLayoutConfig;
  deliveryReceiptLayout: DeliveryReceiptLayoutConfig;
}

export type TicketKind = "receipt" | "kot" | "delivery" | "delivery_receipt";

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
};

export const DEFAULT_DELIVERY_LAYOUT: DeliveryLayoutConfig = {
  widthMm: 80,
  fontScale: 100,
  showLogo: true,
  showDate: true,
  showTime: false,
  showTable: false,
  showCashier: false,
  footerMessage: "Please collect the total amount from the customer.",
  showEndMarker: true,
  showCustomerDetails: true,
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
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  receiptPrinter: "",
  kotPrinter: "",
  deliveryPrinter: "",
  deliveryReceiptPrinter: "",
  receiptCopies: 1,
  kotCopies: 1,
  deliveryCopies: 1,
  deliveryReceiptCopies: 1,
  printMode: "auto",
  receiptLayout: DEFAULT_RECEIPT_LAYOUT,
  kotLayout: DEFAULT_KOT_LAYOUT,
  deliveryLayout: DEFAULT_DELIVERY_LAYOUT,
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
      deliveryPrinter: data.delivery_printer || "",
      deliveryReceiptPrinter: data.delivery_receipt_printer || "",
      receiptCopies: data.receipt_copies ?? 1,
      kotCopies: data.kot_copies ?? 1,
      deliveryCopies: data.delivery_copies ?? 1,
      deliveryReceiptCopies: data.delivery_receipt_copies ?? 1,
      printMode: data.print_mode === "preview" ? "preview" : "auto",
      receiptLayout: parseLayout<ReceiptLayoutConfig>(data.receipt_layout, DEFAULT_RECEIPT_LAYOUT),
      kotLayout: parseLayout<KotLayoutConfig>(data.kot_layout, DEFAULT_KOT_LAYOUT),
      deliveryLayout: parseLayout<DeliveryLayoutConfig>(data.delivery_layout, DEFAULT_DELIVERY_LAYOUT),
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
    deliveryPrinter: settings.deliveryPrinter || null,
    deliveryReceiptPrinter: settings.deliveryReceiptPrinter || null,
    receiptCopies: settings.receiptCopies,
    kotCopies: settings.kotCopies,
    deliveryCopies: settings.deliveryCopies,
    deliveryReceiptCopies: settings.deliveryReceiptCopies,
    printMode: settings.printMode,
    receiptLayout: JSON.stringify(settings.receiptLayout),
    kotLayout: JSON.stringify(settings.kotLayout),
    deliveryLayout: JSON.stringify(settings.deliveryLayout),
    deliveryReceiptLayout: JSON.stringify(settings.deliveryReceiptLayout),
  });
}

export function kindConfig(settings: PrintSettings, kind: TicketKind): {
  printer: string;
  copies: number;
} {
  if (kind === "receipt") return { printer: settings.receiptPrinter, copies: settings.receiptCopies };
  if (kind === "kot") return { printer: settings.kotPrinter, copies: settings.kotCopies };
  if (kind === "delivery_receipt")
    return { printer: settings.deliveryReceiptPrinter, copies: settings.deliveryReceiptCopies };
  return { printer: settings.deliveryPrinter, copies: settings.deliveryCopies };
}

/**
 * Sends a plain-text ticket to the configured printer (native path). When no
 * printer is configured the OS default printer is used. Uses spawn() so PDF
 * printers waiting on a 'Save As' dialog never block the UI.
 */
export function layoutForKind(settings: PrintSettings, kind: TicketKind): BaseLayoutConfig {
  if (kind === "receipt") return settings.receiptLayout;
  if (kind === "kot") return settings.kotLayout;
  if (kind === "delivery_receipt") return settings.deliveryReceiptLayout;
  return settings.deliveryLayout;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function printTextDocument(kind: TicketKind, text: string, settings: PrintSettings): Promise<void> {
  const { printer, copies } = kindConfig(settings, kind);
  const preview = printer === "browser" || settings.printMode === "preview";

  if (preview) {
    const widthMm = layoutForKind(settings, kind).widthMm || 80;
    const html = `<!DOCTYPE html>
<html style="background: #e2e8f0; font-family: 'Courier New', Courier, monospace;">
<head>
<meta charset="utf-8">
<title>Receipt Preview</title>
</head>
<body style="display: flex; justify-content: center; margin: 0; padding: 16px;">
<div style="background: white; color: black; width: ${widthMm}mm; padding: 8px 4px; border: 1px solid #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.15); white-space: pre-wrap; word-wrap: break-word; font-size: 12px; font-weight: bold;">${escapeHtml(text)}</div>
</body>
</html>`;
    await invoke("save_print_html", {
      filename: `ticket-${Date.now()}.html`,
      html
    });
    return;
  }

  await invoke("print_receipt_text", {
    text,
    printerName: printer || null,
    copies: Math.max(1, copies),
  });
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

// ─── Delivery text builder ───────────────────────────────────────────────────

export interface DeliveryTicketData {
  restaurantName: string;
  restaurantContact?: string;
  orderId: string;
  date: string;
  driverName: string;
  items: { name: string; price: number; quantity: number }[];
  totalPrice: number;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
}

export function buildDeliveryText(data: DeliveryTicketData, layout: DeliveryLayoutConfig): string {
  const width = charsForLine(layout.widthMm, layout.fontScale);
  const lines: string[] = [];

  if (layout.showLogo) {
    lines.push(centerText(data.restaurantName.toUpperCase(), width));
    if (data.restaurantContact) lines.push(centerText(data.restaurantContact, width));
  }
  lines.push(centerText("*** DELIVERY TICKET ***", width));
  lines.push(ruleLine("-", width));

  lines.push(padBoth("ORDER NO.", data.orderId, width));
  if (layout.showDate) lines.push(padBoth("DATE", data.date, width));
  lines.push(padBoth("DRIVER", data.driverName || "PENDING DISPATCH", width));
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
  lines.push(padBoth("TOTAL AMOUNT", money(data.totalPrice), width));
  lines.push(ruleLine("-", width));

  if (layout.showCustomerDetails) {
    lines.push("CUSTOMER DETAILS:");
    lines.push(`NAME: ${data.customerName || "WALK-IN"}`);
    lines.push(`PHONE: ${data.customerPhone || "N/A"}`);
    lines.push("ADDRESS:");
    lines.push(data.deliveryAddress || "NO ADDRESS PROVIDED");
    lines.push(ruleLine("-", width));
  }

  if (layout.footerMessage.trim()) lines.push(centerText(layout.footerMessage.trim().toUpperCase(), width));
  if (layout.showEndMarker) {
    lines.push(centerText("*** END OF DELIVERY TICKET ***", width));
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
