import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import Login from "./pages/Login";
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

function App() {
  const [backupWarning, setBackupWarning] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

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