import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Database, FolderOpen, RefreshCw, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import AdminPasswordModal from "./AdminPasswordModal";

export default function BackupSection() {
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<string>("Off");
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    loadBackupSettings();
  }, []);

  const loadBackupSettings = async () => {
    try {
      const data: any = await invoke("get_backup_settings");
      setLastBackupAt(data.last_backup_at || null);
      setFrequency(data.backup_frequency || "Off");
      setBackupPath(data.backup_path || null);
    } catch (err) {
      console.error("Failed to load backup settings", err);
    }
  };

  const handleFrequencyChange = async (newFreq: string) => {
    setFrequency(newFreq);
    try {
      await invoke("update_backup_settings", { frequency: newFreq, path: backupPath });
      setMessage({ text: "Backup frequency updated", type: "success" });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.toString(), type: "error" });
    }
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Backup Destination Folder",
      });
      if (selected && typeof selected === "string") {
        setBackupPath(selected);
        await invoke("update_backup_settings", { frequency, path: selected });
        setMessage({ text: "Backup folder location saved", type: "success" });
        setTimeout(() => setMessage(null), 3000);
        return selected;
      }
    } catch (err: any) {
      setMessage({ text: err.toString(), type: "error" });
    }
    return null;
  };

  const executeBackupNow = async () => {
    setLoading(true);
    setMessage(null);
    try {
      let targetPath = backupPath;
      if (!targetPath) {
        targetPath = await handleSelectFolder();
        if (!targetPath) {
          setLoading(false);
          return;
        }
      }

      const res: string = await invoke("perform_backup", { destination: targetPath });
      setMessage({ text: `Backup completed successfully! Saved to: ${res}`, type: "success" });
      await loadBackupSettings();
    } catch (err: any) {
      console.error("Backup failed:", err);
      setMessage({ text: `Backup failed: ${err.toString()}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return { relative: "Never", exact: "No backups recorded yet" };
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return { relative: dateStr, exact: dateStr };

    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let relative = "";
    if (diffInSeconds < 60) relative = "Just now";
    else if (diffInSeconds < 3600) {
      const m = Math.floor(diffInSeconds / 60);
      relative = `${m} ${m === 1 ? "minute" : "minutes"} ago`;
    } else if (diffInSeconds < 86400) {
      const h = Math.floor(diffInSeconds / 3600);
      relative = `${h} ${h === 1 ? "hour" : "hours"} ago`;
    } else {
      const d = Math.floor(diffInSeconds / 86400);
      if (d === 1) relative = "Yesterday";
      else relative = `${d} days ago`;
    }

    return { relative, exact: date.toLocaleString() };
  };

  const timeInfo = formatRelativeTime(lastBackupAt);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm space-y-6">
      <AdminPasswordModal
        isOpen={showPasswordModal}
        title="Admin Authentication Required"
        description="Please enter your admin password to perform a database backup."
        onClose={() => setShowPasswordModal(false)}
        onSuccess={() => {
          setShowPasswordModal(false);
          executeBackupNow();
        }}
      />

      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
            <Database size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Backup & Data Preservation</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Configure routine database backups and manual snapshots</p>
          </div>
        </div>
        
        <button
          type="button"
          onClick={() => setShowPasswordModal(true)}
          disabled={loading}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-xl text-sm flex items-center gap-2 transition-all shadow-md shadow-blue-600/20 cursor-pointer"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          <span>{loading ? "Backing up..." : "Backup Now"}</span>
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-sm flex items-start gap-3 border ${
            message.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
              : "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
          )}
          <span className="font-medium break-all">{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Last Backup Status
            </span>
            <Clock size={16} className="text-slate-400" />
          </div>
          <div>
            <div
              className="text-lg font-bold text-slate-900 dark:text-white cursor-help inline-block"
              title={timeInfo.exact}
            >
              {timeInfo.relative}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate" title={timeInfo.exact}>
              Exact: {timeInfo.exact}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 block">
            Automatic Backup Schedule
          </label>
          <select
            value={frequency}
            onChange={(e) => handleFrequencyChange(e.target.value)}
            className="w-full h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="Off">Disabled (Off)</option>
            <option value="Daily">Daily (Every 24 hours)</option>
            <option value="Weekly">Weekly (Every 7 days)</option>
          </select>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <FolderOpen size={20} className="text-slate-400 shrink-0" />
          <div className="overflow-hidden">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Destination Folder
            </div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-200 truncate" title={backupPath || "None"}>
              {backupPath || "No folder configured (will prompt on backup)"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSelectFolder}
          className="px-3.5 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors shrink-0 cursor-pointer"
        >
          {backupPath ? "Change Folder" : "Set Folder"}
        </button>
      </div>
    </div>
  );
}
