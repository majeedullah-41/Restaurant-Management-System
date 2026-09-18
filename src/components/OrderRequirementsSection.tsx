import { useState, useEffect } from "react";
import { invoke } from "../lib/api";
import { ClipboardCheck, Save, Loader2 } from "lucide-react";
import { useToast } from "../lib/toast";
import { ToggleRow } from "./ui/toggle";

export default function OrderRequirementsSection() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [requireTableDinein, setRequireTableDinein] = useState(true);
  const [requireTakerDinein, setRequireTakerDinein] = useState(true);
  const [requireTakerOther, setRequireTakerOther] = useState(false);
  const [requirePhoneDelivery, setRequirePhoneDelivery] = useState(true);
  const [requireAddressDelivery, setRequireAddressDelivery] = useState(true);
  const [autoAssignTaker, setAutoAssignTaker] = useState(true);
  const [baseSettings, setBaseSettings] = useState<any>(null);

  const loadSettings = async () => {
    try {
      const data: any = await invoke("get_settings");
      setBaseSettings(data);
      setRequireTableDinein(data.require_table_dinein !== false);
      setRequireTakerDinein(data.require_taker_dinein !== false);
      setRequireTakerOther(data.require_taker_other === true);
      setRequirePhoneDelivery(data.require_phone_delivery !== false);
      setRequireAddressDelivery(data.require_address_delivery !== false);
      setAutoAssignTaker(data.auto_assign_taker !== false);
    } catch (err) {
      console.error("Failed to load order entry requirements", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    window.addEventListener("settingsUpdated", loadSettings);
    return () => window.removeEventListener("settingsUpdated", loadSettings);
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const current: any = baseSettings || (await invoke("get_settings"));
      await invoke("update_settings", {
        name: current.restaurant_name,
        address: current.address || null,
        logoPath: current.logo_path || null,
        taxRate: current.tax_rate,
        totalTables: current.total_tables,
        serviceChargeRate: current.service_charge_rate || 0,
        serviceChargeTypes: current.service_charge_types || "Dine-in",
        contactNumber: current.contact_number || null,
        orderResetFrequency: current.order_reset_frequency || "Daily",
        requireTableDinein,
        requireTakerDinein,
        requireTakerOther,
        requirePhoneDelivery,
        requireAddressDelivery,
        autoAssignTaker,
      });
      toast.success("Order requirements saved successfully!");
      window.dispatchEvent(new Event("settingsUpdated"));
    } catch (err: any) {
      toast.error(err?.toString() || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 flex justify-center items-center min-h-[240px]">
        <Loader2 className="animate-spin text-blue-500" size={24} />
      </div>
    );
  }

  return (
    <div
      data-testid="order-requirements-section"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center border border-blue-100 dark:border-blue-800">
          <ClipboardCheck size={20} className="text-blue-600 dark:text-blue-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Order Entry Requirements</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Choose which fields are required when placing orders. Turn a toggle off to make the field optional.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          <div className="py-3.5">
            <ToggleRow
              label="Table number for dine-in"
              description="Require selecting a table before adding items to a dine-in order."
              testId="toggle-require-table-dinein"
              checked={requireTableDinein}
              onChange={setRequireTableDinein}
              activeClass="bg-blue-600"
              labelClassName="font-semibold text-slate-800 dark:text-slate-200"
            />
          </div>
          <div className="py-3.5">
            <ToggleRow
              label="Order taker for dine-in"
              description="Require selecting an order taker for dine-in orders."
              testId="toggle-require-taker-dinein"
              checked={requireTakerDinein}
              onChange={setRequireTakerDinein}
              activeClass="bg-blue-600"
              labelClassName="font-semibold text-slate-800 dark:text-slate-200"
            />
          </div>
          <div className="py-3.5">
            <ToggleRow
              label="Order taker for takeaway & delivery"
              description="Require selecting an order taker for takeaway and delivery orders too."
              testId="toggle-require-taker-other"
              checked={requireTakerOther}
              onChange={setRequireTakerOther}
              activeClass="bg-blue-600"
              labelClassName="font-semibold text-slate-800 dark:text-slate-200"
            />
          </div>
          <div className="py-3.5">
            <ToggleRow
              label="Phone number for delivery"
              description="Require a customer phone number to complete a delivery order."
              testId="toggle-require-phone-delivery"
              checked={requirePhoneDelivery}
              onChange={setRequirePhoneDelivery}
              activeClass="bg-blue-600"
              labelClassName="font-semibold text-slate-800 dark:text-slate-200"
            />
          </div>
          <div className="py-3.5">
            <ToggleRow
              label="Delivery address"
              description="Require a delivery address to complete a delivery order."
              testId="toggle-require-address-delivery"
              checked={requireAddressDelivery}
              onChange={setRequireAddressDelivery}
              activeClass="bg-blue-600"
              labelClassName="font-semibold text-slate-800 dark:text-slate-200"
            />
          </div>
          <div className="py-3.5">
            <ToggleRow
              label="Auto-assign logged-in staff as order taker"
              description="Automatically pre-select the logged-in staff member as the order taker when they are on the order taker list."
              testId="toggle-auto-assign-taker"
              checked={autoAssignTaker}
              onChange={setAutoAssignTaker}
              activeClass="bg-blue-600"
              labelClassName="font-semibold text-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          data-testid="save-order-requirements-btn"
          className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center justify-center space-x-2 mt-4 shadow-lg shadow-blue-600/20 cursor-pointer"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          <span>Save Order Requirements</span>
        </button>
      </form>
    </div>
  );
}
