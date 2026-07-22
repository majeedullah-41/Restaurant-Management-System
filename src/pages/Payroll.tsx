import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CreditCard, Calendar, CheckCircle, Clock, History, Users, Check, AlertCircle, ArrowUpRight, ArrowDownRight, Banknote, ChevronLeft, ChevronRight } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

interface PayrollSummary {
  staff_id: number;
  name: string;
  category_name: string | null;
  base_salary: number;
  days_present: number;
}

interface SalaryPayout {
  id: number;
  staff_name: string;
  amount: number;
  bonus: number;
  deduction: number;
  date: string;
}

interface InlinePayrollRow extends PayrollSummary {
  bonus: number;
  deduction: number;
  selected: boolean;
  isPaid: boolean;
}

export default function Payroll() {
  const [activeTab, setActiveTab] = useState<'process' | 'history'>('process');
  
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  // Derive date range from selected month (using local formatting to avoid UTC shift)
  const formatLocalDate = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const startDate = formatLocalDate(selectedYear, selectedMonth, 1);
  const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const endDate = formatLocalDate(selectedYear, selectedMonth, lastDayOfMonth);

  const isCurrentMonth = selectedMonth === today.getMonth() && selectedYear === today.getFullYear();
  const isFutureMonth = selectedYear > today.getFullYear() || (selectedYear === today.getFullYear() && selectedMonth > today.getMonth());

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const goToPrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const goToCurrentMonth = () => {
    setSelectedMonth(today.getMonth());
    setSelectedYear(today.getFullYear());
  };
  
  const [rows, setRows] = useState<InlinePayrollRow[]>([]);
  const [history, setHistory] = useState<SalaryPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    setSuccessMsg(null);
    setErrorMsg(null);
    if (activeTab === 'process') {
      fetchSummary();
    } else {
      fetchHistory();
    }
  }, [activeTab, selectedMonth, selectedYear]);

  const fetchSummary = async (sd?: string, ed?: string) => {
    const queryStart = sd || startDate;
    const queryEnd = ed || endDate;
    try {
      setLoading(true);
      setErrorMsg(null);
      
      const [summaryData, paidIds] = await Promise.all([
        invoke<PayrollSummary[]>('get_payroll_summary', { startDate: queryStart, endDate: queryEnd }),
        invoke<number[]>('get_paid_staff_ids', { startDate: queryStart, endDate: queryEnd })
      ]);
      
      const paidSet = new Set(paidIds);
      
      const mappedRows = summaryData.map(s => ({
        ...s,
        bonus: 0,
        deduction: 0,
        selected: false,
        isPaid: paidSet.has(s.staff_id),
      }));
      
      mappedRows.sort((a, b) => {
        if (a.isPaid === b.isPaid) {
          return a.name.localeCompare(b.name);
        }
        return a.isPaid ? 1 : -1;
      });

      setRows(mappedRows);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const data = await invoke<SalaryPayout[]>('get_payout_history');
      setHistory(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Selection helpers
  const unpaidRows = rows.filter(r => !r.isPaid);
  const selectedRows = rows.filter(r => r.selected && !r.isPaid);
  const paidRows = rows.filter(r => r.isPaid);
  const allUnpaidSelected = unpaidRows.length > 0 && unpaidRows.every(r => r.selected);

  const toggleSelectAll = () => {
    const newVal = !allUnpaidSelected;
    setRows(rows.map(r => r.isPaid ? r : { ...r, selected: newVal }));
  };

  const toggleSelect = (staffId: number) => {
    setRows(rows.map(r => r.staff_id === staffId ? { ...r, selected: !r.selected } : r));
  };

  const updateBonus = (staffId: number, value: string) => {
    setRows(rows.map(r => r.staff_id === staffId ? { ...r, bonus: Number(value) || 0 } : r));
  };

  const updateDeduction = (staffId: number, value: string) => {
    setRows(rows.map(r => r.staff_id === staffId ? { ...r, deduction: Number(value) || 0 } : r));
  };

  // Summary calculations
  const totalBase = selectedRows.reduce((s, r) => s + r.base_salary, 0);
  const totalBonus = selectedRows.reduce((s, r) => s + r.bonus, 0);
  const totalDeduction = selectedRows.reduce((s, r) => s + r.deduction, 0);
  const totalNet = totalBase + totalBonus - totalDeduction;

  // Stats for cards
  const totalStaff = rows.length;
  const totalPayrollAmount = rows.reduce((s, r) => s + r.base_salary, 0);
  const totalPaidAmount = paidRows.reduce((s, r) => s + r.base_salary, 0);
  const totalPendingAmount = unpaidRows.reduce((s, r) => s + r.base_salary, 0);

  const handleBatchPayout = () => {
    if (selectedRows.length === 0) return;
    setShowConfirmModal(true);
  };

  const executeBatchPayout = async () => {
    setShowConfirmModal(false);
    
    try {
      setProcessing(true);
      setErrorMsg(null);
      
      const payouts = selectedRows.map(r => ({
        staff_id: r.staff_id,
        base_salary: r.base_salary,
        bonus: r.bonus,
        deduction: r.deduction,
        staff_name: r.name,
      }));
      
      const msg = await invoke<string>('process_batch_payout', { payouts, payoutDate: endDate });
      setSuccessMsg(msg);
      
      // Refresh data — pass dates explicitly to avoid stale closure
      await fetchSummary(startDate, endDate);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
    } finally {
      setProcessing(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20',
      'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20',
      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
      'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20',
      'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
      'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    ];
    const index = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="payroll" />
      
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors">
        <Header title="Payroll Management" subtitle="Review staff attendance and process monthly salary payouts." />

        <div className="flex-1 px-6 pt-4 pb-5 overflow-y-auto flex flex-col">

          {/* Large Stats Grid */}
          {activeTab === 'process' && !loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm mb-1 truncate">Staff</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white whitespace-nowrap">{totalStaff}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm mb-1 truncate">Total Payroll</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white whitespace-nowrap">Rs. {totalPayrollAmount.toLocaleString()}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-600/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm mb-1 truncate">Paid Out</p>
                <p className="text-3xl font-black text-emerald-700 dark:text-emerald-500 whitespace-nowrap">Rs. {totalPaidAmount.toLocaleString()}</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-600/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-amber-600 dark:text-amber-400 font-semibold text-sm mb-1 truncate">Pending</p>
                <p className="text-3xl font-black text-amber-700 dark:text-amber-500 whitespace-nowrap">Rs. {totalPendingAmount.toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* Tabs & Filters */}
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="flex space-x-1 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <button
                onClick={() => setActiveTab('process')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'process'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <CreditCard size={15} />
                  <span>Process Payroll</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'history'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <History size={15} />
                  <span>Payout History</span>
                </div>
              </button>
            </div>

            {activeTab === 'process' && (
              <div className="flex items-center space-x-2">
                {/* Month Navigator */}
                <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
                  <button
                    onClick={goToPrevMonth}
                    className="px-3 py-2.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-r border-slate-200 dark:border-slate-700"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="px-5 py-2.5 flex items-center space-x-2.5 min-w-[200px] justify-center">
                    <Calendar size={15} className="text-blue-500 shrink-0" />
                    <div className="text-center">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {monthNames[selectedMonth]} {selectedYear}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-2 font-medium">
                        {startDate.slice(8)}/{startDate.slice(5,7)} — {endDate.slice(8)}/{endDate.slice(5,7)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={goToNextMonth}
                    disabled={isFutureMonth}
                    className="px-3 py-2.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-l border-slate-200 dark:border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* This Month Quick Button */}
                {!isCurrentMonth && (
                  <button
                    onClick={goToCurrentMonth}
                    className="px-3.5 py-2.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                  >
                    This Month
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Success message */}
          {successMsg && (
            <div className="mb-3 flex items-center space-x-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle size={16} />
              </div>
              <span className="flex-1">{successMsg}</span>
              <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600 text-xs font-bold px-2 py-1 rounded-md hover:bg-emerald-500/10 transition-colors">Dismiss</button>
            </div>
          )}

          {/* Error message */}
          {errorMsg && (
            <div className="mb-3 flex items-center space-x-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertCircle size={16} />
              </div>
              <span className="flex-1">{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600 text-xs font-bold px-2 py-1 rounded-md hover:bg-red-500/10 transition-colors">Dismiss</button>
            </div>
          )}

          {/* Content Area */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex-1 flex flex-col">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-10 h-10 border-3 border-blue-200 dark:border-blue-800 border-t-blue-600 rounded-full animate-spin"></div>
                  <span className="text-slate-400 text-sm font-medium">Loading payroll data...</span>
                </div>
              </div>
            ) : activeTab === 'process' ? (
              <>
                {/* Process Payroll Table */}
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50/80 dark:bg-slate-800/60 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                        <th className="py-4 px-5 font-semibold w-12">
                          <label className="flex items-center justify-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={allUnpaidSelected}
                              onChange={toggleSelectAll}
                              disabled={unpaidRows.length === 0}
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                            />
                          </label>
                        </th>
                        <th className="py-4 px-4 font-semibold">Staff Member</th>
                        <th className="py-4 px-4 font-semibold">Category</th>
                        <th className="py-4 px-4 font-semibold text-center">Attendance</th>
                        <th className="py-4 px-4 font-semibold text-right">Base Salary</th>
                        <th className="py-4 px-4 font-semibold text-center">Bonus</th>
                        <th className="py-4 px-4 font-semibold text-center">Deduction</th>
                        <th className="py-4 px-4 font-semibold text-right">Net Pay</th>
                        <th className="py-4 px-5 font-semibold text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {rows.map((row) => {
                        const netPay = row.base_salary + row.bonus - row.deduction;
                        return (
                          <tr 
                            key={row.staff_id} 
                            onClick={() => !row.isPaid && toggleSelect(row.staff_id)}
                            className={`transition-all duration-150 cursor-pointer ${
                              row.isPaid 
                                ? 'bg-emerald-50/30 dark:bg-emerald-500/[0.03] cursor-default' 
                                : row.selected 
                                  ? 'bg-blue-50/70 dark:bg-blue-500/[0.06] ring-1 ring-inset ring-blue-200 dark:ring-blue-500/20' 
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                            }`}
                          >
                            <td className="py-4 px-5" onClick={(e) => e.stopPropagation()}>
                              <label className="flex items-center justify-center cursor-pointer">
                                <input 
                                  type="checkbox"
                                  checked={row.selected}
                                  onChange={() => toggleSelect(row.staff_id)}
                                  disabled={row.isPaid}
                                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                />
                              </label>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center space-x-3">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${getAvatarColor(row.name)}`}>
                                  {getInitials(row.name)}
                                </div>
                                <span className={`font-bold text-sm ${row.isPaid ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                                  {row.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                                row.isPaid 
                                  ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700' 
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}>
                                {row.category_name || 'Uncategorized'}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-center">
                              <div className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                                row.days_present > 0 
                                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' 
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
                              }`}>
                                <CheckCircle size={12} />
                                <span>{row.days_present} Day{row.days_present !== 1 ? 's' : ''}</span>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <span className={`font-mono font-bold text-sm ${row.isPaid ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                Rs. {row.base_salary.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                              {row.isPaid ? (
                                <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                              ) : (
                                <input
                                  type="number"
                                  value={row.bonus || ''}
                                  onChange={(e) => updateBonus(row.staff_id, e.target.value)}
                                  placeholder="0"
                                  className="w-24 text-center bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 placeholder:text-emerald-300 dark:placeholder:text-emerald-700 transition-all"
                                />
                              )}
                            </td>
                            <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                              {row.isPaid ? (
                                <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                              ) : (
                                <input
                                  type="number"
                                  value={row.deduction || ''}
                                  onChange={(e) => updateDeduction(row.staff_id, e.target.value)}
                                  placeholder="0"
                                  className="w-24 text-center bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-red-700 dark:text-red-400 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 placeholder:text-red-300 dark:placeholder:text-red-700 transition-all"
                                />
                              )}
                            </td>
                            <td className="py-4 px-4 text-right">
                              <span className={`font-mono font-bold text-base ${
                                row.isPaid 
                                  ? 'text-slate-400 dark:text-slate-500' 
                                  : 'text-slate-900 dark:text-white'
                              }`}>
                                Rs. {netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-center">
                              {row.isPaid ? (
                                <span className="inline-flex items-center space-x-1.5 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-3.5 py-1.5 rounded-full text-xs font-bold border border-emerald-200 dark:border-emerald-500/25 shadow-sm shadow-emerald-500/5">
                                  <Check size={12} strokeWidth={3} />
                                  <span>Paid</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-1.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3.5 py-1.5 rounded-full text-xs font-bold border border-amber-200 dark:border-amber-500/20">
                                  <Clock size={12} />
                                  <span>Pending</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-16 text-center">
                            <div className="flex flex-col items-center space-y-3">
                              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <Users size={24} className="text-slate-400" />
                              </div>
                              <div>
                                <p className="text-slate-500 font-semibold text-sm">No staff members found</p>
                                <p className="text-slate-400 text-xs mt-1">Try adjusting the date range or add staff first.</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Sticky Summary Footer */}
                {unpaidRows.length > 0 && (
                  <div className="border-t-2 border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-800/60 dark:via-slate-800/40 dark:to-slate-800/60 px-6 py-4 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-5">
                        {/* Selected Count */}
                        <div className="flex items-center space-x-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Users size={14} className="text-blue-500" />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider leading-tight">Selected</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedRows.length} staff</p>
                          </div>
                        </div>
                        
                        {selectedRows.length > 0 && (
                          <>
                            <div className="h-10 w-px bg-slate-200 dark:bg-slate-700"></div>

                            {/* Base */}
                            <div>
                              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider leading-tight">Base</p>
                              <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">Rs. {totalBase.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>

                            {/* Bonus */}
                            {totalBonus > 0 && (
                              <div>
                                <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider leading-tight">+ Bonus</p>
                                <p className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {totalBonus.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                              </div>
                            )}

                            {/* Deduction */}
                            {totalDeduction > 0 && (
                              <div>
                                <p className="text-[10px] text-red-500 font-semibold uppercase tracking-wider leading-tight">− Deduction</p>
                                <p className="text-sm font-mono font-bold text-red-600 dark:text-red-400">Rs. {totalDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                              </div>
                            )}

                            <div className="h-10 w-px bg-slate-200 dark:bg-slate-700"></div>

                            {/* Net */}
                            <div className="bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider leading-tight">Net Payout</p>
                              <p className="text-base font-mono font-extrabold text-emerald-700 dark:text-emerald-400">Rs. {totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                            </div>
                          </>
                        )}
                      </div>
                      
                      <button
                        onClick={handleBatchPayout}
                        disabled={selectedRows.length === 0 || processing}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold px-7 py-3 rounded-xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all active:scale-[0.97] flex items-center space-x-2.5 text-sm"
                      >
                        <Banknote size={18} />
                        <span>{processing ? 'Processing...' : `Pay Selected (${selectedRows.length})`}</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Payout History Table */
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50/80 dark:bg-slate-800/60 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                      <th className="py-4 px-6 font-semibold">Date Paid</th>
                      <th className="py-4 px-6 font-semibold">Staff Member</th>
                      <th className="py-4 px-6 font-semibold text-right">Base Amount</th>
                      <th className="py-4 px-6 font-semibold text-right">Bonus</th>
                      <th className="py-4 px-6 font-semibold text-right">Deduction</th>
                      <th className="py-4 px-6 font-semibold text-right">Net Paid</th>
                      <th className="py-4 px-6 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {history.map((record) => {
                      const baseAmount = record.amount - record.bonus + record.deduction;
                      return (
                        <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center space-x-2.5">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                <Calendar size={14} className="text-slate-400" />
                              </div>
                              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{record.date}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center space-x-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0 ${getAvatarColor(record.staff_name)}`}>
                                {getInitials(record.staff_name)}
                              </div>
                              <span className="font-bold text-sm text-slate-900 dark:text-white">{record.staff_name}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className="font-mono font-medium text-sm text-slate-600 dark:text-slate-400">
                              Rs. {baseAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            {record.bonus > 0 ? (
                              <span className="inline-flex items-center space-x-1 font-mono font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                                <ArrowUpRight size={12} />
                                <span>Rs. {record.bonus.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            {record.deduction > 0 ? (
                              <span className="inline-flex items-center space-x-1 font-mono font-semibold text-sm text-red-500 dark:text-red-400">
                                <ArrowDownRight size={12} />
                                <span>Rs. {record.deduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <span className="font-mono font-extrabold text-base text-slate-900 dark:text-white">
                              Rs. {record.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <span className="inline-flex items-center space-x-1.5 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-200 dark:border-emerald-500/25">
                              <Check size={11} strokeWidth={3} />
                              <span>Completed</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-16 text-center">
                          <div className="flex flex-col items-center space-y-3">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                              <History size={24} className="text-slate-400" />
                            </div>
                            <div>
                              <p className="text-slate-500 font-semibold text-sm">No payout history yet</p>
                              <p className="text-slate-400 text-xs mt-1">Process your first payroll to see records here.</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-5">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
                  <Banknote size={24} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Confirm Payroll</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Please review before processing.</p>
                </div>
              </div>
              
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 mb-6 border border-slate-100 dark:border-slate-700/50 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Staff members</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedRows.length}</span>
                </div>
                <div className="h-px bg-slate-200 dark:bg-slate-700/50 w-full" />
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Total payout</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">Rs. {totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={executeBatchPayout}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/20 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <span>Confirm & Pay</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

