import { useState, useEffect } from 'react';
import { invoke } from '../lib/api';
import { formatCurrency, todayLocal } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, TrendingDown, BarChart2, ShoppingBag, Plus } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { Link } from 'react-router-dom';

// Interfaces for fetched data
interface DashboardStats {
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  total_orders: number;
  today_revenue: number;
  today_expenses: number;
  today_profit: number;
  today_orders: number;
}

interface RevenueOverview {
  name: string;
  revenue: number;
}

interface TopSellingItem {
  id: number;
  item: string;
  sold: number;
  revenue: number;
  image: string;
}

interface Expense {
  id: number;
  amount: number;
  date: string;
  category: string;
  note: string | null;
}

interface TodaySale {
  id: string;
  table: string;
  customer: string;
  time: string;
  amount: number;
  status: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    total_revenue: 0,
    total_expenses: 0,
    net_profit: 0,
    total_orders: 0,
    today_revenue: 0,
    today_expenses: 0,
    today_profit: 0,
    today_orders: 0
  });
  
  const [revenueData, setRevenueData] = useState<RevenueOverview[]>([]);
  const [topSellingData, setTopSellingData] = useState<TopSellingItem[]>([]);
  const [recentExpensesData, setRecentExpensesData] = useState<Expense[]>([]);
  const [todaysSalesData, setTodaysSalesData] = useState<TodaySale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        const clientDate = todayLocal();
        const [
          _stats,
          _revenue,
          _topItems,
          _recentExpenses,
          _sales,
        ] = await Promise.all([
          invoke<DashboardStats>("get_dashboard_stats"),
          invoke<RevenueOverview[]>("get_revenue_overview"),
          invoke<TopSellingItem[]>("get_top_selling_items"),
          invoke<Expense[]>("get_recent_expenses"),
          invoke<TodaySale[]>("get_todays_sales", { clientDate }),
        ]);

        setStats(_stats);
        setRevenueData(_revenue);
        setTopSellingData(_topItems);
        setRecentExpensesData(_recentExpenses);
        setTodaysSalesData(_sales);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        setError("Failed to load dashboard data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const completedOrders = todaysSalesData.filter(s => s.status === 'Closed').length;
  const processingOrders = todaysSalesData.filter(s => s.status === 'Open').length;
  const pieData = [
    { name: 'Completed', value: completedOrders > 0 ? completedOrders : (processingOrders === 0 ? 1 : 0), fill: '#10b981' },
    { name: 'Processing', value: processingOrders, fill: '#2563eb' }
  ];
  
  const currentMonthName = new Date().toLocaleString('default', { month: 'long' }).toUpperCase();

  return (
    <div className="flex h-[100dvh] w-full bg-[#F8F9FF] dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="dashboard" />

      <main className="flex-1 flex flex-col z-10 overflow-hidden transition-colors min-w-0">
        <Header title="Dashboard" subtitle={`Welcome back, ${user?.display_name || 'Admin'}!`} />

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto custom-scrollbar">
          {error && (
            <div className="mb-6 p-4 rounded-[8px] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm font-semibold">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading dashboard data...</p>
            </div>
          ) : (
          <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <SummaryCard title="TODAY'S SALES" amount={formatCurrency(stats.today_revenue, { newline: true })} progress={Math.min(100, (stats.today_revenue / 10000) * 100)} trend="Today" color="blue" icon={<DollarSign size={20} strokeWidth={2.5} />} />
            <SummaryCard title="TODAY'S EXPENSES" amount={formatCurrency(stats.today_expenses, { newline: true })} progress={Math.min(100, (stats.today_expenses / 5000) * 100)} trend="Today" color="red" icon={<TrendingDown size={20} strokeWidth={2.5} />} />
            <SummaryCard title="TODAY'S PROFIT" amount={formatCurrency(stats.today_profit, { newline: true })} progress={Math.min(100, (Math.max(0, stats.today_profit) / 5000) * 100)} trend="Today" color="amber" icon={<BarChart2 size={20} strokeWidth={2.5} />} />
            <SummaryCard title="TODAY'S ORDERS" amount={stats.today_orders.toString()} progress={Math.min(100, (stats.today_orders / 20) * 100)} trend="Today" color="emerald" icon={<ShoppingBag size={20} strokeWidth={2.5} />} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <SummaryCard title={`${currentMonthName} REVENUE`} amount={formatCurrency(stats.total_revenue, { newline: true })} progress={Math.min(100, (stats.total_revenue / 50000) * 100)} trend="This Month" color="blue" icon={<DollarSign size={20} strokeWidth={2.5} />} />
            <SummaryCard title={`${currentMonthName} EXPENSES`} amount={formatCurrency(stats.total_expenses, { newline: true })} progress={Math.min(100, (stats.total_expenses / 20000) * 100)} trend="This Month" color="red" icon={<TrendingDown size={20} strokeWidth={2.5} />} />
            <SummaryCard title={`${currentMonthName} PROFIT`} amount={formatCurrency(stats.net_profit, { newline: true })} progress={Math.min(100, (Math.max(0, stats.net_profit) / 30000) * 100)} trend="This Month" color="amber" icon={<BarChart2 size={20} strokeWidth={2.5} />} />
            <SummaryCard title={`${currentMonthName} ORDERS`} amount={stats.total_orders.toString()} progress={Math.min(100, (stats.total_orders / 50) * 100)} trend="This Month" color="emerald" icon={<ShoppingBag size={20} strokeWidth={2.5} />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Revenue Overview Chart */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[8px] p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Revenue Overview</h3>
                <select className="bg-[#F8F9FF] dark:bg-slate-950 border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-400 text-sm rounded-[8px] px-4 py-1.5 outline-none cursor-pointer">
                  <option>This Week</option>
                </select>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.8} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 13, fontWeight: 600}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 13, fontWeight: 600}} dx={-10} tickFormatter={(val) => `${val/1000}K`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#CBD5E1" strokeWidth={2} fillOpacity={0} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Order Status Chart */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[8px] p-6 shadow-sm flex flex-col">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Order Status</h3>
              <div className="flex-1 flex items-center justify-center relative my-4">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      innerRadius={70}
                      outerRadius={85}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{completedOrders + processingOrders}</span>
                  <span className="text-sm font-semibold text-slate-500">Total</span>
                </div>
              </div>
              <div className="space-y-3 mt-auto">
                <div className="flex items-center justify-between text-sm bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-[8px]">
                  <div className="flex items-center space-x-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">Processing</span>
                  </div>
                  <span className="text-slate-900 dark:text-white font-bold">{processingOrders}</span>
                </div>
                <div className="flex items-center justify-between text-sm bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-[8px]">
                  <div className="flex items-center space-x-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600"></div>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">Completed</span>
                  </div>
                  <span className="text-slate-900 dark:text-white font-bold">{completedOrders}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Today's Sales Table */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[8px] p-6 shadow-sm flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Today's Sales</h3>
                <Link to="/admin/history" className="text-[13px] font-bold text-blue-600 dark:text-blue-500 hover:underline">View All</Link>
              </div>
              <div className="overflow-x-auto flex-1 flex flex-col">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs font-bold text-slate-500 uppercase tracking-wider border-b-2 border-slate-100 dark:border-slate-800">
                      <th className="pb-3 w-[15%]">ORDER ID</th>
                      <th className="pb-3 w-[20%] text-center">TABLE</th>
                      <th className="pb-3 w-[25%] text-center">CUSTOMER</th>
                      <th className="pb-3 w-[15%] text-center">TIME</th>
                      <th className="pb-3 w-[15%] text-center">AMOUNT</th>
                      <th className="pb-3 w-[10%] text-center">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {todaysSalesData.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-16 text-center text-slate-400 font-semibold h-48">
                           <div className="flex flex-col items-center justify-center">
                             <div className="w-12 h-10 border-2 border-slate-300 rounded-[4px] border-dashed mb-2 opacity-50 flex items-center justify-center">
                               <div className="w-6 h-6 border-2 border-slate-300 rounded-full"></div>
                             </div>
                             No sales recorded today.
                           </div>
                        </td>
                      </tr>
                    )}
                    {todaysSalesData.map(sale => (
                      <tr key={sale.id} className="text-[15px]">
                        <td className="py-4 font-bold text-slate-900 dark:text-slate-300">{sale.id}</td>
                        <td className="py-4 font-medium text-slate-600 dark:text-slate-400 text-center">{sale.table}</td>
                        <td className="py-4 font-medium text-slate-600 dark:text-slate-400 text-center">{sale.customer}</td>
                        <td className="py-4 font-medium text-slate-600 dark:text-slate-400 text-center">{sale.time}</td>
                        <td className="py-4 font-bold text-slate-900 dark:text-white text-center">{formatCurrency(sale.amount)}</td>
                        <td className="py-4 text-center">
                          <span className={`px-2.5 py-1 rounded-[8px] text-xs font-bold ${
                            sale.status === 'Closed' ? 'text-emerald-600' : 'text-orange-600'
                          }`}>
                            {sale.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Selling Items */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[8px] p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Top Selling Items</h3>
              <div className="space-y-5">
                 {topSellingData.length === 0 ? (
                   <p className="text-sm text-slate-500 font-medium">No top selling items yet.</p>
                 ) : topSellingData.map((item, index) => (
                   <div key={item.id} className="flex items-center">
                      <span className="w-4 text-[13px] font-bold text-slate-500 mr-3">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                         <h4 className="font-bold text-[15px] text-slate-900">{item.item}</h4>
                         <p className="text-[13px] text-slate-500 font-medium">{item.sold} Sales</p>
                      </div>
                      <div className="flex flex-col items-end">
                         <span className="font-bold text-[15px] text-slate-900 mb-1">{formatCurrency(item.revenue)}</span>
                         <div className="w-16 h-1 rounded-full bg-slate-200">
                           <div className="h-full rounded-full bg-emerald-600" style={{width: `${Math.min(100, (item.sold / (topSellingData[0]?.sold || 1)) * 100)}%`}}></div>
                         </div>
                      </div>
                   </div>
                 ))}
              </div>
            </div>
          </div>
          
          {/* Recent Expenses row */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[8px] p-6 shadow-sm">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Recent Expenses</h3>
                <Link to="/admin/expenses" className="px-4 py-2 bg-[#0066FF] hover:bg-blue-700 text-white rounded-[8px] text-[13px] font-bold flex items-center transition-colors">
                  <Plus size={16} className="mr-1.5 stroke-[3]" />
                  Add Expense
                </Link>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
               {recentExpensesData.length === 0 ? (
                 <p className="text-sm text-slate-500 font-medium">No recent expenses.</p>
               ) : recentExpensesData.map(exp => (
                 <div key={exp.id} className="border border-slate-200 rounded-[8px] p-4 flex items-center justify-between">
                   <div className="flex items-center space-x-3">
                     <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-sm uppercase">
                       {exp.category.charAt(0)}
                     </div>
                     <div>
                       <p className="font-bold text-[15px] text-slate-900 leading-tight">{exp.category}</p>
                       <p className="text-[12px] text-slate-500 font-medium">{exp.date}</p>
                     </div>
                   </div>
                    <div className="text-right">
                      <p className="font-bold text-[13px] text-red-500 leading-none">{formatCurrency(exp.amount)}</p>
                    </div>
                 </div>
                ))}
              </div>
            </div>
          </>
          )}
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ title, amount, trend, color, icon, progress = 0 }: any) {
  const colorMap: any = {
    blue: "bg-[#E6F0FF] text-[#0066FF]",
    red: "bg-[#FEE2E2] text-[#EF4444]",
    amber: "bg-[#FEF3C7] text-[#D97706]",
    emerald: "bg-[#D1FAE5] text-[#10B981]",
  };
  const bgColors: any = {
    blue: "bg-[#0066FF]",
    red: "bg-[#EF4444]",
    amber: "bg-[#D97706]",
    emerald: "bg-[#10B981]",
  };
  
  const iconBg = colorMap[color];
  const barBg = bgColors[color];
  
  // Custom parsing for newline to match screenshot (Amount takes 2 lines for Expenses/Profit)
  const amountLines = amount.split('\n');

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[8px] p-5 lg:p-6 shadow-sm flex flex-col justify-between h-full min-h-[140px]">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-[11px] font-bold text-slate-600 dark:text-slate-400 tracking-wider mb-2">{title}</h3>
          <div className={`font-bold text-slate-900 dark:text-white leading-tight ${amountLines.length > 1 ? 'text-[24px]' : 'text-[28px]'}`}>
            {amountLines.map((line: string, i: number) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
        <div className={`w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0 ml-2 ${iconBg}`}>
          {icon}
        </div>
      </div>
      <div className="flex items-center mt-auto pt-4">
        <span className="text-[13px] font-bold text-emerald-600 mr-2">{trend}</span>
        <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden flex">
          <div className={`h-full ${barBg} rounded-full transition-all duration-1000 ease-out`} style={{ width: `${progress}%` }}></div>
        </div>
      </div>
    </div>
  );
}