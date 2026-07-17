import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
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
import Attendance from "./pages/Attendance";
import Payroll from "./pages/Payroll";
import UserProfile from "./pages/UserProfile";
import Reports from "./pages/Reports";
import './App.css';

function App() {
  return (
    <Router>
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
        <Route path="/admin/attendance" element={<Attendance />} />
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