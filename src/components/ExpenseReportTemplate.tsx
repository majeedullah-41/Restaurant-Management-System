import React from 'react';
import { formatCurrency } from '../lib/utils';

interface ExpenseRow {
  id: number;
  amount: number;
  date: string;
  category: string;
  note?: string;
}

interface ExpenseReportTemplateProps {
  expenses: ExpenseRow[];
  startDate: string;
  endDate: string;
  restaurantName?: string;
  restaurantLogo?: string | null;
}

export const ExpenseReportTemplate = React.forwardRef<HTMLDivElement, ExpenseReportTemplateProps>(({
  expenses, startDate, endDate, restaurantName = "Restaurant POS", restaurantLogo = null
}, ref) => {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="hidden">
      <div
        ref={ref}
        className="w-[210mm] min-h-[297mm] bg-white text-slate-900 p-12 mx-auto font-sans print:block"
        style={{
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact'
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-end border-b-2 border-slate-800 pb-6 mb-8">
          <div>
            {restaurantLogo && <img src={restaurantLogo} alt="Logo" className="h-16 w-auto object-contain mb-4" />}
            <h1 className="text-3xl font-bold text-slate-900 mb-2">{restaurantName}</h1>
            <h2 className="text-xl text-slate-600 font-medium">Expense Report</h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500 mb-1">Reporting Period</p>
            <p className="font-semibold text-slate-800 bg-slate-100 px-3 py-1 rounded-md">
              {startDate} <span className="text-slate-400 font-normal mx-1">to</span> {endDate}
            </p>
            <p className="text-xs text-slate-400 mt-2">Generated: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-8">
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-orange-500 pl-3">Expense Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Expenses</p>
              <p className="text-3xl font-bold text-orange-700">{formatCurrency(total)}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Transactions</p>
              <p className="text-3xl font-bold text-slate-900">{expenses.length}</p>
            </div>
          </div>
        </div>

        {/* Expenses Table */}
        <div>
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">Expense Details</h3>
          {expenses.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="p-3 font-semibold rounded-tl-lg">Date</th>
                  <th className="p-3 font-semibold">Category</th>
                  <th className="p-3 font-semibold">Note</th>
                  <th className="p-3 font-semibold text-right rounded-tr-lg">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {expenses.map((e) => (
                  <tr key={e.id} className="text-slate-800">
                    <td className="p-3 font-medium">{e.date}</td>
                    <td className="p-3">
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                        {e.category}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{e.note || '-'}</td>
                    <td className="p-3 text-right font-bold">{formatCurrency(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold text-slate-800">
                  <td colSpan={3} className="p-3 rounded-bl-lg">Total Expenses</td>
                  <td className="p-3 text-right rounded-br-lg">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">
              No expenses found in the selected range.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
          <p>This report contains confidential expense information.</p>
        </div>
      </div>
    </div>
  );
});

ExpenseReportTemplate.displayName = 'ExpenseReportTemplate';
