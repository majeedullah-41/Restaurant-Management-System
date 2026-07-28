import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { 
  TrendingUp, TrendingDown, DollarSign, Receipt, Calendar, Download, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { ReportTemplate } from '../components/ReportTemplate';

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
  
  const today = new Date();
  const [mode, setMode] = useState<'date' | 'month' | 'custom'>('month');
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const formatLocalDate = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
  const formatDateForDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return dateStr;
  };

  const monthStartDate = formatLocalDate(selectedYear, selectedMonth, 1);
  const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthEndDate = formatLocalDate(selectedYear, selectedMonth, lastDayOfMonth);

  const dayDateStr = formatLocalDate(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

  const startDate = mode === 'month' ? monthStartDate : mode === 'date' ? dayDateStr : customStart;
  const endDate = mode === 'month' ? monthEndDate : mode === 'date' ? dayDateStr : customEnd;

  const isCurrentSelection = () => {
    if (mode === 'month') {
      return selectedMonth === today.getMonth() && selectedYear === today.getFullYear();
    } else if (mode === 'date') {
      return selectedDate.getDate() === today.getDate() && selectedDate.getMonth() === today.getMonth() && selectedDate.getFullYear() === today.getFullYear();
    }
    return false;
  };

  const isFutureSelection = () => {
    if (mode === 'month') {
      return selectedYear > today.getFullYear() || (selectedYear === today.getFullYear() && selectedMonth >= today.getMonth());
    } else if (mode === 'date') {
      const tDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const sDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      return sDate >= tDate;
    }
    return false;
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const goToPrev = () => {
    if (mode === 'custom') {
      setMode('month');
      return;
    }
    if (mode === 'month') {
      if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear(y => y - 1);
      } else {
        setSelectedMonth(m => m - 1);
      }
    } else if (mode === 'date') {
      const prev = new Date(selectedDate);
      prev.setDate(prev.getDate() - 1);
      setSelectedDate(prev);
    }
  };

  const goToNext = () => {
    if (mode === 'custom') {
      setMode('month');
      return;
    }
    if (mode === 'month') {
      if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear(y => y + 1);
      } else {
        setSelectedMonth(m => m + 1);
      }
    } else if (mode === 'date') {
      const next = new Date(selectedDate);
      next.setDate(next.getDate() + 1);
      setSelectedDate(next);
    }
  };

  const goToCurrent = () => {
    if (mode === 'date') {
      setSelectedDate(today);
    } else {
      setMode('month');
      setSelectedMonth(today.getMonth());
      setSelectedYear(today.getFullYear());
    }
  };

  const applyCustomRange = () => {
    if (customStart && customEnd) {
      setMode('custom');
      setShowDatePicker(false);
    }
  };
  
  // Close date picker if clicked outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDatePicker]);

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
    if (startDate && endDate) {
      fetchReport(startDate, endDate);
    }
  }, [startDate, endDate]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Detailed_Business_Report_${startDate}_to_${endDate}`,
  });

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="reports" />
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors">
        <Header title="Reports & Analytics" subtitle="Detailed breakdown of all restaurant activities." />

        <div className="flex-1 px-6 pt-4 pb-5 overflow-y-auto custom-scrollbar">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div className="flex items-center space-x-2">
              <div className="relative" ref={datePickerRef}>
                <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
                  <button
                    onClick={goToPrev}
                    className="px-3 py-2.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-r border-slate-200 dark:border-slate-700"
                    title={mode === 'custom' ? "Back to Month View" : mode === 'date' ? "Previous Day" : "Previous Month"}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button 
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    className="px-5 py-2.5 flex items-center space-x-2.5 min-w-[200px] justify-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <Calendar size={15} className="text-blue-500 shrink-0" />
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {mode === 'month' ? `${monthNames[selectedMonth]} ${selectedYear}` : mode === 'date' ? `${selectedDate.getDate()} ${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}` : "Custom Range"}
                      </span>
                      {mode !== 'date' && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          {formatDateForDisplay(startDate)} — {formatDateForDisplay(endDate)}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={goToNext}
                    disabled={mode !== 'custom' && isFutureSelection()}
                    className="px-3 py-2.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-l border-slate-200 dark:border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={mode === 'custom' ? "Back to Month View" : mode === 'date' ? "Next Day" : "Next Month"}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Popover */}
                {showDatePicker && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-5 z-50 w-80">
                    <div className="flex space-x-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-4">
                      <button 
                        onClick={() => setMode('date')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'date' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                      >
                        Daily
                      </button>
                      <button 
                        onClick={() => setMode('month')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'month' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                      >
                        Monthly
                      </button>
                      <button 
                        onClick={() => setMode('custom')}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'custom' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                      >
                        Custom
                      </button>
                    </div>

                    {mode === 'custom' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                          <input 
                            type="date" 
                            value={customStart}
                            max={customEnd || undefined}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">End Date</label>
                          <input 
                            type="date" 
                            value={customEnd}
                            min={customStart || undefined}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="pt-2 flex gap-2">
                          <button 
                            onClick={applyCustomRange}
                            disabled={!customStart || !customEnd}
                            className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            Apply Range
                          </button>
                          <button 
                            onClick={() => setShowDatePicker(false)}
                            className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {(mode === 'date' || mode === 'month') && (
                       <div className="py-2">
                         <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-4">
                           Use the arrows on the toolbar to navigate through {mode === 'date' ? 'days' : 'months'}.
                         </p>
                         <button 
                            onClick={() => setShowDatePicker(false)}
                            className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Close
                          </button>
                       </div>
                    )}
                  </div>
                )}
              </div>

              {!isCurrentSelection() && mode !== 'custom' && (
                <button
                  onClick={goToCurrent}
                  className="px-3.5 py-2.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                >
                  {mode === 'date' ? 'Today' : 'This Month'}
                </button>
              )}
            </div>

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
              startDate={startDate} 
              endDate={endDate} 
              restaurantName={restaurantName}
              restaurantLogo={restaurantLogo}
            />
          </div>
        )}
      </main>
    </div>
  );
}
