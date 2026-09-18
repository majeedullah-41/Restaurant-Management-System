import { useState, useEffect, useRef } from "react";
import { invoke } from "../lib/api";
import { formatCurrency, todayLocal } from "../lib/utils";
import {
  Package, Plus, Minus, ShoppingCart, Trash2, Pencil, X, AlertTriangle,
  TrendingDown, Archive, ClipboardList, ChevronDown, Download
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { ConfirmModal } from "../components/ConfirmModal";
import AdminPasswordModal from "../components/AdminPasswordModal";
import DateFilterToolbar from "../components/DateFilterToolbar";
import { MoneyInput } from "../components/MoneyInput";
import { exportReportAsPdf } from "../lib/pdfExport";
import { useToast } from "../lib/toast";
import { InventoryReportTemplate } from "../components/InventoryReportTemplate";

// ── Types ─────────────────────────────────────────────
interface InventoryItem {
  id: number;
  name: string;
  unit: string;
  low_stock_threshold: number;
  current_stock: number;
  default_supplier: string | null;
}

interface InventoryTransaction {
  id: number;
  item_id: number;
  item_name: string;
  item_unit: string;
  transaction_type: string;
  quantity: number;
  unit_price: number | null;
  total_cost: number | null;
  supplier: string | null;
  note: string | null;
  date: string;
}

interface InventorySummary {
  total_items: number;
  low_stock_count: number;
  out_of_stock_count: number;
  period_purchase_total: number;
}

const PRESET_UNITS = ["pcs", "kg", "g", "liters", "ml", "dozen", "bags", "boxes", "bottles", "packets"];

type TabType = "overview" | "usage" | "purchase" | "history";

export default function Inventory() {
  const toast = useToast();
  // ── Core State ──
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary>({ total_items: 0, low_stock_count: 0, out_of_stock_count: 0, period_purchase_total: 0 });
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // ── Add / Edit Item Modal ──
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemUnit, setItemUnit] = useState("pcs");
  const [customUnit, setCustomUnit] = useState("");
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [itemThreshold, setItemThreshold] = useState("5");
  const [itemSupplier, setItemSupplier] = useState("");

  // ── Delete Modal ──
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  // ── Transaction Delete (admin-gated) ──
  const [txnToDelete, setTxnToDelete] = useState<InventoryTransaction | null>(null);
  const [showTxnPassword, setShowTxnPassword] = useState(false);

  // ── Print Report State ──
  const printRef = useRef<HTMLDivElement>(null);
  const [restaurantName, setRestaurantName] = useState("Restaurant POS");
  const [restaurantLogo, setRestaurantLogo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // ── Usage Form ──
  const [usageItemId, setUsageItemId] = useState<number | "">("");
  const [usageQty, setUsageQty] = useState("");
  const [usageNote, setUsageNote] = useState("");

  // ── Purchase Form ──
  const [purchaseItemId, setPurchaseItemId] = useState<number | "">("");
  const [purchaseQty, setPurchaseQty] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [purchaseSupplier, setPurchaseSupplier] = useState("");
  const [purchaseNote, setPurchaseNote] = useState("");

  // ── History Filters ──
  const [dateRange, setDateRange] = useState({ 
    startDate: todayLocal(), 
    endDate: todayLocal() 
  });
  const [historyItemFilter, setHistoryItemFilter] = useState<number | "">("");
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>("all");

  // ── Data Loading ──
  const loadItems = async () => {
    try {
      const data = await invoke<InventoryItem[]>("get_inventory_items");
      setItems(data);
    } catch (err) {
      console.error("Failed to load inventory items:", err);
    }
  };

  const loadSummary = async () => {
    try {
      const data = await invoke<InventorySummary>("get_inventory_summary", {
        startDate: dateRange.startDate || null,
        endDate: dateRange.endDate || null,
      });
      setSummary(data);
    } catch (err) {
      console.error("Failed to load inventory summary:", err);
    }
  };

  const loadTransactions = async () => {
    try {
      const data = await invoke<InventoryTransaction[]>("get_inventory_transactions", {
        startDate: dateRange.startDate || null,
        endDate: dateRange.endDate || null,
        itemId: historyItemFilter || null,
        transactionType: historyTypeFilter || "all",
      });
      setTransactions(data);
    } catch (err) {
      console.error("Failed to load transactions:", err);
    }
  };

  const loadAll = async () => {
    loadItems();
    loadSummary();
    try {
      const settings: any = await invoke("get_settings");
      setRestaurantName(settings.restaurant_name);
      setRestaurantLogo(settings.logo_path || null);
    } catch (e) {}
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    loadSummary();
    if (dateRange.startDate && dateRange.endDate) {
      loadTransactions();
    }
  }, [activeTab, dateRange, historyItemFilter, historyTypeFilter]);

  const handlePrint = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportReportAsPdf(
        `Inventory_Report_${dateRange.startDate}_to_${dateRange.endDate}`,
        printRef.current
      );
    } finally {
      setExporting(false);
    }
  };

  // ── Add / Edit Item ──
  const openAddItemModal = () => {
    setEditingItem(null);
    setItemName("");
    setItemUnit("pcs");
    setCustomUnit("");
    setIsCustomUnit(false);
    setItemThreshold("5");
    setItemSupplier("");
    setIsItemModalOpen(true);
  };

  const openEditItemModal = (item: InventoryItem) => {
    setEditingItem(item);
    setItemName(item.name);
    if (PRESET_UNITS.includes(item.unit)) {
      setItemUnit(item.unit);
      setIsCustomUnit(false);
      setCustomUnit("");
    } else {
      setItemUnit("custom");
      setIsCustomUnit(true);
      setCustomUnit(item.unit);
    }
    setItemThreshold(item.low_stock_threshold.toString());
    setItemSupplier(item.default_supplier || "");
    setIsItemModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalUnit = isCustomUnit ? customUnit.trim() : itemUnit;
    if (!itemName.trim() || !finalUnit) return;

    try {
      if (editingItem) {
        await invoke("update_inventory_item", {
          id: editingItem.id,
          name: itemName.trim(),
          unit: finalUnit,
          lowStockThreshold: parseFloat(itemThreshold) || 5,
          defaultSupplier: itemSupplier.trim() || null,
        });
      } else {
        await invoke("add_inventory_item", {
          name: itemName.trim(),
          unit: finalUnit,
          lowStockThreshold: parseFloat(itemThreshold) || 5,
          defaultSupplier: itemSupplier.trim() || null,
        });
      }
      setIsItemModalOpen(false);
      loadAll();
      toast.success(editingItem ? "Inventory item updated successfully!" : "Inventory item added successfully!");
    } catch (err: any) {
      toast.error(err.toString());
    }
  };

  // ── Delete Item ──
  const handleDeleteItem = (id: number) => {
    setItemToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmDeleteItem = async () => {
    if (itemToDelete === null) return;
    setDeleteModalOpen(false);
    try {
      await invoke("delete_inventory_item", { id: itemToDelete });
      loadAll();
      toast.success("Inventory item deleted.");
    } catch (err: any) {
      toast.error(err.toString());
    } finally {
      setItemToDelete(null);
    }
  };

  // ── Delete Transaction (requires admin password) ──
  const handleDeleteTransaction = (txn: InventoryTransaction) => {
    setTxnToDelete(txn);
    setShowTxnPassword(true);
  };

  const confirmDeleteTransaction = async () => {
    if (!txnToDelete) return;
    const txnId = txnToDelete.id;
    setShowTxnPassword(false);
    setTxnToDelete(null);
    try {
      await invoke("delete_inventory_transaction", { id: txnId });
      loadAll();
      if (dateRange.startDate && dateRange.endDate) {
        loadTransactions();
      }
      toast.success("Inventory transaction deleted.");
    } catch (err: any) {
      toast.error(err.toString());
    }
  };

  // ── Record Usage ──
  const handleRecordUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usageItemId || !usageQty) return;

    try {
      await invoke("record_inventory_usage", {
        itemId: usageItemId as number,
        quantity: parseFloat(usageQty),
        note: usageNote || null,
      });
      const selectedItem = items.find(i => i.id === usageItemId);
      toast.success(`Recorded: ${usageQty} ${selectedItem?.unit || ''} of ${selectedItem?.name || 'item'} used`);
      setUsageQty("");
      setUsageNote("");
      loadAll();
    } catch (err: any) {
      toast.error(err.toString());
    }
  };

  // ── Record Purchase ──
  const handleRecordPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseItemId || !purchaseQty || !purchaseCost) return;

    try {
      await invoke("record_inventory_purchase", {
        itemId: purchaseItemId as number,
        quantity: parseFloat(purchaseQty),
        totalCost: parseFloat(purchaseCost),
        supplier: purchaseSupplier.trim() || null,
        note: purchaseNote.trim() || null,
      });
      const selectedItem = items.find(i => i.id === purchaseItemId);
      toast.success(`Recorded: ${purchaseQty} ${selectedItem?.unit || ''} of ${selectedItem?.name || 'item'} purchased — ${formatCurrency(parseFloat(purchaseCost))} auto-logged to Expenses`);
      setPurchaseQty("");
      setPurchaseCost("");
      setPurchaseSupplier("");
      setPurchaseNote("");
      loadAll();
    } catch (err: any) {
      toast.error(err.toString());
    }
  };

  // ── Stock Status ──
  const getStockStatus = (item: InventoryItem) => {
    if (item.current_stock <= 0) return { label: "Out of Stock", color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20" };
    if (item.current_stock <= item.low_stock_threshold) return { label: "Low Stock", color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20" };
    return { label: "In Stock", color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20" };
  };

  // ── Tab Button Component ──
  const TabButton = ({ tab, icon, label }: { tab: TabType, icon: React.ReactNode, label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
        activeTab === tab
          ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  // ── Input Class ──
  const inputClass = "w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm";
  const labelClass = "block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2";

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden relative transition-colors">

      {/* Add / Edit Item Modal */}
      {isItemModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-[420px] shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingItem ? "Edit Item" : "Add Inventory Item"}
              </h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div>
                <label className={labelClass}>Item Name</label>
                <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} className={inputClass} placeholder="e.g. Chicken, Tomatoes, Rice" required />
              </div>
              <div>
                <label className={labelClass}>Unit</label>
                <div className="flex space-x-2">
                  <select
                    value={isCustomUnit ? "custom" : itemUnit}
                    onChange={(e) => {
                      if (e.target.value === "custom") {
                        setIsCustomUnit(true);
                        setItemUnit("custom");
                      } else {
                        setIsCustomUnit(false);
                        setItemUnit(e.target.value);
                        setCustomUnit("");
                      }
                    }}
                    className={`${inputClass} ${isCustomUnit ? 'w-1/3' : 'w-full'}`}
                  >
                    {PRESET_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    <option value="custom">Custom...</option>
                  </select>
                  {isCustomUnit && (
                    <input
                      type="text"
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      className={`${inputClass} w-2/3`}
                      placeholder="Enter custom unit"
                      required
                    />
                  )}
                </div>
              </div>
              <div>
                <label className={labelClass}>Low Stock Alert Threshold</label>
                <input type="number" step="0.1" value={itemThreshold} onChange={(e) => setItemThreshold(e.target.value)} className={inputClass} placeholder="e.g. 5" />
              </div>
              <div>
                <label className={labelClass}>Default Supplier (Optional)</label>
                <input type="text" value={itemSupplier} onChange={(e) => setItemSupplier(e.target.value)} className={inputClass} placeholder="e.g. Ali Market" />
              </div>
              <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors mt-4 shadow-lg shadow-blue-600/20">
                {editingItem ? "Update Item" : "Add Item"}
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Delete Inventory Item"
        message="This will permanently delete this item and ALL its transaction history. This cannot be undone."
        type="danger"
        onConfirm={confirmDeleteItem}
        onCancel={() => { setDeleteModalOpen(false); setItemToDelete(null); }}
        confirmText="Delete"
      />

      <AdminPasswordModal
        isOpen={showTxnPassword}
        title="Delete Inventory Entry"
        description={`Enter your password to permanently delete this ${txnToDelete?.transaction_type === 'purchase' ? 'purchase' : 'usage'} entry${txnToDelete?.transaction_type === 'purchase' ? ' and its linked expense' : ''}. This action cannot be undone.`}
        confirmLabel="Delete Entry"
        accentColor="red"
        onClose={() => { setShowTxnPassword(false); setTxnToDelete(null); }}
        onSuccess={confirmDeleteTransaction}
      />

      <Sidebar activePage="inventory" />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors min-w-0">
        <Header title="Inventory" subtitle="Track ingredients and supplies used & purchased." />

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <SummaryCard icon={<Package size={28} />} label="Total Items" value={summary.total_items.toString()} color="blue" />
            <SummaryCard icon={<AlertTriangle size={28} />} label="Low Stock" value={summary.low_stock_count.toString()} color="amber" />
            <SummaryCard icon={<Archive size={28} />} label="Out of Stock" value={summary.out_of_stock_count.toString()} color="red" />
            <SummaryCard icon={<ShoppingCart size={28} />} label="Purchases (Selected)" value={`${formatCurrency(summary.period_purchase_total)}`} color="emerald" />
          </div>

          {/* Tabs and Global Date Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 w-full shadow-sm">
            <div className="flex items-center space-x-1">
              <TabButton tab="overview" icon={<Package size={16} />} label="Overview" />
              <TabButton tab="usage" icon={<Minus size={16} />} label="Record Usage" />
              <TabButton tab="purchase" icon={<Plus size={16} />} label="Record Purchase" />
              <TabButton tab="history" icon={<ClipboardList size={16} />} label="History" />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <DateFilterToolbar 
                onDateRangeChange={(startDate, endDate) => setDateRange({ startDate, endDate })}
                defaultMode="month"
              />
              <button
                onClick={() => handlePrint()}
                disabled={exporting}
                className="px-4 py-2.5 h-[42px] bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 border border-slate-200 dark:border-slate-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                <span className="hidden sm:inline">{exporting ? "Exporting…" : "Export PDF"}</span>
              </button>
            </div>
          </div>

          {/* ─── OVERVIEW TAB ─── */}
          {activeTab === "overview" && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">All Inventory Items</h3>
                <button onClick={openAddItemModal} className="bg-blue-600 hover:bg-blue-700 text-white px-4 h-9 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors shadow-lg shadow-blue-600/20">
                  <Plus size={16} />
                  <span>Add Item</span>
                </button>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Item Name</th>
                    <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Unit</th>
                    <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Current Stock</th>
                    <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Alert Threshold</th>
                    <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Status</th>
                    <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={6} className="py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center space-y-3">
                        <Package size={40} className="text-slate-300 dark:text-slate-600" />
                        <p className="font-medium">No inventory items yet</p>
                        <p className="text-xs">Click "Add Item" to start tracking your ingredients and supplies.</p>
                      </div>
                    </td></tr>
                  ) : (
                    items.map((item) => {
                      const status = getStockStatus(item);
                      return (
                        <tr key={item.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors last:border-b-0">
                          <td className="py-4 px-6 text-sm font-semibold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">{item.name}</td>
                          <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">{item.unit}</td>
                          <td className="py-4 px-6 text-sm font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">
                            {item.current_stock % 1 === 0 ? item.current_stock : item.current_stock.toFixed(2)}
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">{item.low_stock_threshold}</td>
                          <td className="py-4 px-6 border-r border-slate-200 dark:border-slate-800">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${status.color}`}>{status.label}</span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button onClick={() => openEditItemModal(item)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-2 rounded-lg transition-colors hover:bg-blue-50 dark:hover:bg-blue-500/10">
                                <Pencil size={16} />
                              </button>
                              <button onClick={() => handleDeleteItem(item.id)} className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-2 rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-500/10">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ─── USAGE TAB ─── */}
          {activeTab === "usage" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Usage Form */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20">
                    <TrendingDown size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Record Usage</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Log items consumed today</p>
                  </div>
                </div>

                <form onSubmit={handleRecordUsage} className="space-y-4">
                  <div>
                    <label className={labelClass}>Select Item</label>
                    <div className="relative">
                      <select value={usageItemId} onChange={(e) => setUsageItemId(e.target.value ? parseInt(e.target.value) : "")} className={`${inputClass} appearance-none pr-10`} required>
                        <option value="">— Select an item —</option>
                        {items.map(i => (
                          <option key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit} available)</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Quantity Used</label>
                    <input type="number" step="0.01" min="0.01" value={usageQty} onChange={(e) => setUsageQty(e.target.value)} className={inputClass} placeholder="e.g. 10" required />
                  </div>
                  <div>
                    <label className={labelClass}>Note (Optional)</label>
                    <input type="text" value={usageNote} onChange={(e) => setUsageNote(e.target.value)} className={inputClass} placeholder="e.g. Used for lunch prep" />
                  </div>
                  <button type="submit" className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-colors shadow-lg shadow-orange-500/20">
                    <span className="flex items-center justify-center space-x-2"><Minus size={18} /><span>Record Usage</span></span>
                  </button>
                </form>
              </div>

              {/* Usage Log */}
              <TodaysLog
                items={items}
                type="usage"
                title="Usage Log"
                icon={<TrendingDown size={20} />}
                color="orange"
                dateRange={dateRange}
                onDelete={handleDeleteTransaction}
              />
            </div>
          )}

          {/* ─── PURCHASE TAB ─── */}
          {activeTab === "purchase" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Purchase Form */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                    <ShoppingCart size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Record Purchase</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Log items restocked — auto-added to Expenses</p>
                  </div>
                </div>

                <form onSubmit={handleRecordPurchase} className="space-y-4">
                  <div>
                    <label className={labelClass}>Select Item</label>
                    <div className="relative">
                      <select 
                        value={purchaseItemId} 
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value) : "";
                          setPurchaseItemId(val);
                          if (val !== "") {
                            const selected = items.find(i => i.id === val);
                            if (selected && selected.default_supplier) {
                              setPurchaseSupplier(selected.default_supplier);
                            }
                          }
                        }} 
                        className={`${inputClass} appearance-none pr-10`} 
                        required
                      >
                        <option value="">— Select an item —</option>
                        {items.map(i => (
                          <option key={i.id} value={i.id}>{i.name} ({i.current_stock} {i.unit} in stock)</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Quantity</label>
                      <input type="number" step="0.01" min="0.01" value={purchaseQty} onChange={(e) => setPurchaseQty(e.target.value)} className={inputClass} placeholder="e.g. 10" required />
                    </div>
                    <div>
                      <label className={labelClass}>Total Cost (Rs.)</label>
                      <MoneyInput value={purchaseCost} onChange={setPurchaseCost} className={inputClass} placeholder="e.g. 500" required />
                    </div>
                  </div>
                  {purchaseQty && purchaseCost && parseFloat(purchaseQty) > 0 && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 -mt-2 px-1">
                      Unit price: {formatCurrency((parseFloat(purchaseCost) / parseFloat(purchaseQty)))} per unit
                    </div>
                  )}
                  <div>
                    <label className={labelClass}>Supplier Name (Optional)</label>
                    <input type="text" value={purchaseSupplier} onChange={(e) => setPurchaseSupplier(e.target.value)} className={inputClass} placeholder="e.g. Ali Market, Metro Store" />
                  </div>
                  <div>
                    <label className={labelClass}>Note (Optional)</label>
                    <input type="text" value={purchaseNote} onChange={(e) => setPurchaseNote(e.target.value)} className={inputClass} placeholder="e.g. Weekly restock" />
                  </div>
                  <button type="submit" className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-600/20">
                    <span className="flex items-center justify-center space-x-2"><Plus size={18} /><span>Record Purchase</span></span>
                  </button>
                </form>
              </div>

              {/* Purchase Log */}
              <TodaysLog
                items={items}
                type="purchase"
                title="Purchase Log"
                icon={<ShoppingCart size={20} />}
                color="emerald"
                dateRange={dateRange}
                onDelete={handleDeleteTransaction}
              />
            </div>
          )}

          {/* ─── HISTORY TAB ─── */}
          {activeTab === "history" && (
            <div className="space-y-4">
              {/* History Filters */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative">
                  <select value={historyItemFilter} onChange={(e) => setHistoryItemFilter(e.target.value ? parseInt(e.target.value) : "")} className="h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 pr-8 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 appearance-none">
                    <option value="">All Items</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select value={historyTypeFilter} onChange={(e) => setHistoryTypeFilter(e.target.value)} className="h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 pr-8 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 appearance-none">
                    <option value="all">All Types</option>
                    <option value="usage">Usage Only</option>
                    <option value="purchase">Purchases Only</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* History Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Date</th>
                      <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Item</th>
                      <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Type</th>
                      <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Quantity</th>
                      <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Cost</th>
                      <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Supplier</th>
                      <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-r border-slate-200 dark:border-slate-800">Note</th>
                      <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr><td colSpan={8} className="py-12 text-center text-slate-500">No transactions found for this period.</td></tr>
                    ) : (
                      transactions.map((t) => (
                        <tr key={t.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors last:border-b-0">
                          <td className="py-4 px-6 text-sm text-slate-700 dark:text-slate-300 font-medium border-r border-slate-200 dark:border-slate-800">{t.date}</td>
                          <td className="py-4 px-6 text-sm font-semibold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">{t.item_name}</td>
                          <td className="py-4 px-6 border-r border-slate-200 dark:border-slate-800">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                              t.transaction_type === 'purchase'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                                : 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20'
                            }`}>
                              {t.transaction_type === 'purchase' ? '↑ Purchase' : '↓ Usage'}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                            {t.quantity % 1 === 0 ? t.quantity : t.quantity.toFixed(2)} {t.item_unit}
                          </td>
                          <td className="py-4 px-6 text-sm font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">
                            {t.total_cost != null ? `${formatCurrency(t.total_cost)}` : '—'}
                          </td>
                          <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">{t.supplier || '—'}</td>
                          <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">{t.note || '—'}</td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => handleDeleteTransaction(t)}
                              className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-2 rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                              title="Delete transaction (admin)"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <InventoryReportTemplate
          ref={printRef}
          items={items}
          transactions={transactions}
          summary={summary}
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
          restaurantName={restaurantName}
          restaurantLogo={restaurantLogo}
        />
      </main>
    </div>
  );
}

// ── Summary Card Component ──
function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
    amber: "bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
    red: "bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20",
    emerald: "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center space-x-4 shadow-sm">
      <div className={`p-3.5 rounded-xl border ${colorMap[color]}`}>{icon}</div>
      <div>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{label}</p>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{value}</h2>
      </div>
    </div>
  );
}

// ── Selected Period Log Component (reused for both Usage and Purchase tabs) ──
function TodaysLog({ type, title, icon, color, dateRange, onDelete }: { items: InventoryItem[], type: string, title: string, icon: React.ReactNode, color: string, dateRange: { startDate: string, endDate: string }, onDelete?: (txn: InventoryTransaction) => void }) {
  const [todayTransactions, setTodayTransactions] = useState<InventoryTransaction[]>([]);

  const loadTodayLog = async () => {
    try {
      const data = await invoke<InventoryTransaction[]>("get_inventory_transactions", {
        startDate: dateRange.startDate || null,
        endDate: dateRange.endDate || null,
        itemId: null,
        transactionType: type,
      });
      setTodayTransactions(data);
    } catch (err) {
      console.error("Failed to load today's log:", err);
    }
  };

  useEffect(() => {
    loadTodayLog();
    const interval = setInterval(loadTodayLog, 3000);
    return () => clearInterval(interval);
  }, [dateRange]);

  const colorMap: Record<string, string> = {
    orange: "border-orange-200 dark:border-orange-500/20",
    emerald: "border-emerald-200 dark:border-emerald-500/20",
  };
  const iconBg: Record<string, string> = {
    orange: "bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400",
    emerald: "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };

  return (
    <div className={`bg-white dark:bg-slate-900 border ${colorMap[color] || 'border-slate-200 dark:border-slate-800'} rounded-2xl shadow-sm overflow-hidden`}>
      <div className="flex items-center space-x-3 px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className={`p-2 rounded-lg ${iconBg[color]}`}>{icon}</div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
        <span className="text-xs text-slate-400 ml-auto">{todayTransactions.length} entries</span>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {todayTransactions.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            No {type === 'usage' ? 'usage' : 'purchases'} recorded today.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/50">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase border-r border-slate-200 dark:border-slate-800">Item</th>
                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase border-r border-slate-200 dark:border-slate-800">Qty</th>
                {type === 'purchase' && <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase border-r border-slate-200 dark:border-slate-800">Cost</th>}
                {type === 'purchase' && <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase border-r border-slate-200 dark:border-slate-800">Supplier</th>}
                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase border-r border-slate-200 dark:border-slate-800">Note</th>
                {onDelete && <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {todayTransactions.map(t => (
                <tr key={t.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors last:border-b-0">
                  <td className="py-3 px-6 text-sm font-semibold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">{t.item_name}</td>
                  <td className="py-3 px-6 text-sm text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">{t.quantity % 1 === 0 ? t.quantity : t.quantity.toFixed(2)} {t.item_unit}</td>
                  {type === 'purchase' && <td className="py-3 px-6 text-sm font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">{formatCurrency(t.total_cost ?? 0)}</td>}
                  {type === 'purchase' && <td className="py-3 px-6 text-sm text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">{t.supplier || '—'}</td>}
                  <td className="py-3 px-6 text-sm text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-800">{t.note || '—'}</td>
                  {onDelete && (
                    <td className="py-3 px-6 text-right">
                      <button
                        onClick={() => onDelete(t)}
                        className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-2 rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                        title="Delete entry (admin)"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
