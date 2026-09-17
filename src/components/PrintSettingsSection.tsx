import { useState, useEffect } from "react";
import type { ReactElement } from "react";
import { invoke } from "../lib/api";
import { Save, Loader2, Printer, TestTube2, LayoutTemplate, FileCode2, RefreshCw } from "lucide-react";
import {
  fetchPrinters,
  loadPrintSettings,
  savePrintSettings,
  printTicketDocument,
  kindConfig,
  assetFileUrl,
  buildReceiptText,
  buildKotText,
  buildDeliveryReceiptText,
  DEFAULT_PRINT_SETTINGS,
  type PrintSettings,
  type PrinterInfo,
  type ReceiptLayoutConfig,
  type KotLayoutConfig,
  type DeliveryReceiptLayoutConfig,
  type TicketKind,
  type ReceiptDocument,
} from "../lib/printing";
import { ReceiptTemplate } from "./ReceiptTemplate";
import { KOTTemplate } from "./KOTTemplate";
import { DeliveryReceiptTemplate } from "./DeliveryReceiptTemplate";
import { ToggleRow } from "./ui/toggle";

const inputCls =
  "w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

const SAMPLE_RECEIPT_DATA = {
  restaurantName: "My Restaurant",
  restaurantAddress: "123 Main St, City",
  restaurantContact: "0300-1234567",
  orderId: "#ORD-0001",
  orderType: "Dine-in",
  tableNumber: "1",
  tableCategoryName: "A",
  tableLabel: "A 01",
  date: "15/08/2026 12:30:45",
  items: [
    { id: 1, name: "Chicken Burger", price: 450, quantity: 2 },
    { id: 2, name: "French Fries", price: 200, quantity: 1 },
    { id: 3, name: "Cold Drink", price: 120, quantity: 3 },
  ],
  subtotal: 1460,
  discount: 100,
  taxAmount: 233.6,
  taxRate: 16,
  totalAmount: 1593.6,
  amountReceived: 2000,
  changeAmount: 406.4,
  cashierName: "Admin",
  orderTakerName: "Ali",
};

const SAMPLE_KOT_DATA = {
  restaurantName: "My Restaurant",
  orderId: "#ORD-0001",
  orderType: "Dine-in",
  tableNumber: "1",
  tableCategoryName: "A",
  tableLabel: "A 01",
  date: "15/08/2026 12:30:45",
  items: [
    { name: "Chicken Burger", printQty: 2 },
    { name: "French Fries", printQty: 1 },
    { name: "Cold Drink", printQty: 3 },
  ],
  cashierName: "Admin",
  orderTakerName: "Ali",
};

const SAMPLE_DR_DATA = {
  restaurantName: "My Restaurant",
  orderId: "#ORD-0001",
  orderType: "Delivery",
  date: "15/08/2026 12:30:45",
  items: SAMPLE_RECEIPT_DATA.items,
  subtotal: 1460,
  discount: 100,
  taxAmount: 233.6,
  taxRate: 16,
  totalAmount: 1643.6,
  amountReceived: 2000,
  changeAmount: 356.4,
  deliveryFee: 50,
  cashierName: "Admin",
  customerName: "John Doe",
  customerPhone: "0300-1234567",
  deliveryAddress: "House 12, Street 5, Main Boulevard",
};

type Tab = "printers" | "receipt" | "kot" | "dr";

export default function PrintSettingsSection() {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [restaurant, setRestaurant] = useState<{ name: string; address: string; contact: string; logo: string | null }>({
    name: "My Restaurant",
    address: "123 Main St, City",
    contact: "0300-1234567",
    logo: null,
  });
  const [tab, setTab] = useState<Tab>("printers");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testing, setTesting] = useState<TicketKind | null>(null);
  const [testMsg, setTestMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [ps, list] = await Promise.all([loadPrintSettings(), fetchPrinters()]);
        setSettings(ps);
        setPrinters(list);
      } catch (err) {
        console.error("Failed to load print settings", err);
      }
      try {
        const s: any = await invoke("get_settings");
        setRestaurant({
          name: s.restaurant_name || "My Restaurant",
          address: s.address || "",
          contact: s.contact_number || "",
          logo: s.logo_path || null,
        });
      } catch {
        /* ignore */
      }
      setLoading(false);
    }
    init();
  }, []);

  const updateSettings = (patch: Partial<PrintSettings>) => setSettings((prev) => ({ ...prev, ...patch }));
  const updateReceipt = (patch: Partial<ReceiptLayoutConfig>) =>
    setSettings((prev) => ({ ...prev, receiptLayout: { ...prev.receiptLayout, ...patch } }));
  const updateKot = (patch: Partial<KotLayoutConfig>) =>
    setSettings((prev) => ({ ...prev, kotLayout: { ...prev.kotLayout, ...patch } }));
  const updateDr = (patch: Partial<DeliveryReceiptLayoutConfig>) =>
    setSettings((prev) => ({ ...prev, deliveryReceiptLayout: { ...prev.deliveryReceiptLayout, ...patch } }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await savePrintSettings(settings);
      setMessage({ type: "success", text: "Print settings saved successfully!" });
      window.dispatchEvent(new Event("settingsUpdated"));
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: "error", text: err.toString() });
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrint = async (kind: TicketKind) => {
    setTesting(kind);
    setTestMsg(null);
    try {
      const logoUrl = assetFileUrl(restaurant.logo);
      let text = "";
      let doc: ReceiptDocument;
      let element: ReactElement;

      if (kind === "receipt") {
        text = buildReceiptText(SAMPLE_RECEIPT_DATA, settings.receiptLayout);
        doc = {
          kind: "receipt",
          restaurant: { name: restaurant.name, address: restaurant.address || null, contact: restaurant.contact || null },
          meta: {
            order_id: SAMPLE_RECEIPT_DATA.orderId,
            date_time: SAMPLE_RECEIPT_DATA.date,
            order_type: SAMPLE_RECEIPT_DATA.orderType,
            table_label: SAMPLE_RECEIPT_DATA.tableLabel,
            cashier_name: SAMPLE_RECEIPT_DATA.cashierName,
            order_taker_name: SAMPLE_RECEIPT_DATA.orderTakerName || null,
          },
          items: SAMPLE_RECEIPT_DATA.items,
          totals: {
            subtotal: SAMPLE_RECEIPT_DATA.subtotal,
            tax_rate: SAMPLE_RECEIPT_DATA.taxRate,
            tax_amount: SAMPLE_RECEIPT_DATA.taxAmount,
            discount: SAMPLE_RECEIPT_DATA.discount,
            total_amount: SAMPLE_RECEIPT_DATA.totalAmount,
          },
          payment: { amount_received: SAMPLE_RECEIPT_DATA.amountReceived, change_amount: SAMPLE_RECEIPT_DATA.changeAmount },
        };
        element = (
          <ReceiptTemplate
            restaurantName={restaurant.name}
            restaurantAddress={restaurant.address || undefined}
            restaurantContact={restaurant.contact || undefined}
            logoUrl={logoUrl}
            orderId={SAMPLE_RECEIPT_DATA.orderId}
            orderType={SAMPLE_RECEIPT_DATA.orderType}
            tableNumber={SAMPLE_RECEIPT_DATA.tableNumber}
            tableCategoryName={SAMPLE_RECEIPT_DATA.tableCategoryName}
            date={SAMPLE_RECEIPT_DATA.date}
            items={SAMPLE_RECEIPT_DATA.items}
            subtotal={SAMPLE_RECEIPT_DATA.subtotal}
            discount={SAMPLE_RECEIPT_DATA.discount}
            taxAmount={SAMPLE_RECEIPT_DATA.taxAmount}
            taxRate={SAMPLE_RECEIPT_DATA.taxRate}
            totalAmount={SAMPLE_RECEIPT_DATA.totalAmount}
            amountReceived={SAMPLE_RECEIPT_DATA.amountReceived}
            changeAmount={SAMPLE_RECEIPT_DATA.changeAmount}
            cashierName={SAMPLE_RECEIPT_DATA.cashierName}
            orderTakerName={SAMPLE_RECEIPT_DATA.orderTakerName}
            config={settings.receiptLayout}
          />
        );
      } else if (kind === "kot") {
        text = buildKotText(SAMPLE_KOT_DATA, settings.kotLayout);
        doc = {
          kind: "kot",
          restaurant: { name: restaurant.name, contact: restaurant.contact || null },
          meta: {
            order_id: SAMPLE_KOT_DATA.orderId,
            date_time: SAMPLE_KOT_DATA.date,
            order_type: SAMPLE_KOT_DATA.orderType,
            table_label: SAMPLE_KOT_DATA.tableLabel,
            cashier_name: SAMPLE_KOT_DATA.cashierName,
            order_taker_name: SAMPLE_KOT_DATA.orderTakerName || null,
          },
          items: SAMPLE_KOT_DATA.items.map(i => ({ name: i.name, price: 0, quantity: i.printQty })),
          totals: { subtotal: 0, tax_rate: 0, tax_amount: 0, discount: 0, total_amount: 0 },
          payment: { amount_received: 0, change_amount: 0 },
        };
        element = (
          <KOTTemplate
            orderId={SAMPLE_KOT_DATA.orderId}
            orderType={SAMPLE_KOT_DATA.orderType}
            tableNumber={SAMPLE_KOT_DATA.tableNumber}
            tableCategoryName={SAMPLE_KOT_DATA.tableCategoryName}
            date={SAMPLE_KOT_DATA.date}
            items={SAMPLE_KOT_DATA.items}
            cashierName={SAMPLE_KOT_DATA.cashierName}
            orderTakerName={SAMPLE_KOT_DATA.orderTakerName}
            restaurantName={restaurant.name}
            restaurantContact={restaurant.contact || undefined}
            logoUrl={logoUrl}
            config={settings.kotLayout}
          />
        );
      } else {
        // kind === "delivery_receipt"
        text = buildDeliveryReceiptText(
          {
            restaurantName: restaurant.name,
            restaurantAddress: restaurant.address || undefined,
            restaurantContact: restaurant.contact || undefined,
            orderId: SAMPLE_DR_DATA.orderId,
            orderType: SAMPLE_DR_DATA.orderType,
            date: SAMPLE_DR_DATA.date,
            items: SAMPLE_DR_DATA.items,
            cashierName: SAMPLE_DR_DATA.cashierName,
            subtotal: SAMPLE_DR_DATA.subtotal,
            taxRate: SAMPLE_DR_DATA.taxRate,
            taxAmount: SAMPLE_DR_DATA.taxAmount,
            discount: SAMPLE_DR_DATA.discount,
            totalAmount: SAMPLE_DR_DATA.totalAmount,
            amountReceived: SAMPLE_DR_DATA.amountReceived,
            changeAmount: SAMPLE_DR_DATA.changeAmount,
            deliveryFee: SAMPLE_DR_DATA.deliveryFee,
            customerName: SAMPLE_DR_DATA.customerName,
            customerPhone: SAMPLE_DR_DATA.customerPhone,
            deliveryAddress: SAMPLE_DR_DATA.deliveryAddress,
          },
          settings.deliveryReceiptLayout
        );
        doc = {
          kind: "delivery_receipt",
          restaurant: { name: restaurant.name, address: restaurant.address || null, contact: restaurant.contact || null },
          meta: {
            order_id: SAMPLE_DR_DATA.orderId,
            date_time: SAMPLE_DR_DATA.date,
            order_type: SAMPLE_DR_DATA.orderType,
            table_label: "",
            cashier_name: SAMPLE_DR_DATA.cashierName,
          },
          customer: { name: SAMPLE_DR_DATA.customerName, phone: SAMPLE_DR_DATA.customerPhone, address: SAMPLE_DR_DATA.deliveryAddress },
          items: SAMPLE_DR_DATA.items,
          totals: {
            subtotal: SAMPLE_DR_DATA.subtotal,
            tax_rate: SAMPLE_DR_DATA.taxRate,
            tax_amount: SAMPLE_DR_DATA.taxAmount,
            discount: SAMPLE_DR_DATA.discount,
            delivery_fee: SAMPLE_DR_DATA.deliveryFee,
            total_amount: SAMPLE_DR_DATA.totalAmount,
          },
          payment: { amount_received: SAMPLE_DR_DATA.amountReceived, change_amount: SAMPLE_DR_DATA.changeAmount },
        };
        element = (
          <DeliveryReceiptTemplate
            restaurantName={restaurant.name}
            restaurantAddress={restaurant.address || undefined}
            restaurantContact={restaurant.contact || undefined}
            logoUrl={logoUrl}
            orderId={SAMPLE_DR_DATA.orderId}
            orderType={SAMPLE_DR_DATA.orderType}
            date={SAMPLE_DR_DATA.date}
            items={SAMPLE_DR_DATA.items}
            subtotal={SAMPLE_DR_DATA.subtotal}
            discount={SAMPLE_DR_DATA.discount}
            taxAmount={SAMPLE_DR_DATA.taxAmount}
            taxRate={SAMPLE_DR_DATA.taxRate}
            totalAmount={SAMPLE_DR_DATA.totalAmount}
            amountReceived={SAMPLE_DR_DATA.amountReceived}
            changeAmount={SAMPLE_DR_DATA.changeAmount}
            deliveryFee={SAMPLE_DR_DATA.deliveryFee}
            cashierName={SAMPLE_DR_DATA.cashierName}
            customerName={SAMPLE_DR_DATA.customerName}
            customerPhone={SAMPLE_DR_DATA.customerPhone}
            deliveryAddress={SAMPLE_DR_DATA.deliveryAddress}
            config={settings.deliveryReceiptLayout}
          />
        );
      }

      await printTicketDocument(kind, element, doc, text, settings);

      const { printer } = kindConfig(settings, kind);
      const successText =
        printer === "dialog"
          ? "Print window opened — choose a printer."
          : printer === "browser"
            ? "Designed ticket opened in your browser."
            : printer.toLowerCase().includes("pdf")
              ? "Designed ticket PDF created and opened."
              : "Test print sent to the printer queue.";
      setTestMsg({ type: "success", text: successText });
    } catch (err: any) {
      setTestMsg({ type: "error", text: err.toString() });
    } finally {
      setTesting(null);
    }
  };

  const refreshPrinters = async () => {
    setPrinters(await fetchPrinters(true));
  };

  const selectCls = (value: string) =>
    `${inputCls} ${!value && printers.length > 0 ? "text-slate-400 dark:text-slate-500" : ""}`;

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 flex justify-center">
        <Loader2 className="animate-spin text-blue-500" size={24} />
      </div>
    );
  }

  return (
    <div data-testid="print-settings-section" className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center border border-violet-100 dark:border-violet-800">
          <Printer size={20} className="text-violet-600 dark:text-violet-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Printing & Receipts</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Printer selection, copies and receipt/KOT layout design
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 mb-6">
        {(
          [
            { id: "printers", label: "Printers & Copies", icon: <Printer size={16} /> },
            { id: "receipt", label: "Receipt Design", icon: <FileCode2 size={16} /> },
            { id: "kot", label: "KOT Design", icon: <LayoutTemplate size={16} /> },
            { id: "dr", label: "Delivery Design", icon: <FileCode2 size={16} /> },
          ] as { id: Tab; label: string; icon: React.ReactNode }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex items-center space-x-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === t.id
                ? "border-violet-600 text-violet-700 dark:text-violet-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {tab === "printers" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Choose which printer each ticket is sent to. Tickets print directly on the selected printer — no dialog.
                A blank selection uses the Windows default printer, "Open Print Window" lets you pick a printer at print
                time, and "Open in Browser" shows the designed ticket as an HTML preview.
              </p>
              <button
                type="button"
                onClick={refreshPrinters}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors cursor-pointer"
              >
                <RefreshCw size={13} />
                <span>Refresh</span>
              </button>
            </div>

            {(
              [
                { key: "receipt", kind: "receipt", label: "Receipt Printer", sub: "Customer payment receipt" },
                { key: "kot", kind: "kot", label: "KOT Printer", sub: "Kitchen order ticket" },
                { key: "deliveryReceipt", kind: "delivery_receipt", label: "Delivery Printer", sub: "Delivery order receipt (checkout & Delivery Management)" },
              ] as { key: "receipt" | "kot" | "deliveryReceipt"; kind: TicketKind; label: string; sub: string }[]
            ).map((row) => (
              <div key={row.key} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                <div className="md:col-span-4">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{row.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{row.sub}</p>
                </div>
                <div className="md:col-span-5">
                  <select
                    data-testid={`printer-${row.key}`}
                    value={settings[`${row.key}Printer`]}
                    onChange={(e) => updateSettings({ [`${row.key}Printer`]: e.target.value } as Partial<PrintSettings>)}
                    className={selectCls(settings[`${row.key}Printer`])}
                  >
                    <option value="">Default printer</option>
                    <option value="dialog">Open Print Window</option>
                    <option value="browser">Open in Browser</option>
                    {printers
                      .filter((p) => {
                        const lower = p.name.toLowerCase();
                        if (lower.includes("microsoft print to pdf")) return true;
                        if (lower.includes("fax") || lower.includes("xps") || lower.includes("onenote")) return false;
                        return true;
                      })
                      .map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    data-testid={`copies-${row.key}`}
                    value={settings[`${row.key}Copies`]}
                    onChange={(e) =>
                      updateSettings({ [`${row.key}Copies`]: Math.max(1, parseInt(e.target.value) || 1) } as Partial<PrintSettings>)
                    }
                    className={inputCls}
                    title="Copies"
                  />
                </div>
                <div className="md:col-span-1 flex items-end">
                  <button
                    type="button"
                    data-testid={`test-${row.key}`}
                    onClick={() => handleTestPrint(row.kind)}
                    disabled={testing === row.kind}
                    className="w-full h-11 inline-flex items-center justify-center space-x-1.5 px-3 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {testing === row.key ? <Loader2 size={14} className="animate-spin" /> : <TestTube2 size={14} />}
                    <span>Test</span>
                  </button>
                </div>
              </div>
            ))}

            {testMsg && (
              <p data-testid="print-test-message" className={`text-sm font-bold ${testMsg.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {testMsg.text}
              </p>
            )}
          </div>
        )}

        {tab === "receipt" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Paper Width (mm)</label>
                  <input
                    type="number"
                    min={58}
                    max={80}
                    step={1}
                    value={settings.receiptLayout.widthMm}
                    onChange={(e) => updateReceipt({ widthMm: Math.max(58, parseInt(e.target.value) || 80) })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Font Scale (%)</label>
                  <input
                    type="number"
                    min={60}
                    max={150}
                    step={5}
                    value={settings.receiptLayout.fontScale}
                    onChange={(e) => updateReceipt({ fontScale: Math.max(60, Math.min(150, parseInt(e.target.value) || 100)) })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Characters / line</label>
                  <input
                    type="number"
                    min={0}
                    max={72}
                    step={1}
                    value={settings.receiptLayout.charsPerLine || ""}
                    placeholder="Auto"
                    onChange={(e) => {
                      const n = parseInt(e.target.value);
                      updateReceipt({ charsPerLine: Number.isNaN(n) ? 0 : Math.max(0, Math.min(72, n)) });
                    }}
                    className={inputCls}
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">0 = automatic. If print clips on the right, lower this (try 42).</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Receipt Title</label>
                <input
                  type="text"
                  value={settings.receiptLayout.headerText}
                  onChange={(e) => updateReceipt({ headerText: e.target.value })}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Footer Message</label>
                <input
                  type="text"
                  value={settings.receiptLayout.footerMessage}
                  onChange={(e) => updateReceipt({ footerMessage: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. Thank you for your visit!"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Item Name Width ({settings.receiptLayout.itemNameWidthPct}%)
                </label>
                <input
                  type="range"
                  min={25}
                  max={55}
                  value={settings.receiptLayout.itemNameWidthPct}
                  onChange={(e) => updateReceipt({ itemNameWidthPct: parseInt(e.target.value) })}
                  className="w-full accent-violet-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-t border-slate-200 dark:border-slate-800 pt-4">
                <ToggleRow label="Restaurant header / logo" testId="toggle-receipt-showLogo" checked={settings.receiptLayout.showLogo} onChange={(v) => updateReceipt({ showLogo: v })} />
                <ToggleRow label="Order number" testId="toggle-receipt-showOrderNo" checked={settings.receiptLayout.showOrderNo} onChange={(v) => updateReceipt({ showOrderNo: v })} />
                <ToggleRow label="Date" testId="toggle-receipt-showDate" checked={settings.receiptLayout.showDate} onChange={(v) => updateReceipt({ showDate: v })} />
                <ToggleRow label="Time" testId="toggle-receipt-showTime" checked={settings.receiptLayout.showTime} onChange={(v) => updateReceipt({ showTime: v })} />
                <ToggleRow label="Order type" testId="toggle-receipt-showOrderType" checked={settings.receiptLayout.showOrderType} onChange={(v) => updateReceipt({ showOrderType: v })} />
                <ToggleRow label="Table number" testId="toggle-receipt-showTable" checked={settings.receiptLayout.showTable} onChange={(v) => updateReceipt({ showTable: v })} />
                <ToggleRow label="Cashier name" testId="toggle-receipt-showCashier" checked={settings.receiptLayout.showCashier} onChange={(v) => updateReceipt({ showCashier: v })} />
                <ToggleRow label="Order taker" testId="toggle-receipt-showOrderTaker" checked={settings.receiptLayout.showOrderTaker} onChange={(v) => updateReceipt({ showOrderTaker: v })} />
                <ToggleRow label="Tax line" testId="toggle-receipt-showTax" checked={settings.receiptLayout.showTax} onChange={(v) => updateReceipt({ showTax: v })} />
                <ToggleRow label="Discount line" testId="toggle-receipt-showDiscount" checked={settings.receiptLayout.showDiscount} onChange={(v) => updateReceipt({ showDiscount: v })} />
                <ToggleRow label="Cash received" testId="toggle-receipt-showCashReceived" checked={settings.receiptLayout.showCashReceived} onChange={(v) => updateReceipt({ showCashReceived: v })} />
                <ToggleRow label="Change due" testId="toggle-receipt-showChange" checked={settings.receiptLayout.showChange} onChange={(v) => updateReceipt({ showChange: v })} />
                <ToggleRow label="End marker" testId="toggle-receipt-showEndMarker" checked={settings.receiptLayout.showEndMarker} onChange={(v) => updateReceipt({ showEndMarker: v })} />
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Live Preview</p>
              <div data-testid="receipt-preview" className="rounded-xl bg-white border border-slate-200 dark:border-slate-700 overflow-auto" style={{ maxHeight: 640 }}>
                <style>{`[data-receipt-preview] .hidden { display: block !important; }`}</style>
                <div data-receipt-preview>
                  <ReceiptTemplate
                    restaurantName={restaurant.name}
                    restaurantAddress={restaurant.address}
                    restaurantContact={restaurant.contact}
                    logoUrl={restaurant.logo ?? undefined}
                    orderId={SAMPLE_RECEIPT_DATA.orderId}
                    orderType={SAMPLE_RECEIPT_DATA.orderType}
                    tableNumber={SAMPLE_RECEIPT_DATA.tableNumber}
                    tableCategoryName={SAMPLE_RECEIPT_DATA.tableCategoryName}
                    date={SAMPLE_RECEIPT_DATA.date}
                    items={SAMPLE_RECEIPT_DATA.items}
                    subtotal={SAMPLE_RECEIPT_DATA.subtotal}
                    discount={SAMPLE_RECEIPT_DATA.discount}
                    taxAmount={SAMPLE_RECEIPT_DATA.taxAmount}
                    taxRate={SAMPLE_RECEIPT_DATA.taxRate}
                    totalAmount={SAMPLE_RECEIPT_DATA.totalAmount}
                    amountReceived={SAMPLE_RECEIPT_DATA.amountReceived}
                    changeAmount={SAMPLE_RECEIPT_DATA.changeAmount}
                    cashierName={SAMPLE_RECEIPT_DATA.cashierName}
                    orderTakerName={SAMPLE_RECEIPT_DATA.orderTakerName}
                    config={settings.receiptLayout}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "kot" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Paper Width (mm)</label>
                  <input
                    type="number"
                    min={58}
                    max={80}
                    step={1}
                    value={settings.kotLayout.widthMm}
                    onChange={(e) => updateKot({ widthMm: Math.max(58, parseInt(e.target.value) || 80) })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Font Scale (%)</label>
                  <input
                    type="number"
                    min={60}
                    max={150}
                    step={5}
                    value={settings.kotLayout.fontScale}
                    onChange={(e) => updateKot({ fontScale: Math.max(60, Math.min(150, parseInt(e.target.value) || 100)) })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Characters / line</label>
                  <input
                    type="number"
                    min={0}
                    max={72}
                    step={1}
                    value={settings.kotLayout.charsPerLine || ""}
                    placeholder="Auto"
                    onChange={(e) => {
                      const n = parseInt(e.target.value);
                      updateKot({ charsPerLine: Number.isNaN(n) ? 0 : Math.max(0, Math.min(72, n)) });
                    }}
                    className={inputCls}
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">0 = automatic. Match the receipt tab value.</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Footer Message</label>
                <input
                  type="text"
                  value={settings.kotLayout.footerMessage}
                  onChange={(e) => updateKot({ footerMessage: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. Please call the cashier for extras"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-t border-slate-200 dark:border-slate-800 pt-4">
                <ToggleRow label="Restaurant name" testId="toggle-kot-showLogo" checked={settings.kotLayout.showLogo} onChange={(v) => updateKot({ showLogo: v })} />
                <ToggleRow label="Date" testId="toggle-kot-showDate" checked={settings.kotLayout.showDate} onChange={(v) => updateKot({ showDate: v })} />
                <ToggleRow label="Time" testId="toggle-kot-showTime" checked={settings.kotLayout.showTime} onChange={(v) => updateKot({ showTime: v })} />
                <ToggleRow label="Table number" testId="toggle-kot-showTable" checked={settings.kotLayout.showTable} onChange={(v) => updateKot({ showTable: v })} />
                <ToggleRow label="Cashier name" testId="toggle-kot-showCashier" checked={settings.kotLayout.showCashier} onChange={(v) => updateKot({ showCashier: v })} />
                <ToggleRow label="Order taker" testId="toggle-kot-showOrderTaker" checked={settings.kotLayout.showOrderTaker} onChange={(v) => updateKot({ showOrderTaker: v })} />
                <ToggleRow label="End marker" testId="toggle-kot-showEndMarker" checked={settings.kotLayout.showEndMarker} onChange={(v) => updateKot({ showEndMarker: v })} />
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Live Preview</p>
              <div data-testid="kot-preview" className="rounded-xl bg-white border border-slate-200 dark:border-slate-700 overflow-auto" style={{ maxHeight: 640 }}>
                <style>{`[data-kot-preview] .hidden { display: block !important; }`}</style>
                <div data-kot-preview>
                  <KOTTemplate
                    orderId={SAMPLE_KOT_DATA.orderId}
                    orderType={SAMPLE_KOT_DATA.orderType}
                    tableNumber={SAMPLE_KOT_DATA.tableNumber}
                    tableCategoryName={SAMPLE_KOT_DATA.tableCategoryName}
                    date={SAMPLE_KOT_DATA.date}
                    items={SAMPLE_KOT_DATA.items}
                    cashierName={SAMPLE_KOT_DATA.cashierName}
                    orderTakerName={SAMPLE_KOT_DATA.orderTakerName}
                    restaurantName={restaurant.name}
                    restaurantContact={restaurant.contact}
                    logoUrl={restaurant.logo ?? undefined}
                    config={settings.kotLayout}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "dr" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Paper Width (mm)</label>
                  <input
                    type="number"
                    min={58}
                    max={80}
                    step={1}
                    value={settings.deliveryReceiptLayout.widthMm}
                    onChange={(e) => updateDr({ widthMm: Math.max(58, parseInt(e.target.value) || 80) })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Font Scale (%)</label>
                  <input
                    type="number"
                    min={60}
                    max={150}
                    step={5}
                    value={settings.deliveryReceiptLayout.fontScale}
                    onChange={(e) => updateDr({ fontScale: Math.max(60, Math.min(150, parseInt(e.target.value) || 100)) })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Characters / line</label>
                  <input
                    type="number"
                    min={0}
                    max={72}
                    step={1}
                    value={settings.deliveryReceiptLayout.charsPerLine || ""}
                    placeholder="Auto"
                    onChange={(e) => {
                      const n = parseInt(e.target.value);
                      updateDr({ charsPerLine: Number.isNaN(n) ? 0 : Math.max(0, Math.min(72, n)) });
                    }}
                    className={inputCls}
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">0 = automatic. Match the receipt tab value.</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Receipt Title</label>
                <input
                  type="text"
                  value={settings.deliveryReceiptLayout.headerText}
                  onChange={(e) => updateDr({ headerText: e.target.value })}
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Footer Message</label>
                <input
                  type="text"
                  value={settings.deliveryReceiptLayout.footerMessage}
                  onChange={(e) => updateDr({ footerMessage: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. Thank you for your order!"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Item Name Width ({settings.deliveryReceiptLayout.itemNameWidthPct}%)
                </label>
                <input
                  type="range"
                  min={25}
                  max={55}
                  value={settings.deliveryReceiptLayout.itemNameWidthPct}
                  onChange={(e) => updateDr({ itemNameWidthPct: parseInt(e.target.value) })}
                  className="w-full accent-violet-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-t border-slate-200 dark:border-slate-800 pt-4">
                <ToggleRow label="Restaurant header / logo" testId="toggle-dr-showLogo" checked={settings.deliveryReceiptLayout.showLogo} onChange={(v) => updateDr({ showLogo: v })} />
                <ToggleRow label="Order number" testId="toggle-dr-showOrderNo" checked={settings.deliveryReceiptLayout.showOrderNo} onChange={(v) => updateDr({ showOrderNo: v })} />
                <ToggleRow label="Date" testId="toggle-dr-showDate" checked={settings.deliveryReceiptLayout.showDate} onChange={(v) => updateDr({ showDate: v })} />
                <ToggleRow label="Time" testId="toggle-dr-showTime" checked={settings.deliveryReceiptLayout.showTime} onChange={(v) => updateDr({ showTime: v })} />
                <ToggleRow label="Order type" testId="toggle-dr-showOrderType" checked={settings.deliveryReceiptLayout.showOrderType} onChange={(v) => updateDr({ showOrderType: v })} />
                <ToggleRow label="Cashier name" testId="toggle-dr-showCashier" checked={settings.deliveryReceiptLayout.showCashier} onChange={(v) => updateDr({ showCashier: v })} />
                <ToggleRow label="Tax line" testId="toggle-dr-showTax" checked={settings.deliveryReceiptLayout.showTax} onChange={(v) => updateDr({ showTax: v })} />
                <ToggleRow label="Discount line" testId="toggle-dr-showDiscount" checked={settings.deliveryReceiptLayout.showDiscount} onChange={(v) => updateDr({ showDiscount: v })} />
                <ToggleRow label="Cash received" testId="toggle-dr-showCashReceived" checked={settings.deliveryReceiptLayout.showCashReceived} onChange={(v) => updateDr({ showCashReceived: v })} />
                <ToggleRow label="Change due" testId="toggle-dr-showChange" checked={settings.deliveryReceiptLayout.showChange} onChange={(v) => updateDr({ showChange: v })} />
                <ToggleRow label="Customer details" testId="toggle-dr-showCustomerDetails" checked={settings.deliveryReceiptLayout.showCustomerDetails} onChange={(v) => updateDr({ showCustomerDetails: v })} />
                <ToggleRow label="Delivery address" testId="toggle-dr-showDeliveryAddress" checked={settings.deliveryReceiptLayout.showDeliveryAddress} onChange={(v) => updateDr({ showDeliveryAddress: v })} />
                <ToggleRow label="End marker" testId="toggle-dr-showEndMarker" checked={settings.deliveryReceiptLayout.showEndMarker} onChange={(v) => updateDr({ showEndMarker: v })} />
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Live Preview</p>
              <div data-testid="dr-preview" className="rounded-xl bg-white border border-slate-200 dark:border-slate-700 overflow-auto" style={{ maxHeight: 640 }}>
                <style>{`[data-dr-preview] .hidden { display: block !important; }`}</style>
                <div data-dr-preview>
                  <DeliveryReceiptTemplate
                    restaurantName={restaurant.name}
                    restaurantAddress={restaurant.address}
                    restaurantContact={restaurant.contact}
                    logoUrl={restaurant.logo ?? undefined}
                    orderId={SAMPLE_DR_DATA.orderId}
                    orderType={SAMPLE_DR_DATA.orderType}
                    date={SAMPLE_DR_DATA.date}
                    items={SAMPLE_DR_DATA.items}
                    subtotal={SAMPLE_DR_DATA.subtotal}
                    discount={SAMPLE_DR_DATA.discount}
                    taxAmount={SAMPLE_DR_DATA.taxAmount}
                    taxRate={SAMPLE_DR_DATA.taxRate}
                    totalAmount={SAMPLE_DR_DATA.totalAmount}
                    amountReceived={SAMPLE_DR_DATA.amountReceived}
                    changeAmount={SAMPLE_DR_DATA.changeAmount}
                    deliveryFee={SAMPLE_DR_DATA.deliveryFee}
                    cashierName={SAMPLE_DR_DATA.cashierName}
                    customerName={SAMPLE_DR_DATA.customerName}
                    customerPhone={SAMPLE_DR_DATA.customerPhone}
                    deliveryAddress={SAMPLE_DR_DATA.deliveryAddress}
                    config={settings.deliveryReceiptLayout}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {message && (
          <p data-testid="print-save-message" className={`text-sm font-bold ${message.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {message.text}
          </p>
        )}

        <button
          type="submit"
          data-testid="save-print-settings"
          disabled={saving}
          className="w-full h-11 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center justify-center space-x-2 mt-4 shadow-lg shadow-violet-600/20 cursor-pointer"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          <span>Save Print Settings</span>
        </button>
      </form>
    </div>
  );
}
