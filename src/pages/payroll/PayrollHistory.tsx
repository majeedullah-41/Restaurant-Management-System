import { useState, useEffect, useRef } from 'react';
import { invoke } from '../../lib/api';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { Clock, Calendar, Download, Trash2 } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import DateFilterToolbar from '../../components/DateFilterToolbar';
import { ConfirmModal } from '../../components/ConfirmModal';
import { PayrollReportTemplate } from '../../components/PayrollReportTemplate';
import { todayLocal } from '../../lib/utils';
import { PayrollHistoryPeriod } from './types';

export default function PayrollHistory() {
  const [history, setHistory] = useState<PayrollHistoryPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [restaurantName, setRestaurantName] = useState('Restaurant POS');
  const [restaurantLogo, setRestaurantLogo] = useState<string | null>(null);

  // Delete period state
  const [deleteTarget, setDeleteTarget] = useState<PayrollHistoryPeriod | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeletePeriod = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      setErrorMsg(null);
      await invoke('delete_payroll_period', {
        startDate: deleteTarget.start_date,
        endDate: deleteTarget.end_date,
      });
      setDeleteTarget(null);
      await fetchHistory();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
    } finally {
      setDeleting(false);
    }
  };

  // Date filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(todayLocal());
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(todayLocal());

  useEffect(() => {
    fetchHistory();
  }, [startDate, endDate]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await invoke<PayrollHistoryPeriod[]>('get_payroll_history', {
        startDate,
        endDate
      });
      setHistory(data);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  useEffect(() => {
    invoke<any>('get_settings')
      .then((settings) => {
        if (settings?.restaurant_name) setRestaurantName(settings.restaurant_name);
        if (settings?.logo_path) setRestaurantLogo(settings.logo_path);
      })
      .catch(() => {});
  }, []);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Payroll_Report_${startDate}_to_${endDate}`,
  });

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="payroll_history" />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors min-w-0">
        <Header title="Payroll History" subtitle="View previously processed payroll batches." />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-[1200px] mx-auto w-full space-y-6">
            
            <div className="flex items-center justify-between gap-4">
              <DateFilterToolbar 
                onDateRangeChange={(start, end) => {
                  setStartDate(start);
                  setEndDate(end);
                }}
                defaultMode="month"
              />
              <button
                onClick={() => handlePrint()}
                disabled={loading || history.length === 0}
                className="shrink-0 px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 border border-slate-200 dark:border-slate-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                Export PDF
              </button>
            </div>

            {errorMsg && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold border border-red-200">
                {errorMsg}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <Clock className="mx-auto h-12 w-12 text-slate-400 mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-white">No history found</h3>
                <p className="text-slate-500">No payroll periods have been processed yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {history.map((period, idx) => (
                  <div key={idx} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                          <Calendar size={24} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                            {new Date(period.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - {new Date(period.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </h3>
                          <p className="text-sm text-slate-500 font-medium">
                            Processed on {period.paid_at ? formatDateTime(period.paid_at) : 'Unknown'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-sm text-slate-500 font-medium mb-1">Total Paid ({period.paid_count} staff)</p>
                          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(period.total_net)}</p>
                        </div>
                        <button
                          onClick={() => setDeleteTarget(period)}
                          title="Delete this payroll period"
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                            <th className="py-3 px-6 border-r border-slate-200 dark:border-slate-800">Staff</th>
                            <th className="py-3 px-4 text-center border-r border-slate-200 dark:border-slate-800">Attendance</th>
                            <th className="py-3 px-4 text-right border-r border-slate-200 dark:border-slate-800">Base Salary</th>
                            <th className="py-3 px-4 text-right border-r border-slate-200 dark:border-slate-800">Bonus</th>
                            <th className="py-3 px-4 text-right border-r border-slate-200 dark:border-slate-800">Deduction</th>
                            <th className="py-3 px-4 text-right border-r border-slate-200 dark:border-slate-800">Advance</th>
                            <th className="py-3 px-4 text-right">Net Paid</th>
                          </tr>
                        </thead>
                        <tbody>
                          {period.rows.map(row => (
                            <tr key={row.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                              <td className="py-3 px-6 border-r border-slate-200 dark:border-slate-800">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {getInitials(row.name)}
                                  </div>
                                  <span className="font-semibold text-sm text-slate-900 dark:text-white">
                                    {row.name}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center border-r border-slate-200 dark:border-slate-800">
                                <span className="text-slate-600 dark:text-slate-400 text-xs font-semibold">
                                  {row.days_present} Days
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-sm text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                                {formatCurrency(row.base_salary)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-sm text-emerald-600 border-r border-slate-200 dark:border-slate-800">
                                {row.bonus > 0 ? `+${formatCurrency(row.bonus)}` : '—'}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-sm text-red-500 border-r border-slate-200 dark:border-slate-800">
                                {row.deduction > 0 ? `-${formatCurrency(row.deduction)}` : '—'}
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
                              <td className="py-3 px-4 text-right font-mono text-sm font-bold text-slate-900 dark:text-white">
                                {formatCurrency(row.net_pay)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </main>

      <PayrollReportTemplate
        ref={printRef}
        periods={history}
        startDate={startDate}
        endDate={endDate}
        restaurantName={restaurantName}
        restaurantLogo={restaurantLogo}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete Payroll Period"
        type="danger"
        message={
          deleteTarget
            ? `Delete this payroll period (${formatCurrency(deleteTarget.total_net)} paid to ${deleteTarget.paid_count} staff)? All staff records for the period will be removed. Any recovered advance amounts are restored and payouts/expenses are deleted. This cannot be undone.`
            : ''
        }
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeletePeriod}
      />
    </div>
  );
}
