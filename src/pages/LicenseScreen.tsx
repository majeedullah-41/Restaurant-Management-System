import { useState } from "react";
import { invoke } from "../lib/api";
import { open } from "@tauri-apps/plugin-dialog";
import { ShieldCheck, Key, Copy, CheckCircle, XCircle, AlertTriangle, Loader2, DatabaseBackup, RefreshCw } from "lucide-react";

interface LicenseStatus {
  valid: boolean;
  hwid: string;
  message: string;
  expiry_date: string | null;
  days_remaining: number | null;
}

interface LicenseScreenProps {
  hwid: string;
  status: LicenseStatus | null;
  onActivated: () => void;
}

export default function LicenseScreen({ hwid, status, onActivated }: LicenseScreenProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const handleCopyHwid = async () => {
    try {
      await navigator.clipboard.writeText(hwid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for Tauri
      const el = document.createElement("textarea");
      el.value = hwid;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || restoring) return;
    setError("");
    setRestoreMsg(null);
    setConfirmRestore(false);

    const trimmed = licenseKey.trim();
    if (!trimmed) {
      setError("Please enter a license key.");
      return;
    }

    setLoading(true);
    try {
      const res: LicenseStatus = await invoke("activate_license", { key: trimmed });
      if (res.valid) {
        onActivated();
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err?.toString() || "Activation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isExpired = status && !status.valid && status.days_remaining !== null && status.days_remaining < 0;

  const handlePickBackup = async () => {
    if (loading || restoring) return;
    setRestoreMsg(null);
    setError("");
    setConfirmRestore(false);
    setSelectedBackup(null);
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Select Your Backup File",
        filters: [
          { name: "RMS Database Backup", extensions: ["db"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (!selected || typeof selected !== "string") return;
      setSelectedBackup(selected);
      setConfirmRestore(true);
    } catch (err: any) {
      setRestoreMsg({ text: err?.toString() || "Failed to open file picker.", type: "error" });
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup || loading || restoring) return;
    setRestoring(true);
    setRestoreMsg(null);
    setError("");
    setConfirmRestore(false);
    try {
      const res: LicenseStatus = await invoke("restore_license_from_backup", { filePath: selectedBackup });
      if (res.valid) {
        setRestoreMsg({ text: "Backup restored. Your license is active on this device.", type: "success" });
      } else {
        setRestoreMsg({ text: res.message, type: "error" });
        setSelectedBackup(null);
      }
    } catch (err: any) {
      setRestoreMsg({ text: err?.toString() || "Failed to restore backup.", type: "error" });
      setSelectedBackup(null);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 transition-colors p-4 md:p-6 lg:p-8">
      <div className="flex flex-col md:flex-row w-full h-full bg-white dark:bg-[#0B1120] rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 transition-colors">
        
        {/* LEFT SIDE: Shield Branding */}
        <div className="hidden md:flex flex-col w-1/2 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)" }}
        >
          {/* Animated gradient orbs */}
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-500/20 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-indigo-500/20 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
          <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-cyan-400/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: "2s" }} />

          <div className="relative z-10 flex flex-col items-center justify-center h-full p-12 text-center">
            {/* Shield Icon */}
            <div className="w-28 h-28 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mb-10 shadow-2xl shadow-blue-500/30 border border-blue-400/20"
              style={{ transform: "rotate(-5deg)" }}
            >
              <ShieldCheck size={56} className="text-white" style={{ transform: "rotate(5deg)" }} />
            </div>

            <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-3 leading-tight">
              License<br />Activation
            </h1>
            <p className="text-blue-400 font-bold tracking-[0.2em] uppercase text-sm mb-8">
              Software Protection
            </p>

            <div className="max-w-sm text-slate-400 text-sm leading-relaxed">
              Your software requires a valid license to operate. Contact your vendor
              with the Hardware ID displayed on this screen to receive your unique activation key. (0347-9366948)
            </div>

            <div className="flex items-center space-x-3 text-slate-400 font-medium mt-10">
              <span>Offline</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>Secure</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>HWID-Locked</span>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Activation Form */}
        <div className="flex w-full md:w-1/2 flex-col overflow-y-auto custom-scrollbar px-6 lg:px-12 py-6 bg-white dark:bg-[#1E293B] relative transition-colors">
          <div className="flex-1 flex flex-col justify-center w-full max-w-md mx-auto min-h-max">
            
            {/* Status Banner */}
            {isExpired && (
              <div className="mb-8 flex items-start space-x-3 bg-red-50 dark:bg-red-500/10 p-4 rounded-xl border border-red-200 dark:border-red-500/20">
                <AlertTriangle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-700 dark:text-red-400">License Expired</p>
                  <p className="text-xs text-red-600 dark:text-red-400/80 mt-1">
                    Your license expired on {status?.expiry_date}. Please enter a new key to continue.
                  </p>
                </div>
              </div>
            )}

            {!isExpired && status && !status.valid && (
              <div className="mb-8 flex items-start space-x-3 bg-amber-50 dark:bg-amber-500/10 p-4 rounded-xl border border-amber-200 dark:border-amber-500/20">
                <Key size={20} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400">Activation Required</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400/80 mt-1">
                    {status.message}
                  </p>
                </div>
              </div>
            )}

            {/* Header */}
            <div className="flex items-center space-x-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center border border-blue-100 dark:border-blue-800">
                <Key size={24} className="text-blue-600 dark:text-blue-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Activate License</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Enter your license key to unlock the application.</p>
              </div>
            </div>

            {/* HWID Display */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                Your Hardware ID
              </label>
              <div className="flex items-center space-x-2">
                <div className="flex-1 h-12 bg-slate-100 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-xl px-4 flex items-center font-mono text-sm text-slate-700 dark:text-slate-300 tracking-wider select-all">
                  {hwid}
                </div>
                <button
                  onClick={handleCopyHwid}
                  className="h-12 w-12 flex items-center justify-center bg-slate-100 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <CheckCircle size={18} className="text-green-500" />
                  ) : (
                    <Copy size={18} className="text-slate-400" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                Share this ID with your software vendor to receive your license key.
              </p>
            </div>

            {/* License Key Form */}
            <form onSubmit={handleActivate} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  License Key
                </label>
                <textarea
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="Paste your license key here..."
                  rows={2}
                  className="w-full bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono resize-none transition-colors"
                />
              </div>

              {error && (
                <div className="flex items-start space-x-2 text-red-500 text-sm bg-red-50 dark:bg-red-500/10 p-3 rounded-xl border border-red-100 dark:border-red-500/20">
                  <XCircle size={16} className="mt-0.5 flex-shrink-0" />
                  <span className="font-medium">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || restoring}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-blue-600/25 flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <span>ACTIVATE LICENSE</span>
                  </>
                )}
              </button>
            </form>

            {/* Restore from Backup */}
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2 mb-1">
                <DatabaseBackup size={18} className="text-slate-400" />
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  Moving to a new device?
                </h3>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-4">
                Restore your backup file to carry your data and activated license over.
                The system checks the backup's license expiry date against today's date.
              </p>

              <button
                type="button"
                onClick={handlePickBackup}
                disabled={loading || restoring}
                className="w-full h-11 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 font-semibold rounded-xl text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={16} />
                <span>SELECT BACKUP FILE</span>
              </button>

              {confirmRestore && selectedBackup && !restoreMsg && (
                <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-3">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                    <span className="font-medium">
                      This will replace ALL data on this device with the contents of this backup. This cannot be undone
                      (a safety copy of the current data is saved automatically).
                      <span className="block mt-1 font-mono break-all text-amber-700 dark:text-amber-400">
                        {selectedBackup}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleRestoreBackup}
                      disabled={restoring}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition-all flex items-center space-x-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {restoring ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Restoring...</span>
                        </>
                      ) : (
                        <span>Confirm & Restore</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setSelectedBackup(null); setConfirmRestore(false); }}
                      disabled={restoring}
                      className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {restoreMsg && (
                <div
                  className={`mt-4 flex items-start space-x-2 text-sm p-3 rounded-xl border ${
                    restoreMsg.type === "success"
                      ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20"
                      : "text-red-500 bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20"
                  }`}
                >
                  {restoreMsg.type === "success" ? (
                    <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle size={16} className="mt-0.5 flex-shrink-0" />
                  )}
                  <span className="font-medium break-all">{restoreMsg.text}</span>
                </div>
              )}

              {restoreMsg?.type === "success" && (
                <button
                  type="button"
                  onClick={onActivated}
                  className="mt-3 w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <ShieldCheck size={18} />
                  <span>CONTINUE TO APPLICATION</span>
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-center">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Need help? Contact your software vendor for license support. (0347-9366948)
              </p>
            </div>
          </div>

          {/* Bottom Footer */}
          <div className="mt-4 pt-2 w-full max-w-md mx-auto flex flex-col items-center gap-2 text-xs text-slate-400 dark:text-slate-500 shrink-0">
            <span className="text-center">Software provided by EagleNest Creations (0346-4451505)</span>
            <div className="w-full flex justify-between items-center flex-wrap gap-2">
              <span>Version 1.0.0</span>
              <div className="flex items-center space-x-1.5 shrink-0">
                <ShieldCheck size={14} className="text-blue-500" />
                <span className="whitespace-nowrap">Hardware-Locked Protection</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
