import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import Login from "./pages/Login";
import LicenseScreen from "./pages/LicenseScreen";
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
import Payroll from "./pages/Payroll";
import UserProfile from "./pages/UserProfile";
import Reports from "./pages/Reports";
import './App.css';

interface LicenseStatus {
  valid: boolean;
  hwid: string;
  message: string;
  expiry_date: string | null;
  days_remaining: number | null;
}

function App() {
  const [backupWarning, setBackupWarning] = useState<string | null>(null);

  // License gating state
  const [licenseChecking, setLicenseChecking] = useState(true);
  const [licenseValid, setLicenseValid] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [machineHwid, setMachineHwid] = useState("");

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
    // Only run auto-backup if license is valid
    if (!licenseValid) return;

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
  }, [licenseValid]);

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
          // Re-check license status after activation
          setLicenseChecking(true);
          invoke<LicenseStatus>("check_license_status").then((status) => {
            setLicenseStatus(status);
            setLicenseValid(status.valid);
            setLicenseChecking(false);
          }).catch(() => {
            setLicenseChecking(false);
          });
        }}
      />
    );
  }

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

      {/* License expiry warning banner (30 days or less) */}
      {licenseStatus && licenseStatus.days_remaining !== null && licenseStatus.days_remaining <= 30 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg bg-amber-500/95 backdrop-blur-sm text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 text-xs font-semibold">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>License expires in {licenseStatus.days_remaining} day{licenseStatus.days_remaining !== 1 ? 's' : ''} ({licenseStatus.expiry_date}). Contact your vendor to renew.</span>
        </div>
      )}

      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/cashier/dashboard" element={<CashierDashboard />} />
        <Route path="/admin/dashboard" element={<Dashboard />} />
        <Route path="/admin/menu" element={<MenuManagement />} />
        <Route path="/admin/settings" element={<SettingsPage />} />
        <Route path="/admin/orders" element={<Orders />} />
        <Route path="/admin/tables" element={<TableManagement />} />
        <Route path="/admin/pos/:tableId" element={<POS />} />
        <Route path="/admin/pos/:tableId/:orderId" element={<POS />} />

        {/* Cashier Routes */}
        <Route path="/cashier/orders" element={<Orders />} />
        <Route path="/cashier/tables" element={<TableManagement />} />
        <Route path="/cashier/pos/:tableId" element={<POS />} />
        <Route path="/cashier/pos/:tableId/:orderId" element={<POS />} />
        <Route path="/cashier/customers" element={<Customers />} />
        <Route path="/cashier/history" element={<Orders />} />
        <Route path="/admin/history" element={<Orders />} />
        <Route path="/admin/staff" element={<StaffManagement />} />
        <Route path="/admin/customers" element={<Customers />} />
        <Route path="/admin/expenses" element={<Expenses />} />
        <Route path="/admin/payroll" element={<Payroll />} />
        <Route path="/admin/profile" element={<UserProfile />} />
        <Route path="/admin/reports" element={<Reports />} />
        
        {/* Wildcard catch-all route should usually be at the very bottom */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;