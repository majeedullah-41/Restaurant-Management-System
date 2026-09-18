import { useState, useEffect, useRef } from 'react';
import { invoke } from '../../lib/api';
import { formatCurrency, todayLocal } from '../../lib/utils';
import { Users, Banknote, Calendar, ArrowRight, Printer, Trash2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { useReactToPrint } from 'react-to-print';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import DateFilterToolbar from '../../components/DateFilterToolbar';
import PayrollEditDrawer from '../../components/PayrollEditDrawer';
import PayrollSlipTemplate from '../../components/PayrollSlipTemplate';
import { ConfirmModal } from '../../components/ConfirmModal';
import { MoneyInput } from '../../components/MoneyInput';
import { PayrollPeriod, PayrollRecordRow, SalaryPayout } from './types';

export default function ProcessPayroll() {
  const toast = useToast();
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecordRow | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Give Advance modal state
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false);
  const [staffList, setStaffList] = useState<{ id: number; name: string; role?: string; salary?: number }[]>([]);
  const [advanceStaffId, setAdvanceStaffId] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceNote, setAdvanceNote] = useState('');
  const [savingAdvance, setSavingAdvance] = useState(false);

  // Delete payroll record state
  const [deleteTarget, setDeleteTarget] = useState<PayrollRecordRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteRecord = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await invoke('delete_payroll_record', { recordId: deleteTarget.id });
      setDeleteTarget(null);
      toast.success(`Removed payroll record for ${deleteTarget.name}.`);
      await fetchPeriod();
    } catch (e: any) {
      console.error(e);
      toast.error(String(e));
    } finally {
      setDeleting(false);
    }
  };

  // Salary slip print state
  const { user } = useAuth();
  const adminName = user?.display_name || 'Admin';
  const [slipRow, setSlipRow] = useState<PayrollRecordRow | null>(null);
  const slipRef = useRef<HTMLDivElement>(null);
  const [restaurantName, setRestaurantName] = useState('RESTAURANT');
  const [restaurantLogo, setRestaurantLogo] = useState<string | null>(null);

  const triggerSlipPrint = useReactToPrint({
    contentRef: slipRef,
    pageStyle: '@page { size: 80mm auto; margin: 0; }',
  });

  useEffect(() => {
    invoke<any>('get_settings')
      .then((settings) => {
        if (settings?.restaurant_name) setRestaurantName(settings.restaurant_name.toUpperCase());
        if (settings?.logo_path) setRestaurantLogo(settings.logo_path);
      })
      .catch(() => {});
  }, []);

  const fetchStaff = async () => {
    try {
      const data = await invoke<any[]>('get_staff_dropdown');
      setStaffList(data.map(s => ({
        id: s.id,
        name: s.name,
        role: s.category_name || s.role,
        salary: s.salary,
      })));
    } catch (e) {
      console.error(e);
    }
  };

  const handleGiveAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceStaffId || !advanceAmount) return;
    try {
      setSavingAdvance(true);
      const staff = staffList.find(s => s.id === parseInt(advanceStaffId));
      await invoke('pay_advance_salary', {
        staffId: parseInt(advanceStaffId),
        amount: parseFloat(advanceAmount),
        date: todayLocal(),
        note: advanceNote,
        staffName: staff?.name || '',
      });
      setAdvanceModalOpen(false);
      setAdvanceAmount('');
      setAdvanceNote('');
      setAdvanceStaffId('');
      toast.success('Advance salary recorded.');
      await fetchPeriod();
    } catch (e: any) {
      console.error(e);
      toast.error(String(e));
    } finally {
      setSavingAdvance(false);
    }
  };

  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      fetchPeriod();
    }
  }, [dateRange]);

  const fetchPeriod = async () => {
    try {
      setLoading(true);
      const data = await invoke<PayrollPeriod>('get_payroll_period', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      });
      setPeriod(data);
      // Clear selection on refresh
      setSelectedIds(new Set());
      setLoadError(null);
    } catch (e: any) {
      console.error(e);
      setLoadError(String(e));
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDrawer = async (id: number, bonus: number, deduction: number, advanceDeduction: number) => {
    try {
      setSavingRecord(true);
      const updated = await invoke<PayrollRecordRow>('update_payroll_record', {
        recordId: id,
        bonus,
        deduction,
        advanceDeduction,
      });
      setPeriod(prev => prev ? { ...prev, rows: prev.rows.map(r => r.id === id ? updated : r) } : prev);
      setSelectedRecord(updated); // Update drawer
      toast.success('Adjustments saved successfully.');
    } catch (e: any) {
      console.error(e);
      toast.error(String(e));
    } finally {
      setSavingRecord(false);
    }
  };

  const executeProcessPayroll = async () => {
    if (!period) return;
    try {
      setProcessing(true);

      const msg = await invoke<string>('process_payroll_batch', {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        recordIds: Array.from(selectedIds),
      });
      toast.success(msg);
      await fetchPeriod();
    } catch (e: any) {
      console.error(e);
      toast.error(String(e));
    } finally {
      setProcessing(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!period) return;
    const pendingIds = period.rows.filter(r => r.status === 'Pending').map(r => r.id);
    if (selectedIds.size === pendingIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingIds));
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500/15 text-blue-600 border-blue-500/20',
      'bg-purple-500/15 text-purple-600 border-purple-500/20',
      'bg-emerald-500/15 text-emerald-600 border-emerald-500/20',
      'bg-amber-500/15 text-amber-600 border-amber-500/20',
      'bg-rose-500/15 text-rose-600 border-rose-500/20',
      'bg-cyan-500/15 text-cyan-600 border-cyan-500/20',
      'bg-indigo-500/15 text-indigo-600 border-indigo-500/20',
    ];
    const index = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  const summary = period?.summary;
  const rows = period?.rows ?? [];
  const pendingRows = rows.filter(r => r.status === 'Pending');
  
  // Progress calculations
  const totalStaff = summary?.total_staff || 0;
  const paidCount = summary?.paid_count || 0;
  const pendingCount = summary?.pending_count || 0;
  const progressPercent = totalStaff > 0 ? (paidCount / totalStaff) * 100 : 0;
  const totalRemaining = summary?.total_remaining || 0;

  // Selected totals
  const selectedNet = Array.from(selectedIds).reduce((sum, id) => {
    const r = rows.find(x => x.id === id);
    return sum + (r ? r.net_pay : 0);
  }, 0);

  // Derive month name from startDate (e.g. "August 2026")
  const periodTitle = dateRange.startDate 
    ? new Date(dateRange.startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Payroll';

  const [slipTransactions, setSlipTransactions] = useState<any[]>([]);

  const slipPayout: SalaryPayout | null = slipRow ? {
    id: slipRow.id,
    staff_id: slipRow.staff_id,
    staff_name: slipRow.name,
    amount: slipRow.net_pay,
    bonus: slipRow.bonus,
    deduction: slipRow.deduction,
    advance_deduction: slipRow.advance_deduction,
    payout_type: 'Salary',
    note: null,
    date: slipRow.paid_at || todayLocal(),
    status: slipRow.status,
    payroll_id: slipRow.payroll_id,
    paid_at: slipRow.paid_at,
    advance_balance: slipRow.advance_balance,
    transactions: slipTransactions,
  } : null;

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="payroll_process" />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors min-w-0 relative">
        <Header title="Payroll Management" subtitle="Process salary, manage advances and keep payroll records." />

        <div className="flex-1 overflow-y-auto pb-[100px]">
          
          <div className="p-4 md:p-6 lg:p-8 flex flex-col max-w-[1400px] mx-auto w-full">
            
            {/* Top Toolbar */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex-1"></div>
              <div className="flex items-center space-x-4">
                <DateFilterToolbar
                  onDateRangeChange={(startDate, endDate) => setDateRange({ startDate, endDate })}
                  defaultMode="month"
                />
                <button
                  onClick={() => {
                    fetchStaff();
                    setAdvanceModalOpen(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center space-x-2 shadow-lg shadow-blue-600/20"
                >
                  <Banknote size={16} />
                  <span>Give Advance</span>
                </button>
              </div>
            </div>

            {/* Error / Success */}

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
            ) : loadError ? (
              <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <AlertCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">Failed to load payroll</h3>
                <p className="text-slate-500">Could not retrieve the payroll period. Check your connection and try again.</p>
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <div className="bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        <Users size={18} />
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Staff</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{summary?.total_staff || 0}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium ml-[52px]">Active Employees</p>
                  </div>

                  <div className="bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        <Banknote size={18} />
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Gross Salary</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{formatCurrency(summary?.total_gross || 0)}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium ml-[52px]">Total Base Salary</p>
                  </div>

                  <div className="bg-orange-50/50 dark:bg-orange-500/5 border border-orange-100 dark:border-orange-500/10 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                        <Calendar size={18} />
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Advances Paid</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{formatCurrency(summary?.advance_outstanding || 0)}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium ml-[52px]">To be deducted</p>
                  </div>

                  <div className="bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <Banknote size={18} />
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">Net Payable</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{formatCurrency(summary?.total_remaining || 0)}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium ml-[52px]">After adjustments</p>
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  
                  {/* Progress Header */}
                  <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">{periodTitle} Payroll</h3>
                      <div className="flex items-center space-x-4 text-sm font-semibold">
                        <span className="text-slate-500">{paidCount} of {totalStaff} employees paid</span>
                        <span className="text-orange-500">{pendingCount} Pending</span>
                        <span className="text-slate-400">{formatCurrency(totalRemaining)} Remaining</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" 
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead>
                        <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                          <th className="py-4 px-6 w-12 border-r border-slate-200 dark:border-slate-800">
                            <input 
                              type="checkbox" 
                              checked={pendingRows.length > 0 && selectedIds.size === pendingRows.length}
                              onChange={toggleSelectAll}
                              disabled={pendingRows.length === 0}
                              className="w-5 h-5 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          <th className="py-4 px-4 border-r border-slate-200 dark:border-slate-800">Staff</th>
                          <th className="py-4 px-4 text-center border-r border-slate-200 dark:border-slate-800">Attendance</th>
                          <th className="py-4 px-4 text-right border-r border-slate-200 dark:border-slate-800">Salary</th>
                          <th className="py-4 px-4 text-right border-r border-slate-200 dark:border-slate-800">Advance</th>
                          <th className="py-4 px-4 text-right border-r border-slate-200 dark:border-slate-800">Net Pay</th>
                          <th className="py-4 px-4 text-center border-r border-slate-200 dark:border-slate-800">Status</th>
                          <th className="py-4 px-6 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors cursor-pointer" onClick={(e) => {
                            // Don't open drawer if clicking checkbox
                            if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'BUTTON') {
                              setSelectedRecord(row);
                              setDrawerOpen(true);
                            }
                          }}>
                            <td className="py-3 px-6 border-r border-slate-200 dark:border-slate-800">
                              <input 
                                type="checkbox"
                                checked={selectedIds.has(row.id)}
                                onChange={() => toggleSelect(row.id)}
                                disabled={row.status !== 'Pending'}
                                className="w-5 h-5 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                              />
                            </td>
                            <td className="py-3 px-4 border-r border-slate-200 dark:border-slate-800">
                              <div className="flex items-center space-x-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${getAvatarColor(row.name)}`}>
                                  {getInitials(row.name)}
                                </div>
                                <span className="font-bold text-sm text-slate-900 dark:text-white">
                                  {row.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center border-r border-slate-200 dark:border-slate-800">
                              <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md">
                                {row.days_present} / 26
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                              {formatCurrency(row.base_salary)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm border-r border-slate-200 dark:border-slate-800">
                              {row.advance_deduction > 0 ? (
                                <div className="flex flex-col items-end">
                                  <span className="text-red-500">-{formatCurrency(row.advance_deduction)}</span>
                                  {row.advance_balance > 0 && <span className="text-[10px] text-amber-600 mt-0.5">Bal: {formatCurrency(row.advance_balance)}</span>}
                                </div>
                              ) : row.advance_balance > 0 ? (
                                <span className="text-amber-600">Bal: {formatCurrency(row.advance_balance)}</span>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-sm font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">
                              {formatCurrency(row.net_pay)}
                            </td>
                            <td className="py-3 px-4 text-center border-r border-slate-200 dark:border-slate-800">
                              {row.status === 'Pending' ? (
                                <span className="text-orange-500 bg-orange-50 dark:bg-orange-500/10 px-3 py-1 rounded-full text-xs font-bold">
                                  Pending
                                </span>
                              ) : (
                                <span className="text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-full text-xs font-bold">
                                  Paid
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-6 text-center">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      const txs = await invoke<any[]>('get_advance_transactions_for_record', { recordId: row.id });
                                      setSlipTransactions(txs);
                                    } catch (err) {
                                      console.error("Failed to load transactions", err);
                                      setSlipTransactions([]);
                                    }
                                    setSlipRow(row);
                                  }}
                                  title="Print salary slip"
                                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                                >
                                  <Printer size={16} />
                                </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecord(row);
                                  setDrawerOpen(true);
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(row);
                                }}
                                title="Delete record"
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-200"
                              >
                                <Trash2 size={16} />
                              </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>



                </div>
              </>
            )}

          </div>
        </div>

        {/* Sticky Action Footer */}
        {pendingRows.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-4 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-20">
            <div className="max-w-[1400px] mx-auto flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-500">
                {selectedIds.size} selected
              </div>
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-slate-500 font-semibold">Total to Pay (Selected)</span>
                  <span className="text-xl font-bold text-emerald-600">{formatCurrency(selectedNet)}</span>
                </div>
                <button
                  onClick={executeProcessPayroll}
                  disabled={processing || selectedIds.size === 0}
                  data-testid="process-payroll-btn"
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold px-8 py-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center space-x-2"
                >
                  <span>{processing ? 'Processing...' : 'Process Payroll'}</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      <PayrollEditDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        record={selectedRecord}
        onSave={handleSaveDrawer}
        saving={savingRecord}
      />

      {/* Delete Payroll Record Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Payroll Record"
        type="danger"
        message={
          deleteTarget
            ? `Delete the ${deleteTarget.name} payroll record for this period (net ${formatCurrency(deleteTarget.net_pay)})? ${
                deleteTarget.status === 'Paid'
                  ? 'The payout and expense will be removed and any recovered advance will be restored.'
                  : 'This removes the record from the period.'
              }`
            : ''
        }
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteRecord}
      />

      {/* Salary Slip Preview Modal */}
      {slipPayout && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-200 dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
            <div className="bg-white dark:bg-slate-900 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Printer size={20} className="text-blue-600" />
                <span>Salary Slip - {slipPayout.staff_name}</span>
              </h3>
              <button onClick={() => setSlipRow(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="p-6 overflow-auto max-h-[65vh] flex justify-center bg-slate-50 dark:bg-slate-900/50">
              <PayrollSlipTemplate
                ref={slipRef}
                visible
                payout={slipPayout}
                restaurantName={restaurantName}
                logoUrl={restaurantLogo || undefined}
                adminName={adminName}
              />
            </div>

            <div className="bg-white dark:bg-slate-900 px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end space-x-3">
              <button
                onClick={() => setSlipRow(null)}
                className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => triggerSlipPrint()}
                className="px-5 py-2.5 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 flex items-center space-x-2"
              >
                <Printer size={16} />
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Give Advance Modal */}
      {advanceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Banknote size={20} className="text-blue-600" />
                <span>Give Advance</span>
              </h3>
              <button onClick={() => setAdvanceModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleGiveAdvance} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Staff Member</label>
                <select
                  required
                  value={advanceStaffId}
                  onChange={e => setAdvanceStaffId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select staff...</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.role ? `(${s.role})` : ''} - {formatCurrency(s.salary || 0)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Advance Amount (Rs)</label>
                <MoneyInput
                  required
                  value={advanceAmount}
                  onChange={setAdvanceAmount}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. 5,000"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Note (Optional)</label>
                <input
                  type="text"
                  value={advanceNote}
                  onChange={e => setAdvanceNote(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Reason for advance..."
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setAdvanceModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAdvance || !advanceStaffId || !advanceAmount}
                  className="px-5 py-2.5 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-600/20"
                >
                  {savingAdvance ? 'Saving...' : 'Confirm Advance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
