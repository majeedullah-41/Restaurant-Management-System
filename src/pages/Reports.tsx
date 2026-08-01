import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { 
  TrendingUp, TrendingDown, DollarSign, Receipt, Download 
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { ReportTemplate } from '../components/ReportTemplate';
import DateFilterToolbar from '../components/DateFilterToolbar';

interface DetailedOrder {
    id: number;
    table_number: string;
    created_at: string;
    total: number;
    status: string;
    cashier: string;
}

interface DetailedExpense {
    id: number;
    date: string;
    category: string;
    amount: number;
    note: string;
}

interface DetailedPayout {
    id: number;
    staff_name: string;
    date: string;
    amount: number;
}

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

interface DetailedReport {
    orders: DetailedOrder[];
    expenses: DetailedExpense[];
    payouts: DetailedPayout[];
    total_revenue: number;
    total_expenses: number;
    net_profit: number;
    profit_margin: number;
    total_orders: number;
    avg_order_value: number;
    sales_trend: DailyTrend[];
    expenses_by_category: CategoryExpense[];
    top_items: TopItem[];
}

export default function Reports() {
  const [report, setReport] = useState<DetailedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);
  
  const [restaurantName, setRestaurantName] = useState("Restaurant POS");
  const [restaurantLogo, setRestaurantLogo] = useState<string | null>(null);
  
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

  const fetchReport = async (sd: string, ed: string) => {
    try {
      setLoading(true);
      const data = await invoke<DetailedReport>('get_detailed_report', { startDate: sd, endDate: ed });
      const settings: any = await invoke("get_settings");
      setRestaurantName(settings.restaurant_name);
      setRestaurantLogo(settings.logo_path || null);
      setReport(data);
    } catch (e) {
      console.error('Failed to fetch report:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      fetchReport(dateRange.startDate, dateRange.endDate);
    }
  }, [dateRange]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Detailed_Business_Report_${dateRange.startDate}_to_${dateRange.endDate}`,
  });

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="reports" />
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors">
        <Header title="Reports & Analytics" subtitle="Detailed breakdown of all restaurant activities." />

        <div className="flex-1 px-6 pt-4 pb-5 overflow-y-auto custom-scrollbar">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6 shrink-0">
            <DateFilterToolbar 
              onDateRangeChange={(startDate, endDate) => setDateRange({ startDate, endDate })} 
              defaultMode="month" 
            />

            <button
              onClick={() => handlePrint()}
              className="px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 border border-slate-200 dark:border-slate-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || !report}
            >
              <Download size={16} />
              Export PDF
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : report ? (
            <div className="space-y-6 max-w-7xl mx-auto p-4">
              
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total Revenue</p>
                      <h3 className="text-3xl font-bold text-slate-900 dark:text-white">Rs. {report.total_revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</h3>
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
                      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Total Orders</p>
                      <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{report.total_orders}</h3>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                     <div>
                      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Avg Order Value</p>
                      <h3 className="text-3xl font-bold text-slate-900 dark:text-white">Rs. {report.avg_order_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</h3>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                     <div>
                      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Profit Margin</p>
                      <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{report.profit_margin.toFixed(2)}%</h3>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Tables */}
              <div className="space-y-6">
                
                {/* Top Selling Items Table */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Top Selling Items</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                          <th className="px-6 py-3 font-medium">Item Name</th>
                          <th className="px-6 py-3 font-medium text-right">Quantity Sold</th>
                          <th className="px-6 py-3 font-medium text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {report.top_items.length > 0 ? report.top_items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">{item.name}</td>
                            <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">{item.quantity}</td>
                            <td className="px-6 py-4 text-right font-medium text-emerald-500 dark:text-emerald-400">Rs. {item.revenue.toFixed(2)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500">No items sold in this period.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Expenses By Category Table */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Expenses By Category</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                          <th className="px-6 py-3 font-medium">Category Name</th>
                          <th className="px-6 py-3 font-medium text-right">Amount Spent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {report.expenses_by_category.length > 0 ? report.expenses_by_category.map((cat, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">{cat.name}</td>
                            <td className="px-6 py-4 text-right font-medium text-red-500 dark:text-red-400">Rs. {cat.value.toFixed(2)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={2} className="px-6 py-8 text-center text-slate-500">No expenses in this period.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Daily Trend Table */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Daily Performance Trend</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                          <th className="px-6 py-3 font-medium">Date</th>
                          <th className="px-6 py-3 font-medium text-right">Sales</th>
                          <th className="px-6 py-3 font-medium text-right">Expenses</th>
                          <th className="px-6 py-3 font-medium text-right">Net Daily</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {report.sales_trend.length > 0 ? report.sales_trend.map((trend, idx) => {
                          const dailyNet = trend.sales - trend.expenses;
                          return (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="px-6 py-4 text-slate-900 dark:text-white font-medium">{trend.date}</td>
                              <td className="px-6 py-4 text-right font-medium text-emerald-500 dark:text-emerald-400">Rs. {trend.sales.toFixed(2)}</td>
                              <td className="px-6 py-4 text-right font-medium text-red-500 dark:text-red-400">Rs. {trend.expenses.toFixed(2)}</td>
                              <td className={`px-6 py-4 text-right font-bold ${dailyNet >= 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                                Rs. {dailyNet.toFixed(2)}
                              </td>
                            </tr>
                          );
                        }) : (
                          <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No activity in this period.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                {/* Orders Table */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Orders List</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                          <th className="px-6 py-3 font-medium">Order ID</th>
                          <th className="px-6 py-3 font-medium">Date & Time</th>
                          <th className="px-6 py-3 font-medium">Table</th>
                          <th className="px-6 py-3 font-medium">Cashier</th>
                          <th className="px-6 py-3 font-medium">Status</th>
                          <th className="px-6 py-3 font-medium text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {report.orders.length > 0 ? report.orders.map((order) => (
                          <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-6 py-4 text-slate-900 dark:text-white">#{order.id}</td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{order.created_at}</td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{order.table_number}</td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{order.cashier || '-'}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                                order.status === 'Closed' ? 'bg-emerald-500/10 text-emerald-500' :
                                order.status === 'Cancelled' ? 'bg-red-500/10 text-red-500' :
                                'bg-orange-500/10 text-orange-500'
                              }`}>
                                {order.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-medium text-slate-900 dark:text-white">Rs. {order.total.toFixed(2)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No orders found for this period.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Expenses Table */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Expenses List</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                          <th className="px-6 py-3 font-medium">Expense ID</th>
                          <th className="px-6 py-3 font-medium">Date</th>
                          <th className="px-6 py-3 font-medium">Category</th>
                          <th className="px-6 py-3 font-medium">Note</th>
                          <th className="px-6 py-3 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {report.expenses.length > 0 ? report.expenses.map((expense) => (
                          <tr key={expense.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-6 py-4 text-slate-900 dark:text-white">#{expense.id}</td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{expense.date}</td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{expense.category}</td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{expense.note || '-'}</td>
                            <td className="px-6 py-4 text-right font-medium text-red-500 dark:text-red-400">Rs. {expense.amount.toFixed(2)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No expenses found for this period.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Salary Payouts Table */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Salary Payouts</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                          <th className="px-6 py-3 font-medium">Payout ID</th>
                          <th className="px-6 py-3 font-medium">Date</th>
                          <th className="px-6 py-3 font-medium">Staff Name</th>
                          <th className="px-6 py-3 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {report.payouts.length > 0 ? report.payouts.map((payout) => (
                          <tr key={payout.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-6 py-4 text-slate-900 dark:text-white">#{payout.id}</td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{payout.date}</td>
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{payout.staff_name}</td>
                            <td className="px-6 py-4 text-right font-medium text-red-500 dark:text-red-400">Rs. {payout.amount.toFixed(2)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No payouts found for this period.</td></tr>
                        )}
                      </tbody>
                    </table>
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
          <div className="hidden">
            <ReportTemplate 
              ref={printRef} 
              report={report} 
              startDate={dateRange.startDate} 
              endDate={dateRange.endDate} 
              restaurantName={restaurantName}
              restaurantLogo={restaurantLogo}
            />
          </div>
        )}
      </main>
    </div>
  );
}
