import React from 'react';
import { formatCurrency } from '../lib/utils';

interface InventoryItem {
  id: number;
  name: string;
  unit: string;
  low_stock_threshold: number;
  current_stock: number;
  default_supplier: string | null;
}

interface InventoryTransaction {
  id: number;
  item_id: number;
  item_name: string;
  item_unit: string;
  transaction_type: string;
  quantity: number;
  unit_price: number | null;
  total_cost: number | null;
  supplier: string | null;
  note: string | null;
  date: string;
}

interface InventorySummary {
  total_items: number;
  low_stock_count: number;
  out_of_stock_count: number;
  period_purchase_total: number;
}

interface InventoryReportTemplateProps {
  items: InventoryItem[];
  transactions: InventoryTransaction[];
  summary: InventorySummary;
  startDate: string;
  endDate: string;
  restaurantName?: string;
  restaurantLogo?: string | null;
}

export const InventoryReportTemplate = React.forwardRef<HTMLDivElement, InventoryReportTemplateProps>(({ 
  items, transactions, summary, startDate, endDate, restaurantName = "Restaurant POS", restaurantLogo = null 
}, ref) => {
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
            <h2 className="text-xl text-slate-600 font-medium">Inventory & Stock Report</h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500 mb-1">Reporting Period</p>
            <p className="font-semibold text-slate-800 bg-slate-100 px-3 py-1 rounded-md">
              {startDate} <span className="text-slate-400 font-normal mx-1">to</span> {endDate}
            </p>
            <p className="text-xs text-slate-400 mt-2">Generated: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {/* Inventory Summary KPIs */}
        <div className="mb-10">
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-blue-600 pl-3">Inventory Summary</h3>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Total Items</p>
              <p className="text-2xl font-bold text-slate-900">{summary.total_items}</p>
            </div>
            <div className={`p-4 rounded-xl border ${summary.low_stock_count > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className={`text-xs uppercase tracking-wider font-semibold mb-1 ${summary.low_stock_count > 0 ? 'text-amber-700' : 'text-slate-500'}`}>Low Stock</p>
              <p className={`text-2xl font-bold ${summary.low_stock_count > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{summary.low_stock_count}</p>
            </div>
            <div className={`p-4 rounded-xl border ${summary.out_of_stock_count > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className={`text-xs uppercase tracking-wider font-semibold mb-1 ${summary.out_of_stock_count > 0 ? 'text-red-700' : 'text-slate-500'}`}>Out of Stock</p>
              <p className={`text-2xl font-bold ${summary.out_of_stock_count > 0 ? 'text-red-700' : 'text-slate-900'}`}>{summary.out_of_stock_count}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Purchases (Period)</p>
              <p className="text-2xl font-bold text-emerald-700">{formatCurrency(summary.period_purchase_total)}</p>
            </div>
          </div>
        </div>

        {/* Current Inventory Status Table */}
        <div className="mb-8" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-indigo-500 pl-3">Current Stock Status</h3>
          {items.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="p-3 font-semibold rounded-tl-lg">Item Name</th>
                  <th className="p-3 font-semibold text-right">Current Stock</th>
                  <th className="p-3 font-semibold">Unit</th>
                  <th className="p-3 font-semibold text-right">Threshold</th>
                  <th className="p-3 font-semibold rounded-tr-lg">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {items.map((item, idx) => {
                  const isOut = item.current_stock <= 0;
                  const isLow = !isOut && item.current_stock <= item.low_stock_threshold;
                  return (
                    <tr key={idx} className="text-slate-800">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className={`p-3 text-right font-bold ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {item.current_stock.toFixed(2)}
                      </td>
                      <td className="p-3 text-slate-600">{item.unit}</td>
                      <td className="p-3 text-right text-slate-600">{item.low_stock_threshold}</td>
                      <td className="p-3">
                        {isOut ? (
                          <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-1 rounded-full">OUT OF STOCK</span>
                        ) : isLow ? (
                          <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded-full">LOW STOCK</span>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">IN STOCK</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">No inventory items.</div>
          )}
        </div>

        {/* Transactions Table */}
        <div className="mb-8" style={{ pageBreakInside: 'avoid' }}>
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-l-4 border-teal-500 pl-3">Transactions in Selected Period</h3>
          {transactions.length > 0 ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="p-3 font-semibold rounded-tl-lg">Date</th>
                  <th className="p-3 font-semibold">Type</th>
                  <th className="p-3 font-semibold">Item</th>
                  <th className="p-3 font-semibold text-right">Quantity</th>
                  <th className="p-3 font-semibold text-right">Cost</th>
                  <th className="p-3 font-semibold rounded-tr-lg">Supplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 border-b border-slate-200">
                {transactions.map((tx, idx) => (
                  <tr key={idx} className="text-slate-800">
                    <td className="p-3 font-medium">{tx.date}</td>
                    <td className="p-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        tx.transaction_type === 'purchase' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {tx.transaction_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 font-medium">{tx.item_name}</td>
                    <td className="p-3 text-right">{tx.quantity} {tx.item_unit}</td>
                    <td className="p-3 text-right">
                      {tx.transaction_type === 'purchase' && tx.total_cost != null ? (
                        <span className="text-emerald-700 font-medium">{formatCurrency(tx.total_cost)}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-600">{tx.supplier || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 bg-slate-50 rounded-lg text-slate-500 text-sm text-center border border-slate-200">No transactions in this period.</div>
          )}
        </div>
        
        {/* Footer */}
        <div className="mt-16 pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
          <p>This report contains confidential inventory information.</p>
        </div>

      </div>
    </div>
  );
});

InventoryReportTemplate.displayName = 'InventoryReportTemplate';
