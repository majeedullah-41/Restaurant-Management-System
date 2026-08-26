import React, { useState, useEffect } from 'react';
import { invoke } from '../../lib/api';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { Banknote, CheckCircle, Clock, Pencil, Plus, Trash2, ChevronDown, ChevronUp, CornerDownRight } from 'lucide-react';
import { ConfirmModal } from '../../components/ConfirmModal';
import { MoneyInput } from '../../components/MoneyInput';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import DateFilterToolbar from '../../components/DateFilterToolbar';
import { todayLocal } from '../../lib/utils';
import { AdvanceHistoryRow } from './types';

type GroupedAdvance = {
  staff_id: number;
  staff_name: string;
  total_amount: number;
  advances: AdvanceHistoryRow[];
  is_all_deducted: boolean;
};

export default function AdvanceHistory() {
  const [history, setHistory] = useState<AdvanceHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedStaffIds, setExpandedStaffIds] = useState<number[]>([]);

  // Date filters — first to last day of the current month from the device clock.
  const [startDate, setStartDate] = useState(() => `${todayLocal().slice(0, 8)}01`);
  const [endDate, setEndDate] = useState(todayLocal);

  // New Advance Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [staffList, setStaffList] = useState<{id: number, name: string, role?: string, salary?: number}[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceNote, setAdvanceNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit Advance Modal State
  const [editingRow, setEditingRow] = useState<AdvanceHistoryRow | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete Advance Confirmation State
  const [confirmDelete, setConfirmDelete] = useState<AdvanceHistoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchHistory();
    fetchStaff();
  }, [startDate, endDate]);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await invoke<AdvanceHistoryRow[]>('get_advance_history', {
        staffId: 0,
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

  const fetchStaff = async () => {
    try {
      const data = await invoke<any[]>('get_staff_dropdown');
      setStaffList(data.map(s => ({ 
        id: s.id, 
        name: s.name,
        role: s.category_name || s.role,
        salary: s.salary
      })));
    } catch (e) {
      console.error(e);
    }
  };

  const handleRecordAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId || !advanceAmount) return;
    try {
      setSaving(true);
      setErrorMsg(null);
      const staffName = staffList.find(s => s.id === parseInt(selectedStaffId))?.name || '';
      await invoke('pay_advance_salary', {
        staffId: parseInt(selectedStaffId),
        amount: parseFloat(advanceAmount),
        date: todayLocal(),
        note: advanceNote,
        staffName: staffName
      });
      setModalOpen(false);
      setAdvanceAmount('');
      setAdvanceNote('');
      setSelectedStaffId('');
      await fetchHistory();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(String(e));
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (row: AdvanceHistoryRow) => {
    setEditingRow(row);
    setEditAmount(String(row.amount));
    setEditNote(row.note || '');
    setErrorMsg(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow || !editAmount) return;
    try {
      setSavingEdit(true);
      setErrorMsg(null);
      await invoke('update_advance', {
        advanceId: editingRow.id,
        amount: parseFloat(editAmount),
        note: editNote
      });
      setEditingRow(null);
      await fetchHistory();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(String(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      setDeleting(true);
      setErrorMsg(null);
      await invoke('delete_advance', { advanceId: confirmDelete.id });
      setConfirmDelete(null);
      await fetchHistory();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(String(err));
    } finally {
      setDeleting(false);
    }
  };

  const toggleExpand = (staffId: number) => {
    setExpandedStaffIds(prev => 
      prev.includes(staffId) 
        ? prev.filter(id => id !== staffId)
        : [...prev, staffId]
    );
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // Group history by staff
  const groupedHistory: GroupedAdvance[] = [];
  const staffMap = new Map<number, GroupedAdvance>();
  
  history.forEach(row => {
    if (!staffMap.has(row.staff_id)) {
      const newGroup = {
        staff_id: row.staff_id,
        staff_name: row.staff_name,
        total_amount: 0,
        advances: [],
        is_all_deducted: true,
      };
      staffMap.set(row.staff_id, newGroup);
      groupedHistory.push(newGroup);
    }
    const group = staffMap.get(row.staff_id)!;
    group.total_amount += row.amount;
    group.advances.push(row);
    if (!row.is_deducted) {
      group.is_all_deducted = false;
    }
  });

  const renderStatus = (isDeducted: boolean) => (
    isDeducted ? (
      <span className="inline-flex items-center space-x-1 text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full text-[11px] font-bold">
        <CheckCircle size={12} />
        <span>Recovered</span>
      </span>
    ) : (
      <span className="inline-flex items-center space-x-1 text-orange-500 bg-orange-50 dark:bg-orange-500/10 px-2.5 py-1 rounded-full text-[11px] font-bold">
        <Clock size={12} />
        <span>Active</span>
      </span>
    )
  );

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      <Sidebar activePage="payroll_advance" />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors min-w-0">
        <Header title="Advance History" subtitle="Track salary advances and deductions." />

        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-[1200px] mx-auto w-full space-y-6">
            
            <DateFilterToolbar 
              onDateRangeChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
              defaultMode="month"
            />

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">All Advances</h2>
              <button
                onClick={() => setModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center space-x-2 shadow-lg shadow-blue-600/20"
              >
                <Plus size={16} />
                <span>Give Advance</span>
              </button>
            </div>

            {errorMsg && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm font-semibold border border-red-200 flex justify-between">
                <span>{errorMsg}</span>
                <button onClick={() => setErrorMsg(null)}>✕</button>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                        <th className="py-4 px-6 border-r border-slate-200 dark:border-slate-800">Date</th>
                        <th className="py-4 px-4 border-r border-slate-200 dark:border-slate-800">Staff</th>
                        <th className="py-4 px-4 border-r border-slate-200 dark:border-slate-800">Note</th>
                        <th className="py-4 px-4 text-right border-r border-slate-200 dark:border-slate-800">Advance Amount</th>
                        <th className="py-4 px-4 text-center border-r border-slate-200 dark:border-slate-800">Status</th>
                        <th className="py-4 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedHistory.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500">
                            No advance history found.
                          </td>
                        </tr>
                      ) : groupedHistory.map(group => {
                        const isExpanded = expandedStaffIds.includes(group.staff_id);
                        const hasMultiple = group.advances.length > 1;

                        if (!hasMultiple) {
                          // Single advance
                          const row = group.advances[0];
                          return (
                            <tr key={row.id} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                              <td className="py-3 px-6 text-sm text-slate-600 dark:text-slate-400 font-medium border-r border-slate-200 dark:border-slate-800">
                                {formatDateTime(row.date)}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-200 dark:border-slate-800">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {getInitials(row.staff_name)}
                                  </div>
                                  <span className="font-semibold text-sm text-slate-900 dark:text-white">
                                    {row.staff_name}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4 border-r border-slate-200 dark:border-slate-800">
                                <span className="text-sm text-slate-500">{row.note || '-'}</span>
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-sm font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">
                                {formatCurrency(row.amount)}
                              </td>
                              <td className="py-3 px-4 text-center border-r border-slate-200 dark:border-slate-800">
                                {renderStatus(row.is_deducted)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  <button onClick={() => openEditModal(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors" title="Edit advance">
                                    <Pencil size={15} />
                                  </button>
                                  <button onClick={() => setConfirmDelete(row)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors" title="Delete advance">
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        // Group of advances
                        // Format dates to show exact dates comma separated, or newest if too many
                        const latestDate = formatDateTime(group.advances[0].date);
                        const otherDatesCount = group.advances.length - 1;

                        return (
                          <React.Fragment key={`group-${group.staff_id}`}>
                            <tr 
                              className={`border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 cursor-pointer ${isExpanded ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''}`}
                              onClick={() => toggleExpand(group.staff_id)}
                            >
                              <td className="py-3 px-6 text-sm text-slate-600 dark:text-slate-400 font-medium border-r border-slate-200 dark:border-slate-800">
                                <div className="flex flex-col">
                                  <span>{latestDate}</span>
                                  <span className="text-[11px] text-slate-400">+{otherDatesCount} more</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 border-r border-slate-200 dark:border-slate-800">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                                    {getInitials(group.staff_name)}
                                  </div>
                                  <span className="font-semibold text-sm text-slate-900 dark:text-white">
                                    {group.staff_name}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4 border-r border-slate-200 dark:border-slate-800">
                                <span className="text-xs text-slate-400 italic">Multiple</span>
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-sm font-bold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-800">
                                {formatCurrency(group.total_amount)}
                              </td>
                              <td className="py-3 px-4 text-center border-r border-slate-200 dark:border-slate-800">
                                {renderStatus(group.is_all_deducted)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center justify-center space-x-2">
                                  <button className="p-1.5 rounded-lg text-slate-400 transition-colors">
                                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            
                            {/* Expanded individual rows */}
                            {isExpanded && group.advances.map(row => (
                              <tr key={`child-${row.id}`} className="bg-slate-50/30 dark:bg-slate-800/10 border-b border-slate-200 dark:border-slate-800 last:border-b-0">
                                <td className="py-2.5 px-6 pl-10 text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center space-x-2 border-r border-slate-200 dark:border-slate-800">
                                  <CornerDownRight size={14} className="text-slate-300 dark:text-slate-600 shrink-0" />
                                  <span>{formatDateTime(row.date)}</span>
                                </td>
                                <td className="py-2.5 px-4 border-r border-slate-200 dark:border-slate-800">
                                </td>
                                <td className="py-2.5 px-4 border-r border-slate-200 dark:border-slate-800">
                                  <span className="text-xs text-slate-500">{row.note || '-'}</span>
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-800">
                                  {formatCurrency(row.amount)}
                                </td>
                                <td className="py-2.5 px-4 text-center scale-90 border-r border-slate-200 dark:border-slate-800">
                                  {renderStatus(row.is_deducted)}
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  <div className="flex items-center justify-center space-x-2">
                                    <button onClick={() => openEditModal(row)} className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
                                      <Pencil size={13} />
                                    </button>
                                    <button onClick={() => setConfirmDelete(row)} className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

      </main>

      {/* Edit Advance Modal */}
      {editingRow && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Pencil size={20} className="text-blue-600" />
                <span>Edit Advance - {editingRow.staff_name}</span>
              </h3>
              <button onClick={() => setEditingRow(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 text-center">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Amount</div>
                  <div className="font-mono font-bold text-slate-900 dark:text-white text-xl">{formatCurrency(editingRow.amount)}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Advance Amount (Rs)
                </label>
                <MoneyInput
                  required
                  value={editAmount}
                  onChange={setEditAmount}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. 5,000"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Note (Optional)</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Reason for advance..."
                />
              </div>

              <div className="pt-4 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editAmount}
                  className="px-5 py-2.5 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-600/20"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Advance Confirmation */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Delete Advance"
        type="danger"
        message={
          confirmDelete
            ? `Are you sure you want to delete the advance of ${formatCurrency(confirmDelete.amount)} for ${confirmDelete.staff_name}?`
            : ''
        }
        confirmText={deleting ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
      />

      {/* Give Advance Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Banknote size={20} className="text-blue-600" />
                <span>Give Advance</span>
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <form onSubmit={handleRecordAdvance} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Staff Member</label>
                <select 
                  required
                  value={selectedStaffId}
                  onChange={e => setSelectedStaffId(e.target.value)}
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
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={saving || !selectedStaffId || !advanceAmount}
                  className="px-5 py-2.5 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-600/20"
                >
                  {saving ? 'Saving...' : 'Confirm Advance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
