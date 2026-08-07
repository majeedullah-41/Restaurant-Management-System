import { useState, useEffect } from "react";
import { invoke } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { Plus, Trash2, Landmark, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { ConfirmModal } from "../components/ConfirmModal";
import DateFilterToolbar from "../components/DateFilterToolbar";

interface Expense {
  id: number;
  amount: number;
  date: string;
  category: string;
  note?: string;
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<number | null>(null);

  // Expense Form State
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Groceries");
  const [note, setNote] = useState("");

  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

  const loadExpenses = async () => {
    try {
      const data: any = await invoke("get_expenses");
      setExpenses(data);
    } catch (err) {
      console.error("Failed to load expenses", err);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category) return;
    try {
      await invoke("add_expense", { 
        amount: parseFloat(amount), 
        date: new Date().toISOString().split('T')[0], 
        category, 
        note 
      });
      setIsExpenseModalOpen(false);
      setAmount("");
      setCategory("Groceries");
      setNote("");
      loadExpenses();
    } catch (err) {
      console.error(err);
    }
  };



  const handleDeleteExpense = (id: number) => {
    setExpenseToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmDeleteExpense = async () => {
    if (expenseToDelete === null) return;
    setDeleteModalOpen(false);
    try {
      await invoke("delete_expense", { id: expenseToDelete });
      loadExpenses();
    } catch (err) {
      console.error(err);
    } finally {
      setExpenseToDelete(null);
    }
  };

  const filteredExpenses = expenses.filter(e => {
    const expenseDate = new Date(e.date);
    const start = dateRange.startDate ? new Date(dateRange.startDate) : null;
    const end = dateRange.endDate ? new Date(dateRange.endDate) : null;
    
    if (start && end) {
      const d = new Date(expenseDate.getFullYear(), expenseDate.getMonth(), expenseDate.getDate());
      const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const e_dt = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      if (d < s || d > e_dt) {
         return false;
      }
      return true;
    }
    return false; // don't show until range is set
  });

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden relative transition-colors">
      
      {/* Add Expense Modal */}
      {isExpenseModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add Expense</h3>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleSaveExpense} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Amount (Rs.)</label>
                <input 
                  type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Category</label>
                <select 
                  value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Groceries">Groceries / Ingredients</option>
                  <option value="Utilities">Utilities (Water, Power)</option>
                  <option value="Maintenance">Maintenance & Repairs</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Note (Optional)</label>
                <input 
                  type="text" value={note} onChange={(e) => setNote(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors mt-4 shadow-lg shadow-blue-600/20">
                Log Expense
              </button>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Delete Expense"
        message="Are you sure you want to delete this expense record? This action cannot be undone."
        type="danger"
        onConfirm={confirmDeleteExpense}
        onCancel={() => {
          setDeleteModalOpen(false);
          setExpenseToDelete(null);
        }}
        confirmText="Delete"
      />

      <Sidebar activePage="expenses" />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors min-w-0">
        <Header title="Expenses" subtitle="Track money leaving the restaurant." />

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-8">
            {/* Summary Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex items-center space-x-6 w-fit min-w-[300px] shadow-sm shrink-0">
               <div className="p-4 rounded-xl bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-500/20">
                 <Landmark size={32} />
               </div>
               <div>
                 <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Total Outflow</p>
                 <h2 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(totalExpenses)}</h2>
               </div>
            </div>

            <div className="flex items-center space-x-4 shrink-0">
              <DateFilterToolbar 
                onDateRangeChange={(startDate, endDate) => setDateRange({ startDate, endDate })}
                defaultMode="month"
              />

              <button 
                onClick={() => setIsExpenseModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 h-10 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors shadow-lg shadow-blue-600/20"
              >
                <Plus size={16} />
                <span>Add Expense</span>
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Category</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Note</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Amount</th>
                  <th className="py-4 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      No expenses logged for this month.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-6 text-sm text-slate-700 dark:text-slate-300 font-medium">{expense.date}</td>
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                          expense.category === 'Salaries' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                          expense.category === 'Groceries' ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20' :
                          expense.category === 'Utilities' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' :
                          'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20'
                        }`}>
                          {expense.category}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-600 dark:text-slate-400">{expense.note || "-"}</td>
                      <td className="py-4 px-6 text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(expense.amount)}</td>
                      <td className="py-4 px-6 text-right">
                        <button 
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-2 rounded-lg transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
