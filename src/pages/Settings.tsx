import { useState, useEffect } from "react";
import { invoke } from "../lib/api";
import { Save, ShieldCheck, Copy, CheckCircle, CalendarClock, Clock, Cpu, RefreshCw, Key, XCircle, Loader2, Upload, Trash } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import BackupSection from "../components/BackupSection";
import DataMigrationSection from "../components/DataMigrationSection";
import DeliverySettingsSection from "../components/DeliverySettingsSection";

export default function SettingsPage() {
  const [name, setName] = useState("Restaurant Management System");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [serviceChargeRate, setServiceChargeRate] = useState("");
  const [serviceChargeTypes, setServiceChargeTypes] = useState<string[]>(["Dine-in"]);
  const [orderResetFrequency, setOrderResetFrequency] = useState("Daily");
  const [logo, setLogo] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // License info state
  const [licenseInfo, setLicenseInfo] = useState<any>(null);
  const [hwidCopied, setHwidCopied] = useState(false);
  const [showRenewForm, setShowRenewForm] = useState(false);
  const [renewKey, setRenewKey] = useState("");
  const [renewLoading, setRenewLoading] = useState(false);
  const [renewMessage, setRenewMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleServiceChargeTypeChange = (type: string) => {
    setServiceChargeTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  useEffect(() => {
    async function fetchSettings() {
      try {
        const data: any = await invoke("get_settings");
        setName(data.restaurant_name);
        setContact(data.contact_number || "");
        setAddress(data.address || "");
        setLogo(data.logo_path || null);
        setTaxRate(data.tax_rate.toString());
        setServiceChargeRate(data.service_charge_rate?.toString() || "0");
        setServiceChargeTypes(data.service_charge_types ? data.service_charge_types.split(",") : ["Dine-in"]);
        setOrderResetFrequency(data.order_reset_frequency || "Daily");
      } catch (err) {
        console.error("Failed to load settings", err);
      }
    }
    async function fetchLicenseInfo() {
      try {
        const info: any = await invoke("get_license_info");
        setLicenseInfo(info);
      } catch (err) {
        console.error("Failed to load license info", err);
      }
    }
    fetchSettings();
    fetchLicenseInfo();
  }, []);

  const copyHwid = async () => {
    if (!licenseInfo) return;
    try {
      await navigator.clipboard.writeText(licenseInfo.hwid);
    } catch {
      const el = document.createElement("textarea");
      el.value = licenseInfo.hwid;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setHwidCopied(true);
    setTimeout(() => setHwidCopied(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    const parsedTaxRate = parseFloat(taxRate);
    const parsedServiceChargeRate = parseFloat(serviceChargeRate);
    if (!isFinite(parsedTaxRate) || parsedTaxRate < 0) {
      setMessage("Tax rate must be a valid non-negative number.");
      return;
    }
    if (!isFinite(parsedServiceChargeRate) || parsedServiceChargeRate < 0) {
      setMessage("Service charge rate must be a valid non-negative number.");
      return;
    }

    try {
      await invoke("update_settings", {
        name: name,
        address: address,
        logoPath: logo ? logo : null,
        taxRate: parsedTaxRate,
        serviceChargeRate: parsedServiceChargeRate,
        serviceChargeTypes: serviceChargeTypes.join(","),
        contactNumber: contact.trim() || null,
        orderResetFrequency: orderResetFrequency
      });
      setMessage("Settings saved successfully!");
      window.dispatchEvent(new Event("settingsUpdated"));
      setTimeout(() => setMessage(""), 3000);
    } catch (err: any) {
      setMessage(err.toString());
    }
  };

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      
      <Sidebar activePage="settings" />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 transition-colors min-w-0">
        <Header title="System Settings" subtitle="Global Configurations" />

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto space-y-8">
          <div className="max-w-3xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">General Preferences</h2>
            
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Restaurant Name</label>
                  <input 
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Contact Number</label>
                  <input 
                    type="text" value={contact} onChange={(e) => setContact(e.target.value)}
                    className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="e.g. 0346-4451505"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Restaurant Address</label>
                  <textarea 
                    value={address} onChange={(e) => setAddress(e.target.value)} rows={2}
                    className="w-full bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none" placeholder="123 Main St, City"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Restaurant Logo</label>
                  <div className="flex items-center space-x-4">
                    {logo ? (
                      <div className="relative group">
                        <img src={logo} alt="Logo" className="w-16 h-16 rounded-xl object-contain bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                        <button type="button" onClick={() => setLogo(null)} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md">
                          <Trash size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                        <span className="text-xs text-slate-400">No logo</span>
                      </div>
                    )}
                    <label className="cursor-pointer inline-flex items-center space-x-2 px-4 py-2.5 bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl transition-colors shadow-sm">
                      <Upload size={16} />
                      <span>Upload Logo</span>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Tax Rate (%)</label>
                  <input 
                    type="number" step="0.1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Order Number Reset</label>
                  <select
                    value={orderResetFrequency}
                    onChange={(e) => setOrderResetFrequency(e.target.value)}
                    className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Yearly">Yearly</option>
                    <option value="Never">Never</option>
                  </select>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">How often order numbers restart from 1.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-900/10">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Service Charge Rate (%)</label>
                  <input 
                    type="number" step="0.1" value={serviceChargeRate} onChange={(e) => setServiceChargeRate(e.target.value)}
                    className="w-full h-11 bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Apply Service Charge To:</label>
                  <div className="flex flex-col space-y-2 mt-2">
                    {['Dine-in', 'Takeaway', 'Delivery'].map(type => (
                      <label key={type} className="flex items-center space-x-2 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={serviceChargeTypes.includes(type)}
                          onChange={() => handleServiceChargeTypeChange(type)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {message && (
                <p className={`text-sm font-bold ${message.startsWith("Error") || message.includes("valid non-negative") ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>{message}</p>
              )}

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

          <div className="max-w-3xl">
            <DeliverySettingsSection />
          </div>

          {/* License Information Section */}
          <div className="max-w-3xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center border border-blue-100 dark:border-blue-800">
                <ShieldCheck size={20} className="text-blue-600 dark:text-blue-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">License Information</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Your software license details</p>
              </div>
            </div>

            {licenseInfo ? (
              <div className="space-y-5">
                {/* Status Badge */}
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 w-32">Status</span>
                  <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    licenseInfo.status === "Active"
                      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                      : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      licenseInfo.status === "Active" ? "bg-emerald-500" : "bg-red-500"
                    }`} />
                    <span>{licenseInfo.status}</span>
                  </span>
                  {licenseInfo.days_remaining !== null && licenseInfo.days_remaining >= 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      ({licenseInfo.days_remaining} day{licenseInfo.days_remaining !== 1 ? "s" : ""} remaining)
                    </span>
                  )}
                </div>

                {/* HWID */}
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 w-32 flex items-center space-x-2">
                    <Cpu size={14} />
                    <span>Hardware ID</span>
                  </span>
                  <div className="flex items-center space-x-2">
                    <code className="bg-slate-100 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono text-slate-700 dark:text-slate-300 tracking-wider">
                      {licenseInfo.hwid}
                    </code>
                    <button
                      onClick={copyHwid}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Copy HWID"
                    >
                      {hwidCopied ? (
                        <CheckCircle size={16} className="text-green-500" />
                      ) : (
                        <Copy size={16} className="text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expiry Date */}
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 w-32 flex items-center space-x-2">
                    <CalendarClock size={14} />
                    <span>Expires On</span>
                  </span>
                  <span className="text-sm text-slate-800 dark:text-slate-200 font-medium">
                    {licenseInfo.expiry_date || "—"}
                  </span>
                </div>

                {/* Last Activated */}
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 w-32 flex items-center space-x-2">
                    <Clock size={14} />
                    <span>Last Renewed</span>
                  </span>
                  <span className="text-sm text-slate-800 dark:text-slate-200 font-medium">
                    {licenseInfo.activated_at || "—"}
                  </span>
                </div>

                {/* Renew License */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                  {!showRenewForm ? (
                    <button
                      onClick={() => { setShowRenewForm(true); setRenewMessage(null); }}
                      className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                    >
                      <RefreshCw size={16} />
                      <span>Renew License</span>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2 mb-2">
                        <Key size={16} className="text-blue-500" />
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Enter New License Key</span>
                      </div>
                      <textarea
                        value={renewKey}
                        onChange={(e) => setRenewKey(e.target.value)}
                        placeholder="Paste your new license key here..."
                        rows={3}
                        className="w-full bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono resize-none transition-colors"
                      />
                      {renewMessage && (
                        <div className={`flex items-start space-x-2 text-sm p-3 rounded-xl border ${
                          renewMessage.type === "success"
                            ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20"
                            : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20"
                        }`}>
                          {renewMessage.type === "success" ? <CheckCircle size={16} className="mt-0.5 flex-shrink-0" /> : <XCircle size={16} className="mt-0.5 flex-shrink-0" />}
                          <span className="font-medium">{renewMessage.text}</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={async () => {
                            const trimmed = renewKey.trim();
                            if (!trimmed) { setRenewMessage({ type: "error", text: "Please enter a license key." }); return; }
                            setRenewLoading(true);
                            setRenewMessage(null);
                            try {
                              const res: any = await invoke("activate_license", { key: trimmed });
                              if (res.valid) {
                                setRenewMessage({ type: "success", text: `License renewed successfully! Valid until ${res.expiry_date}.` });
                                // Refresh license info locally
                                const info: any = await invoke("get_license_info");
                                setLicenseInfo(info);
                                setRenewKey("");
                                
                                // Notify App.tsx to update the global warning banner
                                window.dispatchEvent(new Event("licenseUpdated"));

                                setTimeout(() => { setShowRenewForm(false); setRenewMessage(null); }, 3000);
                              } else {
                                setRenewMessage({ type: "error", text: res.message });
                              }
                            } catch (err: any) {
                              setRenewMessage({ type: "error", text: err?.toString() || "Renewal failed." });
                            } finally {
                              setRenewLoading(false);
                            }
                          }}
                          disabled={renewLoading}
                          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {renewLoading ? (
                            <><Loader2 size={16} className="animate-spin" /><span>Verifying...</span></>
                          ) : (
                            <><ShieldCheck size={16} /><span>Activate</span></>
                          )}
                        </button>
                        <button
                          onClick={() => { setShowRenewForm(false); setRenewKey(""); setRenewMessage(null); }}
                          className="px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading license information...</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}