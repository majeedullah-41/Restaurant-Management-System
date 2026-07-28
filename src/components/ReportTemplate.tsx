import React from 'react';

interface DetailedOrder {
    id: number;
    table_number: string;
    created_at: string;
    total: number;
    status: string;
    cashier: string;
}

interface DetailedExpense {
    id: number;
    date: string;
    category: string;
    amount: number;
    note: string;
}

interface DetailedPayout {
    id: number;
    staff_name: string;
    date: string;
    amount: number;
}

interface DailyTrend {
    date: string;
    sales: number;
    expenses: number;
}

interface CategoryExpense {
    name: string;
    value: number;
}

interface TopItem {
    name: string;
    quantity: number;
    revenue: number;
}

interface DetailedReport {
    orders: DetailedOrder[];
    expenses: DetailedExpense[];
    payouts: DetailedPayout[];
    total_revenue: number;
    total_expenses: number;
    net_profit: number;
    profit_margin: number;
    total_orders: number;
    avg_order_value: number;
    sales_trend: DailyTrend[];
    expenses_by_category: CategoryExpense[];
    top_items: TopItem[];
}

interface ReportTemplateProps {
  report: DetailedReport;
  startDate: string;
  endDate: string;
  restaurantName?: string;
  restaurantLogo?: string | null;
}

export const ReportTemplate = React.forwardRef<HTMLDivElement, ReportTemplateProps>(({ report, startDate, endDate, restaurantName = "Restaurant POS", restaurantLogo = null }, ref) => {
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
            <h2 className="text-xl text-slate-600 font-medium">Detailed Business Report</h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500 mb-1">Reporting Period</p>
            <p className="font-semibold text-slate-800 bg-slate-100 px-3 py-1 rounded-md">
              {startDate} <span className="text-slate-400 font-normal mx-1">to</span> {endDate}
            </p>
            <p className="text-xs text-slate-400 mt-2">Generated: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {/* Financial Summary KPIs */}
        <div className="mb-10">
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">Financial Summary</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-slate-900">Rs. {report.total_revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Expenses</p>
              <p className="text-2xl font-bold text-slate-900">Rs. {report.total_expenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
            <div className={`p-4 rounded-xl border ${report.net_profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-xs uppercase tracking-wider font-semibold mb-1 ${report.net_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>Net Profit</p>
              <p className={`text-2xl font-bold ${report.net_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {report.net_profit < 0 ? '-' : ''}Rs. {Math.abs(report.net_profit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Orders</p>
              <p className="text-xl font-bold text-slate-900">{report.total_orders}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Avg Order Value</p>
              <p className="text-xl font-bold text-slate-900">Rs. {report.avg_order_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Profit Margin</p>
              <p className="text-xl font-bold text-slate-900">{report.profit_margin.toFixed(2)}%</p>
            </div>
          </div>
        </div>

        {/* Top Selling Items Table */}
        <div className="mb-8" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-amber-500 pl-3">Top Selling Items</h3>
          {report.top_items.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="p-3 font-semibold rounded-tl-lg">Item Name</th>
                  <th className="p-3 font-semibold text-right">Quantity Sold</th>
                  <th className="p-3 font-semibold text-right rounded-tr-lg">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {report.top_items.map((item, idx) => (
                  <tr key={idx} className="text-slate-800">
                    <td className="p-3 font-medium">{item.name}</td>
                    <td className="p-3 text-right">{item.quantity}</td>
                    <td className="p-3 text-right font-medium">Rs. {item.revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">No items sold.</div>
          )}
        </div>

        {/* Expenses By Category Table */}
        <div className="mb-8" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-rose-500 pl-3">Expenses By Category</h3>
          {report.expenses_by_category.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="p-3 font-semibold rounded-tl-lg">Category Name</th>
                  <th className="p-3 font-semibold text-right rounded-tr-lg">Amount Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {report.expenses_by_category.map((cat, idx) => (
                  <tr key={idx} className="text-slate-800">
                    <td className="p-3 font-medium">{cat.name}</td>
                    <td className="p-3 text-right font-medium">Rs. {cat.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">No expenses recorded.</div>
          )}
        </div>

        {/* Daily Trend Table */}
        <div className="mb-8" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-teal-500 pl-3">Daily Performance Trend</h3>
          {report.sales_trend.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="p-3 font-semibold rounded-tl-lg">Date</th>
                  <th className="p-3 font-semibold text-right">Sales</th>
                  <th className="p-3 font-semibold text-right">Expenses</th>
                  <th className="p-3 font-semibold text-right rounded-tr-lg">Net Daily</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {report.sales_trend.map((trend, idx) => {
                  const dailyNet = trend.sales - trend.expenses;
                  return (
                    <tr key={idx} className="text-slate-800">
                      <td className="p-3 font-medium">{trend.date}</td>
                      <td className="p-3 text-right">Rs. {trend.sales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className="p-3 text-right">Rs. {trend.expenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                      <td className={`p-3 text-right font-bold ${dailyNet >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        Rs. {dailyNet.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">No activity.</div>
          )}
        </div>

        {/* Orders Table */}
        <div className="mb-8" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">Orders</h3>
          {report.orders.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="p-3 font-semibold rounded-tl-lg">ID</th>
                  <th className="p-3 font-semibold">Date & Time</th>
                  <th className="p-3 font-semibold">Table</th>
                  <th className="p-3 font-semibold">Cashier</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold text-right rounded-tr-lg">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {report.orders.map((order, idx) => (
                  <tr key={idx} className="text-slate-800">
                    <td className="p-3 font-medium">#{order.id}</td>
                    <td className="p-3 text-slate-600">{order.created_at}</td>
                    <td className="p-3 text-slate-600">{order.table_number}</td>
                    <td className="p-3 text-slate-600">{order.cashier || '-'}</td>
                    <td className="p-3 text-slate-600">{order.status}</td>
                    <td className="p-3 text-right font-medium">Rs. {order.total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">No orders recorded.</div>
          )}
        </div>

        {/* Expenses Table */}
        <div className="mb-8" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-red-600 pl-3">Expenses</h3>
          {report.expenses.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="p-3 font-semibold rounded-tl-lg">ID</th>
                  <th className="p-3 font-semibold">Date</th>
                  <th className="p-3 font-semibold">Category</th>
                  <th className="p-3 font-semibold">Note</th>
                  <th className="p-3 font-semibold text-right rounded-tr-lg">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {report.expenses.map((expense, idx) => (
                  <tr key={idx} className="text-slate-800">
                    <td className="p-3 font-medium">#{expense.id}</td>
                    <td className="p-3 text-slate-600">{expense.date}</td>
                    <td className="p-3 text-slate-600">{expense.category}</td>
                    <td className="p-3 text-slate-600">{expense.note || '-'}</td>
                    <td className="p-3 text-right font-medium">Rs. {expense.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">No expenses recorded.</div>
          )}
        </div>

        {/* Payouts Table */}
        <div className="mb-8" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-indigo-600 pl-3">Salary Payouts</h3>
          {report.payouts.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="p-3 font-semibold rounded-tl-lg">ID</th>
                  <th className="p-3 font-semibold">Date</th>
                  <th className="p-3 font-semibold">Staff Name</th>
                  <th className="p-3 font-semibold text-right rounded-tr-lg">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {report.payouts.map((payout, idx) => (
                  <tr key={idx} className="text-slate-800">
                    <td className="p-3 font-medium">#{payout.id}</td>
                    <td className="p-3 text-slate-600">{payout.date}</td>
                    <td className="p-3 text-slate-600">{payout.staff_name}</td>
                    <td className="p-3 text-right font-medium">Rs. {payout.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">No salary payouts recorded.</div>
          )}
        </div>
        
        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
          <p>This report contains confidential business information.</p>
        </div>

      </div>
    </div>
  );
});

ReportTemplate.displayName = 'ReportTemplate';

