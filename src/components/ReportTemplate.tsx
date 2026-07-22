import React from 'react';

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

interface AnalyticsReport {
  total_sales: number;
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
  report: AnalyticsReport;
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
            <h2 className="text-xl text-slate-600 font-medium">Business Performance Report</h2>
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
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-slate-900">Rs. {report.total_sales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
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
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Profit Margin</p>
              <p className="text-2xl font-bold text-slate-900">{report.profit_margin.toFixed(1)}%</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Orders</p>
              <p className="text-2xl font-bold text-slate-900">{report.total_orders}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Avg. Order Value</p>
              <p className="text-2xl font-bold text-slate-900">Rs. {report.avg_order_value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
          </div>
        </div>

        {/* Two Column Layout for Expenses and Top Items */}
        <div className="grid grid-cols-2 gap-8 mb-10">
          {/* Top Selling Items */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">Top Selling Items</h3>
            {report.top_items.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-left text-slate-600">
                    <th className="pb-2 font-semibold">Item Name</th>
                    <th className="pb-2 font-semibold text-center">Qty</th>
                    <th className="pb-2 font-semibold text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.top_items.slice(0, 10).map((item, idx) => (
                    <tr key={idx} className="text-slate-800">
                      <td className="py-2.5 font-medium">{item.name}</td>
                      <td className="py-2.5 text-center text-slate-600">{item.quantity}</td>
                      <td className="py-2.5 text-right font-medium">Rs. {item.revenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">No sales data available.</div>
            )}
          </div>

          {/* Expenses By Category */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">Expenses Breakdown</h3>
            {report.expenses_by_category.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-left text-slate-600">
                    <th className="pb-2 font-semibold">Category</th>
                    <th className="pb-2 font-semibold text-right">Amount</th>
                    <th className="pb-2 font-semibold text-right">% of Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.expenses_by_category.map((cat, idx) => {
                    const percentage = report.total_expenses > 0 ? (cat.value / report.total_expenses) * 100 : 0;
                    return (
                      <tr key={idx} className="text-slate-800">
                        <td className="py-2.5 font-medium flex items-center">
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-400 mr-2 block"></span>
                          {cat.name}
                        </td>
                        <td className="py-2.5 text-right font-medium">Rs. {cat.value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td className="py-2.5 text-right text-slate-500">{percentage.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">No expenses recorded.</div>
            )}
          </div>
        </div>

        {/* Daily Trends Table */}
        <div className="mb-8" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">Daily Trends</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-left">
                <th className="p-3 font-semibold rounded-tl-lg">Date</th>
                <th className="p-3 font-semibold text-right">Sales</th>
                <th className="p-3 font-semibold text-right">Expenses</th>
                <th className="p-3 font-semibold text-right rounded-tr-lg">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 border-b border-slate-200">
              {report.sales_trend.map((trend, idx) => {
                const net = trend.sales - trend.expenses;
                return (
                  <tr key={idx} className="text-slate-800 hover:bg-slate-50">
                    <td className="p-3 whitespace-nowrap">{trend.date}</td>
                    <td className="p-3 text-right font-medium text-blue-700">Rs. {trend.sales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td className="p-3 text-right text-slate-600">Rs. {trend.expenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td className={`p-3 text-right font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {net < 0 ? '-' : ''}Rs. {Math.abs(net).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
