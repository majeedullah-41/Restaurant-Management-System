import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { 
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Receipt, ShoppingBag, Calendar, Download } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { ReportTemplate } from '../components/ReportTemplate';

interface DailyTrend {
  date: string;
  sales: number;
  expenses: number;
}

interface CategoryExpense {
  name: string;
  value: number;
}

interface TopItem {
  name: string;
  quantity: number;
  revenue: number;
}

interface AnalyticsReport {
  total_sales: number;
  total_expenses: number;
  net_profit: number;
  profit_margin: number;
  total_orders: number;
  avg_order_value: number;
  sales_trend: DailyTrend[];
  expenses_by_category: CategoryExpense[];
  top_items: TopItem[];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Reports() {
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);
  
  // Default to current month
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const data = await invoke<AnalyticsReport>('get_analytics_report', { startDate, endDate });
      setReport(data);
    } catch (e) {
      console.error('Failed to fetch report:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Business_Report_${startDate}_to_${endDate}`,
  });

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="reports" />
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors">
        <Header title="Reports & Analytics" subtitle="Visualize your business performance and metrics.">
          <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5">
            <Calendar size={16} className="text-slate-400" />
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-transparent border-none text-sm text-slate-900 dark:text-slate-300 focus:outline-none w-28"
            />
            <span className="text-slate-400 dark:text-slate-500">to</span>
            <input 
              type="date" 
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="bg-transparent border-none text-sm text-slate-900 dark:text-slate-300 focus:outline-none w-28"
            />
          </div>
          <button 
            onClick={fetchReport}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Apply Filter
          </button>
          <button
            onClick={() => handlePrint()}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 border border-slate-200 dark:border-slate-700"
            disabled={loading || !report}
          >
            <Download size={16} />
            Export PDF Report
          </button>
        </Header>

        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : report ? (
            <div className="space-y-6 max-w-7xl mx-auto p-4">
              
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total Revenue</p>
                      <h3 className="text-3xl font-bold text-slate-900 dark:text-white">Rs. {report.total_sales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</h3>
                    </div>
                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 dark:text-blue-400">
                      <DollarSign size={24} />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total Expenses</p>
                      <h3 className="text-3xl font-bold text-slate-900 dark:text-white">Rs. {report.total_expenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</h3>
                    </div>
                    <div className="p-3 bg-red-500/10 rounded-xl text-red-500 dark:text-red-400">
                      <Receipt size={24} />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Net Profit</p>
                      <h3 className={`text-3xl font-bold ${report.net_profit >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        {report.net_profit < 0 ? '-' : ''}Rs. {Math.abs(report.net_profit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </h3>
                    </div>
                    <div className={`p-3 rounded-xl ${report.net_profit >= 0 ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400' : 'bg-red-500/10 text-red-500 dark:text-red-400'}`}>
                      {report.net_profit >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Profit Margin</p>
                      <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{report.profit_margin.toFixed(1)}%</h3>
                    </div>
                    <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-500 dark:text-indigo-400">
                      <ShoppingBag size={24} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-3 gap-6">
                
                {/* Main Trend Chart */}
                <div className="col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Revenue & Expense Trend</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={report.sales_trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `Rs.${value}`} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: '8px' }}
                          itemStyle={{ fontSize: '14px' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Area type="monotone" dataKey="sales" name="Sales" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                        <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExpenses)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Expenses Pie Chart */}
                <div className="col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Expenses by Category</h3>
                  <div className="h-[300px] flex flex-col justify-center">
                    {report.expenses_by_category.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={report.expenses_by_category}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {report.expenses_by_category.map((_entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0F172A', borderColor: '#1E293B', borderRadius: '8px' }}
                            itemStyle={{ fontSize: '14px', color: '#fff' }}
                            formatter={(value: any) => `Rs. ${Number(value).toFixed(2)}`}
                          />
                          <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ paddingTop: '20px' }}/>
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                        No expenses recorded
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Row */}
              <div className="grid grid-cols-2 gap-6">
                
                {/* Top Selling Items */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Top Selling Items</h3>
                  <div className="space-y-4">
                    {report.top_items.length > 0 ? report.top_items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                            #{idx + 1}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{item.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{item.quantity} units sold</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-emerald-500 dark:text-emerald-400">Rs. {item.revenue.toFixed(2)}</p>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-8 text-slate-500">No sales data available</div>
                    )}
                  </div>
                </div>

                {/* Order Stats */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-center items-center text-center">
                   <div className="w-full grid grid-cols-2 gap-6">
                      <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">Total Orders</p>
                        <h4 className="text-4xl font-bold text-slate-900 dark:text-white">{report.total_orders}</h4>
                      </div>
                      <div className="p-6 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">Avg. Order Value</p>
                        <h4 className="text-4xl font-bold text-blue-500 dark:text-blue-400">Rs. {report.avg_order_value.toFixed(2)}</h4>
                      </div>
                   </div>
                </div>

              </div>

            </div>
          ) : (
             <div className="flex items-center justify-center h-full text-slate-500">
               No data available for this date range.
             </div>
          )}
        </div>
        {report && (
          <ReportTemplate 
            ref={printRef} 
            report={report} 
            startDate={startDate} 
            endDate={endDate} 
          />
        )}
      </main>
    </div>
  );
}
