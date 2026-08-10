import React from 'react';
import { formatCurrency } from '../lib/utils';
import { PayrollHistoryPeriod } from '../pages/payroll/types';

interface PayrollReportTemplateProps {
  periods: PayrollHistoryPeriod[];
  startDate: string;
  endDate: string;
  restaurantName?: string;
  restaurantLogo?: string | null;
}

export const PayrollReportTemplate = React.forwardRef<HTMLDivElement, PayrollReportTemplateProps>(({
  periods, startDate, endDate, restaurantName = "Restaurant POS", restaurantLogo = null
}, ref) => {
  const grandTotal = periods.reduce((sum, p) => sum + p.total_net, 0);

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
            <h2 className="text-xl text-slate-600 font-medium">Payroll Report</h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500 mb-1">Reporting Period</p>
            <p className="font-semibold text-slate-800 bg-slate-100 px-3 py-1 rounded-md">
              {startDate} <span className="text-slate-400 font-normal mx-1">to</span> {endDate}
            </p>
            <p className="text-xs text-slate-400 mt-2">Generated: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {periods.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">
            No payroll periods found in the selected range.
          </div>
        ) : (
          periods.map((period, idx) => (
            <div key={idx} className="mb-10">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 border-l-4 border-blue-600 pl-3">
                    {new Date(period.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    {' - '}
                    {new Date(period.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1 ml-3">
                    Processed on {period.paid_at ? new Date(period.paid_at).toLocaleString() : 'Unknown'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-500 font-semibold">{period.paid_count} of {period.total_count} staff paid</p>
                  <p className="text-2xl font-bold text-emerald-700">{formatCurrency(period.total_net)}</p>
                </div>
              </div>

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 text-left">
                    <th className="p-3 font-semibold rounded-tl-lg">Staff</th>
                    <th className="p-3 font-semibold text-center">Attendance</th>
                    <th className="p-3 font-semibold text-right">Base Salary</th>
                    <th className="p-3 font-semibold text-right">Bonus</th>
                    <th className="p-3 font-semibold text-right">Deduction</th>
                    <th className="p-3 font-semibold text-right">Advance</th>
                    <th className="p-3 font-semibold text-right rounded-tr-lg">Net Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                  {period.rows.length > 0 ? (
                    period.rows.map((row) => (
                      <tr key={row.id} className="text-slate-800">
                        <td className="p-3 font-medium">{row.name}</td>
                        <td className="p-3 text-center">{row.days_present} / 26</td>
                        <td className="p-3 text-right">{formatCurrency(row.base_salary)}</td>
                        <td className="p-3 text-right text-emerald-700">{row.bonus > 0 ? `+${formatCurrency(row.bonus)}` : '—'}</td>
                        <td className="p-3 text-right text-red-600">{row.deduction > 0 ? `-${formatCurrency(row.deduction)}` : '—'}</td>
                        <td className="p-3 text-right text-red-600">{row.advance_deduction > 0 ? `-${formatCurrency(row.advance_deduction)}` : '—'}</td>
                        <td className="p-3 text-right font-bold">{formatCurrency(row.net_pay)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-3 text-center text-slate-400">No staff records for this period.</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold text-slate-800">
                    <td colSpan={6} className="p-3 rounded-bl-lg">Period Total</td>
                    <td className="p-3 text-right rounded-br-lg">{formatCurrency(period.total_net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))
        )}

        {periods.length > 0 && (
          <div className="flex justify-between items-center bg-slate-100 border border-slate-300 rounded-xl px-6 py-4 mt-4" style={{ pageBreakInside: 'avoid' }}>
            <span className="text-base font-bold text-slate-800 uppercase tracking-wide">Grand Total Paid</span>
            <span className="text-2xl font-bold text-emerald-700">{formatCurrency(grandTotal)}</span>
          </div>
        )}

        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
          <p>This report contains confidential payroll information.</p>
        </div>
      </div>
    </div>
  );
});

PayrollReportTemplate.displayName = 'PayrollReportTemplate';
