import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
  const [stats, setStats] = useState<DashboardStats>({
    total_revenue: 0,
    total_expenses: 0,
    net_profit: 0,
    total_orders: 0
  });
  
  const [revenueData, setRevenueData] = useState<RevenueOverview[]>([]);
  const [topSellingData, setTopSellingData] = useState<TopSellingItem[]>([]);
  const [recentExpensesData, setRecentExpensesData] = useState<Expense[]>([]);
  const [todaysSalesData, setTodaysSalesData] = useState<TodaySale[]>([]);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const _stats = await invoke<DashboardStats>("get_dashboard_stats");
        setStats(_stats);

        const _revenue = await invoke<RevenueOverview[]>("get_revenue_overview");
        setRevenueData(_revenue);
        console.log("Revenue overview:", _revenue);

        const _topItems = await invoke<TopSellingItem[]>("get_top_selling_items");
        setTopSellingData(_topItems);
        console.log("Top items:", _topItems);

        const _recentExpenses = await invoke<Expense[]>("get_recent_expenses");
        setRecentExpensesData(_recentExpenses);
        console.log("Recent expenses:", _recentExpenses);

        const clientDate = new Date().toISOString().split('T')[0];
        const _sales = await invoke<TodaySale[]>("get_todays_sales", { clientDate });
        setTodaysSalesData(_sales);
        console.log("Todays sales:", _sales);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      }
    };

    loadDashboardData();
  }, []);

  const orderStatusData = [
    { name: 'Completed', value: stats.total_orders, color: '#22c55e' },
    // Later we can add pending/cancelled order fetching
  ];
  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="dashboard" />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors">
        <Header title="Dashboard" subtitle="Welcome back, Admin!" />

        <div className="flex-1 p-8 overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <SummaryCard title="Total Revenue" amount={`Rs. ${stats.total_revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}`} trend="Today" trendUp={true} color="blue" icon={<DollarSign size={20} />} />
            <SummaryCard title="Total Expenses" amount={`Rs. ${stats.total_expenses.toLocaleString(undefined, {minimumFractionDigits: 2})}`} trend="Today" trendUp={false} color="green" icon={<TrendingDown size={20} />} />
            <SummaryCard title="Net Profit" amount={`Rs. ${stats.net_profit.toLocaleString(undefined, {minimumFractionDigits: 2})}`} trend="Today" trendUp={stats.net_profit >= 0} color="purple" icon={<BarChart2 size={20} />} />
            <SummaryCard title="Total Orders" amount={stats.total_orders.toString()} trend="Today" trendUp={true} color="orange" icon={<ShoppingBag size={20} />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
            {/* Revenue Overview Chart */}
            <div className="lg:col-span-2 xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-900 dark:text-white">Revenue Overview</h3>
                <select className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm rounded-lg px-3 py-1 outline-none">
                  <option>This Week</option>
                </select>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dx={-10} tickFormatter={(val) => `${val/1000}K`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Order Status Chart */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col">
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">Order Status</h3>
              <div className="flex-1 flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={orderStatusData}
                      cx="50%" cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {orderStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-bold text-slate-900 dark:text-white">{stats.total_orders}</span>
                  <span className="text-xs text-slate-500">Total</span>
                </div>
              </div>
              <div className="space-y-3 mt-4">
                {orderStatusData.map(status => (
                  <div key={status.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: status.color }}></div>
                      <span className="text-slate-600 dark:text-slate-300">{status.name}</span>
                    </div>
                    <span className="text-slate-500 font-medium">{status.value} ({stats.total_orders > 0 ? Math.round((status.value/stats.total_orders)*100) : 0}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Expenses */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-900 dark:text-white">Recent Expenses</h3>
                <Link to="/admin/expenses" className="text-sm font-medium text-blue-600 dark:text-blue-500 hover:underline">View All</Link>
              </div>
              <div className="space-y-4">
                {recentExpensesData.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">No recent expenses.</p>
                )}
                {recentExpensesData.map(exp => (
                  <div key={exp.id} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-lg`}>
                        {exp.category.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{exp.category}</p>
                        <p className="text-xs text-slate-500">{exp.date}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-red-500 dark:text-red-400">Rs. {exp.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                ))}
              </div>
              <Link to="/admin/expenses" className="w-full mt-6 py-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center justify-center space-x-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <Plus size={16} />
                <span>Add Expense</span>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Today's Sales Table */}
            <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-900 dark:text-white">Today's Sales</h3>
                <a href="#" className="text-sm font-medium text-blue-600 dark:text-blue-500 hover:underline">View All</a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <th className="pb-3">Order ID</th>
                      <th className="pb-3">Table</th>
                      <th className="pb-3">Customer</th>
                      <th className="pb-3">Time</th>
                      <th className="pb-3">Amount</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {todaysSalesData.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-slate-500">No sales today.</td></tr>
                    )}
                    {todaysSalesData.map(sale => (
                      <tr key={sale.id} className="text-sm">
                        <td className="py-4 font-medium text-slate-900 dark:text-slate-300">{sale.id}</td>
                        <td className="py-4 text-slate-600 dark:text-slate-400">{sale.table}</td>
                        <td className="py-4 text-slate-600 dark:text-slate-400">{sale.customer}</td>
                        <td className="py-4 text-slate-600 dark:text-slate-400">{sale.time}</td>
                        <td className="py-4 font-semibold text-slate-900 dark:text-white">Rs. {sale.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td className="py-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                            sale.status === 'Closed' ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/20' : 
                            'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-500/20'
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
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-slate-900 dark:text-white mb-6">Top Selling Items</h3>
              <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <th className="pb-3 w-8">#</th>
                      <th className="pb-3">Item</th>
                      <th className="pb-3">Sold</th>
                      <th className="pb-3">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {topSellingData.length === 0 && (
                      <tr><td colSpan={4} className="py-8 text-center text-slate-500">No items sold yet.</td></tr>
                    )}
                    {topSellingData.map((item, idx) => (
                      <tr key={item.id} className="text-sm">
                        <td className="py-3 font-semibold text-slate-900 dark:text-white">{idx + 1}</td>
                        <td className="py-3">
                          <div className="flex items-center space-x-2">
                            <span className="text-xl">{item.image}</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{item.item}</span>
                          </div>
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-400">{item.sold}</td>
                        <td className="py-3 font-semibold text-slate-900 dark:text-white">Rs. {item.revenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    ))}
                  </tbody>
              </table>
            </div>
          </div>
          
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ title, amount, trend, trendUp, color, icon }: any) {
  const colorMap: any = {
    blue: "bg-blue-600/10 text-blue-600 dark:text-blue-500 border-blue-200 dark:border-blue-500/20",
    green: "bg-emerald-600/10 text-emerald-600 dark:text-emerald-500 border-emerald-200 dark:border-emerald-500/20",
    purple: "bg-purple-600/10 text-purple-600 dark:text-purple-500 border-purple-200 dark:border-purple-500/20",
    orange: "bg-orange-600/10 text-orange-600 dark:text-orange-500 border-orange-200 dark:border-orange-500/20",
  };
  
  const iconBg = colorMap[color];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
      <div className="flex items-start justify-between relative z-10">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${iconBg}`}>
          {icon}
        </div>
      </div>
      <div className="mt-4 relative z-10">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{amount}</h3>
        <p className={`text-xs font-semibold mt-2 ${trendUp ? 'text-green-500' : 'text-slate-500'}`}>
          {trend}
        </p>
      </div>
      
      {/* Decorative Background Element to simulate the wavy line in the mockup */}
      <div className="absolute -bottom-4 -right-4 opacity-10 dark:opacity-20 transform scale-150 group-hover:scale-125 transition-transform duration-500">
         <svg width="120" height="80" viewBox="0 0 120 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 40 Q 30 10 60 40 T 120 40" stroke="currentColor" className={`text-${color}-500`} strokeWidth="4" fill="none"/>
        </svg>
      </div>
    </div>
  );
}