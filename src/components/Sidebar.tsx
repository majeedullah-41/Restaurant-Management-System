import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "../lib/api";
import { useAuth } from "../lib/auth";
import { 
  LayoutDashboard, MenuSquare, ClipboardList, Table2, Users, 
  UserSquare2, CalendarClock, Receipt, BarChart3, 
  Settings, LogOut, ShoppingCart, Truck, Package
} from "lucide-react";

export default function Sidebar({ activePage }: { activePage: string }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const role = user?.role || "Admin";

  const [restaurantName, setRestaurantName] = useState("RESTAURANT");
  const [restaurantLogo, setRestaurantLogo] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const loadName = async () => {
      try {
        const settings: any = await invoke("get_settings");
        setRestaurantName(settings.restaurant_name.toUpperCase());
        setRestaurantLogo(settings.logo_path || null);
      } catch (e) {}
    };
    loadName();

    const handleSettingsUpdated = () => loadName();
    window.addEventListener("settingsUpdated", handleSettingsUpdated);
    
    // Restore scroll position
    const savedScroll = sessionStorage.getItem("sidebarScroll");
    if (savedScroll && navRef.current) {
      navRef.current.scrollTop = parseInt(savedScroll, 10);
    }
    
    const handleToggleSidebar = () => setIsOpen(prev => !prev);
    window.addEventListener('toggleMobileSidebar', handleToggleSidebar);
    
    return () => {
      window.removeEventListener("settingsUpdated", handleSettingsUpdated);
      window.removeEventListener('toggleMobileSidebar', handleToggleSidebar);
    };
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    sessionStorage.setItem("sidebarScroll", e.currentTarget.scrollTop.toString());
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/80 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      <aside className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-white dark:bg-[#0B1120] border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="min-h-[5rem] py-4 flex items-center px-6 border-b border-slate-200 dark:border-slate-800">
        {restaurantLogo && (
          <div className="h-10 w-10 shrink-0 bg-white rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden mr-3">
            <img src={restaurantLogo} alt="Logo" className="h-full w-full object-contain p-0.5" />
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-base font-bold text-slate-900 dark:text-white tracking-wide leading-tight line-clamp-2" title={restaurantName}>{restaurantName}</span>
          <span className="text-[10px] text-blue-600 dark:text-blue-500 font-semibold tracking-widest truncate mt-0.5">MANAGEMENT SYSTEM</span>
        </div>
      </div>

      <div className="flex items-center mt-6 px-3">
        <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-500 font-bold mr-3 shadow-inner">
          {role === "Admin" ? "AD" : "CA"}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{role === "Admin" ? "Admin User" : role}</h3>
          <p className="text-xs text-emerald-500 font-medium">Online</p>
        </div>
      </div>
      
      {/* Centralized Navigation */}
      <nav 
        ref={navRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar"
      >
        {role === "Cashier" ? (
          <>
            <NavItem icon={<LayoutDashboard size={20} />} label="Cashier Dashboard" active={activePage === "cashier_dashboard"} onClick={() => navigate('/cashier/dashboard')} />
            <NavItem icon={<ShoppingCart size={20} />} label="POS / New Order" active={activePage === "pos"} onClick={() => navigate('/cashier/pos/0')} />
            <NavItem icon={<ClipboardList size={20} />} label="Orders" active={activePage === "orders"} onClick={() => navigate('/cashier/orders')} />
            <NavItem icon={<Truck size={20} />} label="Deliveries" active={activePage === "deliveries"} onClick={() => navigate('/cashier/deliveries')} />
            <NavItem icon={<Users size={20} />} label="Customers" active={activePage === "customers"} onClick={() => navigate('/cashier/customers')} />
            <NavItem icon={<CalendarClock size={20} />} label="Order History" active={activePage === "history"} onClick={() => navigate('/cashier/history')} />
            <NavItem icon={<Table2 size={20} />} label="Table Reservation" active={activePage === "tables"} onClick={() => navigate('/cashier/tables')} />
          </>
        ) : (
          <>
            <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" active={activePage === "dashboard"} onClick={() => navigate('/admin/dashboard')} />
            <NavItem icon={<ShoppingCart size={20} />} label="POS / New Order" active={activePage === "pos"} onClick={() => navigate('/admin/pos/0')} />
            <NavItem icon={<MenuSquare size={20} />} label="Menu Management" active={activePage === "menu"} onClick={() => navigate('/admin/menu')} />
            <NavItem icon={<ClipboardList size={20} />} label="Orders" active={activePage === "orders"} onClick={() => navigate('/admin/orders')} />
            <NavItem icon={<Truck size={20} />} label="Deliveries" active={activePage === "deliveries"} onClick={() => navigate('/admin/deliveries')} />
            <NavItem icon={<CalendarClock size={20} />} label="Order History" active={activePage === "history"} onClick={() => navigate('/admin/history')} />
            <NavItem icon={<Table2 size={20} />} label="Table Management" active={activePage === "tables"} onClick={() => navigate('/admin/tables')} />
            <NavItem icon={<Users size={20} />} label="Customers" active={activePage === "customers"} onClick={() => navigate('/admin/customers')} />
            <NavItem icon={<UserSquare2 size={20} />} label="Staff Management" active={activePage === "staff"} onClick={() => navigate('/admin/staff')} />
            
            <NavGroup 
              icon={<Receipt size={20} />} 
              label="Payroll" 
              isActive={activePage.startsWith("payroll")}
              defaultExpanded={activePage.startsWith("payroll")}
            >
              <NavItem label="Process Payroll" active={activePage === "payroll_process"} onClick={() => navigate('/admin/payroll/process')} isSubItem />
              <NavItem label="Payroll History" active={activePage === "payroll_history"} onClick={() => navigate('/admin/payroll/history')} isSubItem />
              <NavItem label="Advance History" active={activePage === "payroll_advance"} onClick={() => navigate('/admin/payroll/advance')} isSubItem />
            </NavGroup>

            <NavItem icon={<Receipt size={20} />} label="Expenses" active={activePage === "expenses"} onClick={() => navigate('/admin/expenses')} />
            <NavItem icon={<Package size={20} />} label="Inventory" active={activePage === "inventory"} onClick={() => navigate('/admin/inventory')} />
            <NavItem icon={<BarChart3 size={20} />} label="Reports" active={activePage === "reports"} onClick={() => navigate('/admin/reports')} />
            <NavItem icon={<Settings size={20} />} label="Settings" active={activePage === "settings"} onClick={() => navigate('/admin/settings')} />
            <NavItem icon={<UserSquare2 size={20} />} label="User Profile" active={activePage === "profile"} onClick={() => navigate('/admin/profile')} />
          </>
        )}
      </nav>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <button onClick={async () => { await logout(); navigate('/', { replace: true }); }} className="flex items-center space-x-3 text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 w-full px-3 py-2 rounded-lg transition-colors">
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
    </>
  );
}

// Helper components
import { ChevronDown, ChevronRight } from "lucide-react";

function NavGroup({ icon, label, isActive, defaultExpanded, children }: { icon: React.ReactNode, label: string, isActive: boolean, defaultExpanded: boolean, children: React.ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  useEffect(() => {
    if (isActive) setIsExpanded(true);
  }, [isActive]);

  return (
    <div className="space-y-1">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${
          isActive && !isExpanded
          ? "bg-blue-50/50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 font-semibold"
          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 font-medium"
        }`}
      >
        <div className="flex items-center space-x-3">
          {icon}
          <span className="text-sm">{label}</span>
        </div>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {isExpanded && (
        <div className="pl-4 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

function NavItem({ icon, label, active = false, isSubItem = false, onClick }: { icon?: React.ReactNode, label: string, active?: boolean, isSubItem?: boolean, onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all ${
        active 
        ? isSubItem 
          ? "bg-slate-100/80 dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border-l-2 border-blue-600" 
          : "bg-blue-600 text-white shadow-md shadow-blue-600/20" 
        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200"
      }`}
    >
      {icon}
      <span className={`font-medium text-sm ${isSubItem && active ? "font-semibold" : ""}`}>{label}</span>
    </button>
  );
}
