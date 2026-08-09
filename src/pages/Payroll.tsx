import { useState, useEffect, useRef } from 'react';
import { invoke } from '../lib/api';
import { formatCurrency, todayLocal } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { CreditCard, Calendar, CheckCircle, Clock, History, Users, Check, AlertCircle, ArrowUpRight, ArrowDownRight, Banknote, Printer, RotateCcw, XCircle } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import DateFilterToolbar from '../components/DateFilterToolbar';
import PayrollSlipTemplate from '../components/PayrollSlipTemplate';

export interface SalaryPayout {
  id: number;
  staff_id: number;
  staff_name: string;
  amount: number;
  bonus: number;
  deduction: number;
  advance_deduction: number;
  payout_type: string;
  note: string | null;
  date: string;
}

export interface PayrollRecordRow {
  id: number;
  staff_id: number;
  name: string;
  category_name: string | null;
  base_salary: number;
  days_present: number;
  advance_balance: number;
  bonus: number;
  deduction: number;
  advance_deduction: number;
  gross_pay: number;
  net_pay: number;
  status: string;
  payroll_id: string | null;
  paid_at: string | null;
}

interface PayrollPeriodSummary {
  total_staff: number;
  total_gross: number;
  advance_outstanding: number;
  total_paid: number;
  total_remaining: number;
  paid_count: number;
  pending_count: number;
}

interface PayrollPeriod {
  start_date: string;
  end_date: string;
  summary: PayrollPeriodSummary;
  rows: PayrollRecordRow[];
}

interface PayrollHistoryPeriod {
  start_date: string;
  end_date: string;
  paid_at: string | null;
  total_count: number;
  paid_count: number;
  total_net: number;
  rows: PayrollRecordRow[];
}

type EditableField = 'bonus' | 'deduction' | 'advance_deduction';

export default function Payroll() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'process' | 'history'>('process');

  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [history, setHistory] = useState<PayrollHistoryPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceStaffId, setAdvanceStaffId] = useState<number | ''>('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(todayLocal());
  const [advanceNote, setAdvanceNote] = useState('');
  const [advancing, setAdvancing] = useState(false);

  const [selectedPrintPayout, setSelectedPrintPayout] = useState<SalaryPayout | null>(null);
  const [restaurantName, setRestaurantName] = useState('Restaurant');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<string>('get_restaurant_name')
      .then(setRestaurantName)
      .catch(() => setRestaurantName('Restaurant'));
  }, []);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Payroll_Slip',
  });

  useEffect(() => {
    setSuccessMsg(null);
    setErrorMsg(null);
    if (!dateRange.startDate || !dateRange.endDate) return;

    if (activeTab === 'process') {
      fetchPeriod();
    } else {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, dateRange]);

  const fetchPeriod = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await invoke<PayrollPeriod>('get_payroll_period', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      setPeriod(data);
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
      setErrorMsg(null);
      const data = await invoke<PayrollHistoryPeriod[]>('get_payroll_history', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      setHistory(data);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
    } finally {
      setLoading(false);
    }
  };

  const rows = period?.rows ?? [];

  const updateRowValue = (id: number, field: EditableField, value: string) => {
    if (!period) return;
    const num = Math.max(0, Number(value) || 0);
    setPeriod({
      ...period,
      rows: period.rows.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: num };
        const advanceDed = field === 'advance_deduction' ? num : updated.advance_deduction;
        const bonus = field === 'bonus' ? num : updated.bonus;
        const deduction = field === 'deduction' ? num : updated.deduction;
        updated.gross_pay = updated.base_salary + bonus;
        updated.net_pay = Math.max(0, updated.base_salary + bonus - deduction - advanceDed);
        return updated;
      }),
    });
  };

  const saveRow = async (id: number) => {
    const row = rows.find(r => r.id === id);
    if (!row || row.status !== 'Pending') return;
    setSavingId(id);
    try {
      setErrorMsg(null);
      const updated = await invoke<PayrollRecordRow>('update_payroll_record', {
        recordId: id,
        bonus: row.bonus,
        deduction: row.deduction,
        advanceDeduction: row.advance_deduction,
      });
      setPeriod(prev => prev ? { ...prev, rows: prev.rows.map(r => r.id === id ? updated : r) } : prev);
      setSuccessMsg('Payroll adjustments saved.');
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
      await fetchPeriod();
    } finally {
      setSavingId(null);
    }
  };

  const handleProcessPayroll = () => {
    setShowConfirmModal(true);
  };

  const executeProcessPayroll = async () => {
    setShowConfirmModal(false);
    try {
      setProcessing(true);
      setErrorMsg(null);
      const msg = await invoke<string>('process_payroll_batch', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      setSuccessMsg(msg);
      await fetchPeriod();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
    } finally {
      setProcessing(false);
    }
  };

  const handleReopenPeriod = async (sd: string, ed: string) => {
    if (!window.confirm('Reopen this payroll period? Payments and advance deductions will be reversed and you can review again.')) return;
    try {
      setProcessing(true);
      setErrorMsg(null);
      const msg = await invoke<string>('reopen_payroll', { startDate: sd, endDate: ed });
      setSuccessMsg(msg);
      await fetchPeriod();
      if (activeTab === 'history') await fetchHistory();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
    } finally {
      setProcessing(false);
    }
  };

  const handleVoidPeriod = async (sd: string, ed: string) => {
    if (!window.confirm('Void this payroll period? Payments and advance deductions will be reversed and the records marked Void. This cannot be undone.')) return;
    try {
      setProcessing(true);
      setErrorMsg(null);
      const msg = await invoke<string>('void_payroll', { startDate: sd, endDate: ed });
      setSuccessMsg(msg);
      await fetchPeriod();
      if (activeTab === 'history') await fetchHistory();
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

      setAdvanceStaffId('');
      setAdvanceAmount('');
      setAdvanceNote('');
      setAdvanceDate(dateRange.endDate || todayLocal());

      if (dateRange.startDate) {
        await fetchPeriod();
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
      setShowAdvanceModal(false);
    } finally {
      setAdvancing(false);
    }
  };

  const toSlipPayout = (row: PayrollRecordRow, periodEnd: string): SalaryPayout => ({
    id: row.id,
    staff_id: row.staff_id,
    staff_name: row.name,
    amount: row.net_pay,
    bonus: row.bonus,
    deduction: row.deduction,
    advance_deduction: row.advance_deduction,
    payout_type: 'Salary',
    note: row.payroll_id ? `Payroll #${row.payroll_id}` : null,
    date: row.paid_at || periodEnd,
  });

  const handlePrintSlip = async (row: PayrollRecordRow, periodEnd: string) => {
    setSelectedPrintPayout(toSlipPayout(row, periodEnd));
    setTimeout(() => {
      handlePrint();
    }, 100);
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

  const pendingRows = rows.filter(r => r.status === 'Pending');
  const paidRows = rows.filter(r => r.status === 'Paid');
  const voidRows = rows.filter(r => r.status === 'Void');
  const pendingNet = pendingRows.reduce((s, r) => s + r.net_pay, 0);
  const totalPaidNet = paidRows.reduce((s, r) => s + r.net_pay, 0);

  const summary = period?.summary;

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <div className="hidden">
        <div ref={printRef}>
          {selectedPrintPayout && (
            <PayrollSlipTemplate
              payout={selectedPrintPayout}
              restaurantName={restaurantName}
              adminName={user?.display_name || user?.role || 'Admin'}
            />
          )}
        </div>
      </div>
      <Sidebar activePage="payroll" />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors min-w-0">
        <Header title="Payroll Management" subtitle="Review staff attendance and process monthly salary payouts." />

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto flex flex-col">

          {activeTab === 'process' && !loading && summary && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm mb-1 truncate">Staff</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white whitespace-nowrap">{summary.total_staff}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm mb-1 truncate">Gross Payroll</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white whitespace-nowrap">{formatCurrency(summary.total_gross)}</p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-orange-600 dark:text-orange-400 font-semibold text-sm mb-1 truncate">Advance Outstanding</p>
                <p className="text-3xl font-black text-orange-700 dark:text-orange-500 whitespace-nowrap">{formatCurrency(summary.advance_outstanding)}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-600/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-emerald-600 dark:text-emerald-400 font-semibold text-sm mb-1 truncate">Paid Out</p>
                <p className="text-3xl font-black text-emerald-700 dark:text-emerald-500 whitespace-nowrap">{formatCurrency(summary.total_paid)}</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-600/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
                <p className="text-amber-600 dark:text-amber-400 font-semibold text-sm mb-1 truncate">Pending</p>
                <p className="text-3xl font-black text-amber-700 dark:text-amber-500 whitespace-nowrap">{formatCurrency(summary.total_remaining)}</p>
              </div>
            </div>
          )}

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
                  <span>Payroll History</span>
                </div>
              </button>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  if (dateRange.endDate) {
                    setAdvanceDate(dateRange.endDate);
                  }
                  setShowAdvanceModal(true);
                }}
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

          {successMsg && (
            <div className="mb-3 flex items-center space-x-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                <CheckCircle size={16} />
              </div>
              <span className="flex-1">{successMsg}</span>
              <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600 text-xs font-bold px-2 py-1 rounded-md hover:bg-emerald-500/10 transition-colors">Dismiss</button>
            </div>
          )}

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
                {period && paidRows.length > 0 && (
                  <div className="flex items-center justify-between px-5 py-3 bg-emerald-50/60 dark:bg-emerald-500/[0.04] border-b border-emerald-200 dark:border-emerald-500/20 shrink-0">
                    <div className="flex items-center space-x-3 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
                      <CheckCircle size={16} />
                      <span>
                        {summary?.paid_count ?? paidRows.length} of {summary?.total_staff ?? rows.length} staff already paid for this period ({formatCurrency(totalPaidNet)}).
                      </span>
                    </div>
                    <button
                      onClick={() => handleReopenPeriod(period.start_date, period.end_date)}
                      disabled={processing}
                      className="inline-flex items-center space-x-1.5 bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={13} />
                      <span>Reopen</span>
                    </button>
                  </div>
                )}
                {period && voidRows.length > 0 && (
                  <div className="flex items-center justify-between px-5 py-3 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <div className="flex items-center space-x-3 text-slate-500 dark:text-slate-400 text-sm font-semibold">
                      <XCircle size={16} />
                      <span>{voidRows.length} payroll record{voidRows.length !== 1 ? 's' : ''} in this period have been voided.</span>
                    </div>
                  </div>
                )}

                {/* Process Payroll Table */}
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50/80 dark:bg-slate-800/60 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                        <th className="py-4 px-5 font-semibold whitespace-nowrap">Staff Member</th>
                        <th className="py-4 px-2 font-semibold whitespace-nowrap">Category</th>
                        <th className="py-4 px-2 font-semibold text-center whitespace-nowrap">Attendance</th>
                        <th className="py-4 px-2 font-semibold text-right whitespace-nowrap">Base Salary</th>
                        <th className="py-4 px-2 font-semibold text-center whitespace-nowrap">Bonus</th>
                        <th className="py-4 px-2 font-semibold text-center whitespace-nowrap">Deduction</th>
                        <th className="py-4 px-2 font-semibold text-center whitespace-nowrap">Advance Bal.</th>
                        <th className="py-4 px-2 font-semibold text-center whitespace-nowrap">Advance Ded.</th>
                        <th className="py-4 px-2 font-semibold text-right whitespace-nowrap">Net Pay</th>
                        <th className="py-4 px-3 font-semibold text-center whitespace-nowrap">Status</th>
                        <th className="py-4 px-3 font-semibold text-center whitespace-nowrap">Slip</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {rows.map((row) => {
                        const isPaid = row.status === 'Paid';
                        const isVoid = row.status === 'Void';
                        return (
                          <tr
                            key={row.id}
                            className={`transition-all duration-150 ${
                              isVoid
                                ? 'bg-slate-50/40 dark:bg-slate-800/20 opacity-60'
                                : isPaid
                                  ? 'bg-emerald-50/30 dark:bg-emerald-500/[0.03]'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                            }`}
                          >
                            <td className="py-3 px-5">
                              <div className="flex items-center space-x-3">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${getAvatarColor(row.name)}`}>
                                  {getInitials(row.name)}
                                </div>
                                <span className={`font-bold text-sm ${isPaid ? 'text-slate-400 dark:text-slate-500' : isVoid ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                                  {row.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                                isPaid || isVoid
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
                              <span className={`font-mono font-bold text-sm whitespace-nowrap ${isPaid || isVoid ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                {formatCurrency(row.base_salary)}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-center">
                              {isPaid || isVoid ? (
                                <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">{row.bonus > 0 ? formatCurrency(row.bonus) : '—'}</span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  value={row.bonus || ''}
                                  onChange={(e) => updateRowValue(row.id, 'bonus', e.target.value)}
                                  onBlur={() => saveRow(row.id)}
                                  placeholder="0"
                                  className="w-24 text-center bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-400 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 placeholder:text-emerald-300 dark:placeholder:text-emerald-700 transition-all"
                                />
                              )}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {isPaid || isVoid ? (
                                <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">{row.deduction > 0 ? formatCurrency(row.deduction) : '—'}</span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  value={row.deduction || ''}
                                  onChange={(e) => updateRowValue(row.id, 'deduction', e.target.value)}
                                  onBlur={() => saveRow(row.id)}
                                  placeholder="0"
                                  className="w-24 text-center bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-red-700 dark:text-red-400 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 placeholder:text-red-300 dark:placeholder:text-red-700 transition-all"
                                />
                              )}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {row.advance_balance > 0 ? (
                                <span className="font-mono text-sm font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                  {formatCurrency(row.advance_balance)}
                                </span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center">
                              {isPaid || isVoid ? (
                                <span className="font-mono text-sm font-semibold text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                  {row.advance_deduction > 0 ? `-${formatCurrency(row.advance_deduction)}` : '—'}
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  max={Math.max(0, row.advance_balance)}
                                  value={row.advance_deduction || ''}
                                  onChange={(e) => updateRowValue(row.id, 'advance_deduction', e.target.value)}
                                  onBlur={() => saveRow(row.id)}
                                  placeholder="0"
                                  title={`Max ${formatCurrency(row.advance_balance)}`}
                                  className="w-24 text-center bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-orange-700 dark:text-orange-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 placeholder:text-orange-300 dark:placeholder:text-orange-700 transition-all"
                                />
                              )}
                            </td>
                            <td className="py-3 px-2 text-right">
                              <span className={`font-mono font-bold text-base whitespace-nowrap ${
                                isPaid || isVoid ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'
                              }`}>
                                {formatCurrency(row.net_pay)}
                              </span>
                              {savingId === row.id && (
                                <span className="ml-2 text-[10px] text-slate-400 animate-pulse">saving…</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {isPaid ? (
                                <span className="inline-flex items-center space-x-1.5 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-3.5 py-1.5 rounded-full text-xs font-bold border border-emerald-200 dark:border-emerald-500/25 shadow-sm shadow-emerald-500/5 whitespace-nowrap">
                                  <Check size={12} strokeWidth={3} />
                                  <span>Paid</span>
                                </span>
                              ) : isVoid ? (
                                <span className="inline-flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400 px-3.5 py-1.5 rounded-full text-xs font-bold border border-slate-200 dark:border-slate-600 whitespace-nowrap">
                                  <XCircle size={12} />
                                  <span>Void</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center space-x-1.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3.5 py-1.5 rounded-full text-xs font-bold border border-amber-200 dark:border-amber-500/20 whitespace-nowrap">
                                  <Clock size={12} />
                                  <span>Pending</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {(isPaid) && (
                                <button
                                  onClick={() => handlePrintSlip(row, period!.end_date)}
                                  className="inline-flex items-center space-x-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                                >
                                  <Printer size={14} />
                                  <span>Slip</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {rows.length > 0 && rows.length < 8 && Array.from({ length: 8 - rows.length }).map((_, i) => (
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
                          <td className="py-3 px-3"></td>
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={11} className="py-16 text-center">
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
                {pendingRows.length > 0 && (
                  <div className="border-t-2 border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-800/60 dark:via-slate-800/40 dark:to-slate-800/60 px-6 py-4 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-5">
                        <div className="flex items-center space-x-2.5">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <Users size={14} className="text-blue-500" />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider leading-tight">Pending</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{pendingRows.length} staff</p>
                          </div>
                        </div>
                        <div className="h-10 w-px bg-slate-200 dark:bg-slate-700"></div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider leading-tight">Total Net</p>
                          <p className="text-base font-mono font-extrabold text-emerald-700 dark:text-emerald-400">{formatCurrency(pendingNet)}</p>
                        </div>
                      </div>

                      <button
                        onClick={handleProcessPayroll}
                        disabled={pendingRows.length === 0 || processing}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold px-7 py-3 rounded-xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all active:scale-[0.97] flex items-center space-x-2.5 text-sm"
                      >
                        <Banknote size={18} />
                        <span>{processing ? 'Processing...' : `Process Payroll (${pendingRows.length})`}</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Payroll History */
              <div className="flex-1 overflow-auto">
                {history.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="flex flex-col items-center space-y-3">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <History size={24} className="text-slate-400" />
                      </div>
                      <div>
                        <p className="text-slate-500 font-semibold text-sm">No payroll history yet</p>
                        <p className="text-slate-400 text-xs mt-1">Process your first payroll to see records here.</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  history.map((periodRec) => (
                    <div key={`${periodRec.start_date}-${periodRec.end_date}`} className="border-b border-slate-100 dark:border-slate-800/50">
                      <div className="flex items-center justify-between px-5 py-4 bg-slate-50/60 dark:bg-slate-800/30">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center shrink-0">
                            <Calendar size={16} className="text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              {periodRec.start_date} → {periodRec.end_date}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {periodRec.paid_count} of {periodRec.total_count} paid · {formatCurrency(periodRec.total_net)} total
                              {periodRec.paid_at ? ` · paid ${periodRec.paid_at}` : ''}
                            </p>
                          </div>
                        </div>
                        {periodRec.paid_count > 0 && (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleReopenPeriod(periodRec.start_date, periodRec.end_date)}
                              disabled={processing}
                              className="inline-flex items-center space-x-1.5 bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/25 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                            >
                              <RotateCcw size={13} />
                              <span>Reopen</span>
                            </button>
                            <button
                              onClick={() => handleVoidPeriod(periodRec.start_date, periodRec.end_date)}
                              disabled={processing}
                              className="inline-flex items-center space-x-1.5 bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/25 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                            >
                              <XCircle size={13} />
                              <span>Void</span>
                            </button>
                          </div>
                        )}
                      </div>
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                            <th className="py-3 px-5 font-semibold whitespace-nowrap">Staff Member</th>
                            <th className="py-3 px-2 font-semibold text-right whitespace-nowrap">Base</th>
                            <th className="py-3 px-2 font-semibold text-right whitespace-nowrap">Bonus</th>
                            <th className="py-3 px-2 font-semibold text-right whitespace-nowrap">Deduction</th>
                            <th className="py-3 px-2 font-semibold text-right whitespace-nowrap">Advance</th>
                            <th className="py-3 px-2 font-semibold text-right whitespace-nowrap">Net Paid</th>
                            <th className="py-3 px-3 font-semibold text-center whitespace-nowrap">Status</th>
                            <th className="py-3 px-3 font-semibold text-center whitespace-nowrap">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                          {periodRec.rows.map((row) => {
                            const isPaid = row.status === 'Paid';
                            const isVoid = row.status === 'Void';
                            return (
                              <tr key={row.id} className={`transition-colors ${isVoid ? 'opacity-50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/20'}`}>
                                <td className="py-3 px-5">
                                  <div className="flex items-center space-x-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0 ${getAvatarColor(row.name)}`}>
                                      {getInitials(row.name)}
                                    </div>
                                    <span className="font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap">{row.name}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <span className="font-mono font-medium text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatCurrency(row.base_salary)}</span>
                                </td>
                                <td className="py-3 px-2 text-right">
                                  {row.bonus > 0 ? (
                                    <span className="inline-flex items-center space-x-1 font-mono font-semibold text-sm text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                      <ArrowUpRight size={12} />
                                      <span>{formatCurrency(row.bonus)}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-2 text-right">
                                  {row.deduction > 0 ? (
                                    <span className="inline-flex items-center space-x-1 font-mono font-semibold text-sm text-red-500 dark:text-red-400 whitespace-nowrap">
                                      <ArrowDownRight size={12} />
                                      <span>{formatCurrency(row.deduction)}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-2 text-right">
                                  {row.advance_deduction > 0 ? (
                                    <span className="font-mono font-semibold text-sm text-orange-500 dark:text-orange-400 whitespace-nowrap">{formatCurrency(row.advance_deduction)}</span>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-600 font-mono text-sm">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-2 text-right">
                                  <span className="font-mono font-extrabold text-base text-slate-900 dark:text-white whitespace-nowrap">{formatCurrency(row.net_pay)}</span>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {isPaid ? (
                                    <span className="inline-flex items-center space-x-1.5 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-200 dark:border-emerald-500/25 whitespace-nowrap">
                                      <Check size={11} strokeWidth={3} />
                                      <span>Paid</span>
                                    </span>
                                  ) : isVoid ? (
                                    <span className="inline-flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400 px-3 py-1.5 rounded-full text-xs font-bold border border-slate-200 dark:border-slate-600 whitespace-nowrap">
                                      <XCircle size={11} />
                                      <span>Void</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center space-x-1.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-full text-xs font-bold border border-amber-200 dark:border-amber-500/20 whitespace-nowrap">
                                      <Clock size={11} />
                                      <span>Pending</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  {isPaid && (
                                    <button
                                      onClick={() => handlePrintSlip(row, periodRec.end_date)}
                                      className="inline-flex items-center space-x-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                                    >
                                      <Printer size={14} />
                                      <span>Slip</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
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
                  <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Period</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{period?.start_date} → {period?.end_date}</span>
                </div>
                <div className="h-px bg-slate-200 dark:bg-slate-700/50 w-full" />
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Staff to pay</span>
                  <span className="font-bold text-slate-900 dark:text-white">{pendingRows.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 text-sm font-medium">Total payout</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-lg">{formatCurrency(pendingNet)}</span>
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
                  onClick={executeProcessPayroll}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-600/20 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <span>{processing ? 'Processing...' : 'Confirm & Pay'}</span>
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
      {selectedPrintPayout && (
        <PayrollSlipTemplate
          ref={printRef}
          payout={selectedPrintPayout}
          restaurantName={restaurantName}
          adminName={user?.display_name || user?.role || 'Admin'}
        />
      )}
    </div>
  );
}
