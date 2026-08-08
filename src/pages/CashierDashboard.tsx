import { useState, useEffect } from 'react';
import { invoke } from '../lib/api';
import { formatCurrency, todayLocal } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, ShoppingBag, PieChart, 
  Clock, Banknote, Plus, List, CalendarDays, Search
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { AlertModal } from '../components/AlertModal';

interface CashierStats {
  todays_sales: number;
  total_orders: number;
  completed_orders: number;
  pending_orders: number;
  avg_order_value: number;
  total_tax: number;
}

interface TodaySale {
  id: string;
  table: string;
  customer: string;
  time: string;
  amount: number;
  status: string;
}

interface DetailedTableStatus {
  id: number;
  table_id: number;
  table_number: number;
  status: string;
  active_order_id: number | null;
  active_order_total: number | null;
  elapsed_minutes: number | null;
  category_name: string | null;
}

interface StaffDropdown {
  id: number;
  name: string;
  role: string | null;
  category_id: number | null;
  category_name: string | null;
}

interface StaffCategory {
  id: number;
  name: string;
}

export default function CashierDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<CashierStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<TodaySale[]>([]);
  const [tables, setTables] = useState<DetailedTableStatus[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showClockModal, setShowClockModal] = useState(false);
  const [clockCategoryId, setClockCategoryId] = useState<number | "">("");
  const [clockStaffId, setClockStaffId] = useState<number | "">("");
  
  const [staff, setStaff] = useState<StaffDropdown[]>([]);
  const [categories, setCategories] = useState<StaffCategory[]>([]);

  const [alertModal, setAlertModal] = useState<{ title: string; message: string; type: 'danger' | 'warning' | 'info' | 'success' } | null>(null);

  const loadData = async () => {
    try {
      await invoke("init_tables_if_needed");
      
      const clientDate = todayLocal();
      
      const _stats = await invoke<CashierStats>("get_cashier_dashboard_stats", { clientDate });
      setStats(_stats);

      const _sales = await invoke<TodaySale[]>("get_todays_sales", { clientDate });
      setRecentOrders(_sales);

      const _tables = await invoke<DetailedTableStatus[]>("get_detailed_table_statuses");
      setTables(_tables);

      const _staff = await invoke<StaffDropdown[]>("get_staff_dropdown");
      setStaff(_staff);

      const _categories = await invoke<StaffCategory[]>("get_staff_categories");
      setCategories(_categories);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000); // 15 seconds for live tables
    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleClockInOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clockStaffId) {
      setAlertModal({ title: "No Staff Selected", message: "Please select a staff member.", type: "warning" });
      return;
    }
    try {
      const msg = await invoke<string>("clock_in_out", { staffId: Number(clockStaffId) });
      setAlertModal({ title: "Success", message: msg, type: "success" });
      setShowClockModal(false);
      setClockStaffId("");
      setClockCategoryId("");
    } catch (err) {
      console.error(err);
      setAlertModal({ title: "Clock In/Out Failed", message: String(err), type: "danger" });
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTableColor = (status: string) => {
    switch (status) {
      case 'Available': return 'border-emerald-900/50 bg-emerald-950/20 text-emerald-500 hover:border-emerald-500/50';
      case 'Occupied': return 'border-red-900/50 bg-red-950/20 text-red-500 hover:border-red-500/50';
      case 'Reserved': return 'border-orange-900/50 bg-orange-950/20 text-orange-500 hover:border-orange-500/50';
      case 'Cleaning': return 'border-blue-900/50 bg-blue-950/20 text-blue-500 hover:border-blue-500/50';
      case 'Maintenance': return 'border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-500';
      default: return 'border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-500';
    }
  };

  const getTableDot = (status: string) => {
    switch (status) {
      case 'Available': return 'bg-emerald-500';
      case 'Occupied': return 'bg-red-500';
      case 'Reserved': return 'bg-orange-500';
      case 'Cleaning': return 'bg-blue-500';
      case 'Maintenance': return 'bg-slate-500';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 font-sans overflow-hidden">
      <Sidebar activePage="cashier_dashboard" />

      <main className="flex-1 flex flex-col z-10 overflow-hidden relative min-w-0">
        {/* Header */}
        <Header title="Cashier Dashboard" subtitle="Welcome back, Cashier!">
          <button onClick={() => setShowClockModal(true)} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors border border-blue-500/20">
            <Clock size={16} />
            <span>Clock In/Out</span>
          </button>
        </Header>

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto flex gap-6 custom-scrollbar">
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col space-y-6">
            
            {/* Top Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <TrendingUp size={16} />
                  </div>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Today's Sales</h3>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{formatCurrency((stats?.todays_sales || 0))}</p>
                <p className="text-xs text-slate-500">Orders: {stats?.completed_orders || 0}</p>
              </div>

              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                    <ShoppingBag size={16} />
                  </div>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Today's Orders</h3>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{stats?.total_orders || 0}</p>
                <div className="flex text-xs space-x-2">
                  <span className="text-emerald-500">Completed: {stats?.completed_orders || 0}</span>
                  <span className="text-slate-500">Pending: {stats?.pending_orders || 0}</span>
                </div>
              </div>

              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                    <PieChart size={16} />
                  </div>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Average Order Value</h3>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{formatCurrency((stats?.avg_order_value || 0))}</p>
                <p className="text-xs text-slate-500">Based on {stats?.completed_orders || 0} completed orders</p>
              </div>
            </div>

            {/* Restaurant Tables Area */}
            <div className="flex-1 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center space-x-6">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Restaurant Tables</h2>
                  <div className="flex items-center space-x-4 text-xs font-medium">
                    <div className="flex items-center space-x-2"><span className="w-2 h-2 rounded-sm bg-emerald-500"></span><span className="text-slate-500 dark:text-slate-400">Vacant</span></div>
                    <div className="flex items-center space-x-2"><span className="w-2 h-2 rounded-sm bg-red-500"></span><span className="text-slate-500 dark:text-slate-400">Occupied</span></div>
                    <div className="flex items-center space-x-2"><span className="w-2 h-2 rounded-sm bg-orange-500"></span><span className="text-slate-500 dark:text-slate-400">Reserved</span></div>
                    <div className="flex items-center space-x-2"><span className="w-2 h-2 rounded-sm bg-blue-500"></span><span className="text-slate-500 dark:text-slate-400">Cleaning</span></div>
                  </div>
                </div>

              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                {loading ? (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading tables...</div>
                ) : (
                  <div className="grid grid-cols-5 gap-4">
                    {tables.map(table => (
                      <button 
                        key={table.id}
                        onClick={() => {
                          if (table.status === 'Maintenance' || table.status === 'Reserved') {
                            setAlertModal({ title: "Table Unavailable", message: `Cannot open order: Table is marked as ${table.status} by admin.`, type: "warning" });
                            return;
                          }
                          navigate(`/cashier/pos/${table.table_id}`);
                        }}
                        className={`relative border rounded-xl p-4 flex flex-col justify-center items-center h-28 transition-all hover:-translate-y-1 group ${getTableColor(table.status)} ${(table.status === 'Maintenance' || table.status === 'Reserved') ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {/* Table "Chairs" Decoration (top/bottom) */}
                        <div className="absolute top-1 flex space-x-2">
                          <div className={`w-3 h-1 rounded-full opacity-30 ${getTableDot(table.status)}`}></div>
                          <div className={`w-3 h-1 rounded-full opacity-30 ${getTableDot(table.status)}`}></div>
                        </div>
                        <div className="absolute bottom-1 flex space-x-2">
                          <div className={`w-3 h-1 rounded-full opacity-30 ${getTableDot(table.status)}`}></div>
                          <div className={`w-3 h-1 rounded-full opacity-30 ${getTableDot(table.status)}`}></div>
                        </div>
                        {/* Table "Chairs" Decoration (left/right) */}
                        <div className="absolute left-1 flex flex-col space-y-2">
                          <div className={`w-1 h-3 rounded-full opacity-30 ${getTableDot(table.status)}`}></div>
                          <div className={`w-1 h-3 rounded-full opacity-30 ${getTableDot(table.status)}`}></div>
                        </div>
                        <div className="absolute right-1 flex flex-col space-y-2">
                          <div className={`w-1 h-3 rounded-full opacity-30 ${getTableDot(table.status)}`}></div>
                          <div className={`w-1 h-3 rounded-full opacity-30 ${getTableDot(table.status)}`}></div>
                        </div>

                        <div className="flex items-center justify-center space-x-2 mb-1 z-10">
                          <div className={`w-2 h-2 rounded-full ${getTableDot(table.status)}`}></div>
                          <span className="text-xl font-bold tracking-wider">
                            {table.table_number.toString().padStart(2, '0')}
                          </span>
                        </div>
                        
                          <div className="z-10 flex flex-col items-center">
                            <span className="text-xs font-medium uppercase tracking-wider mb-0.5 opacity-90">
                              {table.status === 'Available' ? 'Vacant' : table.status}
                            </span>
                            {table.category_name && (
                              <span className="text-[9px] font-medium text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full mb-0.5">
                                {table.category_name}
                              </span>
                            )}
                            <span className="text-xs font-bold opacity-100">
                              {formatCurrency((table.active_order_total || 0))}
                            </span>
                          {table.status === 'Occupied' && (
                            <div className="flex items-center space-x-1 mt-1 opacity-70 text-[9px]">
                              <Clock size={9} />
                              <span>{table.elapsed_minutes || 0} min</span>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-72 flex flex-col space-y-6 shrink-0">
            
            {/* Today's Summary */}
            <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Today's Summary</h2>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center"><Banknote size={12} className="mr-2 text-green-500"/> Total Sales</span>
                  <span className="text-slate-900 dark:text-white font-medium">{formatCurrency((stats?.todays_sales || 0))}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center"><ShoppingBag size={12} className="mr-2 text-blue-500"/> Total Orders</span>
                  <span className="text-slate-900 dark:text-white font-medium">{stats?.total_orders || 0}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2"></div> Completed Orders</span>
                  <span className="text-slate-900 dark:text-white font-medium">{stats?.completed_orders || 0}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-2"></div> Pending Orders</span>
                  <span className="text-slate-900 dark:text-white font-medium">{stats?.pending_orders || 0}</span>
                </div>
              </div>
            </div>

            {/* Recent Orders */}
            <div className="flex-1 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col overflow-hidden min-h-[200px]">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent Orders</h2>
                <a href="/cashier/orders" className="text-[10px] text-blue-500 hover:text-blue-400">View All</a>
              </div>
              <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                {recentOrders.length === 0 ? (
                  <div className="text-center text-slate-500 text-xs mt-4">No orders today.</div>
                ) : (
                  recentOrders.map(order => {
                    const parsedOrderId = parseInt(order.id.replace('#ORD-', '')) || 0;
                    const parsedTableId = order.table === 'Walk-in' ? '0' : (order.table.replace('Table ', '').trim() || '0');
                    return (
                      <div 
                        key={order.id} 
                        onClick={() => {
                          if (order.status === 'Open') {
                             navigate(`/cashier/pos/${parsedTableId}/${parsedOrderId}?return=/cashier/dashboard`);
                          }
                        }}
                        className={`flex items-center justify-between group p-1.5 -mx-1.5 rounded-lg transition-colors ${order.status === 'Open' ? 'cursor-pointer hover:bg-slate-800/50' : 'opacity-80'}`}
                      >
                        <div className="flex items-center space-x-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${order.status === 'Open' ? 'bg-orange-500' : 'bg-emerald-500'}`}></div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:text-white transition-colors">{order.id}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{order.table}</div>
                        <div className="text-[11px] text-slate-500">{formatTime(order.time)}</div>
                        <div className="text-xs font-bold text-red-400 text-right w-16">{formatCurrency(order.amount)}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="shrink-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Quick Actions</h3>
              <div className="grid grid-cols-4 gap-2">
                <button onClick={() => navigate('/cashier/pos/0/new?return=/cashier/dashboard')} className="bg-blue-900/30 border border-blue-800/50 hover:bg-blue-800/50 rounded-xl p-3 flex flex-col items-center justify-center transition-colors text-blue-400 group">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mb-1 group-hover:bg-blue-500/40 transition-colors">
                    <Plus size={16} />
                  </div>
                  <span className="text-[9px] font-medium text-center leading-tight">POS /<br/>New Order</span>
                </button>
                <button onClick={() => navigate('/cashier/orders')} className="bg-purple-900/30 border border-purple-800/50 hover:bg-purple-800/50 rounded-xl p-3 flex flex-col items-center justify-center transition-colors text-purple-400 group">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center mb-1 group-hover:bg-purple-500/40 transition-colors">
                    <List size={16} />
                  </div>
                  <span className="text-[9px] font-medium text-center leading-tight">Order<br/>History</span>
                </button>
                <button onClick={() => navigate('/cashier/tables')} className="bg-orange-900/30 border border-orange-800/50 hover:bg-orange-800/50 rounded-xl p-3 flex flex-col items-center justify-center transition-colors text-orange-400 group">
                  <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center mb-1 group-hover:bg-orange-500/40 transition-colors">
                    <CalendarDays size={16} />
                  </div>
                  <span className="text-[9px] font-medium text-center leading-tight">Table<br/>Reservation</span>
                </button>
                <button onClick={() => navigate('/cashier/customers')} className="bg-emerald-900/30 border border-emerald-800/50 hover:bg-emerald-800/50 rounded-xl p-3 flex flex-col items-center justify-center transition-colors text-emerald-400 group">
                  <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center mb-1 group-hover:bg-emerald-500/40 transition-colors">
                    <Search size={16} />
                  </div>
                  <span className="text-[9px] font-medium text-center leading-tight">Customers</span>
                </button>
              </div>
            </div>

            {/* Walk-in & Customer */}
            <div className="shrink-0 space-y-3">
              <button 
                onClick={() => navigate('/cashier/pos/0/new?return=/cashier/dashboard')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-slate-900 dark:text-white rounded-xl p-4 flex items-center space-x-4 transition-colors text-left shadow-sm"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">New Walk-in</h3>
                  <p className="text-xs text-blue-200">Create new order</p>
                </div>
              </button>
              <button 
                onClick={() => navigate('/cashier/customers')}
                className="w-full bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 hover:bg-slate-800 text-slate-900 dark:text-white rounded-xl p-4 flex items-center space-x-4 transition-colors text-left shadow-sm"
              >
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400">
                  <Search size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Search Customer</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Find existing customer</p>
                </div>
              </button>
            </div>

          </div>
        </div>
      </main>

      {/* Clock In/Out Modal */}
      {showClockModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 p-6 rounded-xl w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 text-center">
              Staff Clock In/Out
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 text-center">
              Select a staff member to record attendance.
            </p>
            <form onSubmit={handleClockInOut}>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Filter by Category</label>
                <select 
                  value={clockCategoryId} 
                  onChange={(e) => {
                    setClockCategoryId(e.target.value === "" ? "" : Number(e.target.value));
                    setClockStaffId("");
                  }}
                  className="w-full bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All Categories</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="mb-6">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Select Staff Member</label>
                <select 
                  required
                  value={clockStaffId} 
                  onChange={e => setClockStaffId(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="" disabled>Select Staff</option>
                  {staff
                    .filter(s => clockCategoryId === "" ? true : s.category_id === clockCategoryId)
                    .map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.category_name || 'Uncategorized'})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => { setShowClockModal(false); setClockStaffId(""); }} className="px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-slate-900 dark:text-white text-sm font-medium rounded-lg shadow-lg shadow-blue-500/20 transition-all">
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 4px;
        }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background: #475569;
        }
      `}</style>

      <AlertModal
        isOpen={alertModal !== null}
        title={alertModal?.title || ""}
        message={alertModal?.message || ""}
        type={alertModal?.type || "danger"}
        buttonText="OK"
        onClose={() => setAlertModal(null)}
      />
    </div>
  );
}
