import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ShieldAlert, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import AdminPasswordModal from "./AdminPasswordModal";

export default function DataMigrationSection() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [oldRestaurantName, setOldRestaurantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const executeSelectFile = async () => {
    setError(null);
    setSuccessMsg(null);
    setOldRestaurantName(null);
    
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
        title: "Select Previous RMS Database Backup File",
      });

      if (selected && typeof selected === "string") {
        setSelectedFile(selected);
        setValidating(true);
        try {
          const name: string = await invoke("validate_backup_file", { filePath: selected });
          setOldRestaurantName(name);
        } catch (valErr: any) {
          setError(valErr.toString());
          setSelectedFile(null);
        } finally {
          setValidating(false);
        }
      }
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res: string = await invoke("import_backup_file", { filePath: selectedFile });
      setSuccessMsg(res);
      setSelectedFile(null);
      setOldRestaurantName(null);
    } catch (err: any) {
      setError(`Import failed: ${err.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-amber-50/40 dark:bg-amber-950/20 rounded-2xl border-2 border-amber-300 dark:border-amber-700/60 p-8 shadow-sm space-y-6">
      <AdminPasswordModal
        isOpen={showPasswordModal}
        title="Admin Authentication Required"
        description="Please enter your admin password to select and import a database backup file."
        onClose={() => setShowPasswordModal(false)}
        onSuccess={() => {
          setShowPasswordModal(false);
          executeSelectFile();
        }}
      />

      <div className="flex items-center gap-3 border-b border-amber-200 dark:border-amber-800/60 pb-4">
        <div className="p-2.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-xl">
          <ShieldAlert size={22} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-amber-950 dark:text-amber-200">Data Migration — Advanced</h2>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            For version upgrades: Import data from a previous database file into this installation.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl text-sm flex items-start gap-3 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span className="font-medium break-all">{error}</span>
        </div>
      )}

      {successMsg ? (
        <div className="p-6 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-lg">Import Successful</h3>
          </div>
          <p className="text-sm font-medium">{successMsg}</p>
          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg text-xs font-bold text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            ⚠️ IMPORTANT: Please close and reopen the app now to reload all application state with your imported data.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!selectedFile ? (
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/40">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Import Previous Data (.db file)</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select an old local.db backup file. A timestamped safety backup of your current database will be saved automatically.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                disabled={validating}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold rounded-xl text-sm flex items-center gap-2 transition-all shrink-0 cursor-pointer shadow-sm"
              >
                <FileSpreadsheet size={16} />
                <span>{validating ? "Validating..." : "Select Database File"}</span>
              </button>
            </div>
          ) : (
            <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Database File Validated
                  </span>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-1 break-all">
                    Path: {selectedFile}
                  </div>
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-1">
                    Detected Restaurant: <span className="font-bold text-blue-600 dark:text-blue-400">{oldRestaurantName}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setOldRestaurantName(null);
                  }}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer"
                >
                  Cancel Selection
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={loading}
                  className="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-amber-600/20"
                >
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                  <span>{loading ? "Importing & Migrating..." : "Confirm & Import Data"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
