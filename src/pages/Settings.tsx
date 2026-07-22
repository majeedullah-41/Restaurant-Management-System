import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Save } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import BackupSection from "../components/BackupSection";
import DataMigrationSection from "../components/DataMigrationSection";

export default function SettingsPage() {
  const [name, setName] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [tables, setTables] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function fetchSettings() {
      try {
        const data: any = await invoke("get_settings");
        setName(data.restaurant_name);
        setLogo(data.logo_path || null);
        setTaxRate(data.tax_rate.toString());
        setTables(data.total_tables.toString());
      } catch (err) {
        console.error("Failed to load settings", err);
      }
    }
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    try {
      await invoke("update_settings", {
        name: name,
        logoPath: logo ? logo : null,
        taxRate: parseFloat(taxRate),
        totalTables: parseInt(tables)
      });
      setMessage("Settings saved successfully!");
      window.dispatchEvent(new Event("settingsUpdated"));
      setTimeout(() => setMessage(""), 3000);
    } catch (err: any) {
      setMessage(err.toString());
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      
      <Sidebar activePage="settings" />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 transition-colors">
        <Header title="System Settings" subtitle="Global Configurations" />

        <div className="flex-1 p-8 overflow-y-auto space-y-8">
          <div className="max-w-3xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">General Preferences</h2>
            
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Tax Rate (%)</label>
                  <input 
                    type="number" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Total Physical Tables</label>
                  <input 
                    type="number" value={tables} onChange={(e) => setTables(e.target.value)}
                    className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                  />
                </div>
              </div>

              {message && <p className="text-green-600 dark:text-green-400 text-sm font-bold">{message}</p>}

              <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center space-x-2 mt-4 shadow-lg shadow-blue-600/20 cursor-pointer">
                <Save size={18} />
                <span>Save Settings</span>
              </button>
            </form>
          </div>

          <div className="max-w-3xl">
            <BackupSection />
          </div>

          <div className="max-w-3xl">
            <DataMigrationSection />
          </div>
        </div>
      </main>
    </div>
  );
}