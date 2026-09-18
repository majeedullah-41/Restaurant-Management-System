import { useState, useEffect } from 'react';
import { invoke } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import SecuritySettingsSection from '../components/SecuritySettingsSection';
import { User, Lock, Mail, Shield, CheckCircle2, AlertCircle, BadgeCheck, Users } from 'lucide-react';

interface ManagedUser {
  id: number;
  username: string;
  role: string;
  display_name: string | null;
}

export default function UserProfile() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const userRole = user?.role || "Unknown";
  const isAdmin = userRole === "Admin";

  const [currentUsername, setCurrentUsername] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState({ text: "", type: "" });
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const [targetRole, setTargetRole] = useState("");

  // Admin "manage another user" support
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [managingUser, setManagingUser] = useState<string>("");
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setCurrentUsername(user.username);
    setNewUsername(user.username);
    setTargetRole(user.role);
    setDisplayName(user.display_name || "");
  }, [user]);

  // Admins can load the full user list to explicitly pick who to manage.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const loadUsers = async () => {
      setUsersLoading(true);
      try {
        const data = await invoke<ManagedUser[]>("get_users");
        if (!cancelled) setUsers(data);
      } catch (e) {
        console.error("Failed to load users:", e);
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    };
    loadUsers();
    return () => { cancelled = true; };
  }, [isAdmin]);

  // When an admin selects a user from the dropdown, load their details.
  useEffect(() => {
    if (!isAdmin) return;
    if (!managingUser) {
      setNewUsername(currentUsername);
      setTargetRole(userRole);
      setDisplayName(user?.display_name || "");
      return;
    }
    const target = users.find(u => u.username === managingUser);
    if (target) {
      setNewUsername(target.username);
      setTargetRole(target.role);
      setDisplayName(target.display_name || "");
    }
  }, [managingUser, users, isAdmin]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ text: "", type: "" });

    if (!newUsername.trim()) {
      setMessage({ text: "Username cannot be empty.", type: "error" });
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ text: "New password and confirm password do not match.", type: "error" });
      return;
    }

    if (newPassword && newPassword.length < 6) {
      setMessage({ text: "Password must be at least 6 characters long.", type: "error" });
      return;
    }

    const isManagingOther = Boolean(isAdmin && managingUser && managingUser !== currentUsername);

    if (newPassword && !currentPassword && !isManagingOther) {
      setMessage({ text: "Current password is required to set a new password.", type: "error" });
      return;
    }

    try {
      setLoading(true);
      await invoke("update_user_profile", {
        oldUsername: isManagingOther ? managingUser : currentUsername,
        newUsername: newUsername,
        currentPassword: currentPassword ? currentPassword : null,
        newPassword: newPassword ? newPassword : null,
        adminOverride: isManagingOther,
        displayName: displayName || null,
        newRole: isAdmin ? targetRole : null,
      });

      if (!isManagingOther && newUsername !== currentUsername) {
        localStorage.setItem("userName", newUsername);
        localStorage.setItem("username", newUsername);
        setCurrentUsername(newUsername);
      }

      // Refresh the user list so the dropdown reflects the latest state.
      if (isAdmin) {
        try {
          const data = await invoke<ManagedUser[]>("get_users");
          setUsers(data);
          if (isManagingOther) setManagingUser(newUsername);
        } catch { /* ignore refresh failures */ }
      }

      try {
        await refresh();
        toast.success("Profile updated successfully!");
      } catch (refreshErr) {
        console.error("Profile updated, but session refresh failed:", refreshErr);
        toast.warning("Profile updated, but the session could not be refreshed. Sign out and back in if the changes do not take effect.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

    } catch (error: any) {
      toast.error(error.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="profile" />
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors min-w-0">
        <Header title="User Profile" subtitle="Manage your account settings and security preferences." />

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto custom-scrollbar">
          <div className="max-w-4xl mx-auto">

            {message.text && (
              <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 border ${
                message.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                  : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20'
              }`}>
                {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                <p className="font-medium text-sm">{message.text}</p>
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-6">

              {/* Manage User (Admin only) */}
              {isAdmin && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg">
                        <Users size={20} />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Manage User</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Select a user to update their profile, role or password.</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="max-w-md">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">User</label>
                      <select
                        value={managingUser}
                        onChange={(e) => setManagingUser(e.target.value)}
                        disabled={usersLoading}
                        className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <option value="">{usersLoading ? "Loading users..." : `My account (${currentUsername})`}</option>
                        {users.map(u => (
                          <option key={u.id} value={u.username} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800">
                            {u.username} — {u.role}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                        Select another user to edit their account. Your own account is edited by default.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Account Information Section */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg">
                      <User size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Account Information</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {managingUser ? `Editing account: ${managingUser}` : "Update your primary email address and username."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="max-w-md">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Email Address / Username</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail size={16} className="text-slate-400" />
                      </div>
                      <input
                        type="email"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <div className="max-w-md">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Role</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Shield size={16} className="text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={targetRole || userRole}
                        className="w-full h-11 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                        disabled
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      Your role determines your permissions within the system. Roles cannot be changed here.
                    </p>
                  </div>

                  <div className="max-w-md">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Display Name</label>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">This name will appear on printed receipts & salary slips as the Cashier/Admin name.</p>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <BadgeCheck size={16} className="text-slate-400" />
                      </div>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. Ali Khan"
                        className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-2.5 rounded-xl font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center min-w-[140px]"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Security Section */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-lg">
                      <Lock size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Security Settings</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {managingUser ? `Set a new password for ${managingUser} (no current password required).` : "Change your password to keep your account secure."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="max-w-md">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={isAdmin && managingUser && managingUser !== currentUsername ? "Not required for Admin override" : "••••••••"}
                      disabled={isAdmin && managingUser && managingUser !== currentUsername ? true : false}
                      className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50"
                    />
                  </div>

                  <div className="max-w-md">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    />
                  </div>

                  <div className="max-w-md">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Confirm New Password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (managingUser) {
                      setManagingUser("");
                      setNewUsername(currentUsername);
                      setTargetRole(userRole);
                      setDisplayName(user?.display_name || "");
                    } else {
                      setNewUsername(currentUsername);
                      setDisplayName(user?.display_name || "");
                    }
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setMessage({text: "", type: ""});
                  }}
                  className="px-6 py-2.5 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Discard Changes
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center min-w-[140px]"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : "Save Changes"}
                </button>
              </div>

            </form>

            <div className="mt-8">
              <SecuritySettingsSection />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
