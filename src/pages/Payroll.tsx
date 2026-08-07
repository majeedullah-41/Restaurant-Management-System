import { useState, useEffect } from 'react';
import { invoke } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { CreditCard, Calendar, CheckCircle, Clock, History, Users, Check, AlertCircle, ArrowUpRight, ArrowDownRight, Banknote, Printer } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import DateFilterToolbar from '../components/DateFilterToolbar';
import { AlertModal } from '../components/AlertModal';

interface PayrollSummary {
  staff_id: number;
  name: string;
  category_name: string | null;
  base_salary: number;
  days_present: number;
  advance_balance: number;
  paid_amount: number | null;
}

interface SalaryPayout {
  id: number;
  staff_name: string;
  amount: number;
  bonus: number;
  deduction: number;
  advance_deduction: number;
  date: string;
}

interface InlinePayrollRow extends PayrollSummary {
  bonus: number;
  deduction: number;
  selected: boolean;
  isPaid: boolean;
}

export default function Payroll() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'process' | 'history'>('process');
  
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  
  const [rows, setRows] = useState<InlinePayrollRow[]>([]);
  const [history, setHistory] = useState<SalaryPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceStaffId, setAdvanceStaffId] = useState<number | ''>('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [advanceNote, setAdvanceNote] = useState('');
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    setSuccessMsg(null);
    setErrorMsg(null);
    if (!dateRange.startDate || !dateRange.endDate) return;
    
    if (activeTab === 'process') {
      fetchSummary();
    } else {
      fetchHistory();
    }
  }, [activeTab, dateRange]);

  const fetchSummary = async (sd?: string, ed?: string) => {
    const queryStart = sd || dateRange.startDate;
    const queryEnd = ed || dateRange.endDate;
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
        advance_balance: s.advance_balance || 0,
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

  const fetchHistory = async (sd?: string, ed?: string) => {
    const queryStart = sd || dateRange.startDate;
    const queryEnd = ed || dateRange.endDate;
    try {
      setLoading(true);
      const data = await invoke<SalaryPayout[]>('get_payout_history', { startDate: queryStart, endDate: queryEnd });
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
  const totalAdvanceDeduction = selectedRows.reduce((s, r) => s + r.advance_balance, 0);
  const totalNet = totalBase + totalBonus - totalDeduction - totalAdvanceDeduction;

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
        advance_deduction: r.advance_balance,
        staff_name: r.name,
      }));
      
      const payoutDate = dateRange.endDate || new Date().toISOString().split('T')[0];
      const msg = await invoke<string>('process_batch_payout', { payouts, payoutDate });
      setSuccessMsg(msg);
      
      // Refresh data — pass dates explicitly to avoid stale closure
      await fetchSummary(dateRange.startDate, dateRange.endDate);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
    } finally {
      setProcessing(false);
    }
  };

  const handlePayAdvanceSalary = async () => {
    if (!advanceStaffId || !advanceAmount || !advanceDate) {
      setErrorMsg('Please fill in all required fields.');
      setShowAdvanceModal(false);
      return;
    }

    try {
      setAdvancing(true);
      setErrorMsg(null);

      const staff = rows.find(r => r.staff_id === Number(advanceStaffId));
      if (!staff) throw new Error('Staff not found');

      const msg = await invoke<string>('pay_advance_salary', {
        staffId: Number(advanceStaffId),
        amount: Number(advanceAmount),
        date: advanceDate,
        note: advanceNote,
        staffName: staff.name
      });

      setSuccessMsg(msg);
      setShowAdvanceModal(false);
      
      // Reset form
      setAdvanceStaffId('');
      setAdvanceAmount('');
      setAdvanceNote('');
      
      // Refresh summary to see updated advance balance
      if (activeTab === 'process' && dateRange.startDate) {
        await fetchSummary(dateRange.startDate, dateRange.endDate);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
      setShowAdvanceModal(false);
    } finally {
      setAdvancing(false);
    }
  };

  const handlePrintSlip = async (payout: SalaryPayout) => {
    try {
      const restName = await invoke<string>('get_restaurant_name').catch(() => 'Restaurant');
      const adminName = user?.display_name || user?.role || 'Admin';
      const baseAmount = payout.amount - payout.bonus + payout.deduction + payout.advance_deduction;

      const padBoth = (left: string, right: string, width = 32) => {
        const spaces = width - left.length - right.length;
        return left + " ".repeat(Math.max(1, spaces)) + right;
      };
    
      const center = (text: string, width = 32) => {
        if (text.length >= width) return text.substring(0, width);
        const left = Math.floor((width - text.length) / 2);
        return " ".repeat(left) + text;
      };

      let text = "";
      text += center(restName) + "\n";
      text += center("SALARY SLIP") + "\n";
      text += "-".repeat(32) + "\n";
      
      text += `Staff: ${payout.staff_name}\n`;
      text += `Date:  ${payout.date}\n`;
      text += `Admin: ${adminName}\n`;
      text += "-".repeat(32) + "\n";
      
      text += padBoth("Base Salary", `${formatCurrency(baseAmount)}`) + "\n";
      
      if (payout.bonus > 0) {
        text += padBoth("Bonus/Allowances", `+ ${formatCurrency(payout.bonus)}`) + "\n";
      }
      if (payout.deduction > 0) {
        text += padBoth("Deductions", `- ${formatCurrency(payout.deduction)}`) + "\n";
      }
      if (payout.advance_deduction > 0) {
        text += padBoth("Advance Ded.", `- ${formatCurrency(payout.advance_deduction)}`) + "\n";
      }
      
      text += "=".repeat(32) + "\n";
      text += padBoth("NET PAY", `${formatCurrency(payout.amount)}`) + "\n";
      text += "-".repeat(32) + "\n\n";
      
      text += "Employer Sig: _________________\n\n";
      text += "Employee Sig: _________________\n\n\n\n";

      await invoke("print_receipt_text", { text });
    } catch (e) {
      console.error('Failed to print slip:', e);
      setPrintError('Failed to print slip: ' + e);
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
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="payroll" />
      
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors min-w-0">
        <Header title="Payroll Management" subtitle="Review staff attendance and process monthly salary payouts." />

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto flex flex-col">

          {/* Large Stats Grid */}
          {activeTab === 'process' && !loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm mb-1 truncate">Staff</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white whitespace-nowrap">{totalStaff}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm mb-1 truncate">Total Payroll</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white whitespace-nowrap">{formatCurrency(totalPayrollAmount)}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-600/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm mb-1 truncate">Paid Out</p>
                <p className="text-3xl font-black text-emerald-700 dark:text-emerald-500 whitespace-nowrap">{formatCurrency(totalPaidAmount)}</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-600/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-amber-600 dark:text-amber-400 font-semibold text-sm mb-1 truncate">Pending</p>
                <p className="text-3xl font-black text-amber-700 dark:text-amber-500 whitespace-nowrap">{formatCurrency(totalPendingAmount)}</p>
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

            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setShowAdvanceModal(true)}
                className="bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 dark:text-amber-400 px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center space-x-2"
              >
                <Banknote size={15} />
                <span>Pay Advance Salary</span>
              </button>
              <DateFilterToolbar 
                onDateRangeChange={(startDate, endDate) => setDateRange({ startDate, endDate })}
                defaultMode="month"
              />
            </div>
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex-1 flex flex-col min-h-[700px]">
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
                        <th className="py-4 px-2 font-semibold whitespace-nowrap">Staff Member</th>
                        <th className="py-4 px-2 font-semibold whitespace-nowrap">Category</th>
                        <th className="py-4 px-2 font-semibold text-center whitespace-nowrap">Attendance</th>
                        <th className="py-4 px-2 font-semibold text-right whitespace-nowrap">Base Salary</th>
                        <th className="py-4 px-2 font-semibold text-center whitespace-nowrap">Bonus</th>
                        <th className="py-4 px-2 font-semibold text-center whitespace-nowrap">Deduction</th>
                        <th className="py-4 px-2 font-semibold text-center whitespace-nowrap">Advance Bal.</th>
                        <th className="py-4 px-2 font-semibold text-right whitespace-nowrap">Net Pay</th>
                        <th className="py-4 px-3 font-semibold text-center whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {rows.map((row) => {
                        const netPay = row.isPaid 
                          ? (row.paid_amount || row.base_salary) 
                          : (row.base_salary + row.bonus - row.deduction - row.advance_balance);
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
                            <td className="py-3 px-2">
                              <div className="flex items-center space-x-3">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${getAvatarColor(row.name)}`}>
                                  {getInitials(row.name)}
                                </div>
                                <span className={`font-bold text-sm ${row.isPaid ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                                  {row.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                                row.isPaid 
                                  ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700' 
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}>
                                {row.category_name || 'Uncategorized'}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-center">
                              <div className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                                row.days_present > 0 
                                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' 
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
                              }`}>
                                <CheckCircle size={12} />
                                <span>{row.days_present} Day{row.days_present !== 1 ? 's' : ''}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2 text-right">
                              <span className={`font-mono font-bold text-sm whitespace-nowrap ${row.isPaid ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                {formatCurrency(row.base_salary)}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-center" onClick={(e) => e.stopPropagation()}>
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
                            <td className="py-3 px-2 text-center" onClick={(e) => e.stopPropagation()}>
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
                            <td className="py-3 px-2 text-center">
                              {row.advance_balance > 0 ? (
                                <span className="font-mono text-sm font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                  {formatCurrency(-row.advance_balance)}
                                </span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-right">
                              <span className={`font-mono font-bold text-base whitespace-nowrap ${
                                row.isPaid 
                                  ? 'text-slate-400 dark:text-slate-500' 
                                  : 'text-slate-900 dark:text-white'
                              }`}>
                                {formatCurrency(netPay)}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">
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
                      {rows.length > 0 && rows.length < 10 && Array.from({ length: 10 - rows.length }).map((_, i) => (
                        <tr key={`empty-${i}`} className="bg-transparent pointer-events-none">
                          <td className="py-4 px-5 h-[62px]"></td>
                          <td className="py-3 px-2"></td>
                          <td className="py-3 px-2"></td>
                          <td className="py-3 px-2"></td>
                          <td className="py-3 px-2"></td>
                          <td className="py-3 px-2"></td>
                          <td className="py-3 px-2"></td>
                          <td className="py-3 px-2"></td>
                          <td className="py-3 px-2"></td>
                          <td className="py-3 px-3"></td>
                        </tr>
                      ))}
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
                              <p className="text-sm font-mono font-bold text-slate-700 dark:text-slate-300">{formatCurrency(totalBase)}</p>
                            </div>

                            {/* Bonus */}
                            {totalBonus > 0 && (
                              <div>
                                <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider leading-tight">+ Bonus</p>
                                <p className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalBonus)}</p>
                              </div>
                            )}

                            {/* Deduction */}
                            {totalDeduction > 0 && (
                              <div>
                                <p className="text-[10px] text-red-500 font-semibold uppercase tracking-wider leading-tight">− Deduction</p>
                                <p className="text-sm font-mono font-bold text-red-600 dark:text-red-400">{formatCurrency(totalDeduction)}</p>
                              </div>
                            )}

                            {/* Advance Deduction */}
                            {totalAdvanceDeduction > 0 && (
                              <div>
                                <p className="text-[10px] text-orange-500 font-semibold uppercase tracking-wider leading-tight">− Advance</p>
                                <p className="text-sm font-mono font-bold text-orange-600 dark:text-orange-400">{formatCurrency(totalAdvanceDeduction)}</p>
                              </div>
                            )}

                            <div className="h-10 w-px bg-slate-200 dark:bg-slate-700"></div>

                            {/* Net */}
                            <div className="bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider leading-tight">Net Payout</p>
                              <p className="text-base font-mono font-extrabold text-emerald-700 dark:text-emerald-400">{formatCurrency(totalNet)}</p>
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
                      <th className="py-4 px-4 font-semibold whitespace-nowrap">Date Paid</th>
                      <th className="py-4 px-4 font-semibold whitespace-nowrap">Staff Member</th>
                      <th className="py-4 px-4 font-semibold text-right whitespace-nowrap">Base Amount</th>
                      <th className="py-4 px-4 font-semibold text-right whitespace-nowrap">Bonus</th>
                      <th className="py-4 px-4 font-semibold text-right whitespace-nowrap">Deduction</th>
                      <th className="py-4 px-4 font-semibold text-right whitespace-nowrap">Advance</th>
                      <th className="py-4 px-4 font-semibold text-right whitespace-nowrap">Net Paid</th>
                      <th className="py-4 px-4 font-semibold text-center whitespace-nowrap">Status</th>
                      <th className="py-4 px-4 font-semibold text-center whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {history.map((record) => {
                      const baseAmount = record.amount - record.bonus + record.deduction + record.advance_deduction;
                      return (
                        <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2.5">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                <Calendar size={14} className="text-slate-400" />
                              </div>
                              <span className="text-sm font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">{record.date}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0 ${getAvatarColor(record.staff_name)}`}>
                                {getInitials(record.staff_name)}
                              </div>
                              <span className="font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap">{record.staff_name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="font-mono font-medium text-sm text-slate-600 dark:text-400 whitespace-nowrap">
                              {formatCurrency(baseAmount)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {record.bonus > 0 ? (
                              <span className="inline-flex items-center space-x-1 font-mono font-semibold text-sm text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                <ArrowUpRight size={12} />
                                <span>{formatCurrency(record.bonus)}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {record.deduction > 0 ? (
                              <span className="inline-flex items-center space-x-1 font-mono font-semibold text-sm text-red-500 dark:text-red-400 whitespace-nowrap">
                                <ArrowDownRight size={12} />
                                <span>{formatCurrency(record.deduction)}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {record.advance_deduction > 0 ? (
                              <span className="inline-flex items-center space-x-1 font-mono font-semibold text-sm text-orange-500 dark:text-orange-400 whitespace-nowrap">
                                <span>{formatCurrency(record.advance_deduction)}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="font-mono font-extrabold text-base text-slate-900 dark:text-white whitespace-nowrap">
                              {formatCurrency(record.amount)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center space-x-1.5 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-200 dark:border-emerald-500/25 whitespace-nowrap">
                              <Check size={11} strokeWidth={3} />
                              <span>Completed</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handlePrintSlip(record)}
                              className="inline-flex items-center space-x-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                            >
                              <Printer size={14} />
                              <span>Slip</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-16 text-center">
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
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">{formatCurrency(totalNet)}</span>
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

      {/* Advance Salary Modal */}
      {showAdvanceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex items-center space-x-4 mb-5">
                <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Banknote size={24} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">Advance Salary</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Record an advance payment.</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Staff Member</label>
                  <select
                    value={advanceStaffId}
                    onChange={(e) => setAdvanceStaffId(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:text-white"
                  >
                    <option value="" disabled>Select Staff</option>
                    {rows.map(r => (
                      <option key={r.staff_id} value={r.staff_id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Amount (Rs.)</label>
                  <input
                    type="number"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={advanceDate}
                    onChange={(e) => setAdvanceDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Note (Optional)</label>
                  <input
                    type="text"
                    value={advanceNote}
                    onChange={(e) => setAdvanceNote(e.target.value)}
                    placeholder="Reason for advance"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowAdvanceModal(false)}
                  disabled={advancing}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayAdvanceSalary}
                  disabled={advancing || !advanceStaffId || !advanceAmount}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-lg shadow-amber-600/20 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <span>{advancing ? 'Saving...' : 'Record Advance'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AlertModal
        isOpen={printError !== null}
        title="Print Failed"
        message={printError || ""}
        type="danger"
        onClose={() => setPrintError(null)}
      />
    </div>
  );
}

