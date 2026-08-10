import { useState, useEffect } from 'react';
import { X, CheckCircle, Clock } from 'lucide-react';
import { PayrollRecordRow } from '../pages/payroll/types';
import { formatCurrency } from '../lib/utils';
import { MoneyInput } from './MoneyInput';

interface PayrollEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  record: PayrollRecordRow | null;
  onSave: (id: number, bonus: number, deduction: number, advanceDeduction: number) => Promise<void>;
  saving: boolean;
}

export default function PayrollEditDrawer({ isOpen, onClose, record, onSave, saving }: PayrollEditDrawerProps) {
  const [bonus, setBonus] = useState('');
  const [deduction, setDeduction] = useState('');

  useEffect(() => {
    if (record) {
      setBonus(record.bonus > 0 ? record.bonus.toString() : '');
      setDeduction(record.deduction > 0 ? record.deduction.toString() : '');
    }
  }, [record]);

  if (!isOpen || !record) return null;

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

  const adNum = record.status === 'Pending' ? record.advance_balance : record.advance_deduction;

  const handleSave = () => {
    const b = Math.max(0, Number(bonus) || 0);
    const d = Math.max(0, Number(deduction) || 0);
    onSave(record.id, b, d, adNum);
  };

  // Preview net pay calculation
  const bNum = Math.max(0, Number(bonus) || 0);
  const dNum = Math.max(0, Number(deduction) || 0);
  const previewNetPay = Math.max(0, record.base_salary + bNum - dNum - adNum);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/20 dark:bg-slate-900/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transform transition-transform duration-300">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border shrink-0 ${getAvatarColor(record.name)}`}>
              {getInitials(record.name)}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{record.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{record.category_name || 'Staff'}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <span className="text-slate-600 dark:text-slate-400 text-sm font-medium">Attendance</span>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 rounded-full text-xs font-bold">
              <span>{record.days_present} / 26 Days</span>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Salary Details</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Base Salary</span>
                <span className="font-mono font-medium text-slate-900 dark:text-white">{formatCurrency(record.base_salary)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 dark:text-slate-400">Advance Paid</span>
                <span className="font-mono font-medium text-red-500">{record.advance_balance > 0 ? formatCurrency(record.advance_balance) : '—'}</span>
              </div>
              <div className="flex items-center justify-between text-sm pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-slate-900 dark:text-white font-bold">Net Pay</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base">{formatCurrency(previewNetPay)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Adjustments</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Bonus</span>
                <MoneyInput
                  min="0"
                  value={bonus}
                  onChange={setBonus}
                  disabled={record.status !== 'Pending'}
                  className="w-24 text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50"
                  placeholder="0"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">Deduction</span>
                <MoneyInput
                  min="0"
                  value={deduction}
                  onChange={setDeduction}
                  disabled={record.status !== 'Pending'}
                  className="w-24 text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors disabled:opacity-50"
                  placeholder="0"
                />
              </div>
            </div>
            
            {record.advance_balance > 0 && (
              <p className="text-xs text-slate-400 text-center italic mt-2">
                Total advance paid: {formatCurrency(record.advance_balance)}.
              </p>
            )}
          </div>
          
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 space-y-4">
          <div className={`flex items-center justify-center space-x-2 p-3 rounded-lg border ${
            record.status === 'Pending' 
            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400' 
            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
          }`}>
            {record.status === 'Pending' ? (
              <>
                <CheckCircle size={18} />
                <span className="text-sm font-bold">Ready to Process</span>
              </>
            ) : (
              <>
                <Clock size={18} />
                <span className="text-sm font-bold">Already Processed</span>
              </>
            )}
          </div>
          
          <button
            onClick={handleSave}
            disabled={saving || record.status !== 'Pending'}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-600/20 transition-all disabled:shadow-none"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}
