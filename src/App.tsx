import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { invoke } from "./lib/api";
import { useAuth } from "./lib/auth";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import LicenseScreen from "./pages/LicenseScreen";
import ProtectedRoute from "./components/ProtectedRoute";
import CashierDashboard from "./pages/CashierDashboard";
import Dashboard from "./pages/Dashboard";
import MenuManagement from "./pages/MenuManagement";
import SettingsPage from "./pages/Settings";
import POS from "./pages/POS";
import Orders from "./pages/Orders";
import TableManagement from "./pages/TableManagement";
import StaffManagement from "./pages/StaffManagement";
import Customers from "./pages/Customers";
import Expenses from "./pages/Expenses";
import ProcessPayroll from "./pages/payroll/ProcessPayroll";
import PayrollHistory from "./pages/payroll/PayrollHistory";
import AdvanceHistory from "./pages/payroll/AdvanceHistory";
import UserProfile from "./pages/UserProfile";
import Reports from "./pages/Reports";
import DeliveryManagement from "./pages/DeliveryManagement";
import Inventory from "./pages/Inventory";
import './App.css';

interface LicenseStatus {
  valid: boolean;
  hwid: string;
  message: string;
  expiry_date: string | null;
  days_remaining: number | null;
}

function App() {
  const { user, loading: authLoading } = useAuth();
  const [backupWarning, setBackupWarning] = useState<string | null>(null);

  // License gating state
  const [licenseChecking, setLicenseChecking] = useState(true);
  const [licenseValid, setLicenseValid] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [machineHwid, setMachineHwid] = useState("");
  const [hideLicenseWarning, setHideLicenseWarning] = useState(false);

  // Check license on mount
  useEffect(() => {
    async function checkLicense() {
      try {
        const hwid: string = await invoke("get_machine_hwid");
        setMachineHwid(hwid);

        const status: LicenseStatus = await invoke("check_license_status");
        setLicenseStatus(status);
        setLicenseValid(status.valid);
      } catch (err) {
        console.error("License check failed:", err);
        setLicenseValid(false);
      } finally {
        setLicenseChecking(false);
      }
    }
    
    checkLicense();

    // Listen for license updates from Settings page
    const handleLicenseUpdate = () => {
      checkLicense();
    };
    window.addEventListener("licenseUpdated", handleLicenseUpdate);
    return () => window.removeEventListener("licenseUpdated", handleLicenseUpdate);
  }, []);

  useEffect(() => {
    // Only run auto-backup when a valid license is active, an admin is logged
    // in (the backup command is admin-gated server-side), and backup is due.
    if (!licenseValid || !user || user.role !== "Admin") return;

    async function runAutoBackup() {
      try {
        const res = await invoke<string | null>("check_and_run_auto_backup");
        if (res) {
          console.log("Automatic background backup succeeded:", res);
        }
      } catch (err: any) {
        console.error("Automatic background backup failed:", err);
        setBackupWarning(`Automatic backup failed: ${err.toString()}`);
      }
    }
    runAutoBackup();
  }, [licenseValid, user]);

  // Loading spinner while checking license
  if (licenseChecking) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Verifying license...</p>
        </div>
      </div>
    );
  }

  // License is invalid — show the License Screen exclusively
  if (!licenseValid) {
    return (
      <LicenseScreen
        hwid={machineHwid}
        status={licenseStatus}
        onActivated={() => {
          // Re-check license status after activation / restore. Never let a
          // transient HWID query failure strand a successfully activated license.
          setLicenseChecking(true);
          Promise.allSettled([
            invoke<string>("get_machine_hwid"),
            invoke<LicenseStatus>("check_license_status"),
          ]).then(([hwidRes, statusRes]) => {
            if (hwidRes.status === "fulfilled") setMachineHwid(hwidRes.value);
            const status = statusRes.status === "fulfilled" ? statusRes.value : null;
            if (status) {
              setLicenseStatus(status);
              setLicenseValid(status.valid);
            } else {
              setLicenseValid(false);
            }
            setLicenseChecking(false);
          }).catch(() => {
            setLicenseChecking(false);
          });
        }}
      />
    );
  }

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Verifying session...</p>
        </div>
      </div>
    );
  }

  const homePath = user && user.role === "Admin" ? "/admin/dashboard" : "/cashier/dashboard";

  // License is valid — render the full application
  return (
    <Router>
      {backupWarning && (
        <div className="fixed top-4 right-4 z-50 max-w-md bg-amber-500 text-white p-3 rounded-xl shadow-lg flex items-center justify-between text-xs font-semibold">
          <span>⚠️ {backupWarning}</span>
          <button
            onClick={() => setBackupWarning(null)}
            className="ml-3 hover:text-amber-200 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* License expiry warning banner (7 days or less) */}
      {licenseStatus && licenseStatus.days_remaining !== null && licenseStatus.days_remaining <= 7 && !hideLicenseWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg bg-amber-500/95 backdrop-blur-sm text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center justify-between space-x-4 text-xs font-semibold">
          <div className="flex items-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>License expires in {licenseStatus.days_remaining} day{licenseStatus.days_remaining !== 1 ? 's' : ''} ({licenseStatus.expiry_date}). Contact your vendor to renew.</span>
          </div>
          <button 
            onClick={() => setHideLicenseWarning(true)}
            className="hover:text-amber-200 cursor-pointer font-bold shrink-0 p-1"
          >
            ✕
          </button>
        </div>
      )}

      <Routes>
        <Route path="/" element={user ? <Navigate to={homePath} replace /> : <Login />} />
        <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />

        <Route path="/cashier/dashboard" element={<ProtectedRoute><CashierDashboard /></ProtectedRoute>} />
        <Route path="/admin/dashboard" element={<ProtectedRoute adminOnly><Dashboard /></ProtectedRoute>} />
        <Route path="/admin/menu" element={<ProtectedRoute adminOnly><MenuManagement /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute adminOnly><SettingsPage /></ProtectedRoute>} />
        <Route path="/admin/orders" element={<ProtectedRoute adminOnly><Orders /></ProtectedRoute>} />
        <Route path="/admin/tables" element={<ProtectedRoute adminOnly><TableManagement /></ProtectedRoute>} />
        <Route path="/admin/pos/:tableId/:orderId?" element={<ProtectedRoute adminOnly><POS /></ProtectedRoute>} />

        {/* Cashier Routes */}
        <Route path="/cashier/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
        <Route path="/cashier/tables" element={<ProtectedRoute><TableManagement /></ProtectedRoute>} />
        <Route path="/cashier/pos/:tableId/:orderId?" element={<ProtectedRoute><POS /></ProtectedRoute>} />
        <Route path="/cashier/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="/cashier/history" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
        <Route path="/cashier/deliveries" element={<ProtectedRoute><DeliveryManagement /></ProtectedRoute>} />
        <Route path="/admin/history" element={<ProtectedRoute adminOnly><Orders /></ProtectedRoute>} />
        <Route path="/admin/deliveries" element={<ProtectedRoute adminOnly><DeliveryManagement /></ProtectedRoute>} />
        <Route path="/admin/staff" element={<ProtectedRoute adminOnly><StaffManagement /></ProtectedRoute>} />
        <Route path="/admin/customers" element={<ProtectedRoute adminOnly><Customers /></ProtectedRoute>} />
        <Route path="/admin/expenses" element={<ProtectedRoute adminOnly><Expenses /></ProtectedRoute>} />
        <Route path="/admin/inventory" element={<ProtectedRoute adminOnly><Inventory /></ProtectedRoute>} />
        <Route path="/admin/payroll" element={<Navigate to="/admin/payroll/process" replace />} />
        <Route path="/admin/payroll/process" element={<ProtectedRoute adminOnly><ProcessPayroll /></ProtectedRoute>} />
        <Route path="/admin/payroll/history" element={<ProtectedRoute adminOnly><PayrollHistory /></ProtectedRoute>} />
        <Route path="/admin/payroll/advance" element={<ProtectedRoute adminOnly><AdvanceHistory /></ProtectedRoute>} />
        <Route path="/admin/profile" element={<ProtectedRoute adminOnly><UserProfile /></ProtectedRoute>} />
        <Route path="/cashier/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
        <Route path="/admin/reports" element={<ProtectedRoute adminOnly><Reports /></ProtectedRoute>} />
        
        {/* Wildcard catch-all route should usually be at the very bottom */}
        <Route path="*" element={<Navigate to={user ? homePath : "/"} replace />} />
      </Routes>
    </Router>
  );
}

export default App;
