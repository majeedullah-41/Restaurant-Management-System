import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Lock, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function ChangePassword() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage({ text: "", type: "" });

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (!currentPassword) {
      setError("Current password is required.");
      return;
    }

    try {
      setLoading(true);
      await invoke("update_user_profile", {
        oldUsername: user?.username ?? "",
        newUsername: user?.username ?? "",
        currentPassword,
        newPassword,
        adminOverride: false,
        displayName: null,
        newRole: null,
      });

      setMessage({ text: "Password updated successfully!", type: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      await refresh();
      const dest = user?.role === "Admin" ? "/admin/dashboard" : "/cashier/dashboard";
      setTimeout(() => navigate(dest, { replace: true }), 800);
    } catch (err: any) {
      setError(err?.toString() || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 transition-colors">
      <div className="w-full max-w-md bg-white dark:bg-[#0B1120] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
            <ShieldCheck size={32} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Change Your Password</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              For security, you must set a new password before using {`"`}password{`"`} as your password.
            </p>
          </div>
        </div>

        {message.text && (
          <div className={`p-3.5 rounded-xl border text-sm font-semibold flex items-center gap-2 ${
            message.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
              : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20"
          }`}>
            {message.type === "success" ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm font-semibold flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="text-slate-700 dark:text-slate-300 font-semibold">Current Password</Label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                id="currentPassword"
                type="password"
                placeholder="Enter current password"
                className="pl-10 h-11 bg-slate-50 dark:bg-[#0B1120] border-slate-200 dark:border-slate-800 rounded-xl"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-slate-700 dark:text-slate-300 font-semibold">New Password</Label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                id="newPassword"
                type="password"
                placeholder="At least 6 characters"
                className="pl-10 h-11 bg-slate-50 dark:bg-[#0B1120] border-slate-200 dark:border-slate-800 rounded-xl"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-slate-700 dark:text-slate-300 font-semibold">Confirm New Password</Label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter new password"
                className="pl-10 h-11 bg-slate-50 dark:bg-[#0B1120] border-slate-200 dark:border-slate-800 rounded-xl"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/25 mt-2"
          >
            {loading ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
