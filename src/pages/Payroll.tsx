import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CreditCard, Calendar, CheckCircle, Clock, History, DollarSign, X } from 'lucide-react';
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

export default function Payroll() {
  const [activeTab, setActiveTab] = useState<'process' | 'history'>('process');
  
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  
  const [summary, setSummary] = useState<PayrollSummary[]>([]);
  const [history, setHistory] = useState<SalaryPayout[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<PayrollSummary | null>(null);
  const [bonus, setBonus] = useState<number | ''>('');
  const [deduction, setDeduction] = useState<number | ''>('');

  useEffect(() => {
    if (activeTab === 'process') {
      fetchSummary();
    } else {
      fetchHistory();
    }
  }, [activeTab, startDate, endDate]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const fetchSummary = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await invoke<PayrollSummary[]>('get_payroll_summary', { startDate, endDate });
      setSummary(data);
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

  const handleProcessPayout = async () => {
    if (!selectedStaff) return;
    try {
      await invoke('process_payout', {
        staffId: selectedStaff.staff_id,
        amount: selectedStaff.base_salary,
        bonus: Number(bonus) || 0,
        deduction: Number(deduction) || 0,
        date: new Date().toISOString().split('T')[0]
      });
      setShowModal(false);
      setBonus('');
      setDeduction('');
      setSelectedStaff(null);
      // Move to history tab to see the record
      setActiveTab('history');
    } catch (e) {
      console.error(e);
    }
  };

  const openPayoutModal = (staff: PayrollSummary) => {
    setSelectedStaff(staff);
    setBonus('');
    setDeduction('');
    setShowModal(true);
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="payroll" />
      
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors">
        <Header title="Payroll Management" subtitle="Review staff attendance and process monthly salary payouts." />

        <div className="flex-1 p-8 overflow-y-auto">
          {/* Tabs & Filters */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex space-x-2 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <button
                onClick={() => setActiveTab('process')}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'process'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <CreditCard size={16} />
                  <span>Process Payroll</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === 'history'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <History size={16} />
                  <span>Payout History</span>
                </div>
              </button>
            </div>

            {activeTab === 'process' && (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 shadow-sm">
                  <Calendar size={16} className="text-slate-400 dark:text-slate-400" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
                  />
                  <span className="text-slate-400 dark:text-slate-500">to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {errorMsg ? (
              <div className="p-12 text-center text-red-400">Error: {errorMsg}</div>
            ) : loading ? (
              <div className="p-12 text-center text-slate-400">Loading payroll data...</div>
            ) : activeTab === 'process' ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm">
                    <th className="py-4 px-6 font-medium">Staff Member</th>
                    <th className="py-4 px-6 font-medium">Category</th>
                    <th className="py-4 px-6 font-medium text-center">Days Present</th>
                    <th className="py-4 px-6 font-medium text-right">Fixed Monthly Base</th>
                    <th className="py-4 px-6 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {summary.map((row) => (
                    <tr key={row.staff_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors group">
                      <td className="py-4 px-6">
                        <div className="font-bold text-slate-900 dark:text-white">{row.name}</div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700">
                          {row.category_name || 'Uncategorized'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="inline-flex items-center space-x-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full text-sm font-bold border border-emerald-500/20">
                          <CheckCircle size={14} />
                          <span>{row.days_present} Days</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="font-mono font-bold text-slate-700 dark:text-slate-300">
                          {row.base_salary.toFixed(2)}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => openPayoutModal(row)}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-md shadow-blue-900/20 transition-all active:scale-95 flex items-center space-x-2 ml-auto"
                        >
                          <DollarSign size={16} />
                          <span>Pay Now</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {summary.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        No staff members found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm">
                    <th className="py-4 px-6 font-medium">Date Paid</th>
                    <th className="py-4 px-6 font-medium">Staff Member</th>
                    <th className="py-4 px-6 font-medium text-right">Base Amount</th>
                    <th className="py-4 px-6 font-medium text-right">Bonus</th>
                    <th className="py-4 px-6 font-medium text-right text-red-400">Deduction</th>
                    <th className="py-4 px-6 font-medium text-right text-emerald-400">Net Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {history.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="py-4 px-6 text-slate-600 dark:text-slate-300 text-sm">
                        <div className="flex items-center space-x-2">
                          <Clock size={14} className="text-slate-400 dark:text-slate-500" />
                          <span>{record.date}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">{record.staff_name}</td>
                      <td className="py-4 px-6 text-right text-slate-600 dark:text-slate-300 font-mono">
                        {(record.amount - record.bonus + record.deduction).toFixed(2)}
                      </td>
                      <td className="py-4 px-6 text-right text-blue-400 font-mono">
                        +{record.bonus.toFixed(2)}
                      </td>
                      <td className="py-4 px-6 text-right text-red-400 font-mono">
                        -{record.deduction.toFixed(2)}
                      </td>
                      <td className="py-4 px-6 text-right text-emerald-400 font-mono font-bold text-lg">
                        {record.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        No payout history found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* Payout Modal */}
      {showModal && selectedStaff && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/50 rounded-full p-2"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Process Payout</h2>
            
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl mb-6 border border-slate-200 dark:border-slate-700/50">
              <div className="text-sm text-slate-500 dark:text-slate-400 mb-1">Staff Member</div>
              <div className="font-bold text-lg text-slate-900 dark:text-white">{selectedStaff.name}</div>
              <div className="text-xs text-slate-500 mt-1">{selectedStaff.days_present} Days Present in selected period</div>
            </div>

            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Fixed Monthly Base</label>
                <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 font-mono text-lg text-slate-700 dark:text-slate-300">
                  {selectedStaff.base_salary.toFixed(2)}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-blue-500 dark:text-blue-400 mb-2 uppercase tracking-wider">Bonus Amount</label>
                  <input
                    type="number"
                    value={bonus}
                    onChange={(e) => setBonus(Number(e.target.value) || '')}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-red-500 dark:text-red-400 mb-2 uppercase tracking-wider">Deduction</label>
                  <input
                    type="number"
                    value={deduction}
                    onChange={(e) => setDeduction(Number(e.target.value) || '')}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-red-500 transition-colors"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700/50 mb-6">
              <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">Net Final Payout</div>
              <div className="text-3xl font-mono font-bold text-emerald-500 dark:text-emerald-400">
                {(selectedStaff.base_salary + (Number(bonus) || 0) - (Number(deduction) || 0)).toFixed(2)}
              </div>
            </div>

            <button
              onClick={handleProcessPayout}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] text-lg"
            >
              Confirm & Pay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
