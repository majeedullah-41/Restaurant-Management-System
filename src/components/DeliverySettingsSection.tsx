import { useState, useEffect } from "react";
import { invoke } from "../lib/api";
import { Save, Truck, Loader2 } from "lucide-react";

export default function DeliverySettingsSection() {
  const [baseFee, setBaseFee] = useState("");
  const [freeThreshold, setFreeThreshold] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const data: any = await invoke("get_delivery_settings");
        setBaseFee(data.base_delivery_fee.toString());
        setFreeThreshold(data.free_delivery_threshold.toString());
      } catch (err) {
        console.error("Failed to load delivery settings", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await invoke("update_delivery_settings", {
        baseDeliveryFee: parseFloat(baseFee) || 0,
        freeDeliveryThreshold: parseFloat(freeThreshold) || 0,
      });
      setMessage({ type: "success", text: "Delivery settings saved successfully!" });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: "error", text: err.toString() });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 flex justify-center">
        <Loader2 className="animate-spin text-blue-500" size={24} />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center border border-indigo-100 dark:border-indigo-800">
          <Truck size={20} className="text-indigo-600 dark:text-indigo-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Delivery Configuration</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Manage delivery fees and pricing rules</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Base Delivery Fee (Rs)</label>
            <input 
              type="number" step="1" value={baseFee} onChange={(e) => setBaseFee(e.target.value)}
              className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Free Delivery Threshold (Rs)</label>
            <input 
              type="number" step="1" value={freeThreshold} onChange={(e) => setFreeThreshold(e.target.value)}
              className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" required
              placeholder="e.g. 2000 for free delivery over Rs.2000"
            />
            <p className="text-xs text-slate-500 mt-1">Set to 0 to always charge the base fee.</p>
          </div>
        </div>

        {message && (
          <p className={`text-sm font-bold ${message.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {message.text}
          </p>
        )}

        <button 
          type="submit" 
          disabled={saving}
          className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center justify-center space-x-2 mt-4 shadow-lg shadow-indigo-600/20 cursor-pointer"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          <span>Save Delivery Settings</span>
        </button>
      </form>
    </div>
  );
}
