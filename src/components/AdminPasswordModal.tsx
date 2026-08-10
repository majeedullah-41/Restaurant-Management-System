import { useState } from "react";
import { invoke } from "../lib/api";
import { Lock, AlertCircle, X, Check } from "lucide-react";

interface AdminPasswordModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onSuccess: () => void;
  verifyCommand?: string;
  confirmLabel?: string;
  accentColor?: "amber" | "red";
}

export default function AdminPasswordModal({
  isOpen,
  title,
  description,
  onClose,
  onSuccess,
  verifyCommand = "verify_admin_password",
  confirmLabel = "Verify & Proceed",
  accentColor = "amber",
}: AdminPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const verified = await invoke<boolean>(verifyCommand, { password });
      if (!verified) {
        throw new Error("Incorrect password");
      }
      setPassword("");
      setError(null);
      setLoading(false);
      onSuccess();
    } catch (err: any) {
      setError(err.toString() || "Incorrect Admin Password");
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword("");
    setError(null);
    onClose();
  };

  const isRed = accentColor === "red";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isRed ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'}`}>
              <Lock size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
              Admin Password
            </label>
            <input
              type="password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className={`w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-slate-900 dark:text-white focus:outline-none focus:ring-1 text-sm font-medium ${isRed ? 'focus:border-red-500 focus:ring-red-500' : 'focus:border-amber-500 focus:ring-amber-500'}`}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password.trim()}
              className={`px-5 py-2.5 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center gap-2 transition-all cursor-pointer shadow-md ${isRed ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'}`}
            >
              <Check size={16} />
              <span>{loading ? "Verifying..." : confirmLabel}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
