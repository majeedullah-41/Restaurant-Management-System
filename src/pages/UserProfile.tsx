import { useState, useEffect } from 'react';
import { invoke } from '../lib/api';
import { useAuth } from '../lib/auth';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import SecuritySettingsSection from '../components/SecuritySettingsSection';
import { User, Lock, Mail, Shield, CheckCircle2, AlertCircle, BadgeCheck } from 'lucide-react';

export default function UserProfile() {
  const { user, refresh } = useAuth();
  const userRole = user?.role || "Unknown";
  const [currentUsername, setCurrentUsername] = useState("");
  
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [message, setMessage] = useState({ text: "", type: "" });
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");

  const [targetRole, setTargetRole] = useState("");

  useEffect(() => {
    if (!user) return;
    setCurrentUsername(user.username);
    setNewUsername(user.username);
    setTargetRole(user.role);
    setDisplayName(user.display_name || "");
  }, [user]);

  useEffect(() => {
    if (userRole === "Admin" && newUsername && newUsername !== currentUsername) {
      const checkUser = async () => {
        try {
          const role = await invoke("get_user_role_by_username", { username: newUsername });
          setTargetRole(role as string);
        } catch (e) {
          setTargetRole("");
        }
      };
      
      const timer = setTimeout(checkUser, 500);
      return () => clearTimeout(timer);
    } else if (newUsername === currentUsername) {
      setTargetRole(userRole);
    } else {
      setTargetRole("");
    }
  }, [newUsername, currentUsername, userRole]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage({ text: "", type: "" });
    
    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ text: "New password and confirm password do not match.", type: "error" });
      return;
    }
    
    const isTargetingOther = Boolean(userRole === "Admin" && targetRole && newUsername !== currentUsername);

    if (newPassword && !currentPassword && !isTargetingOther) {
      setMessage({ text: "Current password is required to set a new password.", type: "error" });
      return;
    }

    try {
      setLoading(true);
      await invoke("update_user_profile", {
        oldUsername: isTargetingOther ? newUsername : currentUsername,
        newUsername: newUsername,
        currentPassword: currentPassword ? currentPassword : null,
        newPassword: newPassword ? newPassword : null,
        adminOverride: isTargetingOther,
        displayName: displayName || null,
        newRole: userRole === "Admin" ? targetRole : null,
      });
      
      setMessage({ text: "Profile updated successfully!", type: "success" });
      
      // Update local storage and current state if username changed
      if (!isTargetingOther && newUsername !== currentUsername) {
        localStorage.setItem("userName", newUsername);
        localStorage.setItem("username", newUsername); // set both for compatibility
        setCurrentUsername(newUsername);
      }
      await refresh();
      
      // Clear password fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      
    } catch (error: any) {
      setMessage({ text: error.toString(), type: "error" });
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
              
              {/* Account Information Section */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg">
                      <User size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Account Information</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Update your primary email address and username.</p>
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
                      {userRole === "Admin" ? (
                        <select
                          value={targetRole || userRole}
                          onChange={(e) => setTargetRole(e.target.value)}
                          className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer"
                        >
                          <option value="Admin">Admin</option>
                          <option value="Cashier">Cashier</option>
                        </select>
                      ) : (
                        <input 
                          type="text" 
                          value={targetRole || userRole}
                          className="w-full h-11 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                          disabled
                        />
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      Your role determines your permissions within the system. {userRole !== "Admin" && "Roles cannot be changed here."}
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
                      <p className="text-sm text-slate-500 dark:text-slate-400">Change your password to keep your account secure.</p>
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
                      placeholder={userRole === "Admin" && targetRole && newUsername !== currentUsername ? "Not required for Admin override" : "••••••••"}
                      disabled={userRole === "Admin" && targetRole && newUsername !== currentUsername ? true : false}
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
                    setNewUsername(currentUsername);
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
